<#
.SYNOPSIS
    Find and quarantine files in a source folder that already exist in a reference folder.
.DESCRIPTION
    Indexes ReferenceFolder by file size, compares candidate files in SourceFolder
    using partial SHA-256 and exact byte/full-hash verification, moves confirmed
    duplicates to QuarantineFolder, and exports a CSV report on real runs.
.PARAMETER SourceFolder
    Folder to scan for duplicate files to quarantine.
.PARAMETER ReferenceFolder
    Authoritative reference folder containing files to keep.
.PARAMETER QuarantineFolder
    Destination folder where duplicate source files are moved.
.EXAMPLE
    .\'find duplicated based on folder.ps1' -SourceFolder "D:\Inbox" -ReferenceFolder "D:\Pictures" -WhatIf
    Previews which duplicate files would be moved without altering disk state or writing a Desktop CSV report.
.EXAMPLE
    .\'find duplicated based on folder.ps1' -SourceFolder "D:\Inbox" -ReferenceFolder "D:\Pictures" -QuarantineFolder "D:\Quarantine" -Confirm
    Interactively prompts before moving each confirmed duplicate file to a custom quarantine folder.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Folder containing candidate duplicate files to check.")]
    [string]$SourceFolder,
    [Parameter(Mandatory = $true, HelpMessage = "Reference folder containing original files to keep.")]
    [string]$ReferenceFolder,
    [string]$QuarantineFolder = "",
    [string]$ReportPath = ""
)

if ([string]::IsNullOrWhiteSpace($SourceFolder) -or -not (Test-Path -LiteralPath $SourceFolder -PathType Container)) {
    Write-Error "Source folder does not exist or is not a directory: $SourceFolder. Run 'Get-Help .\find duplicated based on folder.ps1 -Examples' for usage."
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ReferenceFolder) -or -not (Test-Path -LiteralPath $ReferenceFolder -PathType Container)) {
    Write-Error "Reference folder does not exist or is not a directory: $ReferenceFolder. Run 'Get-Help .\find duplicated based on folder.ps1 -Examples' for usage."
    exit 1
}

$SourceFolder = [System.IO.Path]::GetFullPath($SourceFolder)
$ReferenceFolder = [System.IO.Path]::GetFullPath($ReferenceFolder)
if ([string]::IsNullOrWhiteSpace($QuarantineFolder)) {
    $sourceParent = [System.IO.Path]::GetDirectoryName($SourceFolder.TrimEnd('\', '/'))
    if ([string]::IsNullOrWhiteSpace($sourceParent)) { $sourceParent = $SourceFolder }
    $QuarantineFolder = Join-Path $sourceParent "_duplicates_quarantine"
}
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
if ($SourceNormalized.StartsWith($ReferenceNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $ReferenceNormalized.StartsWith($SourceNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "SourceFolder and ReferenceFolder cannot overlap ($SourceFolder vs $ReferenceFolder)."
    exit 1
}
if ($QuarantineNormalized.Equals($SourceNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $QuarantineNormalized.Equals($ReferenceNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "QuarantineFolder cannot be the same as SourceFolder or ReferenceFolder ($QuarantineFolder)."
    exit 1
}
if ($SourceNormalized.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $ReferenceNormalized.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $QuarantineNormalized.StartsWith($ReferenceNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "QuarantineFolder ($QuarantineFolder) cannot be an ancestor of SourceFolder/ReferenceFolder or inside ReferenceFolder."
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

function Format-ByteSize {
    param([long]$Bytes)
    $size = [double]$Bytes
    foreach ($unit in @("B", "KB", "MB", "GB", "TB")) {
        if ($size -lt 1024.0 -or $unit -eq "TB") {
            if ($unit -eq "B") {
                return "$([Math]::Round($size)) B"
            }
            return "$($size.ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture)) $unit"
        }
        $size /= 1024.0
    }
}

$Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$ModeLabel = if ($WhatIfPreference) { "WhatIf preview (no files will be moved)" } else { "Active quarantine" }
Write-Host "Mode             : $ModeLabel"
Write-Host "Source folder    : $SourceFolder"
Write-Host "Reference folder : $ReferenceFolder"
Write-Host "Quarantine folder: $QuarantineFolder"
Write-Host "Scanning source folder and building matching reference index..."

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
    if (([System.IO.File]::GetAttributes($LiteralPath) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw [System.IO.IOException]::new("Refusing to read reparse point (symlink/junction): $LiteralPath")
    }
    $stream = [System.IO.File]::Open($LiteralPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
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

# ⚡ Bolt: Streaming 1 MB block comparison with native memcmp (fallback to Enumerable.SequenceEqual) and early exit
$CompareBufferSize = 1048576
$CompareBuf1 = New-Object byte[] $CompareBufferSize
$CompareBuf2 = New-Object byte[] $CompareBufferSize
$script:FastCompareState = $null

function Initialize-FastByteCompare {
    if ($null -ne $script:FastCompareState) { return }
    if (([System.Management.Automation.PSTypeName]'FastByteCompare').Type) {
        $script:FastCompareState = $true
        return
    }
    try {
        Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class FastByteCompare {
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [DllImport("msvcrt.dll", CallingConvention = CallingConvention.Cdecl)]
    private static extern int memcmp(byte[] b1, byte[] b2, UIntPtr count);

    public static bool Equals(byte[] a, byte[] b, int count) {
        if (count == 0) return true;
        if (a == null || b == null) return false;
        if (count < 0 || count > a.Length || count > b.Length) {
            throw new ArgumentOutOfRangeException("count");
        }
        return memcmp(a, b, (UIntPtr)(uint)count) == 0;
    }
}
"@ -ErrorAction Stop
        $script:FastCompareState = $true
    }
    catch {
        $script:FastCompareState = $false
    }
}

function Compare-FilesExact {
    param([string]$Path1, [string]$Path2)
    if (([System.IO.File]::GetAttributes($Path1) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw [System.IO.IOException]::new("Refusing to read reparse point (symlink/junction): $Path1")
    }
    if (([System.IO.File]::GetAttributes($Path2) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw [System.IO.IOException]::new("Refusing to read reparse point (symlink/junction): $Path2")
    }
    $s1 = [System.IO.File]::Open($Path1, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
    $s2 = $null
    try {
        $s2 = [System.IO.File]::Open($Path2, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
        if ($s1.Length -ne $s2.Length) { return $false }
        Initialize-FastByteCompare
        while ($true) {
            $r1 = Read-FullChunk -Stream $s1 -Buffer $CompareBuf1 -Count $CompareBufferSize
            $r2 = Read-FullChunk -Stream $s2 -Buffer $CompareBuf2 -Count $CompareBufferSize
            if ($r1 -ne $r2) { return $false }
            if ($r1 -eq 0) { return $true }
            if ($script:FastCompareState) {
                if (-not [FastByteCompare]::Equals($CompareBuf1, $CompareBuf2, $r1)) { return $false }
            } elseif ($r1 -eq $CompareBufferSize) {
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
    $trimmedStart = $Value.TrimStart()
    if ($Value[0] -in @('=', '+', '-', '@', "`t", "`r", "`n") -or
        (-not [string]::IsNullOrEmpty($trimmedStart) -and $trimmedStart[0] -in @('=', '+', '-', '@'))) {
        return "'" + $Value
    }
    return $Value
}

function Reserve-QuarantinePath {
    param(
        [string]$QuarantineDir,
        [string]$FileName,
        [bool]$WhatIfMode = $false
    )
    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($FileName)
    $Extension = [System.IO.Path]::GetExtension($FileName)
    $Timestamp = [DateTime]::Now.ToString("yyyyMMdd_HHmmss")
    $Counter = 0
    while ($true) {
        $candidateName = if ($Counter -eq 0) { $FileName } else { "{0}_{1}_{2}{3}" -f $BaseName, $Timestamp, $Counter, $Extension }
        $candidate = Join-Path $QuarantineDir $candidateName
        $Counter++
        if ($WhatIfMode) {
            if (-not ([System.IO.File]::Exists($candidate) -or [System.IO.Directory]::Exists($candidate))) {
                return $candidate
            }
            continue
        }
        if ([System.IO.Directory]::Exists($candidate)) {
            continue
        }
        try {
            $fs = [System.IO.File]::Open($candidate, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
            $fs.Dispose()
            return $candidate
        }
        catch [System.IO.IOException] {
            if (-not ([System.IO.File]::Exists($candidate) -or [System.IO.Directory]::Exists($candidate))) { throw }
            if ($Counter -gt 10000) { throw }
        }
    }
}

$script:SkippedDirs = 0

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
            $script:SkippedDirs++
        }
    }
    return $results
}

# ⚡ Bolt: Scan source folder first so the reference index skips files whose size doesn't exist in source
$sourceFiles = @(Get-FilesFast -RootPath $SourceFolder)
$sourceSizes = [System.Collections.Generic.HashSet[long]]::new()
foreach ($file in $sourceFiles) {
    if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    $null = $sourceSizes.Add($file.Length)
}

$referenceFilesBySize = [System.Collections.Generic.Dictionary[long, System.Collections.Generic.List[string]]]::new()
[int]$TotalReferenceFiles = 0

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop and filtered by source sizes
if ($sourceSizes.Count -gt 0) {
    foreach ($file in Get-FilesFast -RootPath $ReferenceFolder) {
        if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        $size = $file.Length
        if (-not $sourceSizes.Contains($size)) { continue }
        $list = $null
        if (-not $referenceFilesBySize.TryGetValue($size, [ref]$list)) {
            # ⚡ Bolt: Using List[string] instead of @() to avoid O(N²) reallocation on +=
            $list = [System.Collections.Generic.List[string]]::new()
            $referenceFilesBySize[$size] = $list
        }
        # ⚡ Bolt: .Add() is O(1) amortized, whereas += on arrays is O(N)
        $list.Add($file.FullName)
        $TotalReferenceFiles++
    }
}

$referencePartialHashes = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$referenceHashes = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$MovedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
# ⚡ Bolt: Using List instead of @() for efficient O(1) appends
$duplicates = [System.Collections.Generic.List[PSCustomObject]]::new()

$TotalSourceFiles = $sourceFiles.Count
$SourceIndex = 0
$LastPercent = -1
[long]$ReclaimedBytes = 0
[int]$ErrorCount = 0

Write-Host "Indexed $TotalReferenceFiles reference file(s). Checking $TotalSourceFiles source file(s)..."

try {
    # ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
    foreach ($file in $sourceFiles) {
        $SourceIndex++
        if ($TotalSourceFiles -gt 0) {
            $Percent = [int](($SourceIndex / $TotalSourceFiles) * 100)
            if ($Percent -ne $LastPercent) {
                $LastPercent = $Percent
                Write-Progress -Activity "Checking source folder for duplicates" -Status "$SourceIndex of $TotalSourceFiles ($($file.Name))" -PercentComplete $Percent
            }
        }
        if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        if ($MovedFiles.Contains($file.FullName)) { continue }
        try {
            $size = $file.Length

            if ($referenceFilesBySize.ContainsKey($size)) {
                $candidates = $referenceFilesBySize[$size]
                if ($candidates.Count -eq 1 -and ($file.FullName.Equals($candidates[0], [System.StringComparison]::OrdinalIgnoreCase) -or $MovedFiles.Contains($candidates[0]))) {
                    continue
                }

                $srcPartial = Get-FastPartialHash -LiteralPath $file.FullName -ExpectedLength $size
                $partialMatches = [System.Collections.Generic.List[string]]::new()

                foreach ($refFile in $candidates) {
                    if ($file.FullName.Equals($refFile, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
                    if ($MovedFiles.Contains($refFile)) { continue }
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
                        if ($MovedFiles.Contains($refFile)) { continue }
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
                    if (([System.IO.File]::GetAttributes($file.FullName) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                        Write-Warning "Skipping reparse point (symlink/junction): $($file.FullName)"
                        continue
                    }

                    $PreviewDestination = Reserve-QuarantinePath -QuarantineDir $QuarantineFolder -FileName $file.Name -WhatIfMode $true
                    if ($PSCmdlet.ShouldProcess($file.FullName, "Move duplicate file to $PreviewDestination")) {
                        $Destination = Reserve-QuarantinePath -QuarantineDir $QuarantineFolder -FileName $file.Name -WhatIfMode $false
                        try {
                            if (([System.IO.File]::GetAttributes($Destination) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                                throw [System.IO.IOException]::new("Refusing to move into reparse point destination: $Destination")
                            }
                            Move-Item -LiteralPath $file.FullName -Destination $Destination -Force -ErrorAction Stop
                        }
                        catch {
                            if ([System.IO.File]::Exists($Destination)) {
                                Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                            }
                            throw
                        }
                        $duplicates.Add([PSCustomObject]@{
                            SourceFile = (Format-SafeCsvField -Value $file.FullName)
                            MatchingFiles = (Format-SafeCsvField -Value ($matchingFiles -join "; "))
                        })
                        $null = $MovedFiles.Add($file.FullName)
                        $ReclaimedBytes += $size
                        Write-Host "Moved duplicate ($(Format-ByteSize -Bytes $size)): $($file.FullName) [KEEP: $($matchingFiles[0])]"
                    } elseif ($WhatIfPreference) {
                        $duplicates.Add([PSCustomObject]@{
                            SourceFile = (Format-SafeCsvField -Value $file.FullName)
                            MatchingFiles = (Format-SafeCsvField -Value ($matchingFiles -join "; "))
                        })
                        $null = $MovedFiles.Add($file.FullName)
                        $ReclaimedBytes += $size
                        Write-Host "[WHATIF] Would move ($(Format-ByteSize -Bytes $size)): $($file.FullName) [KEEP: $($matchingFiles[0])]"
                    }
                }
            }
        }
        catch {
            $ErrorCount++
            Write-Warning "Failed to process: $($file.FullName) - $($_.Exception.Message)"
        }
    }
}
finally {
    Write-Progress -Activity "Checking source folder for duplicates" -Completed
    $PartialSha256.Dispose()
}
$Stopwatch.Stop()
$ElapsedText = $Stopwatch.Elapsed.TotalSeconds.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
$FormattedSize = Format-ByteSize -Bytes $ReclaimedBytes

Write-Host ""
if ($WhatIfPreference) {
    Write-Host "Completed in ${ElapsedText}s (WhatIf preview - no files were moved)."
    Write-Host "Files checked                  : $TotalSourceFiles"
    Write-Host "Duplicates that would be moved : $($duplicates.Count)"
    Write-Host "Space that would be reclaimed  : $FormattedSize"
    Write-Host "Target quarantine folder       : $QuarantineFolder"
    if ($duplicates.Count -gt 0) {
        Write-Host "Tip: Re-run without -WhatIf to move these duplicate files and export the CSV report."
    }
} else {
    $reportSaved = $false
    $ReportFile = $null
    if ($duplicates.Count -gt 0) {
        if (-not [string]::IsNullOrWhiteSpace($ReportPath)) {
            $ReportFile = [System.IO.Path]::GetFullPath($ReportPath)
            $ReportDir = [System.IO.Path]::GetDirectoryName($ReportFile)
        } else {
            $DesktopDir = [Environment]::GetFolderPath('Desktop')
            $ReportDir = if (-not [string]::IsNullOrWhiteSpace($DesktopDir) -and (Test-Path -LiteralPath $DesktopDir -PathType Container)) {
                $DesktopDir
            } else {
                $QuarantineFolder
            }
            $ReportFile = Join-Path $ReportDir "DuplicateFilesReport_$(Get-Date -Format 'yyyyMMdd_HHmmss_fff').csv"
        }
        if ([string]::IsNullOrWhiteSpace($ReportDir) -or -not (Test-Path -LiteralPath $ReportDir -PathType Container)) {
            Write-Warning "Report directory does not exist: $ReportDir"
        } elseif ((Test-HasReparsePointInLineage -Path $ReportDir) -or (Test-HasReparsePointInLineage -Path $ReportFile)) {
            Write-Warning "Refusing to export report into reparse-point path: $ReportFile"
        } else {
            try {
                $duplicates | Export-Csv -LiteralPath $ReportFile -NoTypeInformation -NoClobber -ErrorAction Stop
                $reportSaved = $true
            }
            catch {
                Write-Warning "Failed to export report: $($_.Exception.Message)"
            }
        }
    }

    Write-Host "Completed in ${ElapsedText}s."
    Write-Host "Files checked     : $TotalSourceFiles"
    Write-Host "Duplicates moved  : $($duplicates.Count)"
    Write-Host "Space reclaimed   : $FormattedSize"
    Write-Host "Quarantine folder : $QuarantineFolder"
    if ($reportSaved) {
        Write-Host "Report saved to   : $ReportFile"
    } elseif ($duplicates.Count -eq 0) {
        Write-Host "Report            : Not created (no duplicates found)"
    }
}
if ($script:SkippedDirs -gt 0) {
    Write-Host "Skipped inaccessible folders: $($script:SkippedDirs)"
}
if ($ErrorCount -gt 0) {
    Write-Host "Errors / skipped  : $ErrorCount"
}
