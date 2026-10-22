## 2024-10-22 - PowerShell Group-Object Performance Pitfall
**Learning:** In PowerShell, using `Group-Object` without the `-AsHashTable` parameter returns an array of GroupInfo objects. Filtering this array using `Where-Object` (e.g., inside a loop) creates an $O(N^2)$ time complexity. This is a common performance bottleneck when matching or grouping large datasets in PowerShell scripts.
**Action:** Always use `Group-Object -AsHashTable -AsString` when you need to perform lookups against the grouped data, turning it into an $O(1)$ hash map lookup and significantly improving performance.
