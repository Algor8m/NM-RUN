/** Canonical event names from NM_RUN_MASTER_PROMPT_WEB.md. P3 may publish refinements; coordinate before changing these. */
export const CLIENT_EVENTS = Object.freeze({
  ROOM_CREATE: 'room:create', ROOM_JOIN: 'room:join', ROOM_LEAVE: 'room:leave',
  LOBBY_READY: 'lobby:ready', PLAYER_STATE: 'player:state',
  RACE_START_REQUEST: 'race:start_request', RACE_REMATCH: 'race:rematch',
});
export const SERVER_EVENTS = Object.freeze({
  LOBBY_UPDATE: 'lobby:update', RACE_COUNTDOWN: 'race:countdown', RACE_START: 'race:start',
  PLAYER_STATE: 'player:state', RACE_RANKING: 'race:ranking', RACE_FINISH: 'race:finish',
  RACE_RESULTS: 'race:results', SERVER_ERROR: 'server:error',
});
export const NETWORK_EVENTS = Object.freeze([
  SERVER_EVENTS.LOBBY_UPDATE, SERVER_EVENTS.RACE_COUNTDOWN, SERVER_EVENTS.RACE_START,
  SERVER_EVENTS.PLAYER_STATE, SERVER_EVENTS.RACE_RANKING, SERVER_EVENTS.RACE_FINISH,
  SERVER_EVENTS.RACE_RESULTS, SERVER_EVENTS.SERVER_ERROR,
  'connect', 'disconnect', 'connect_error',
]);
