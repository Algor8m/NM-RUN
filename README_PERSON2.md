# NM Run — Person 2: Player Controller and Gameplay

## Delivery status

This is the Person 2 module only. It does not contain the real track, network server, main bootstrap, final HUD, or shared production config.

- [GENERATED] Four selectable, simple low-poly avatars named Tanishi, Yash, Anjali, and Ritam, with distinct outfit colours/details and name labels. They are procedural Three.js meshes; no external GLB assets are required.
- [GENERATED] Simple walk/run limb movement and an on-screen Jump button in the standalone test harness.
- [GENERATED] Local keyboard input; remote players ignore keyboard input.
- [GENERATED] Delta-time-based acceleration, braking, coasting, steering and clamped frame deltas.
- [FIXED] Obstacle slowdown now caps the speed on the same update as impact, instead of waiting until the next frame.
- [GENERATED] Jump/gravity/grounding, dodge duration/cooldown, boost drain, shield duration, obstacle slowdown, debris endurance damage/regeneration, zero-endurance stumble/recovery.
- [GENERATED] Test-harness obstacle and pickup mocks, plus `getState()` diagnostics.
- [GENERATED] Remote transform interpolation API.
- [UNVERIFIED] Browser visual/gameplay behaviour and integration with the real P1/P3/P4 modules have not been verified in this delivery environment.
- [UNVERIFIED] Multiplayer, server authority and deployment are outside this module and are not claimed as tested.

## Owned files

- `src/player/Player.js`
- `src/player/PlayerController.js`
- `src/player/PlayerTest.html`
- `src/player/player-test.js`
- `src/player/test-only/config.mock.js` (test-only config; do not import into the production game)
- `README_PERSON2.md`

## Coordinate convention

Three.js Y is up. Yaw/`rotation` is radians about +Y. Yaw `0` faces `-Z`; positive yaw turns left. Forward is `(-sin(yaw), 0, -cos(yaw))`. Player position is at the feet; jumping changes `position.y`.

## Controls

- W / Up: accelerate.
- S / Down: brake/reduce speed.
- A / Left and D / Right: steer.
- Space: jump (test harness also has an on-screen **JUMP** button).
- Left Ctrl: dodge; duration and cooldown are configured in the shared config.
- Left Shift: boost while the meter remains.

**Browser note:** Left Ctrl is retained to match the shared prompt. Browsers/OS shortcuts such as Ctrl+W may close the tab and cannot reliably be intercepted by a web page. Avoid pressing Ctrl+W while testing; if the team chooses another dodge key, coordinate that contract change with P4 before changing the key map.

## API

```js
import { Player } from "./src/player/Player.js";
import { KeyboardInput } from "./src/player/PlayerController.js";

const keyboard = new KeyboardInput(); // one per page; local player only
const player = new Player({ peerId: "peer-id", name: "Tanishi", isLocal: true });
player.setCharacter("Yash"); // optional: switch to Tanishi, Yash, Anjali, or Ritam
scene.add(player.mesh);
player.update(deltaSeconds, keyboard.read(), trackWorld);
const snapshot = player.getState();
player.teleportTo({ position: { x: 0, y: 0, z: 0 }, yaw: 0 });
player.grantBoost(35);
player.grantShield(8);
player.setControlsEnabled(false);
player.setRaceProgress(checkpointIndex, progress); // race logic supplies accepted values
player.on("damage", event => console.log(event));
// Cleanup: keyboard.dispose(); player.dispose();
```

Remote entity example:

```js
const remote = new Player({ peerId: "other-peer", name: "Other", color: 0xf59e0b, isLocal: false });
scene.add(remote.mesh);
remote.applyRemoteState(networkSnapshot); // queues a target transform
remote.update(deltaSeconds, null, null); // interpolates toward target; no local input
```

`applyRemoteState()` accepts `position: {x,y,z}`, `rotation` (yaw radians; `yaw` is also accepted), and optional finite `speed`. P3 owns transport and packet validation; this module never sends packets.

## State schema

`getState()` returns a fresh serializable object with `peerId`, `position: {x,y,z}`, `rotation` (yaw in radians), `speed`, `endurance` (0–100), `boost` (0–100), `boosting`, `shieldActive`, `lastCheckpointIndex` (initially `-1`), and `progress` (initially `0`). P3/race logic should provide accepted checkpoint/progress values through `setRaceProgress()`; clients must not treat local progress as authoritative race results.

## Track and pickup contracts

P1's `getObstacleBounds()` should return records shaped like:

```js
{ id: "stable-id", kind: "debris", min: { x, y, z }, max: { x, y, z }, active: true }
```

The controller also supports `getPickupSpawns()` records shaped like `{ id, type: "boost" | "shield", position: {x,y,z}, active: true }` and calls `setPickupActive(id, false)` after local collection if that method exists. P1/P3 must agree how pickup collection is made authoritative and synchronized, so multiple clients cannot independently claim the same pickup. Current client-side collection is a responsive gameplay effect, not server authority.

The optional track interface can provide `getProgress(position, lastCheckpointIndex)` and `getRespawnTransform(lastCheckpointIndex)`. Fall detection uses a low-Y threshold; P1/P4 should agree on fall boundaries and safe respawn policy before integration.

## Gameplay events for P4

Subscribe with `player.on(eventName, callback)`. Events currently emitted include:

- `jump`, `land`, `dodge`
- `obstacle-hit`, `damage`, `shield-absorbed`, `stumble`, `respawn`
- `pickup` (`type` is `boost` or `shield`)
- `boost-changed`, `shield-changed` (from direct grant methods)

Callbacks receive small event payloads with relevant state/obstacle/pickup information. Event callbacks should be lightweight. P4 can map these to HUD updates, camera shake, and Web Audio effects. This module does not implement audio or HUD.

## Test steps (test-only harness)

1. Extract the ZIP and open the `nm-run` folder in VS Code.
2. Open a terminal in that folder.
3. Run `python -m http.server 8000` (or `py -m http.server 8000` on Windows if needed).
4. Open `http://localhost:8000/src/player/PlayerTest.html` in Chrome/Edge.
5. Select Tanishi, Yash, Anjali, or Ritam from the Character menu. Test movement, steering, Space or the on-screen JUMP button, Left Ctrl dodge, Left Shift boost, the red debris obstacle, the orange barricade, and the cyan/purple pickups.
6. Confirm the panel reports state values, events, endurance, boost, shield and cooldown.
7. Stop the server with Ctrl+C in the terminal.

The harness uses a test-only track and mock obstacle/pickup data. It loads Three.js 0.160.0 from a CDN and therefore needs an internet connection. The team must confirm that the production app pins the same Three.js version. Do not open the page using `file://`.

## Checks performed

- [RAN-OK] JavaScript syntax checks passed for `Player.js`, `PlayerController.js`, and `player-test.js`.
- [RAN-OK] 14 Node-side controller checks passed, covering jump impulse/upward movement/landing/re-jump, forward acceleration, dodge/cooldown, boost drain, immediate obstacle slowdown, debris damage, shield absorption, endurance regeneration, boost pickup, and remote interpolation.
- [UNVERIFIED] The browser harness could not be confirmed in a real browser in this environment; the headless WebGL run did not complete. These controller checks do not prove the browser UI or full-game integration.
- [UNVERIFIED] Integration with P1/P3/P4 and multiplayer was not run.

## Integration checklist

### P1 — Track
- [ ] Confirm stable obstacle IDs/kinds and world-space `min`/`max` bounds include Y.
- [ ] Confirm pickup records and `setPickupActive()` semantics/respawn ownership.
- [ ] Confirm `getProgress()` and `getRespawnTransform()` signatures.
- [ ] Confirm coordinate/yaw convention and fall/respawn policy.

### P3 — Network/server
- [ ] Share final player-state packet schema and event table with P2/P4.
- [ ] Send only `getState()` snapshots; validate/sanitize packets on server.
- [ ] Feed remote snapshots to `applyRemoteState()` and call remote `update()` each frame.
- [ ] Keep checkpoint acceptance, pickup authority, standings and finish order server-owned.

### P4 — UI/bootstrap/shared config
- [ ] Provide canonical `src/shared/config.js` with master-prompt defaults and keep Three.js version consistent.
- [ ] Import `Player` and `KeyboardInput`; instantiate keyboard input only for the local player.
- [ ] Call `player.update(dt, input, trackWorld)` for the local player and `remote.update(dt, null, null)` for remotes.
- [ ] Subscribe to documented player events for HUD/audio/effects.
- [ ] Confirm Left Ctrl dodge key choice; coordinate any key change before implementation changes.
- [ ] Run full-game smoke tests with at least two real browser clients and the actual server.

## Known limitations

- Player-to-player physical collisions are intentionally disabled.
- Local pickup collection is not authoritative; the team must synchronize collection with P3.
- `progress` is a local display value; only server-accepted checkpoints/results determine standings.
- Shared geometry/materials are reused; per-player materials and label textures are disposed by `dispose()`.
- No full-game, multiplayer, hosting, or browser-run claim is made.


## All-stages test harness

Open `src/player/PlayerTest.html` through a local server. The page contains the playable mock course, a **Character** selector for Tanishi/Yash/Anjali/Ritam, an on-screen **JUMP** button, and **Run all mechanic checks**, which runs repeatable checks for acceleration, jump, dodge/cooldown, boost drain, obstacle slowdown, debris damage, shield absorption, endurance regeneration, pickup grants, remote interpolation, and snapshot shape. These checks are browser-side checks against test-only mock data; they do not prove integration with the real P1 track or P3 server.

### Status labels
- [GENERATED] Stage 1–4 implementation and test harness files are present.
- [RAN-OK] JavaScript syntax checks passed in Node.js.
- [UNVERIFIED] Browser visual behaviour, real P1 track integration, real P3 multiplayer, and P4 HUD/audio integration until tested with those modules.

### Run
1. Open a terminal in the extracted `nm-run` folder.
2. Run `python -m http.server 8000`.
3. Open `http://localhost:8000/src/player/PlayerTest.html`.
4. Click **Run all mechanic checks** and confirm every line says `PASS`.
5. Manually drive through the test debris/barricade and test jump, dodge, boost, and shield.

The standalone page uses an import-map alias for the shared configuration because `src/shared/config.js` is owned by Person 4 and is intentionally not included in this Person 2 ZIP. In the integrated project, use Person 4's canonical `src/shared/config.js` and confirm the Three.js version matches across all roles.
