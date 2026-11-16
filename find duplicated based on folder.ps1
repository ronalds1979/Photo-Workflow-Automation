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

$QuarantineNormalized = $QuarantineFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

Write-Host "Building size and hash index for reference folder..."

# ⚡ Bolt: Fast 192 KB partial hash (head + middle + tail) with reusable buffer & SHA256 instance
$PartialChunkSize = 65536
$PartialHashBuffer = New-Object byte[] $PartialChunkSize
$PartialSha256 = [System.Security.Cryptography.SHA256]::Create()

function Get-FastPartialHash {
    param([string]$LiteralPath)
    $stream = [System.IO.File]::Open($LiteralPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $len = $stream.Length
        $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
        if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }

        if ($len -gt ($PartialChunkSize * 2)) {
            $stream.Position = [long](($len - $PartialChunkSize) / 2)
            $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
            if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }
        }
        if ($len -gt $PartialChunkSize) {
            $stream.Position = [Math]::Max(0L, $len - $PartialChunkSize)
            $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
            if ($read -gt 0) { $null = $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) }
        }

        $null = $PartialSha256.TransformFinalBlock([byte[]]::new(0), 0, 0)
        return [System.BitConverter]::ToString($PartialSha256.Hash).Replace("-", "")
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
            $r1 = $s1.Read($CompareBuf1, 0, $CompareBufferSize)
            $r2 = $s2.Read($CompareBuf2, 0, $CompareBufferSize)
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

function Get-FilesFast {
    param([string]$RootPath)
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $enumOpts = [System.IO.EnumerationOptions]::new()
        $enumOpts.RecurseSubdirectories = $true
        $enumOpts.IgnoreInaccessible = $true
        $enumOpts.AttributesToSkip = $enumOpts.AttributesToSkip -bor [System.IO.FileAttributes]::ReparsePoint
        return [System.IO.DirectoryInfo]::new($RootPath).EnumerateFiles('*', $enumOpts)
    }
    return Get-ChildItem -LiteralPath $RootPath -File -Recurse -ErrorAction SilentlyContinue | Where-Object {
        ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
    }
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
            if ($candidates.Count -eq 1 -and $file.FullName.Equals($candidates[0], [System.StringComparison]::OrdinalIgnoreCase)) {
                continue
            }

            $srcPartial = Get-FastPartialHash -LiteralPath $file.FullName
            $partialMatches = [System.Collections.Generic.List[string]]::new()

            foreach ($refFile in $candidates) {
                if ($file.FullName.Equals($refFile, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                if (-not $referencePartialHashes.ContainsKey($refFile)) {
                    $referencePartialHashes[$refFile] = Get-FastPartialHash -LiteralPath $refFile
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
                    SourceFile = $file.FullName
                    MatchingFiles = ($matchingFiles -join "; ")
                })

                $Destination = Join-Path $QuarantineFolder $file.Name
                $Counter = 1
                while (Test-Path -LiteralPath $Destination) {
                    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
                    $Extension = [System.IO.Path]::GetExtension($file.Name)
                    $Destination = Join-Path $QuarantineFolder ("{0}_{1}_{2}{3}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Counter, $Extension)
                    $Counter++
                }

                if ($PSCmdlet.ShouldProcess($file.FullName, "Move duplicate file to $Destination")) {
                    Move-Item -LiteralPath $file.FullName -Destination $Destination -ErrorAction Stop
                    $MovedFiles[$file.FullName] = $true
                    Write-Host "Moved duplicate to quarantine: $($file.FullName)"
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
