## 2023-10-21 - [PowerShell Array Filtering O(N²)]
**Learning:** In PowerShell, using `Where-Object` inside a loop over a large collection to find matching items based on a property (like Name) causes an O(N²) performance bottleneck.
**Action:** Use `Group-Object -Property Name -AsHashTable -AsString` outside the loop to build a hash table, changing the lookup complexity to O(1) and overall processing to O(N) instead of O(N²).

## 2026-10-27 - [Python Hashing O(N) bottleneck]
**Learning:** In Python script processing perceptual hashes across multiple related image pairs, recalculating the base image hash per paired image results in redundant I/O operations and O(N) complexity.
**Action:** Hoist the perceptual hashing logic of the primary image (JPG) out of the nested loop before hashing sequential counterpart images (NEF), making it an O(1) operation for the primary image.

## 2023-11-20 - [PowerShell Array Appending O(N²)]
**Learning:** In PowerShell, using `+=` to append to an array (`@()`) inside a loop is an O(N²) operation because it creates a new array in memory and copies all elements on every iteration.
**Action:** Replace `@()` and `+=` with `[System.Collections.Generic.List[T]]` and the `.Add()` method for O(1) amortized appends.
