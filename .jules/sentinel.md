## 2024-10-25 - Wildcard Injection via -Path Parameter
**Vulnerability:** PowerShell scripts use `-Path` instead of `-LiteralPath` for cmdlets handling file paths (e.g., Get-ChildItem, Test-Path, Get-FileHash, Move-Item).
**Learning:** Using `-Path` evaluates wildcard characters (`[`, `]`, `?`, `*`), leading to potential command injection or runtime errors when handling arbitrary or unvalidated paths containing these characters.
**Prevention:** Always default to using `-LiteralPath` instead of `-Path` for path-based cmdlets when handling unvalidated or arbitrary file paths to prevent wildcard injection vulnerabilities.
