$SourceFolder = "D:\Other files and trash videos"
$ReferenceFolder = "D:\Original\Pictures"
$QuarantineFolder = "D:\DuplicateFilesFound"

if (!(Test-Path -LiteralPath $QuarantineFolder)) {
    New-Item -ItemType Directory -LiteralPath $QuarantineFolder | Out-Null
}

Write-Host "Building size and hash index for reference folder..."

$referenceFilesBySize = @{}

Get-ChildItem -LiteralPath $ReferenceFolder -File -Recurse | ForEach-Object {
    $size = $_.Length
    if (-not $referenceFilesBySize.ContainsKey($size)) {
        # ⚡ Bolt: Using List[string] instead of @() to avoid O(N²) reallocation on +=
        $referenceFilesBySize[$size] = [System.Collections.Generic.List[string]]::new()
    }
    # ⚡ Bolt: .Add() is O(1) amortized, whereas += on arrays is O(N)
    $referenceFilesBySize[$size].Add($_.FullName)
}

$referenceHashes = @{}
$MovedFiles = @{}
# ⚡ Bolt: Using List instead of @() for efficient O(1) appends
$duplicates = [System.Collections.Generic.List[PSCustomObject]]::new()

Write-Host "Checking source folder..."

Get-ChildItem -LiteralPath $SourceFolder -File -Recurse | ForEach-Object {
    if ($MovedFiles.ContainsKey($_.FullName)) { return }
    try {
        $size = $_.Length

        if ($referenceFilesBySize.ContainsKey($size)) {
            $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash

            $matchFound = $false
            # ⚡ Bolt: Using List[string] instead of @() for efficient O(1) appends
            $matchingFiles = [System.Collections.Generic.List[string]]::new()

            foreach ($refFile in $referenceFilesBySize[$size]) {
                if (-not $referenceHashes.ContainsKey($refFile)) {
                    $referenceHashes[$refFile] = (Get-FileHash -LiteralPath $refFile -Algorithm SHA256).Hash
                }

                if ($hash -eq $referenceHashes[$refFile]) {
                    $matchFound = $true
                    $matchingFiles.Add($refFile)
                }
            }

            if ($matchFound) {
                $duplicates.Add([PSCustomObject]@{
                    SourceFile = $_.FullName
                    MatchingFiles = ($matchingFiles -join "; ")
                })

                $Destination = Join-Path $QuarantineFolder $_.Name
                $Counter = 1
                while (Test-Path -LiteralPath $Destination) {
                    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
                    $Extension = [System.IO.Path]::GetExtension($_.Name)
                    $Destination = Join-Path $QuarantineFolder ("{0}_{1}_{2}{3}" -f $BaseName, (Get-Date -Format "yyyyMMdd_HHmmss"), $Counter, $Extension)
                    $Counter++
                }

                Move-Item -LiteralPath $_.FullName -Destination $Destination -ErrorAction Stop
                $MovedFiles[$_.FullName] = $true
                Write-Host "Moved duplicate to quarantine: $($_.FullName)"
            }
        }
    }
    catch {
        Write-Warning "Failed to process: $($_.FullName)"
    }
}

$ReportFile = "$env:USERPROFILE\Desktop\DuplicateFilesReport.csv"
$duplicates | Export-Csv -LiteralPath $ReportFile -NoTypeInformation

Write-Host ""
Write-Host "Completed."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host "Report saved to: $ReportFile"
