## 2023-10-21 - [PowerShell Array Filtering O(N²)]
**Learning:** In PowerShell, using `Where-Object` inside a loop over a large collection to find matching items based on a property (like Name) causes an O(N²) performance bottleneck.
**Action:** Use `Group-Object -Property Name -AsHashTable -AsString` outside the loop to build a hash table, changing the lookup complexity to O(1) and overall processing to O(N) instead of O(N²).
