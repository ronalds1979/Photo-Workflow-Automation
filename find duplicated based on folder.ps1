$SourceFolder = "D:\Other files and trash videos"
$ReferenceFolder = "D:\Original\Pictures"
$QuarantineFolder = "D:\DuplicateFilesFound"

if (!(Test-Path -LiteralPath $QuarantineFolder)) {
    try {
        New-Item -ItemType Directory -LiteralPath $QuarantineFolder -ErrorAction Stop | Out-Null
    }
    catch {
        Write-Error "Failed to create quarantine folder: $($_.Exception.Message)"
        exit
    }
}

Write-Host "Building size and hash index for reference folder..."

$referenceFilesBySize = @{}

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
foreach ($file in Get-ChildItem -LiteralPath $ReferenceFolder -File -Recurse -ErrorAction SilentlyContinue) {
    $size = $file.Length
    if (-not $referenceFilesBySize.ContainsKey($size)) {
        # ⚡ Bolt: Using List[string] instead of @() to avoid O(N²) reallocation on +=
        $referenceFilesBySize[$size] = [System.Collections.Generic.List[string]]::new()
    }
    # ⚡ Bolt: .Add() is O(1) amortized, whereas += on arrays is O(N)
    $referenceFilesBySize[$size].Add($file.FullName)
}

$referenceHashes = @{}
$MovedFiles = @{}
# ⚡ Bolt: Using List instead of @() for efficient O(1) appends
$duplicates = [System.Collections.Generic.List[PSCustomObject]]::new()

Write-Host "Checking source folder..."

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
foreach ($file in Get-ChildItem -LiteralPath $SourceFolder -File -Recurse -ErrorAction SilentlyContinue) {
    if ($MovedFiles.ContainsKey($file.FullName)) { continue }
    try {
        $size = $file.Length

        if ($referenceFilesBySize.ContainsKey($size)) {
            $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash

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

                Move-Item -LiteralPath $file.FullName -Destination $Destination -ErrorAction Stop
                $MovedFiles[$file.FullName] = $true
                Write-Host "Moved duplicate to quarantine: $($file.FullName)"
            }
        }
    }
    catch {
        Write-Warning "Failed to process: $($file.FullName)"
    }
}

$ReportFile = "$env:USERPROFILE\Desktop\DuplicateFilesReport_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"
try {
    $duplicates | Export-Csv -LiteralPath $ReportFile -NoTypeInformation -ErrorAction Stop
}
catch {
    Write-Warning "Failed to export report: $($_.Exception.Message)"
}

Write-Host ""
Write-Host "Completed."
Write-Host "Duplicates moved to: $QuarantineFolder"
Write-Host "Report saved to: $ReportFile"
