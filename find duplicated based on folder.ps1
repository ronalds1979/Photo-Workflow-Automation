$SourceFolder = "D:\Other files and trash videos"
$ReferenceFolder = "D:\Original\Pictures"

Write-Host "Building hash index for reference folder..."

$referenceHashes = @{}

Get-ChildItem -Path $ReferenceFolder -File -Recurse | ForEach-Object {
    try {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
        if (-not $referenceHashes.ContainsKey($hash)) {
            $referenceHashes[$hash] = @()
        }
        $referenceHashes[$hash] += $_.FullName
    }
    catch {
        Write-Warning "Failed to hash: $($_.FullName)"
    }
}

$duplicates = @()

Write-Host "Checking source folder..."

Get-ChildItem -Path $SourceFolder -File -Recurse | ForEach-Object {
    try {
        $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash

        if ($referenceHashes.ContainsKey($hash)) {

            $duplicates += [PSCustomObject]@{
                SourceFile = $_.FullName
                MatchingFiles = ($referenceHashes[$hash] -join "; ")
            }

            Remove-Item $_.FullName -Force

            Write-Host "Deleted duplicate: $($_.FullName)"
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
Write-Host "Report saved to: $ReportFile"