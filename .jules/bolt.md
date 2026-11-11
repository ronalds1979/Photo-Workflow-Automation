## 2023-10-21 - [PowerShell Array Filtering O(N²)]
**Learning:** In PowerShell, using `Where-Object` inside a loop over a large collection to find matching items based on a property (like Name) causes an O(N²) performance bottleneck.
**Action:** Use `Group-Object -Property Name -AsHashTable -AsString` outside the loop to build a hash table, changing the lookup complexity to O(1) and overall processing to O(N) instead of O(N²).

## 2026-10-27 - [Python Hashing O(N) bottleneck]
**Learning:** In Python script processing perceptual hashes across multiple related image pairs, recalculating the base image hash per paired image results in redundant I/O operations and O(N) complexity.
**Action:** Hoist the perceptual hashing logic of the primary image (JPG) out of the nested loop before hashing sequential counterpart images (NEF), making it an O(1) operation for the primary image.

## 2023-11-20 - [PowerShell Array Appending O(N²)]
**Learning:** In PowerShell, using `+=` to append to an array (`@()`) inside a loop is an O(N²) operation because it creates a new array in memory and copies all elements on every iteration.
**Action:** Replace `@()` and `+=` with `[System.Collections.Generic.List[T]]` and the `.Add()` method for O(1) amortized appends.

## 2024-05-15 - [PowerShell File Hashing Caching and State Tracking]
**Learning:** Caching expensive calculations like `Get-FileHash` inside nested loops over large files drastically improves performance (from O(N) to O(1) per lookup). However, if the script alters the file system (e.g., moving or deleting files) during processing, cached elements become stale, causing errors or "phantom matches" in subsequent iterations.
**Action:** When implementing caching for file metadata, always implement alongside state tracking (e.g., `$MovedFiles = @{}`) to eagerly skip files that have been modified or removed from their original paths.

## 2024-10-30 - [PowerShell Pipeline Overhead in Tight Loops]
**Learning:** Using PowerShell pipelines (like `| Where-Object`) inside tight loops (like nested `foreach` loops) introduces significant overhead because PowerShell has to instantiate pipeline objects and bind parameters for every iteration.
**Action:** Replace pipeline operators inside inner/tight loops with fast `foreach` or `for` loops, evaluating conditions (e.g. `if`) directly inside the loop to drastically reduce execution overhead.

## 2024-11-20 - [PowerShell Pipeline & String Allocation Overhead on File Scans]
**Learning:** Initializing large file sets using `Get-ChildItem | Where-Object` along with array scans (`-contains`) and per-item string allocations (`.ToLower()`) causes significant CPU and memory overhead during drive-wide scans.
**Action:** Replace initial pipeline filtering on large datasets with standard `foreach` loops over the base collection, and use `[System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)` for O(1) condition checks, storing results in a `[System.Collections.Generic.List[T]]`.

## 2024-11-21 - [Python `os.walk` Redundant Iteration O(N)]
**Learning:** When using `os.walk`, iterating over the `files` array multiple times in separate loops (e.g., once to find `.nef` files and once for `.jpg` files) when those loops contain slow I/O-bound checks like `os.path.islink()` results in redundant system calls (like `stat`). This doubles the discovery overhead and causes a hidden O(N) performance penalty.
**Action:** Consolidate filtering logic and categorize file paths within a single iteration pass over the `files` array. Store the results in dictionaries or lists for subsequent processing to minimize system calls.

## 2024-11-22 - [Python PIL Redundant Memory Allocation and Copy]
**Learning:** In Python PIL, `ImageOps.exif_transpose()` already returns a new Image object (either transposed or a direct copy if no transposition was needed). Calling `.copy()` immediately after `ImageOps.exif_transpose()` is redundant and allocates a full new image buffer in memory, drastically increasing memory overhead and processing time for large images (e.g. 4000x3000 JPG/NEF thumbnails).
**Action:** Remove the redundant `.copy()` after `ImageOps.exif_transpose()` to avoid double memory allocation and speed up the hash generation process.

## 2024-11-23 - [Python Directory Traversal `os.walk` vs `os.scandir` bottleneck]
**Learning:** Using `os.walk` along with `os.path.islink()` for directory traversal performs redundant `stat` system calls under the hood, significantly slowing down file discovery in directories with many files.
**Action:** Replace `os.walk` with a stack-based traversal using `os.scandir()`. This allows checking `entry.is_symlink()`, `entry.is_dir()`, and `entry.is_file()` directly on the `DirEntry` objects, which caches the `stat` results from the directory read and drastically reduces slow I/O operations.

## 2024-11-23 - [PowerShell Loop Fast Fail & Console I/O Avoidance]
**Learning:** Console output cmdlets like `Write-Host` are surprisingly slow in PowerShell. Placing them inside tight loops before checking if a file actually needs processing causes unnecessary I/O bottleneck when iterating over large collections where most items will be skipped.
**Action:** Always fetch related cache/collection items first, and use early returns (e.g. `if ($Collection.Count -le 1) { continue }`) to quickly skip elements and bypass subsequent slow console output or complex loop initialization for irrelevant items.
