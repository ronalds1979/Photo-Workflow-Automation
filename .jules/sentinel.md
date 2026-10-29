## 2024-05-24 - [Wildcard Injection in PowerShell Cmdlets]
**Vulnerability:** Found wildcard injection vulnerabilities in `find duplicated based on folder.ps1` and `find-duplicated-video.ps1`. When using the `-Path` parameter in cmdlets like `Get-ChildItem`, `Test-Path`, `Move-Item`, and `Get-FileHash`, PowerShell interprets square brackets `[]` and other wildcard characters in filenames. This can cause cmdlets to either fail or act on unintended files if a user-controlled file path contains these characters.
**Learning:** In PowerShell scripts dealing with arbitrary file paths or user input, always use `-LiteralPath` instead of `-Path` to prevent paths from being evaluated as wildcard patterns, avoiding unintended consequences or execution failures.
**Prevention:** Default to using `-LiteralPath` for all path-based cmdlets unless wildcard evaluation is explicitly intended and strictly controlled.
## 2024-03-24 - Directory Scoping Bypass via Path Confusion
**Vulnerability:** Path confusion vulnerability in `find-duplicated-video.ps1`.
**Learning:** Using `String.StartsWith()` for filtering paths without appending a directory separator can unintentionally include similarly named sibling directories. E.g., filtering for `D:\MyFolder` will incorrectly match `D:\MyFolder_Secret\video.mp4`. Furthermore, default `StartsWith()` in .NET is case-sensitive, making it unreliable for Windows file paths.
**Prevention:** Always normalize directory paths by appending a trailing slash (e.g., `TrimEnd('\') + '\'`) and use `[System.StringComparison]::OrdinalIgnoreCase` when comparing paths using `.StartsWith()`.
## 2023-10-29 - Missing Error Handling Exposing Stack Traces
**Vulnerability:** Found a missing error handler in `find-duplicated.py` for the `os.remove()` call. If a file was locked or missing permissions, it would crash the program and expose a stack trace.
**Learning:** File system operations can fail for many reasons outside the program's control. Unhandled exceptions in these operations can leak information about the system through stack traces.
**Prevention:** Always wrap file operations in `try-except OSError` blocks to fail securely, handle the error gracefully, and log a controlled message instead of a stack trace.
