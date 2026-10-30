# ====================================================================
# FIND AND REMOVE DUPLICATE VIDEOS
# Keeps the copy outside the target folder
# Moves duplicates to a quarantine folder for safety
# ====================================================================

$FolderToCheck = "D:\Other files and trash videos"
$DriveRoot = "D:\"
$QuarantineFolder = "D:\DuplicateVideosFound"

# Create quarantine folder if missing
if (!(Test-Path -LiteralPath $QuarantineFolder)) {
    New-Item -ItemType Directory -LiteralPath $QuarantineFolder | Out-Null
}

# Video extensions
$VideoExtensions = @(
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".m4v",
    ".ts",
    ".mts",
    ".m2ts",
    ".flv",
    ".webm"
)

Write-Host ""
Write-Host "Scanning drive..."
Write-Host ""

# Read all video files once
$AllVideos = Get-ChildItem `
    -LiteralPath $DriveRoot `
    -File `
    -Recurse `
    -ErrorAction SilentlyContinue |
    Where-Object {
        $VideoExtensions -contains $_.Extension.ToLower()
    }

Write-Host "Found $($AllVideos.Count) video files."
Write-Host ""

# Group by filename
# ⚡ Bolt: Using -AsHashTable -AsString changes lookup complexity from O(N²) to O(1)
$VideosByName = $AllVideos | Group-Object Name -AsHashTable -AsString

# 🛡️ Sentinel: Enforce directory boundary and case-insensitive matching to prevent path confusion (e.g. matching "D:\Folder_Secret" when checking "D:\Folder")
$FolderToCheckNormalized = $FolderToCheck.TrimEnd('\') + '\'

# Only videos inside the folder being cleaned
$VideosToCheck = $AllVideos | Where-Object {
    $_.FullName.StartsWith($FolderToCheckNormalized, [System.StringComparison]::OrdinalIgnoreCase)
}

Write-Host "Checking $($VideosToCheck.Count) videos..."
Write-Host ""

# ⚡ Bolt: Cache hashes to avoid recalculating for large video files
$FileHashes = @{}
$MovedFiles = @{}

foreach ($Video in $VideosToCheck) {

    if ($MovedFiles.ContainsKey($Video.FullName)) { continue }

    Write-Host "Checking: $($Video.Name)"

    # ⚡ Bolt: Fast hash table lookup instead of filtering the whole collection
    # ⚡ Bolt: Avoided pipeline (Where-Object) overhead by filtering directly inside the loop
    $AllCandidatesForName = $VideosByName[$Video.Name]

    foreach ($Candidate in $AllCandidatesForName) {

        if ($Candidate.FullName -eq $Video.FullName) { continue }
        if ($MovedFiles.ContainsKey($Candidate.FullName)) { continue }

        # Quick size comparison first
        if ($Video.Length -ne $Candidate.Length) {
            continue
        }

        try {
            if (-not $FileHashes.ContainsKey($Video.FullName)) {
                $FileHashes[$Video.FullName] = (Get-FileHash -LiteralPath $Video.FullName -Algorithm SHA256).Hash
            }
            if (-not $FileHashes.ContainsKey($Candidate.FullName)) {
                $FileHashes[$Candidate.FullName] = (Get-FileHash -LiteralPath $Candidate.FullName -Algorithm SHA256).Hash
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

                Move-Item `
                    -LiteralPath $Video.FullName `
                    -Destination $Destination

                # ⚡ Bolt: Record the moved file so we don't try to compare against it again later, avoiding errors
                $MovedFiles[$Video.FullName] = $true

                break
            }
        }
        catch {

            Write-Host "ERROR: $($Video.FullName)"
            Write-Host $_.Exception.Message
        }
    }
}

Write-Host ""
Write-Host "Finished."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host ""