/** Canonical NM Run tuning and client configuration. Coordinate convention: Three.js Y is up; route progress follows the ordered track centerline. */
export const GAME_CONFIG = Object.freeze({
  GAME_NAME: 'NM Run', MAX_PLAYERS: 4, MIN_PLAYERS_TO_START: 2,
  DEBUG_ALLOW_SOLO: true, SERVER_PORT: 3000, NETWORK_SEND_RATE_HZ: 25,
  COUNTDOWN_SECONDS: 3, LAPS: 2,
  BASE_SPEED: 14, BOOST_SPEED: 21, ACCELERATION: 30, TURN_RATE_DEG: 140,
  JUMP_VELOCITY: 8, GRAVITY: 22, DODGE_DISTANCE: 3, DODGE_DURATION: 0.25,
  DODGE_COOLDOWN: 1.5, ENDURANCE_MAX: 100, ENDURANCE_DEBRIS_DAMAGE: 25,
  ENDURANCE_REGEN_PER_SEC: 8, ENDURANCE_REGEN_DELAY: 2, STUMBLE_DURATION: 1.5,
  OBSTACLE_SLOWDOWN_FACTOR: 0.5, OBSTACLE_SLOWDOWN_TIME: 1, BOOST_MAX: 100,
  BOOST_START: 30, BOOST_DRAIN_PER_SEC: 30, BOOST_PICKUP_AMOUNT: 35,
  SHIELD_DURATION: 8, PICKUP_RESPAWN_SECONDS: 10,
  TRACK_TARGET_LENGTH_MIN: 1200, TRACK_TARGET_LENGTH_MAX: 1600,
  RACE_TARGET_SECONDS_MIN: 90, RACE_TARGET_SECONDS_MAX: 120,
  THREE_VERSION: '0.180.0',
});
export const PICKUP_TYPES = Object.freeze({ BOOST: 'boost', SHIELD: 'shield' });

/** Public URL only. Set window.NM_RUN_SERVER_URL before src/main.js in production. */
export function getServerUrl() {
  const override = typeof window !== 'undefined' ? window.NM_RUN_SERVER_URL : '';
  if (typeof override === 'string' && override.trim()) return override.trim().replace(/\/$/, '');
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_NM_RUN_SERVER_URL) {
    return import.meta.env.VITE_NM_RUN_SERVER_URL.trim().replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  }
  return `http://localhost:${GAME_CONFIG.SERVER_PORT}`;
}
