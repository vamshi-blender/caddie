# Example: powershell -F scripts\oq.ps1 "SELECT COUNT(*) AS total_records FROM AADHAAR_MOBILE_APP;"
[CmdletBinding()]
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$QueryParts,
    [Parameter(ValueFromPipeline = $true)]
    [string]$InputObject,
    [string]$Config
)

begin {
    $pipedLines = New-Object System.Collections.Generic.List[string]
}

process {
    if ($null -ne $InputObject) {
        $pipedLines.Add($InputObject)
    }
}

end {
if (-not $Config) {
    $Config = Join-Path $PSScriptRoot "oracle.config.local.json"
}

$stdinQuery = ""
if ($pipedLines.Count -eq 0 -and [Console]::IsInputRedirected) {
    $stdinQuery = [Console]::In.ReadToEnd().Trim()
}

if ((-not $QueryParts -or $QueryParts.Count -eq 0) -and $pipedLines.Count -eq 0 -and -not $stdinQuery) {
    throw "No SQL provided."
}

$query = if ($QueryParts -and $QueryParts.Count -gt 0) {
    $QueryParts -join ' '
} elseif ($stdinQuery) {
    $stdinQuery
} else {
    ($pipedLines -join [Environment]::NewLine).Trim()
}

if (-not $query) {
    throw "SQL is empty."
}

$query | python (Join-Path $PSScriptRoot "oracle_exec.py") -c $Config
}
