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

$DriveRootTrimmed = $DriveRoot.TrimEnd('\', '/')
$FolderToCheckTrimmed = $FolderToCheck.TrimEnd('\', '/')
if ($FolderToCheckTrimmed.Equals($DriveRootTrimmed, [System.StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "FolderToCheck cannot be the same as DriveRoot ($DriveRoot)."
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

function Get-FastPartialHash {
    param([string]$LiteralPath)
    $stream = [System.IO.File]::Open($LiteralPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $len = $stream.Length
        $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
        if ($read -gt 0) { $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) | Out-Null }

        if ($len -gt ($PartialChunkSize * 2)) {
            $stream.Position = [long](($len - $PartialChunkSize) / 2)
            $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
            if ($read -gt 0) { $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) | Out-Null }
        }
        if ($len -gt $PartialChunkSize) {
            $stream.Position = [Math]::Max(0L, $len - $PartialChunkSize)
            $read = $stream.Read($PartialHashBuffer, 0, $PartialChunkSize)
            if ($read -gt 0) { $PartialSha256.TransformBlock($PartialHashBuffer, 0, $read, $null, 0) | Out-Null }
        }

        $PartialSha256.TransformFinalBlock([byte[]]::new(0), 0, 0) | Out-Null
        return [System.BitConverter]::ToString($PartialSha256.Hash).Replace("-", "")
    } finally {
        $stream.Dispose()
    }
}

# 🛡️ Sentinel: Enforce directory boundary and case-insensitive matching to prevent path confusion
$FolderToCheckNormalized = $FolderToCheck.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$QuarantineNormalized = $QuarantineFolder.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

# ⚡ Bolt: Single-pass scan populating both $VideosByName and $VideosToCheck without extra Group-Object/foreach passes
$VideosByName = [System.Collections.Generic.Dictionary[string, System.Collections.Generic.List[System.IO.FileInfo]]]::new([System.StringComparer]::OrdinalIgnoreCase)
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
        $files = Get-ChildItem -LiteralPath $DriveRoot -File -Recurse -ErrorAction SilentlyContinue | Where-Object {
            ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0
        }
    }

    foreach ($file in $files) {
        if ($file.FullName.StartsWith($QuarantineNormalized, [System.StringComparison]::OrdinalIgnoreCase)) {
            continue
        }
        if ($VideoExtensions.Contains($file.Extension)) {
            $TotalVideos++
            $list = $null
            if (-not $VideosByName.TryGetValue($file.Name, [ref]$list)) {
                $list = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
                $VideosByName[$file.Name] = $list
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

# ⚡ Bolt: Cache partial and full hashes to avoid recalculating for large video files
$PartialHashes = @{}
$FileHashes = @{}
$MovedFiles = @{}

$VideoIndex = 0
$TotalVideosToCheck = $VideosToCheck.Count
$LastPercent = -1

foreach ($Video in $VideosToCheck) {
    $VideoIndex++

    if ($MovedFiles.ContainsKey($Video.FullName)) { continue }

    # ⚡ Bolt: Fast hash table lookup instead of filtering the whole collection
    $AllCandidatesForName = $VideosByName[$Video.Name]

    # ⚡ Bolt: Early return before Write-Progress and Write-Host I/O if there are no duplicates to check
    if ($AllCandidatesForName.Count -le 1) { continue }

    if ($TotalVideosToCheck -gt 0) {
        $Percent = [int](($VideoIndex / $TotalVideosToCheck) * 100)
        if ($Percent -ne $LastPercent) {
            $LastPercent = $Percent
            Write-Progress -Activity "Checking for duplicate videos" -Status "$VideoIndex of $TotalVideosToCheck ($($Video.Name))" -PercentComplete $Percent
        }
    }

    Write-Host "Checking: $($Video.Name)"

    foreach ($Candidate in $AllCandidatesForName) {

        if ($Candidate.FullName -eq $Video.FullName) { continue }
        if ($MovedFiles.ContainsKey($Candidate.FullName)) { continue }

        # Quick size comparison first
        if ($Video.Length -ne $Candidate.Length) {
            continue
        }

        try {
            if (-not $PartialHashes.ContainsKey($Video.FullName)) {
                $PartialHashes[$Video.FullName] = Get-FastPartialHash -LiteralPath $Video.FullName
            }
            if (-not $PartialHashes.ContainsKey($Candidate.FullName)) {
                $PartialHashes[$Candidate.FullName] = Get-FastPartialHash -LiteralPath $Candidate.FullName
            }
            if ($PartialHashes[$Video.FullName] -ne $PartialHashes[$Candidate.FullName]) {
                continue
            }

            if (-not $FileHashes.ContainsKey($Video.FullName)) {
                $FileHashes[$Video.FullName] = (Get-FileHash -LiteralPath $Video.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
            }
            if (-not $FileHashes.ContainsKey($Candidate.FullName)) {
                $FileHashes[$Candidate.FullName] = (Get-FileHash -LiteralPath $Candidate.FullName -Algorithm SHA256 -ErrorAction Stop).Hash
            }

            $Hash1 = $FileHashes[$Video.FullName]
            $Hash2 = $FileHashes[$Candidate.FullName]

            if ($Hash1 -eq $Hash2) {

                Write-Host ""
                Write-Host "DUPLICATE FOUND" -ForegroundColor Yellow
                Write-Host "MOVE : $($Video.FullName)"
                Write-Host "KEEP : $($Candidate.FullName)"
                Write-Host ""

                $Destination = Join-Path $QuarantineFolder $Video.Name

                # Prevent filename collisions
                $Counter = 1
                while (Test-Path -LiteralPath $Destination) {

                    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($Video.Name)
                    $Extension = [System.IO.Path]::GetExtension($Video.Name)

                    $Destination = Join-Path `
                        $QuarantineFolder `
                        ("{0}_{1}_{2}{3}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Counter, $Extension)
                    $Counter++
                }

                if ($PSCmdlet.ShouldProcess($Video.FullName, "Move duplicate video to $Destination")) {
                    Move-Item `
                        -LiteralPath $Video.FullName `
                        -Destination $Destination `
                        -ErrorAction Stop

                    # ⚡ Bolt: Record the moved file so we don't try to compare against it again later, avoiding errors
                    $MovedFiles[$Video.FullName] = $true
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

$PartialSha256.Dispose()

Write-Host ""
Write-Host "Finished."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host ""