# Optional PowerShell entry point; the Node implementation also runs directly.
$harnessNode = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $harnessNode) {
    Write-Error 'Node.js 18 or newer is required. Install Node.js LTS and reopen PowerShell.'
    exit 1
}
# One ASCII envelope preserves literal quotes and Unicode under Windows
# PowerShell 5.1's legacy native-argument handling as well as PowerShell 7.
$harnessArgumentsJson = ConvertTo-Json -InputObject @($args) -Compress
$harnessEncodedArguments = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($harnessArgumentsJson))
& $harnessNode.Source (Join-Path $PSScriptRoot 'harness.mjs') '--encoded-argv' $harnessEncodedArguments
exit $LASTEXITCODE
