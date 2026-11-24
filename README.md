# sync-watch-frontend

Web client for **Sync Watch**, a small pet project for watching videos together in sync. Create a room, share the link, pick a video (YouTube link, direct or HLS URL, or an uploaded file) and everyone's player stays at the same position.

Backend: [`sync-watch-backend`](https://github.com/MishkaCube/sync-watch-backend) (Java, Spring Boot, WebSocket).

## Features

- **Rooms.** Create a room on the home page or join one by id. Joining a missing room shows a clear "room not found" screen.
- **Three video sources.** A YouTube link (IFrame player), a direct or HLS (`.m3u8`) URL, or a file uploaded from your device with a progress bar and cancel. HLS streams go through the backend proxy, so every participant gets the same cached segments.
- **Synchronized playback.** Play, pause and seek are shared across the room. A server clock is the source of truth and each client corrects its own drift continuously (see below).
- **Synchronized start.** When someone presses play, everyone seeks and prebuffers first, then all players start together on the server's signal. No one starts a few seconds early because someone else is still loading.
- **Buffering awareness.** If a participant stalls, the others see a "partner is buffering" overlay and wait instead of drifting ahead.
- **Lobby and presence.** The participant list shows each person's connection quality (good, normal, weak) based on heartbeats. Each participant gets a stable generated avatar ([DiceBear](https://www.dicebear.com/)) derived from their anonymous id.
- **Chat.** Room chat with history loaded on join.
- **Resilience.** The app polls the backend health endpoint and shows an overlay when the backend is down. WebSocket reconnects automatically.
- **UI.** React with Tailwind, light and dark themes, responsive layout with safe-area support on phones.

## Tech stack

React 18 · TypeScript · Vite 5 · Tailwind CSS 3 · React Router 6 · STOMP over SockJS (`@stomp/stompjs`, `sockjs-client`) · `hls.js` · GitHub Actions

## How synchronization works

```
 user presses play ──▶ server runs a readiness barrier
                         │
        "prepare" ◀──────┘   everyone seeks + prebuffers, then replies "ready"
        "go"      ◀──────    all ready (or timeout): everyone starts together
        "clock"   ◀──────    server clock: position, playing, updatedAt
```

- `useSync` keeps one STOMP connection per room (SockJS, 2 s heartbeats, 3 s reconnect) and dispatches events: clock, source change, participants, buffering, chat, lobby, prepare, go.
- `useRoomClock` runs a 1 second control loop that compares the player with the expected position from the server clock:
  - drift above 3 s: hard seek;
  - drift above 0.3 s: nudge the playback rate (0.92 when ahead, 1.08 when behind) so the picture catches up smoothly;
  - after a local action (play, pause, seek) corrections pause for 1.5 s so the user's own change is not fought;
  - while anyone is buffering the player is held paused.
- The expected position is computed from the moment the client received the event, not from server timestamps, to avoid clock skew between machines.
- There are workarounds for Safari and iOS (native HLS, inline playback, ignored seeks right after reload).

## Getting started

Requirements: Node.js 18+ and a running backend on port 8080.

```bash
npm ci
npm run dev        # http://localhost:5173
```

The Vite dev server proxies `/api` and `/ws` to `http://localhost:8080`, so no environment variables are needed.

```bash
npm run build      # type-check (tsc) and production build into dist/
npm run preview    # serve the production build locally
```

## Project structure

```
src
├── pages/        HomePage, RoomPage
├── components/   VideoPlayer, YouTubePlayer, SourcePicker, ChatPanel, LobbyPanel, overlays
├── hooks/        useSync (STOMP), useRoomClock (drift control), useBackendHealth, useTheme
└── lib/          api client, shared types, HLS and YouTube helpers
```

## Deployment

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on every push to `develop`: `npm ci`, `npm run build`, copies `dist/` to the server over SSH, publishes it to the nginx web root and reloads nginx. Server credentials are stored as repository secrets. nginx serves the static files and proxies `/api` and `/ws` to the backend.

## Known limitations

- No authentication: anyone with a room link can join, and participants are anonymous (a random id per browser).
- No automated tests yet.
- Room state lives in the backend's memory, so rooms are lost on restart.

## Roadmap

- Component and hook tests for the clock logic (Vitest, React Testing Library)
- Display names for participants
- Docker setup for local development

## License

Not specified yet.
