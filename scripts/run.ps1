param(
  [ValidateSet('dev', 'build', 'preview', 'test', 'test:smoke', 'check:space', 'catalog:download', 'catalog:import', 'catalog:verify', 'catalog:map', 'ci', 'audit', 'multiplayer:dev', 'multiplayer:check', 'multiplayer:build', 'multiplayer:preview', 'multiplayer:test', 'multiplayer:load', 'multiplayer:browser')]
  [string]$Task = 'dev'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$npmPath = Join-Path $projectRoot '..\.tools\package\bin\npm-cli.js'
$savedChannel = $env:PLAYWRIGHT_CHANNEL
$savedPath = $env:PATH
Push-Location -LiteralPath $projectRoot
try {
  if (Test-Path -LiteralPath $nodePath) {
    $env:PATH = (Split-Path -Parent $nodePath) + [System.IO.Path]::PathSeparator + $savedPath
  }
  if ($Task -eq 'test:smoke' -and -not $savedChannel -and
      (Test-Path -LiteralPath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')) {
    $env:PLAYWRIGHT_CHANNEL = 'msedge'
  }
  [string[]]$arguments = if ($Task -in @('ci', 'audit')) { @($Task) } else { @('run', $Task) }
  if ($npmCommand) { & $npmCommand.Source @arguments }
  elseif ((Test-Path -LiteralPath $nodePath) -and (Test-Path -LiteralPath $npmPath)) {
    & $nodePath $npmPath @arguments
  } else { throw 'Install Node.js with npm, or restore the workspace .tools/npm runtime.' }
  $result = $LASTEXITCODE
} finally {
  $env:PLAYWRIGHT_CHANNEL = $savedChannel
  $env:PATH = $savedPath
  Pop-Location
}
exit $result
