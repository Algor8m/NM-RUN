/**
 * Browser-console progress sanity check. Import TrackWorld and call
 * runProgressChecks(track) after the world is built. This intentionally tests
 * the P1 client estimate only; P3 remains authoritative for accepted progress.
 */
export function runProgressChecks(track) {
  const points = track.getCenterline();
  const failures = [];
  let previous = -Infinity;
  points.forEach((point, index) => {
    const progress = track.getProgress(point, -1);
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) failures.push(`Invalid progress at route sample ${index}: ${progress}`);
    if (progress + 1e-9 < previous) failures.push(`Progress regressed at route sample ${index}: ${progress} < ${previous}`);
    previous = progress;
  });
  const starts = track.getStartTransforms();
  if (starts.length !== 4) failures.push(`Expected four start transforms, got ${starts.length}`);
  if (track.getCheckpointCount() !== 12) failures.push(`Expected 12 checkpoints, got ${track.getCheckpointCount()}`);
  const obstacles = track.getObstacleBounds();
  if (obstacles.some(o => !o.id || !o.kind || !Number.isFinite(o.min.x) || !Number.isFinite(o.max.z))) failures.push('Obstacle bounds include an invalid record');
  const pickups = track.getPickupSpawns();
  if (pickups.length < 10 || pickups.some(p => !p.id || !p.type || !p.position)) failures.push('Pickup spawn definitions are incomplete');
  return { ok: failures.length === 0, failures, samplesChecked: points.length, routeLength: track.getTotalLength(), checkpoints: track.getCheckpointCount(), obstacles: obstacles.length, pickups: pickups.length };
}
