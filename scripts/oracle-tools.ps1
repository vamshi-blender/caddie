function oq {
    [CmdletBinding()]
    param(
        [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
        [string[]]$QueryParts,
        [string]$Config
    )

    if (-not $Config) {
        $Config = Join-Path $PSScriptRoot "oracle.config.local.json"
    }

    if (-not $QueryParts -and -not $input) {
        throw "No SQL provided."
    }

    $query = if ($QueryParts) {
        $QueryParts -join ' '
    } else {
        ($input | Out-String).Trim()
    }

    python (Join-Path $PSScriptRoot "oracle_exec.py") -c $Config -q $query
}

Set-Alias -Name oqx -Value oq
