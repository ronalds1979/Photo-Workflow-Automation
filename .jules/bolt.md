## 2023-10-23 - [PowerShell Pipeline Optimization]
**Learning:** PowerShell's `Where-Object` pipeline inside a loop on a collection returned by `Group-Object` causes severe O(N^2) performance degradation, acting as a major bottleneck for large file operations.
**Action:** Use `Group-Object -AsHashTable -AsString` to create an O(1) lookup table instead of filtering arrays.
