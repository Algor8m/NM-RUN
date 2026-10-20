# NM Run — Person 4 Delivery

**Scope:** UI, audio, camera effects, browser bootstrap, canonical shared constants/events, root client configuration, integration/deployment documentation.

## Stage summary

| Stage | Scope | Status |
|---|---|---|
| 1 | HTML/CSS shell, Three.js renderer, shared config/events, module integration points | `[GENERATED]` — files created; runtime not yet verified |
| 2 | Lobby and race UI wired to expected NetworkClient event contract | `[GENERATED]` — adapter expects P3's documented public API; P3 files not included in this role ZIP |
| 3 | HUD, camera, audio, settings, results | `[GENERATED]` — source written; standalone harness included, not browser-tested here |
| 4 | Deployment docs, credits, optimization and smoke-test checklist | `[GENERATED]` — documentation supplied; no hosting or multiplayer session performed |

**Validation:** `[RAN-OK]` JavaScript syntax checks passed for all `src/**/*.js` files and `npm run check`. `[UNVERIFIED]` Browser rendering, production build, and integrated P1–P3 gameplay were not verified. `npm install` could not resolve `registry.npmjs.org` in this environment (`EAI_AGAIN`), so dependencies were not installed, `npm run build` could not run (`vite: not found`), and no package-lock was generated. Run `npm install` in a network-enabled environment to create `package-lock.json`. The app deliberately reports missing modules and does not create fake racers or pretend the server is connected.

## Assumptions and integration contract

1. Root project is the client package; P3's Node server remains a separate package in `server/` and is started from that directory.
2. Three.js is pinned to `0.180.0` in the root package. **Person 1 must confirm this matches the version used by `TrackWorld.js`; align the pin before integration if not.**
3. P1 exports `TrackWorld` (or default) from `src/track/TrackWorld.js`; the selected integration signature is `new TrackWorld(scene)`, and the constructor is expected to build/attach its world. P4 does not call a second build method to avoid duplicate geometry.
4. P2 exports `PlayerController`, `Player`, or default from `src/player/PlayerController.js`; constructor accepts an options object `{ peerId, playerName, scene, track, config, isLocal }` and provides `update(dt, inputState, trackData)`, `getState()`, and state position/rotation access. This constructor shape is an **integration assumption**, not guaranteed by the master prompt; P2 must confirm it or P4 must make a small adapter adjustment.
5. P3 exports `NetworkClient` (or default) from `src/network/NetworkClient.js`; constructor takes no required args; `connect(serverUrl)` initiates connection; `on(event, callback)` (or `subscribe`) registers event handlers; documented room/ready/state/start/rematch/leave methods exist. P3 must confirm exact event payload shapes in `README_PERSON3.md`.
6. Server URL is public configuration, not a secret. `window.NM_RUN_SERVER_URL` is the canonical production override; otherwise Vite's `VITE_NM_RUN_SERVER_URL` or `http://localhost:3000` is used.
7. The server contract follows the master prompt event names. Any changes require explicit agreement with P3 and an update to `src/shared/events.js`.
8. The current course, player controller and network modules are not included in this Person 4 ZIP because they belong to P1, P2 and P3.

## Owned files

```text
nm-run-person4/
├── index.html
├── Person4Test.html
├── package.json
├── .gitignore
├── .env.example
├── CREDITS.md
├── README_PERSON4.md
├── styles/main.css
├── src/main.js
├── src/shared/config.js
├── src/shared/events.js
├── src/ui/LobbyUI.js
├── src/ui/HUD.js
├── src/ui/ResultsUI.js
├── src/ui/SettingsUI.js
├── src/ui/person4-test.js
├── src/audio/AudioManager.js
├── src/effects/CameraEffects.js
└── docs/DEPLOYMENT.md
```

## Setup on Windows

1. Install Node.js LTS (npm included).
2. Extract/copy this folder into the integrated repository as the root client files. Do not replace P1–P3 folders.
3. Open PowerShell in the client project root, for example:

   ```powershell
   cd C:\path\to\nm-run
   npm install
   npm run check
   npm run dev
   ```

4. Open the Vite URL printed in the terminal (normally `http://localhost:5173`). **Do not double-click `index.html`**: browser ES modules and npm package imports require an HTTP development server.
5. To run the standalone P4 harness, open `http://localhost:5173/Person4Test.html`. This harness tests UI/audio/effects modules only; sample standings are test-only and it does not prove multiplayer.
6. In a second PowerShell terminal, start P3's server according to `README_PERSON3.md`, normally from the server directory with `npm install` then `npm start`. Do not run the server using the root client package.
7. Once P1–P3 modules are in place, reload the client. Missing module messages should disappear; the connection pill must report Connected only after the actual Socket.IO connection succeeds.

## Controls

- `W` / `Arrow Up`: accelerate
- `S` / `Arrow Down`: brake
- `A` / `D` or left/right arrows: steer
- `Space`: jump
- `Left Ctrl`: quick dodge
- `Left Shift`: boost
- `Escape`: show/hide the pause overlay

The pause overlay only covers the UI. It does **not** freeze the online race. Input mechanics are owned by P2.

## UI and shared contracts

- `src/shared/config.js` contains canonical values copied from the master prompt and `getServerUrl()`.
- `src/shared/events.js` contains the suggested client/server event names from the master prompt.
- `LobbyUI` calls `createRoom(name)`, `joinRoom(code, name)`, `setReady(ready)`, `requestStartRace()`, and `leaveRoom()` on P3's adapter.
- `ResultsUI` calls `requestRematch()` and `leaveRoom()`.
- The HUD displays server-supplied standings only. It does not calculate authoritative placement.
- Server payloads are expected to include a lobby object with `players`/`members`, and rankings/results as arrays or `rankings`/`results` properties. P3 should align or document its exact payload shapes.
- If Person 2's remote-player visual factory differs, P4 needs a small adapter to create remote visuals. This version intentionally does not instantiate an undocumented remote controller.

## Audio and performance

- AudioContext is created/resumed only in response to a user action. Browsers may still mute audio if their policies or device settings prevent playback.
- Geometry for the preview ground/road is minimal. That preview is only shown if P1's track module cannot be imported and is labelled as an integration preview.
- Pixel ratio and shadow quality are adjustable. Low quality disables shadows; the renderer caps device pixel ratio.
- Renderer and animation loop are created once. Updates use delta time capped at 50 ms to avoid large movement jumps after tab stalls.

## Known issues / integration blockers

- `[UNVERIFIED]` P1, P2 and P3 implementations are not present in this role folder, so full gameplay is not yet integrated.
- `[UNVERIFIED]` The exact constructors and event payloads of P1–P3 must be checked against their READMEs before merging.
- `[UNVERIFIED]` The current UI event mapping assumes P3's client adapter emits the shared server events directly.
- `[UNVERIFIED]` No browser runtime, two-client room, full race, deployment or performance profile was run for this delivery.
- `[GENERATED]` Lobby create/join/start controls, HUD display, results rendering, settings and audio/effects modules have been authored.

## End-to-end integration checklist

1. [ ] Confirm P1 Three.js version and `TrackWorld` API; update the root pin only after team agreement.
2. [ ] Confirm P2 constructor, `update`, `getState`, `applyRemoteState`, event/state fields and remote visual creation API.
3. [ ] Confirm P3 constructor, `connect`, subscription API, all method names, event names and exact payload shapes.
4. [ ] Run `npm install`, `npm run check`, `npm run build` in the root client.
5. [ ] Start P3's Node server and verify startup logs.
6. [ ] Start Vite client and open two to four independent browser sessions (separate profiles or one normal and multiple private sessions).
7. [ ] Create room in one client; join with another; verify room code, player count and host display.
8. [ ] Ready all connected clients; verify start is enabled only for host with at least two players and all ready.
9. [ ] Start countdown and confirm synchronized countdown/start event on all clients.
10. [ ] Confirm track rendering, local movement, remote transforms and 20–30 Hz state snapshots.
11. [ ] Confirm HUD telemetry and standings are sourced from server events.
12. [ ] Test boost, jump, dodge, obstacle hits, checkpoints, finish order and server-generated results.
13. [ ] Test room-full, invalid code, server disconnect, host disconnect, rematch, leave/return, resize and settings.
14. [ ] Only mark individual features `[RAN-OK]` after directly observing them in the integrated runtime.

## Next integration checklist for P1–P3

- **P1:** `src/track/TrackWorld.js`, exact constructor/build signature, centerline/checkpoint data, obstacle bounds, pickup API, and matching Three.js version.
- **P2:** `src/player/PlayerController.js`, exact constructor, `getState()` schema, yaw convention, gameplay event mechanism, and remote-player visual creation API.
- **P3:** `src/network/NetworkClient.js`, `server/` package and entry point, exact event table, `connect(serverUrl)` behavior, player identity exposure, and server payload schemas.
- **Team:** keep the canonical event table in this folder; coordinate any contract changes rather than introducing duplicate event names.
