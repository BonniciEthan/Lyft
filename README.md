# Lyft

A self-hosted personal gym tracker. One React + Vite front end, served three ways:

| Target | How |
| --- | --- |
| Home server (CasaOS) | Docker image: Express + SQLite on port `3457`, serving the built UI |
| Phone | Open `http://<SERVER_IP>:3457`, then Add to Home Screen |
| Zorin OS / Ubuntu desktop | Tauri v2 `.deb` wrapping the same UI |

Sync only happens when you tap a button. Every edit is saved to `localStorage` straight away, **Save** pushes the whole state to the server, and **Load** pulls it back. Nothing polls in the background.

```
.
├── Dockerfile               multi-stage: build client → server deps → lean runtime
├── docker-compose.yml       CasaOS-ready (x-casaos metadata)
├── server/                  Express + better-sqlite3 API (port 3456)
└── client/                  React + Vite UI
    ├── public/              manifest.json, icons
    ├── src/                 app code (seed.js, lib/, components/)
    └── src-tauri/           Tauri v2 desktop wrapper (.deb)
```

## 1. Deploy on the home server (CasaOS)

Copy this folder to the server, then:

```bash
sudo mkdir -p /DATA/AppData/lyft
docker compose up -d --build
```

Or in CasaOS: **App Store → Custom Install → Import** and paste `docker-compose.yml`. CasaOS cannot build images, so run `docker build -t lyft:latest .` on the server first.

The database is at `/DATA/AppData/lyft/gym.db`. On first start it is seeded with the default split, routines and goal. To back up, copy that file. The CasaOS tile icon is the `wger` icon from dashboard-icons; change `icon:` in the compose file if you want a different one.

API:

- `GET /api/health` returns `{ status, timestamp }`
- `GET /api/sync` returns the full state
- `POST /api/sync` validates the body, replaces the stored state and returns `{ success, lastSynced }`

## 2. Phone

Open `http://<SERVER_IP>:3457` (LAN) or `http://<tailscale-ip>:3457`, then use Share → **Add to Home Screen**. Leave the Server URL in Settings blank, because relative `/api` calls go to the server the page came from.

## 3. Desktop `.deb` (Zorin OS 17)

One-time prerequisites:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Node.js 20+ is also required.

Build:

```bash
cd client
npm install
npm run tauri:build
```

Install the package from `client/src-tauri/target/release/bundle/deb/`:

```bash
sudo apt install ./client/src-tauri/target/release/bundle/deb/Lyft_1.1.0_amd64.deb
```

On first launch, open the gear icon, set **Backend Server URL** to `http://192.168.x.x:3457` (or your Tailscale IP), tap **Test Connection**, then **Save**, and then **Load**.

## Local development

```bash
cd server && npm install && npm start        # API on :3456 (data in ./data; set PORT to change)
cd client && npm install && npm run dev      # Vite on :5173, proxies /api → :3456
cd client && npm run tauri:dev               # desktop window against Vite
```

## Data model

```jsonc
{
  "lastSynced": "ISO string | null",
  "split":    { "Monday": "Push", ... "Sunday": "Rest" },
  "workouts": { "Push": [{ "id", "name", "defaultSets" }], ... },
  "logs": {
    "2026-11-13": {
      "category": "Pull",
      "exercises": [
        { "exerciseId": "pull-1", "name": "Wide Grip Lat Pulldown",
          "sets": [{ "weight": 62.5, "reps": 10, "spotted": false }] }
      ]
    }
  },
  "goals": [{ "id", "exercise", "startPR", "currentPR", "targetPR", "targetDate", "notes", "achieved" }]
}
```

A day is only written to `logs` once you edit something on it, so browsing the calendar never creates empty entries.
