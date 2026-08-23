[CmdletBinding()]
param(
  [string]$AppPath,

  [ValidateRange(5, 3600)]
  [int]$DurationSeconds = 60,

  [ValidateRange(250, 10000)]
  [int]$IntervalMilliseconds = 1000,

  [string]$OutputDirectory,

  [ValidateRange(1, 120)]
  [int]$StartupTimeoutSeconds = 30,

  [switch]$KeepOpen
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot

function Find-ReleaseExecutable {
  $releaseDirectory = Join-Path $projectRoot 'backend\target\release'
  if (-not (Test-Path -LiteralPath $releaseDirectory)) {
    return $null
  }

  $candidates = Get-ChildItem -LiteralPath $releaseDirectory -Filter '*.exe' -File |
    Where-Object { $_.Name -notmatch '(?i)(uninstall|setup)' } |
    Sort-Object LastWriteTime -Descending

  return ($candidates | Select-Object -First 1)
}

function Get-ProcessTreeIds {
  param([int]$RootProcessId)

  $allProcesses = @(Get-CimInstance -ClassName Win32_Process)
  $knownIds = [System.Collections.Generic.HashSet[int]]::new()
  [void]$knownIds.Add($RootProcessId)
  $pendingIds = @($RootProcessId)

  while ($pendingIds.Count -gt 0) {
    $currentId = $pendingIds[0]
    if ($pendingIds.Count -eq 1) {
      $pendingIds = @()
    } else {
      $pendingIds = @($pendingIds[1..($pendingIds.Count - 1)])
    }

    foreach ($child in $allProcesses | Where-Object { $_.ParentProcessId -eq $currentId }) {
      $childId = [int]$child.ProcessId
      if ($knownIds.Add($childId)) {
        $pendingIds += $childId
      }
    }
  }

  return @($knownIds)
}

function Get-AppMetrics {
  param([int]$RootProcessId)

  $processIds = Get-ProcessTreeIds -RootProcessId $RootProcessId
  $processes = @()
  foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      $processes += $process
    }
  }

  $workingSet = 0.0
  $privateBytes = 0.0
  $cpuSeconds = 0.0
  $handles = 0
  foreach ($process in $processes) {
    $workingSet += $process.WorkingSet64
    $privateBytes += $process.PrivateMemorySize64
    $cpuSeconds += $process.CPU
    $handles += $process.HandleCount
  }

  return [PSCustomObject]@{
    ProcessCount = $processes.Count
    WorkingSetMB = [math]::Round($workingSet / 1MB, 2)
    PrivateMemoryMB = [math]::Round($privateBytes / 1MB, 2)
    CpuSeconds = [math]::Round($cpuSeconds, 3)
    HandleCount = $handles
  }
}

function Get-NumberAverage {
  param([object[]]$Values)
  if ($Values.Count -eq 0) { return 0 }
  return [math]::Round((($Values | Measure-Object -Average).Average), 2)
}

function Get-NumberMaximum {
  param([object[]]$Values)
  if ($Values.Count -eq 0) { return 0 }
  return [math]::Round((($Values | Measure-Object -Maximum).Maximum), 2)
}

if ([string]::IsNullOrWhiteSpace($AppPath)) {
  $detectedExecutable = Find-ReleaseExecutable
  if ($null -eq $detectedExecutable) {
    throw 'Executável não encontrado. Gere-o com "npm run tauri:build" ou informe -AppPath.'
  }
  $AppPath = $detectedExecutable.FullName
}

$AppPath = (Resolve-Path -LiteralPath $AppPath).Path
if (-not $AppPath.EndsWith('.exe', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '-AppPath deve apontar para um executável .exe.'
}

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutputDirectory = Join-Path $projectRoot "artifacts\benchmarks\$stamp"
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Write-Host "Iniciando benchmark: $AppPath"
$startedAt = Get-Date
$launchTimer = [System.Diagnostics.Stopwatch]::StartNew()
$rootProcess = Start-Process -FilePath $AppPath -PassThru
$windowReady = $false

while ($launchTimer.Elapsed.TotalSeconds -lt $StartupTimeoutSeconds) {
  Start-Sleep -Milliseconds 100
  $rootProcess.Refresh()
  if ($rootProcess.HasExited) {
    throw 'O aplicativo foi encerrado antes de abrir uma janela.'
  }
  if ($rootProcess.MainWindowHandle -ne [IntPtr]::Zero) {
    $windowReady = $true
    break
  }
}

if (-not $windowReady) {
  throw "A janela não ficou pronta em $StartupTimeoutSeconds segundos."
}

$startupToWindowMs = [math]::Round($launchTimer.Elapsed.TotalMilliseconds, 0)
Write-Host "Janela pronta em $startupToWindowMs ms. Coletando por $DurationSeconds segundos..."

$samples = [System.Collections.Generic.List[object]]::new()
$collectionTimer = [System.Diagnostics.Stopwatch]::StartNew()
$previousMetrics = $null
$previousElapsedSeconds = 0.0

while ($collectionTimer.Elapsed.TotalSeconds -lt $DurationSeconds) {
  $rootProcess.Refresh()
  if ($rootProcess.HasExited) {
    Write-Warning 'O aplicativo foi encerrado durante a coleta.'
    break
  }

  $metrics = Get-AppMetrics -RootProcessId $rootProcess.Id
  $elapsedSeconds = $collectionTimer.Elapsed.TotalSeconds
  $cpuPercent = 0.0
  if ($null -ne $previousMetrics) {
    $intervalSeconds = $elapsedSeconds - $previousElapsedSeconds
    if ($intervalSeconds -gt 0) {
      $cpuDelta = [math]::Max(0, $metrics.CpuSeconds - $previousMetrics.CpuSeconds)
      $cpuPercent = ($cpuDelta / $intervalSeconds / [Environment]::ProcessorCount) * 100
    }
  }

  $samples.Add([PSCustomObject]@{
    Timestamp = (Get-Date).ToString('o')
    ElapsedSeconds = [math]::Round($elapsedSeconds, 2)
    CpuPercent = [math]::Round($cpuPercent, 2)
    WorkingSetMB = $metrics.WorkingSetMB
    PrivateMemoryMB = $metrics.PrivateMemoryMB
    ProcessCount = $metrics.ProcessCount
    HandleCount = $metrics.HandleCount
  })

  $previousMetrics = $metrics
  $previousElapsedSeconds = $elapsedSeconds
  Start-Sleep -Milliseconds $IntervalMilliseconds
}

$endedAt = Get-Date
$csvPath = Join-Path $OutputDirectory 'samples.csv'
$summaryPath = Join-Path $OutputDirectory 'summary.json'
$samples | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding utf8

$summary = [PSCustomObject]@{
  Application = $AppPath
  StartedAt = $startedAt.ToString('o')
  FinishedAt = $endedAt.ToString('o')
  StartupToWindowMs = $startupToWindowMs
  DurationSeconds = [math]::Round($collectionTimer.Elapsed.TotalSeconds, 2)
  IntervalMilliseconds = $IntervalMilliseconds
  LogicalProcessors = [Environment]::ProcessorCount
  SampleCount = $samples.Count
  CpuPercent = [PSCustomObject]@{
    Average = Get-NumberAverage -Values @($samples | ForEach-Object { $_.CpuPercent })
    Peak = Get-NumberMaximum -Values @($samples | ForEach-Object { $_.CpuPercent })
  }
  WorkingSetMB = [PSCustomObject]@{
    Average = Get-NumberAverage -Values @($samples | ForEach-Object { $_.WorkingSetMB })
    Peak = Get-NumberMaximum -Values @($samples | ForEach-Object { $_.WorkingSetMB })
  }
  PrivateMemoryMB = [PSCustomObject]@{
    Average = Get-NumberAverage -Values @($samples | ForEach-Object { $_.PrivateMemoryMB })
    Peak = Get-NumberMaximum -Values @($samples | ForEach-Object { $_.PrivateMemoryMB })
  }
  ProcessCount = [PSCustomObject]@{
    Average = Get-NumberAverage -Values @($samples | ForEach-Object { $_.ProcessCount })
    Peak = Get-NumberMaximum -Values @($samples | ForEach-Object { $_.ProcessCount })
  }
}

$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding utf8

if (-not $KeepOpen -and -not $rootProcess.HasExited) {
  Stop-Process -Id $rootProcess.Id -Force
}

Write-Host ''
Write-Host "Relatório salvo em: $OutputDirectory"
Write-Host "Abertura: $startupToWindowMs ms | RAM pico: $($summary.PrivateMemoryMB.Peak) MB | CPU pico: $($summary.CpuPercent.Peak)%"
