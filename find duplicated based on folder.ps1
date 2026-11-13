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

# ⚡ Bolt: Fast 192 KB partial hash (head + middle + tail) to reject non-matching same-size files before full SHA-256
function Get-FastPartialHash {
    param([string]$LiteralPath)
    $chunkSize = 65536
    $stream = [System.IO.File]::Open($LiteralPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
        $len = $stream.Length
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $buffer = New-Object byte[] $chunkSize
            $read = $stream.Read($buffer, 0, $chunkSize)
            if ($read -gt 0) { $sha.TransformBlock($buffer, 0, $read, $null, 0) | Out-Null }

            if ($len -gt ($chunkSize * 2)) {
                $stream.Position = [long](($len - $chunkSize) / 2)
                $read = $stream.Read($buffer, 0, $chunkSize)
                if ($read -gt 0) { $sha.TransformBlock($buffer, 0, $read, $null, 0) | Out-Null }
            }
            if ($len -gt $chunkSize) {
                $stream.Position = [Math]::Max(0L, $len - $chunkSize)
                $read = $stream.Read($buffer, 0, $chunkSize)
                if ($read -gt 0) { $sha.TransformBlock($buffer, 0, $read, $null, 0) | Out-Null }
            }

            $sha.TransformFinalBlock([byte[]]::new(0), 0, 0) | Out-Null
            return [System.BitConverter]::ToString($sha.Hash).Replace("-", "")
        } finally {
            $sha.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

function Get-FilesFast {
    param([string]$RootPath)
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        $enumOpts = [System.IO.EnumerationOptions]::new()
        $enumOpts.RecurseSubdirectories = $true
        $enumOpts.IgnoreInaccessible = $true
        return [System.IO.DirectoryInfo]::new($RootPath).EnumerateFiles('*', $enumOpts)
    }
    return Get-ChildItem -LiteralPath $RootPath -File -Recurse -ErrorAction SilentlyContinue
}

$referenceFilesBySize = @{}

# ⚡ Bolt: Replaced pipeline | ForEach-Object with foreach loop to eliminate significant per-item overhead in large file sets
foreach ($file in Get-FilesFast -RootPath $ReferenceFolder) {
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
    if ($MovedFiles.ContainsKey($file.FullName)) { continue }
    try {
        $size = $file.Length

        if ($referenceFilesBySize.ContainsKey($size)) {
            $srcPartial = Get-FastPartialHash -LiteralPath $file.FullName
            $partialMatches = [System.Collections.Generic.List[string]]::new()

            foreach ($refFile in $referenceFilesBySize[$size]) {
                if (-not $referencePartialHashes.ContainsKey($refFile)) {
                    $referencePartialHashes[$refFile] = Get-FastPartialHash -LiteralPath $refFile
                }
                if ($srcPartial -eq $referencePartialHashes[$refFile]) {
                    $partialMatches.Add($refFile)
                }
            }

            if ($partialMatches.Count -eq 0) { continue }

            $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256 -ErrorAction Stop).Hash

            $matchFound = $false
            # ⚡ Bolt: Using List[string] instead of @() for efficient O(1) appends
            $matchingFiles = [System.Collections.Generic.List[string]]::new()

            foreach ($refFile in $partialMatches) {
                if (-not $referenceHashes.ContainsKey($refFile)) {
                    $referenceHashes[$refFile] = (Get-FileHash -LiteralPath $refFile -Algorithm SHA256 -ErrorAction Stop).Hash
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
        Write-Warning "Failed to process: $($file.FullName) - $($_.Exception.Message)"
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
