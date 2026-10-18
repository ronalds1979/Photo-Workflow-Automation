# ====================================================================
# FIND AND REMOVE DUPLICATE VIDEOS
# Keeps the copy outside the target folder
# Moves duplicates to a quarantine folder for safety
# ====================================================================

$FolderToCheck = "D:\Other files and trash videos"
$DriveRoot = "D:\"
$QuarantineFolder = "D:\DuplicateVideosFound"

# Create quarantine folder if missing
if (!(Test-Path $QuarantineFolder)) {
    New-Item -ItemType Directory -Path $QuarantineFolder | Out-Null
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
    -Path $DriveRoot `
    -File `
    -Recurse `
    -ErrorAction SilentlyContinue |
    Where-Object {
        $VideoExtensions -contains $_.Extension.ToLower()
    }

Write-Host "Found $($AllVideos.Count) video files."
Write-Host ""

# Group by filename
$VideosByName = $AllVideos | Group-Object Name

# Only videos inside the folder being cleaned
$VideosToCheck = $AllVideos | Where-Object {
    $_.FullName.StartsWith($FolderToCheck)
}

Write-Host "Checking $($VideosToCheck.Count) videos..."
Write-Host ""

foreach ($Video in $VideosToCheck) {

    Write-Host "Checking: $($Video.Name)"

    $Candidates = $VideosByName |
        Where-Object { $_.Name -eq $Video.Name } |
        Select-Object -ExpandProperty Group |
        Where-Object { $_.FullName -ne $Video.FullName }

    foreach ($Candidate in $Candidates) {

        # Quick size comparison first
        if ($Video.Length -ne $Candidate.Length) {
            continue
        }

        try {

            $Hash1 = (Get-FileHash -Path $Video.FullName -Algorithm SHA256).Hash
            $Hash2 = (Get-FileHash -Path $Candidate.FullName -Algorithm SHA256).Hash

            if ($Hash1 -eq $Hash2) {

                Write-Host ""
                Write-Host "DUPLICATE FOUND" -ForegroundColor Yellow
                Write-Host "MOVE : $($Video.FullName)"
                Write-Host "KEEP : $($Candidate.FullName)"
                Write-Host ""

                $Destination = Join-Path $QuarantineFolder $Video.Name

                # Prevent filename collisions
                if (Test-Path $Destination) {

                    $BaseName = [SystemIO.Path]::GetFileNameWithoutExtension($Video.Name)
                    $Extension = [System.IO.Path]::GetExtension($Video.Name)

                    $Destination = Join-Path `
                        $QuarantineFolder `
                        ("{0}_{1}{2}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Extension)
                }

                Move-Item `
                    -Path $Video.FullName `
                    -Destination $Destination `
                    -Force

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