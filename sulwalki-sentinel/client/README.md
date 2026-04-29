# MDPT Client

React/Vite frontend for the MDPT planning application.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

The built app is emitted to `client/dist`.

## Installable Browser App

The production client includes a web app manifest and service worker. When served over localhost or HTTPS, Chrome and Edge can install MDPT as a desktop-style app. Backend features still require the FastAPI server to be running.
