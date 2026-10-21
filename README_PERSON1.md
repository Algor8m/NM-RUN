# NM Run — Person 1: World, Environment & Track

## Stage 1 delivery
This is a standalone, procedural Three.js track module. It is designed to be copied into the team's `nm-run/` project at the same relative paths. It does not implement player physics, network transport, lobby state, or final HUD.

### Assumptions
1. Three.js is pinned to `0.180.0` in the standalone test page; the integrated app must use the same version.
2. Three.js Y is up. The track's forward route is the ordered sampled centreline from its first point to its last point; the route generally advances toward +Z.
3. Position, bounds, and length use world units, not guaranteed real-world metres.
4. Checkpoints are ordered from index `0` to `11`; checkpoint `11` is the finish trigger.
5. The module exports client-side progress estimates only. Person 3's server remains authoritative for accepted checkpoint progress and results.
6. Stage 1 focuses on the runnable base track, public API, and test harness. Detailed shortcut geometry, final route tuning, and comprehensive collision testing remain Stage 2 work.

## Files
```text
nm-run-person1/
├── README_PERSON1.md
└── src/
    └── track/
        ├── TrackWorld.js
        ├── TrackData.js
        ├── TrackBuilder.js
        ├── TrackTest.html
        ├── track-test.js
        └── progress-check.js
```

Copy `src/track/` into the integrated project at `nm-run/src/track/` and copy this README to `nm-run/README_PERSON1.md`.

## Run the standalone test (Windows)
The page imports Three.js from a pinned CDN, so an internet connection is required. Do not open `TrackTest.html` by double-clicking it; use a local web server so ES modules load correctly.

1. Install Node.js LTS if it is not already installed: https://nodejs.org/
2. Open **PowerShell**.
3. Change directory to the folder where you extracted this ZIP. For example:
   ```powershell
   cd "$HOME\Downloads\nm-run-person1"
   ```
4. Start a static server using `npx`:
   ```powershell
   npx --yes http-server . -p 8080 -c-1
   ```
5. Open `http://localhost:8080/src/track/TrackTest.html` in Chrome.
6. Use the buttons to show the centreline/debug points, switch to top-down view, mark the four start slots, toggle a pickup, and run the progress sanity check.
7. Open Chrome DevTools with `F12` and check the Console for errors.
8. Stop the local server with `Ctrl+C` in PowerShell.

If port 8080 is already occupied, use `npx --yes http-server . -p 8081 -c-1` and open port 8081 instead.

## Public API
```js
import { TrackWorld } from './src/track/TrackWorld.js';

const track = new TrackWorld();
track.build(scene); // scene is a THREE.Scene

track.getStartTransforms();
track.getCheckpointCount();
track.getCheckpoint(0);
track.getCheckpointTriggers();
track.getObstacleBounds();
track.getPickupSpawns();
track.getCenterline();
track.getTotalLength();
track.getProgress({ x: 0, y: 0, z: 30 }, -1);
track.getRespawnTransform(-1);
track.setPickupActive('boost-01', false);
track.setObstacleActive('barrier-01', false);
track.update(deltaSeconds);
```

### Data shapes and integration notes
- `getStartTransforms()` returns four records: `{ position: { x, y, z }, yaw, slot }`. Yaw is radians around Three.js Y.
- `getCheckpoint(index)` returns `{ id, index, label, progress, position, yaw, bounds, isFinish }`, or `null` for an invalid index. Bounds are simple `{ min, max }` numeric objects.
- `getObstacleBounds()` returns `{ id, kind, min, max, active }` records. The list is plain numeric data; Person 2 should consume this list rather than traverse the Three.js scene graph per frame.
- `getPickupSpawns()` returns `{ id, type, position, respawnSeconds, active }` records. Pickup collection and respawn timers are owned by gameplay/network code, not this module.
- `getCenterline()` returns ordered `{ x, y, z }` route points. `getTotalLength()` is an approximate polyline length in world units.
- `getProgress(position, lastCheckpointIndex)` is a local estimate clamped to the currently accepted checkpoint interval. It must not be treated as proof of a valid checkpoint or finish.
- `getRespawnTransform(lastCheckpointIndex)` returns `{ position, yaw }`. Pass the most recently accepted checkpoint index; use `-1` before the first checkpoint.
- `setPickupActive` and `setObstacleActive` return `false` for unknown IDs and `true` when an ID exists. The visual is hidden/shown and the exported `active` state changes.

## Zones
| Core segment | Route fraction | Included visual theme |
|---|---:|---|
| Campus entrance & starting grid | 0–13% | Entrance gate, road markings, start slots |
| Academic block paths | 13–32% | Academic blocks, windows, trees |
| Central quad | 32–49% | Open road and fountain/statue |
| Under-construction zone | 49–70% | Scaffolding, barricades, debris and tools |
| Final sprint | 70–100% | Sports/open ground sub-zone, grandstand, finish gate |

The sports/open-ground area is a sub-zone of the final part of the course, preserving five core segments.

## Checkpoint list
There are 12 ordered gates. IDs are `checkpoint-01` through `checkpoint-11`, followed by `finish`. The last record is flagged `isFinish: true`. The checkpoint trigger bounds are starter axis-aligned bounds for integration; curved-gate oriented collision refinement is a Stage 2 task.

## Obstacle and pickup inventory
- Obstacles have stable IDs, kind strings, and world-space bounds. Kinds currently include `barricade`, `cone`, `debris`, `pipe`, and `planks`.
- The pickup data contains 12 deterministic spawns: seven boost pickups and five shield pickups. All use a 10-second respawn value. Person 2 handles collection effects; P3/team integration must agree on authoritative pickup collection before online use.
- Start transforms are four side-by-side positions facing the first route segment.

## Shortcuts
Shortcut geometry and alternate path progression are **not yet implemented in Stage 1**. Stage 2 must add 2–3 fair shortcuts that reconnect without skipping ordered checkpoint gates. Until then, `getProgress` is a nearest-centreline estimate and must not be used to validate shortcuts or server race progression.

## Performance notes
- Environment objects use shared materials where practical and low-polygon primitives.
- Centreline sampling is deterministic and generated once per `TrackBuilder` instance.
- The exported obstacle list is cached as numeric bounds; player collision does not need to inspect scene nodes every frame.
- The test harness caps device pixel ratio at 1.75 and uses a simple renderer without post-processing.
- Actual FPS/draw-call targets have not been measured yet.

## Status labels
- **[GENERATED]** Track module, procedural base environment, road, checkpoint visuals/data, obstacles, pickups, start transforms, API, and standalone test harness are written.
- **[UNVERIFIED]** Browser rendering, route seams, full collision accuracy, route progress behaviour on curved sections, and integration with P2/P3/P4 have not been run or verified in this environment.
- **[UNVERIFIED]** The course's measured race duration is not tuned to 90–120 seconds.
- **Not implemented in Stage 1:** shortcuts, final obstacle placement pass, oriented checkpoint collision tests, and server-side progression (owned by P3).

## Person 2 / Person 3 / Person 4 integration checklist
- **P2:** Import `TrackWorld`; call `getObstacleBounds()` during collision updates and use `active` records only. Use `getRespawnTransform(lastCheckpointIndex)` for recovery. Confirm coordinate/yaw conventions with this README.
- **P3:** Treat checkpoint definitions and IDs as the intended order, but implement server-side checkpoint acceptance, movement bounds, progress, and finish validation. Do not trust `getProgress()` from a client as authoritative.
- **P4:** Import `TrackWorld` from `src/track/TrackWorld.js`, call `build(scene)` once after scene setup, and call `update(deltaSeconds)` from the existing render loop. Use `getStartTransforms()` for grid placement and `getCheckpointTriggers()` for HUD checkpoint labels. Keep Three.js at `0.180.0` unless the team agrees to update all modules together.

## Next stage
1. Verify the standalone page in Chrome and resolve any console errors.
2. Add and test 2–3 shortcuts that reconnect to the ordered checkpoint path.
3. Refine checkpoint trigger geometry and progress sampling around bends.
4. Tune course length and race duration after integrating movement speed from Person 2.
5. Review obstacle positions and ensure each is safely reachable and avoidable.


## Campus-reference layout update (Stage 1 refresh)

The scene layout now takes visual cues from the user-provided NMIMS Hyderabad/Jadcherla reference photos: a broad white entrance portal; white academic blocks with deep-blue horizontal window bands; landscaped lawn and checker paving; a central fountain; an outdoor sports complex with blue/green courts, red running-track strips, fencing and covered seating; tree-lined internal roads; and an unfinished construction plot. These are original low-poly meshes, not copied photographic textures or logos.

The route is a continuous, curved centreline that weaves past the entrance, academic buildings, central landscaped quad, construction plots, sports complex and open-ground stretch. Checkpoint IDs/count, pickup IDs/count, obstacle IDs, `TrackWorld` public methods, Y-up coordinates, and yaw-in-radians convention are preserved. This remains a procedural approximation of the campus, not a surveyed-accurate map.

### Updated files
- `src/track/TrackData.js` — revised centreline anchors and moved the existing stable obstacle/pickup definitions near the new route.
- `src/track/TrackBuilder.js` — rebuilt the environment dressing around recognizable campus features.

### Status for this refresh
- [GENERATED] Updated campus layout and procedural architecture.
- [GENERATED] Revised route anchors and environmental placements.
- [RAN-OK] JavaScript syntax checks, if recorded in the delivery message, only; they do not verify visual appearance.
- [UNVERIFIED] Browser rendering, road-to-building clearance, gameplay collision alignment, full progress behaviour on every curve, and performance on the target laptop.

## Closed-loop track and expanded hazards (update)

- The centerline now uses a closed Catmull-Rom curve, looping back to the start/finish area.
- Existing public `TrackWorld` methods and the original 12 obstacle IDs are retained.
- 24 extra hazards are placed using a fixed-seed pseudo-random generator along the loop. The seed keeps placements deterministic across runs, which is important for multiplayer consistency.
- Hazard kinds include low-poly trees, rocks, construction blocks, barricades, and debris. New obstacle IDs are stable (`random-<kind>-NN`).
- The route and obstacle placement are still approximate. Run `TrackTest.html` and inspect centerline/debug view before gameplay integration; collision fairness and pickup placement need in-browser validation.
