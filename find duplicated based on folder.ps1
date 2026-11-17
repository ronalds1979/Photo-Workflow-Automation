[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SourceFolder = "D:\Other files and trash videos",
    [string]$ReferenceFolder = "D:\Original\Pictures",
    [string]$QuarantineFolder = "D:\DuplicateFilesFound"
)

if ([string]::IsNullOrWhiteSpace($SourceFolder) -or -not (Test-Path -LiteralPath $SourceFolder -PathType Container)) {
    Write-Error "Source folder does not exist or is not a directory: $SourceFolder"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ReferenceFolder) -or -not (Test-Path -LiteralPath $ReferenceFolder -PathType Container)) {
    Write-Error "Reference folder does not exist or is not a directory: $ReferenceFolder"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($QuarantineFolder)) {
    Write-Error "Quarantine folder path cannot be empty."
    exit 1
}

$SourceFolder = [System.IO.Path]::GetFullPath($SourceFolder)
$ReferenceFolder = [System.IO.Path]::GetFullPath($ReferenceFolder)
$QuarantineFolder = [System.IO.Path]::GetFullPath($QuarantineFolder)

function Test-HasReparsePointInLineage {
    param([string]$Path)
    $curr = $Path
    while (-not [string]::IsNullOrEmpty($curr)) {
        $item = Get-Item -LiteralPath $curr -Force -ErrorAction SilentlyContinue
        if ($null -ne $item -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
            return $true
        }
        $parent = [System.IO.Path]::GetDirectoryName($curr)
        if ($parent -eq $curr) { break }
        $curr = $parent
    }
    return $false
}

if (Test-HasReparsePointInLineage -Path $SourceFolder) {
    Write-Error "Source folder must not be or traverse a reparse point (symlink/junction): $SourceFolder"
    exit 1
}
if (Test-HasReparsePointInLineage -Path $ReferenceFolder) {
    Write-Error "Reference folder must not be or traverse a reparse point (symlink/junction): $ReferenceFolder"
    exit 1
}
if (Test-HasReparsePointInLineage -Path $QuarantineFolder) {
    Write-Error "Quarantine folder must not be or traverse a reparse point (symlink/junction): $QuarantineFolder"
    exit 1
}

$SourceNormalized = $SourceFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$ReferenceNormalized = $ReferenceFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$QuarantineNormalized = $QuarantineFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

if ($SourceNormalized.Equals($ReferenceNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "SourceFolder and ReferenceFolder cannot be the same directory ($SourceFolder)."
    exit 1
}
if ($QuarantineNormalized.Equals($SourceNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $QuarantineNormalized.Equals($ReferenceNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "QuarantineFolder cannot be the same as SourceFolder or ReferenceFolder ($QuarantineFolder)."
    exit 1
}

if (Test-Path -LiteralPath $QuarantineFolder) {
    try {
        $quarantineItem = Get-Item -LiteralPath $QuarantineFolder -Force -ErrorAction Stop
        if (-not $quarantineItem.PSIsContainer) {
            Write-Error "Quarantine path exists and is not a directory: $QuarantineFolder"
            exit 1
        }
        if (($quarantineItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            Write-Error "Quarantine folder must not be a reparse point (symlink/junction): $QuarantineFolder"
            exit 1
        }
    }
    catch {
        Write-Error "Failed to inspect quarantine folder: $($_.Exception.Message)"
        exit 1
    }
}
elseif ($PSCmdlet.ShouldProcess($QuarantineFolder, "Create quarantine directory")) {
    try {
        New-Item -ItemType Directory -LiteralPath $QuarantineFolder -ErrorAction Stop | Out-Null
    }
    catch {
        Write-Error "Failed to create quarantine folder: $($_.Exception.Message)"
        exit 1
    }
}

Write-Host "Building size and hash index for reference folder..."

# ⚡ Bolt: Fast 192 KB partial hash (head + middle + tail) with reusable buffer & SHA256 instance
$PartialChunkSize = 65536
$PartialHashBuffer = New-Object byte[] $PartialChunkSize
$PartialSha256 = [System.Security.Cryptography.SHA256]::Create()

function Read-FullChunk {
    param(
        [System.IO.Stream]$Stream,
        [byte[]]$Buffer,
        [int]$Count
    )
    $totalRead = 0
    while ($totalRead -lt $Count) {
        $bytesRead = $Stream.Read($Buffer, $totalRead, $Count - $totalRead)
        if ($bytesRead -eq 0) { break }
        $totalRead += $bytesRead
    }
    return $totalRead
}

function Get-FastPartialHash {
    param(
        [string]$LiteralPath,
        [long]$ExpectedLength = -1
    )
    $stream = [System.IO.File]::Open($LiteralPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $PartialSha256.Initialize()
        $len = $stream.Length
        if ($ExpectedLength -ge 0 -and $len -ne $ExpectedLength) {
            throw [System.IO.IOException]::new("File length changed during scan: $LiteralPath")
        }
        $read = Read-FullChunk -Stream $stream -Buffer $PartialHashBuffer -Count $PartialChunkSize
        if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }

        if ($len -gt ($PartialChunkSize * 2)) {
            $stream.Position = [long](($len - $PartialChunkSize) / 2)
            $read = Read-FullChunk -Stream $stream -Buffer $PartialHashBuffer -Count $PartialChunkSize
            if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }
        }
        if ($len -gt $PartialChunkSize) {
            $stream.Position = [Math]::Max(0L, $len - $PartialChunkSize)
            $read = Read-FullChunk -Stream $stream -Buffer $PartialHashBuffer -Count $PartialChunkSize
            if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }
        }

        $null = $PartialSha256.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return [System.BitConverter]::ToString($PartialSha256.Hash).Replace("-", "")
    } catch {
        $PartialSha256.Initialize()
        throw
    } finally {
        $stream.Dispose()
    }
}

# ⚡ Bolt: Streaming 1 MB block comparison with early exit for single-candidate checks
$CompareBufferSize = 1048576
$CompareBuf1 = New-Object byte[] $CompareBufferSize
$CompareBuf2 = New-Object byte[] $CompareBufferSize

function Compare-FilesExact {
    param([string]$Path1, [string]$Path2)
    $s1 = [System.IO.File]::Open($Path1, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $s2 = $null
    try {
        $s2 = [System.IO.File]::Open($Path2, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        if ($s1.Length -ne $s2.Length) { return $false }
        while ($true) {
            $r1 = Read-FullChunk -Stream $s1 -Buffer $CompareBuf1 -Count $CompareBufferSize
            $r2 = Read-FullChunk -Stream $s2 -Buffer $CompareBuf2 -Count $CompareBufferSize
            if ($r1 -ne $r2) { return $false }
            if ($r1 -eq 0) { return $true }
            if ($r1 -eq $CompareBufferSize) {
                if (-not [System.Linq.Enumerable]::SequenceEqual($CompareBuf1, $CompareBuf2)) { return $false }
            } else {
                $seg1 = [System.ArraySegment[byte]]::new($CompareBuf1, 0, $r1)
                $seg2 = [System.ArraySegment[byte]]::new($CompareBuf2, 0, $r2)
                if (-not [System.Linq.Enumerable]::SequenceEqual($seg1, $seg2)) { return $false }
            }
        }
    } finally {
        if ($s2) { $s2.Dispose() }
        $s1.Dispose()
    }
}

function Format-SafeCsvField {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return $Value }
    if ($Value[0] -in @('=', '+', '-', '@', "`t", "`r")) {
        return "'" + $Value
    }
    return $Value
}

function Get-FilesFast {
    param([string]$RootPath)
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $enumOpts = [System.IO.EnumerationOptions]::new()
        $enumOpts.RecurseSubdirectories = $true
        $enumOpts.IgnoreInaccessible = $true
        $enumOpts.AttributesToSkip = $enumOpts.AttributesToSkip -bor [System.IO.FileAttributes]::ReparsePoint
        return [System.IO.DirectoryInfo]::new($RootPath).EnumerateFiles('*', $enumOpts)
    }

    # ⚡ Bolt: Stack-based .NET traversal for PS 5.1 avoids Get-ChildItem pipeline overhead and skips reparse-point directories before descending
    $results = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
    $stack = [System.Collections.Generic.Stack[System.IO.DirectoryInfo]]::new()
    $rootInfo = [System.IO.DirectoryInfo]::new($RootPath)
    if (($rootInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
        $stack.Push($rootInfo)
    }
    while ($stack.Count -gt 0) {
        $dir = $stack.Pop()
        try {
            foreach ($entry in $dir.EnumerateFileSystemInfos()) {
                if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
                if ($entry -is [System.IO.DirectoryInfo]) {
                    $stack.Push($entry)
                } elseif ($entry -is [System.IO.FileInfo]) {
                    $results.Add($entry)
                }
            }
        } catch {
            # Ignore inaccessible directories
        }
    }
    return $results
}

$referenceFilesBySize = @{}

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
foreach ($file in Get-FilesFast -RootPath $ReferenceFolder) {
    if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    $size = $file.Length
    if (-not $referenceFilesBySize.ContainsKey($size)) {
        # ⚡ Bolt: Using List[string] instead of @() to avoid O(N²) reallocation on +=
        $referenceFilesBySize[$size] = [System.Collections.Generic.List[string]]::new()
    }
    # ⚡ Bolt: .Add() is O(1) amortized, whereas += on arrays is O(N)
    $referenceFilesBySize[$size].Add($file.FullName)
}

$referencePartialHashes = @{}
$referenceHashes = @{}
$MovedFiles = @{}
# ⚡ Bolt: Using List instead of @() for efficient O(1) appends
$duplicates = [System.Collections.Generic.List[PSCustomObject]]::new()

Write-Host "Checking source folder..."

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
foreach ($file in Get-FilesFast -RootPath $SourceFolder) {
    if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    if ($MovedFiles.ContainsKey($file.FullName)) { continue }
    try {
        $size = $file.Length

        if ($referenceFilesBySize.ContainsKey($size)) {
            $candidates = $referenceFilesBySize[$size]
            if ($candidates.Count -eq 1 -and ($file.FullName.Equals($candidates[0], [System.StringComparison]::OrdinalIgnoreCase) -or $MovedFiles.ContainsKey($candidates[0]))) {
                continue
            }

            $srcPartial = Get-FastPartialHash -LiteralPath $file.FullName -ExpectedLength $size
            $partialMatches = [System.Collections.Generic.List[string]]::new()

            foreach ($refFile in $candidates) {
                if ($file.FullName.Equals($refFile, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                if ($MovedFiles.ContainsKey($refFile)) { continue }
                if (-not $referencePartialHashes.ContainsKey($refFile)) {
                    $referencePartialHashes[$refFile] = Get-FastPartialHash -LiteralPath $refFile -ExpectedLength $size
                }
                if ($srcPartial -eq $referencePartialHashes[$refFile]) {
                    $partialMatches.Add($refFile)
                }
            }

            if ($partialMatches.Count -eq 0) { continue }

            $matchFound = $false
            # ⚡ Bolt: Using List[string] instead of @() for efficient O(1) appends
            $matchingFiles = [System.Collections.Generic.List[string]]::new()

            if ($size -le ($PartialChunkSize * 3)) {
                # All bytes of files <= 192 KB were already covered by Get-FastPartialHash
                $matchFound = $true
                foreach ($refFile in $partialMatches) {
                    $matchingFiles.Add($refFile)
                }
            } elseif ($partialMatches.Count -eq 1) {
                # ⚡ Bolt: Streaming early-exit comparison avoids full-file SHA-256 hashing for single-candidate checks
                $refFile = $partialMatches[0]
                if (Compare-FilesExact -Path1 $file.FullName -Path2 $refFile) {
                    $matchFound = $true
                    $matchingFiles.Add($refFile)
                }
            } else {
                $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
                foreach ($refFile in $partialMatches) {
                    if ($MovedFiles.ContainsKey($refFile)) { continue }
                    if (-not $referenceHashes.ContainsKey($refFile)) {
                        $referenceHashes[$refFile] = (Get-FileHash -LiteralPath $refFile -Algorithm SHA256 -ErrorAction Stop).Hash
                    }

                    if ($hash -eq $referenceHashes[$refFile]) {
                        $matchFound = $true
                        $matchingFiles.Add($refFile)
                    }
                }
            }

            if ($matchFound) {
                $duplicates.Add([PSCustomObject]@{
                    SourceFile = (Format-SafeCsvField -Value $file.FullName)
                    MatchingFiles = (Format-SafeCsvField -Value ($matchingFiles -join "; "))
                })

                $Destination = Join-Path $QuarantineFolder $file.Name
                $Counter = 1
                while (Test-Path -LiteralPath $Destination -Force) {
                    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
                    $Extension = [System.IO.Path]::GetExtension($file.Name)
                    $Destination = Join-Path $QuarantineFolder ("{0}_{1}_{2}{3}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Counter, $Extension)
                    $Counter++
                }

                if ($PSCmdlet.ShouldProcess($file.FullName, "Move duplicate file to $Destination")) {
                    Move-Item -LiteralPath $file.FullName -Destination $Destination -ErrorAction Stop
                    $MovedFiles[$file.FullName] = $true
                    Write-Host "Moved duplicate to quarantine: $($file.FullName)"
                } elseif ($WhatIfPreference) {
                    $MovedFiles[$file.FullName] = $true
                }
            }
        }
    }
    catch {
        Write-Warning "Failed to process: $($file.FullName) - $($_.Exception.Message)"
    }
}

$PartialSha256.Dispose()

$ReportFile = "$env:USERPROFILE\Desktop\DuplicateFilesReport_$(Get-Date -Format 'yyyyMMdd_HHmmss_fff').csv"
try {
    $duplicates | Export-Csv -LiteralPath $ReportFile -NoTypeInformation -NoClobber -ErrorAction Stop
}
catch {
    Write-Warning "Failed to export report: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Completed."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host "Report saved to: $ReportFile"
