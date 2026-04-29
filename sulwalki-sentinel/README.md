# MDPT

MDPT is a multi-domain planning tool for line-of-sight analysis, detection-layer architecture, threat simulation, scenario persistence, and military-format gap analysis reports.

## Development

Run the backend:

```bash
cd server
python3 -m venv venv
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

Run the frontend:

```bash
cd client
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## Environment

Create `client/.env` from `client/.env.example` and set:

```bash
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token_here
VITE_BACKEND_URL=http://localhost:8000
VITE_WS_TRACKS_URL=ws://localhost:8000/ws/tracks
```

Vite embeds these values during `npm run build`.

## Downloadable Release

Create a downloadable archive:

```bash
./scripts/package_release.sh
```

The archive is written to `dist-release/mdpt-<timestamp>.tar.gz`. It contains:

- Production client build
- FastAPI backend
- Local scenario storage folder
- Linux/macOS and Windows launch scripts
- Release README

## Browser Install

The production client is also installable from Chrome or Edge as a PWA. Start the release, open `http://localhost:5173`, then use the browser install action. Keep the backend launch script running for scenario saves, reports, data feeds, and physics calculations.
