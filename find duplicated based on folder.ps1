$SourceFolder = "D:\Other files and trash videos"
$ReferenceFolder = "D:\Original\Pictures"
$QuarantineFolder = "D:\DuplicateFilesFound"

if (!(Test-Path $QuarantineFolder)) {
    New-Item -ItemType Directory -Path $QuarantineFolder | Out-Null
}

Write-Host "Building size and hash index for reference folder..."

$referenceFilesBySize = @{}

Get-ChildItem -Path $ReferenceFolder -File -Recurse | ForEach-Object {
    $size = $_.Length
    if (-not $referenceFilesBySize.ContainsKey($size)) {
        $referenceFilesBySize[$size] = @()
    }
    $referenceFilesBySize[$size] += $_.FullName
}

$referenceHashes = @{}
$duplicates = @()

Write-Host "Checking source folder..."

Get-ChildItem -Path $SourceFolder -File -Recurse | ForEach-Object {
    try {
        $size = $_.Length

        if ($referenceFilesBySize.ContainsKey($size)) {
            $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash

            $matchFound = $false
            $matchingFiles = @()

            foreach ($refFile in $referenceFilesBySize[$size]) {
                if (-not $referenceHashes.ContainsKey($refFile)) {
                    $referenceHashes[$refFile] = (Get-FileHash $refFile -Algorithm SHA256).Hash
                }

                if ($hash -eq $referenceHashes[$refFile]) {
                    $matchFound = $true
                    $matchingFiles += $refFile
                }
            }

            if ($matchFound) {
                $duplicates += [PSCustomObject]@{
                    SourceFile = $_.FullName
                    MatchingFiles = ($matchingFiles -join "; ")
                }

                $Destination = Join-Path $QuarantineFolder $_.Name
                if (Test-Path $Destination) {
                    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                    $Extension = [System.IO.Path]::GetExtension($_.Name)
                    $Destination = Join-Path $QuarantineFolder ("{0}_{1}{2}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Extension)
                }

                Move-Item -Path $_.FullName -Destination $Destination -Force
                Write-Host "Moved duplicate to quarantine: $($_.FullName)"
            }
        }
    }
    catch {
        Write-Warning "Failed to process: $($_.FullName)"
    }
}

$ReportFile = "$env:USERPROFILE\Desktop\DuplicateFilesReport.csv"
$duplicates | Export-Csv $ReportFile -NoTypeInformation

Write-Host ""
Write-Host "Completed."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host "Report saved to: $ReportFile"
