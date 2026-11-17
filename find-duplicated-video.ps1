# ====================================================================
# FIND AND REMOVE DUPLICATE VIDEOS
# Keeps the copy outside the target folder
# Moves duplicates to a quarantine folder for safety
# ====================================================================

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$FolderToCheck = "D:\Other files and trash videos",
    [string]$DriveRoot = "D:\",
    [string]$QuarantineFolder = "D:\DuplicateVideosFound"
)

if ([string]::IsNullOrWhiteSpace($DriveRoot) -or -not (Test-Path -LiteralPath $DriveRoot -PathType Container)) {
    Write-Error "DriveRoot does not exist or is not a directory: $DriveRoot"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($FolderToCheck) -or -not (Test-Path -LiteralPath $FolderToCheck -PathType Container)) {
    Write-Error "FolderToCheck does not exist or is not a directory: $FolderToCheck"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($QuarantineFolder)) {
    Write-Error "Quarantine folder path cannot be empty."
    exit 1
}

$DriveRoot = [System.IO.Path]::GetFullPath($DriveRoot)
$FolderToCheck = [System.IO.Path]::GetFullPath($FolderToCheck)
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

if (Test-HasReparsePointInLineage -Path $DriveRoot) {
    Write-Error "DriveRoot must not be or traverse a reparse point (symlink/junction): $DriveRoot"
    exit 1
}
if (Test-HasReparsePointInLineage -Path $FolderToCheck) {
    Write-Error "FolderToCheck must not be or traverse a reparse point (symlink/junction): $FolderToCheck"
    exit 1
}
if (Test-HasReparsePointInLineage -Path $QuarantineFolder) {
    Write-Error "Quarantine folder must not be or traverse a reparse point (symlink/junction): $QuarantineFolder"
    exit 1
}

# 🛡️ Sentinel: Enforce directory boundary and case-insensitive matching to prevent path confusion
$DriveRootNormalized = $DriveRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$FolderToCheckNormalized = $FolderToCheck.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$QuarantineNormalized = $QuarantineFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

if ($FolderToCheckNormalized.Equals($DriveRootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "FolderToCheck cannot be the same as DriveRoot ($DriveRoot)."
    exit 1
}
if (-not $FolderToCheckNormalized.StartsWith($DriveRootNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "FolderToCheck ($FolderToCheck) must be located inside DriveRoot ($DriveRoot)."
    exit 1
}
if ($QuarantineNormalized.Equals($DriveRootNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $QuarantineNormalized.Equals($FolderToCheckNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "QuarantineFolder cannot be the same as DriveRoot or FolderToCheck ($QuarantineFolder)."
    exit 1
}
if ($DriveRootNormalized.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase) -or
    $FolderToCheckNormalized.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "QuarantineFolder ($QuarantineFolder) cannot be an ancestor of DriveRoot or FolderToCheck."
    exit 1
}

# Create quarantine folder if missing, or verify it is not a reparse point
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

# Video extensions
# ⚡ Bolt: Using HashSet with OrdinalIgnoreCase for O(1) case-insensitive lookups instead of O(N) array scans and .ToLower() allocations
$VideoExtensions = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
@(".mp4", ".mkv", ".avi", ".mov", ".wmv", ".m4v", ".ts", ".mts", ".m2ts", ".flv", ".webm") | ForEach-Object {
    $VideoExtensions.Add($_) | Out-Null
}

Write-Host ""
Write-Host "Scanning drive..."
Write-Host ""

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

# ⚡ Bolt: Streaming 1 MB block comparison with early exit on first mismatched chunk (avoids full-file SHA-256 I/O & CPU)
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
            if ($Counter -gt 10000) { throw }
        }
    }
}

# ⚡ Bolt: Composite key (Name|Length) eliminates camera filename collisions (e.g. C0001.MP4) before console/progress I/O
$VideosByNameAndLength = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[System.IO.FileInfo]]]::new([System.StringComparer]::OrdinalIgnoreCase)
$VideosToCheck = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
$TotalVideos = 0

try {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $enumOpts = [System.IO.EnumerationOptions]::new()
        $enumOpts.RecurseSubdirectories = $true
        $enumOpts.IgnoreInaccessible = $true
        $enumOpts.AttributesToSkip = $enumOpts.AttributesToSkip -bor [System.IO.FileAttributes]::ReparsePoint
        $files = [System.IO.DirectoryInfo]::new($DriveRoot).EnumerateFiles('*', $enumOpts)
    } else {
        # ⚡ Bolt: Stack-based .NET traversal for PS 5.1 avoids Get-ChildItem pipeline overhead and skips reparse-point directories before descending
        $files = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
        $stack = [System.Collections.Generic.Stack[System.IO.DirectoryInfo]]::new()
        $rootInfo = [System.IO.DirectoryInfo]::new($DriveRoot)
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
                        $files.Add($entry)
                    }
                }
            } catch {
                # Ignore inaccessible directories
            }
        }
    }

    foreach ($file in $files) {
        if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        if ($VideoExtensions.Contains($file.Extension)) {
            $TotalVideos++
            $key = "$($file.Name)|$($file.Length)"
            $list = $null
            if (-not $VideosByNameAndLength.TryGetValue($key, [ref]$list)) {
                $list = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
                $VideosByNameAndLength[$key] = $list
            }
            $list.Add($file)
            if ($file.FullName.StartsWith($FolderToCheckNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
                $VideosToCheck.Add($file)
            }
        }
    }
}
catch {
    Write-Error "Failed to scan drive root '$DriveRoot': $($_.Exception.Message)"
    exit 1
}

Write-Host "Found $TotalVideos video files."
Write-Host ""
Write-Host "Checking $($VideosToCheck.Count) videos..."
Write-Host ""

# ⚡ Bolt: Cache partial hashes in strongly-typed .NET collections to avoid PowerShell hashtable overhead
$PartialHashes = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$MovedFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

$VideoIndex = 0
$TotalVideosToCheck = $VideosToCheck.Count
$LastPercent = -1
[long]$ReclaimedBytes = 0
[int]$DuplicatesMoved = 0

foreach ($Video in $VideosToCheck) {
    $VideoIndex++

    if ($MovedFiles.Contains($Video.FullName)) { continue }

    # ⚡ Bolt: O(1) composite Name|Length lookup skips unrelated size collisions before Write-Progress/Write-Host
    $AllCandidatesForName = $VideosByNameAndLength["$($Video.Name)|$($Video.Length)"]

    # ⚡ Bolt: Early return before Write-Progress and Write-Host I/O if there are no size-matching duplicates to check
    if ($AllCandidatesForName.Count -le 1) { continue }

    if ($TotalVideosToCheck -gt 0) {
        $Percent = [int](($VideoIndex / $TotalVideosToCheck) * 100)
        if ($Percent -ne $LastPercent) {
            $LastPercent = $Percent
            Write-Progress -Activity "Checking for duplicate videos" -Status "$VideoIndex of $TotalVideosToCheck ($($Video.Name))" -PercentComplete $Percent
        }
    }

    Write-Host "Checking: $($Video.Name)"

    $externalCandidates = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
    $intraCandidates = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
    foreach ($c in $AllCandidatesForName) {
        if ($c.FullName.StartsWith($FolderToCheckNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
            $intraCandidates.Add($c)
        } else {
            $externalCandidates.Add($c)
        }
    }
    $OrderedCandidates = [System.Collections.Generic.List[System.IO.FileInfo]]::new($AllCandidatesForName.Count)
    $OrderedCandidates.AddRange($externalCandidates)
    $OrderedCandidates.AddRange($intraCandidates)

    foreach ($Candidate in $OrderedCandidates) {

        if ($Candidate.FullName -eq $Video.FullName) { continue }
        if ($MovedFiles.Contains($Candidate.FullName)) { continue }

        try {
            if (-not $PartialHashes.ContainsKey($Video.FullName)) {
                $PartialHashes[$Video.FullName] = Get-FastPartialHash -LiteralPath $Video.FullName -ExpectedLength $Video.Length
            }
            if (-not $PartialHashes.ContainsKey($Candidate.FullName)) {
                $PartialHashes[$Candidate.FullName] = Get-FastPartialHash -LiteralPath $Candidate.FullName -ExpectedLength $Video.Length
            }
            if ($PartialHashes[$Video.FullName] -ne $PartialHashes[$Candidate.FullName]) {
                continue
            }

            # ⚡ Bolt: Files <= 192 KB are already 100% covered by Get-FastPartialHash; larger files use streaming early-exit comparison
            $isExactMatch = ($Video.Length -le ($PartialChunkSize * 3)) -or (Compare-FilesExact -Path1 $Video.FullName -Path2 $Candidate.FullName)

            if ($isExactMatch) {
                $sourceItem = Get-Item -LiteralPath $Video.FullName -Force -ErrorAction Stop
                if (($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                    Write-Warning "Skipping reparse point (symlink/junction): $($Video.FullName)"
                    break
                }

                Write-Host ""
                Write-Host "DUPLICATE FOUND" -ForegroundColor Yellow
                Write-Host "MOVE : $($Video.FullName)"
                Write-Host "KEEP : $($Candidate.FullName)"
                Write-Host ""

                $PreviewDestination = Reserve-QuarantinePath -QuarantineDir $QuarantineFolder -FileName $Video.Name -WhatIfMode $true
                if ($PSCmdlet.ShouldProcess($Video.FullName, "Move duplicate video to $PreviewDestination")) {
                    $Destination = Reserve-QuarantinePath -QuarantineDir $QuarantineFolder -FileName $Video.Name -WhatIfMode $false
                    try {
                        Move-Item `
                            -LiteralPath $Video.FullName `
                            -Destination $Destination `
                            -Force `
                            -ErrorAction Stop
                    }
                    catch {
                        if ([System.IO.File]::Exists($Destination)) {
                            Remove-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
                        }
                        throw
                    }

                    # ⚡ Bolt: Record the moved file so we don't try to compare against it again later, avoiding errors
                    $null = $MovedFiles.Add($Video.FullName)
                    $DuplicatesMoved++
                    $ReclaimedBytes += $Video.Length
                } elseif ($WhatIfPreference) {
                    $null = $MovedFiles.Add($Video.FullName)
                    $DuplicatesMoved++
                    $ReclaimedBytes += $Video.Length
                }

                break
            }
        }
        catch {

            Write-Host "ERROR: $($Video.FullName)"
            Write-Host $_.Exception.Message
        }
    }
}

Write-Progress -Activity "Checking for duplicate videos" -Completed
$PartialSha256.Dispose()

Write-Host ""
Write-Host "Finished."
Write-Host "Duplicates moved  : $DuplicatesMoved ($([Math]::Round($ReclaimedBytes / 1MB, 2)) MB)"
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host ""