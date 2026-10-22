## 2024-05-24 - [High] Wildcard Injection in PowerShell Cmdlets
**Vulnerability:** Found multiple PowerShell scripts using `-Path` or positional arguments for path-based cmdlets (like `Get-ChildItem`, `Test-Path`, `Move-Item`, `Get-FileHash`) when handling unvalidated paths from variables.
**Learning:** In PowerShell, `-Path` resolves wildcards (e.g. `[ ]`, `*`, `?`). If a file or folder name contains these characters (like `[test]file.txt`) and is passed to `-Path`, it can cause the command to fail, or worse, be exploited for wildcard injection if the path is user-controlled.
**Prevention:** Always default to using `-LiteralPath` instead of `-Path` (or positional arguments) for cmdlets that accept paths, unless wildcard resolution is explicitly required and the input is sanitized/safe.
