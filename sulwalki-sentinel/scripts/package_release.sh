#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_NAME="mdpt-${STAMP}"
OUT_DIR="${ROOT_DIR}/dist-release"
RELEASE_DIR="${OUT_DIR}/${RELEASE_NAME}"

if [[ "${1:-}" != "--skip-build" ]]; then
  npm --prefix "${ROOT_DIR}/client" run build
fi

rm -rf "${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}/client" "${RELEASE_DIR}/server" "${RELEASE_DIR}/data/scenarios"

cp -R "${ROOT_DIR}/client/dist" "${RELEASE_DIR}/client/dist"
cp "${ROOT_DIR}/client/.env.example" "${RELEASE_DIR}/client/.env.example"
cp "${ROOT_DIR}/server/main.py" "${RELEASE_DIR}/server/main.py"
cp "${ROOT_DIR}/server/physics_engine.py" "${RELEASE_DIR}/server/physics_engine.py"
cp "${ROOT_DIR}/server/data_bridge.py" "${RELEASE_DIR}/server/data_bridge.py"
cp "${ROOT_DIR}/server/requirements.txt" "${RELEASE_DIR}/server/requirements.txt"
cp "${ROOT_DIR}/data/scenarios/.gitkeep" "${RELEASE_DIR}/data/scenarios/.gitkeep"

cat > "${RELEASE_DIR}/start-linux.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

if [[ ! -d "server/.venv" ]]; then
  python3 -m venv server/.venv
fi

server/.venv/bin/python -m pip install -r server/requirements.txt

echo "Starting MDPT backend at http://localhost:8000"
server/.venv/bin/python -m uvicorn main:app --app-dir server --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Starting MDPT client at http://localhost:5173"
python3 -m http.server 5173 --directory client/dist &
CLIENT_PID=$!

cleanup() {
  kill "${BACKEND_PID}" "${CLIENT_PID}" 2>/dev/null || true
}
trap cleanup EXIT

echo "Open http://localhost:5173 in your browser. Press Ctrl+C to stop MDPT."
wait
SCRIPT

cat > "${RELEASE_DIR}/start-windows.ps1" <<'SCRIPT'
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (!(Test-Path "server\.venv")) {
  py -3 -m venv server\.venv
}

server\.venv\Scripts\python.exe -m pip install -r server\requirements.txt

$Backend = Start-Process -FilePath "server\.venv\Scripts\python.exe" -ArgumentList "-m uvicorn main:app --app-dir server --host 127.0.0.1 --port 8000" -PassThru
$Client = Start-Process -FilePath "py" -ArgumentList "-3 -m http.server 5173 --directory client\dist" -PassThru

Write-Host "MDPT is running at http://localhost:5173"
Write-Host "Close this window or press Enter to stop MDPT."
Read-Host

Stop-Process -Id $Backend.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $Client.Id -Force -ErrorAction SilentlyContinue
SCRIPT

cat > "${RELEASE_DIR}/README.md" <<'SCRIPT'
# MDPT Release

This folder contains a packaged MDPT build:

- `client/dist` is the production web app.
- `server` is the FastAPI backend for scenarios, reports, tracks, KMZ/KML import, and calculations.
- `data/scenarios` stores saved scenario JSON files locally.

## Linux / macOS

```bash
chmod +x start-linux.sh
./start-linux.sh
```

Open `http://localhost:5173`.

## Windows

Open PowerShell in this folder:

```powershell
.\start-windows.ps1
```

Open `http://localhost:5173`.

## Requirements

- Python 3.12 recommended.
- Internet access may be needed on first launch to install Python dependencies.
- Cesium ion access is controlled at build time through `client/.env` before packaging.

## Installable App

After opening MDPT in Chrome or Edge, use the browser install button to install it as a desktop app. The backend launch script still needs to be running for scenario saves, reports, live tracks, and physics calculations.
SCRIPT

chmod +x "${RELEASE_DIR}/start-linux.sh"
tar -czf "${OUT_DIR}/${RELEASE_NAME}.tar.gz" -C "${OUT_DIR}" "${RELEASE_NAME}"

echo "Created ${OUT_DIR}/${RELEASE_NAME}.tar.gz"
