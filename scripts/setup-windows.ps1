# Setup do ambiente Windows para rodar o projeto (Tauri + Rust + frontend).
# Uso (PowerShell, na raiz do projeto):  powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

Write-Host "== Node / npm" -ForegroundColor Cyan
if (-not (Has node)) { throw "Node.js nao encontrado. Instale em https://nodejs.org (v18+)." }
node -v; npm -v

Write-Host "== Rust" -ForegroundColor Cyan
if (-not (Has cargo)) { throw "Rust nao encontrado. Instale via https://rustup.rs e abra um novo terminal." }
rustc -V; cargo -V

Write-Host "== Visual C++ Build Tools (link.exe)" -ForegroundColor Cyan
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vsPath = $null
if (Test-Path $vswhere) {
  $vsPath = & $vswhere -products * -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if (-not $vsPath) {
  Write-Host "C++ Build Tools ausentes. Instalando via winget (pede permissao de administrador, ~3-6 GB)..." -ForegroundColor Yellow
  if (-not (Has winget)) { throw "winget indisponivel. Baixe 'Build Tools for Visual Studio' em https://visualstudio.microsoft.com/visual-cpp-build-tools/ e marque 'Desenvolvimento para desktop com C++'." }
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
    --override "--wait --passive --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
  Write-Host "Instalacao concluida. FECHE este terminal, abra outro e rode o script de novo." -ForegroundColor Green
  exit 0
} else {
  Write-Host "OK: $vsPath"
}

Write-Host "== Dependencias do frontend (npm install)" -ForegroundColor Cyan
npm install

Write-Host "== cargo check (backend)" -ForegroundColor Cyan
Push-Location backend
cargo check
Pop-Location

Write-Host "`nTudo certo. Rode:  npm run tauri:dev" -ForegroundColor Green
