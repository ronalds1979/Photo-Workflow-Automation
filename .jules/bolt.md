## 2024-05-24 - [O(1) lookup tables for PowerShell grouping]
**Learning:** Filtering arrays of GroupInfo objects with `Where-Object` (e.g. `$GroupedData | Where-Object { $_.Name -eq $Target }`) leads to O(N^2) time complexity, causing massive performance bottlenecks on large sets of files.
**Action:** Always use `Group-Object -AsHashTable -AsString` when grouping data in PowerShell to create an O(1) lookup table that can be queried directly (e.g. `$GroupedData[$Target]`).
