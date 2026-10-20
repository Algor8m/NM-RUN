// Person 2: input and deterministic local gameplay simulation.
// Coordinates: Y is up; yaw is radians around +Y; yaw=0 faces -Z; +yaw turns left.
import { GAME_CONFIG } from "../shared/config.js";

export const PLAYER_TUNING = Object.freeze({
  BRAKE_DECEL: 45,
  COAST_DECEL: 8,
  MIN_STEER_SPEED: 3,
  MAX_DELTA: 0.1,
  PLAYER_RADIUS: 0.48,
  PLAYER_HEIGHT: 1.8,
  COLLISION_RETRY_SECONDS: 0.25,
  REMOTE_SMOOTHING: 12,
  FALL_Y: -15
});

const ACTION_CODES = Object.freeze({
  forward: ["KeyW", "ArrowUp"], back: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"],
  jump: ["Space"], dodge: ["ControlLeft"], boost: ["ShiftLeft"]
});
const CODE_TO_ACTION = {};
for (const [action, codes] of Object.entries(ACTION_CODES)) for (const code of codes) CODE_TO_ACTION[code] = action;
const PREVENT_DEFAULT_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);
function isTypingTarget(target) {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable === true);
}
function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Create once for a local player. Remote players must never use keyboard input. */
export class KeyboardInput {
  constructor(target = window) {
    this._target = target; this._down = new Set();
    this._state = { forward:false, back:false, left:false, right:false, jump:false, dodge:false, boost:false };
    this._onKeyDown = e => this._handle(e, true); this._onKeyUp = e => this._handle(e, false);
    this._onBlur = () => this.reset();
    target.addEventListener("keydown", this._onKeyDown); target.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
  }
  _handle(e, down) {
    const action = CODE_TO_ACTION[e.code]; if (!action) return;
    if (down) { if (isTypingTarget(e.target)) return; if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault(); this._down.add(e.code); }
    else this._down.delete(e.code);
    this._state[action] = ACTION_CODES[action].some(code => this._down.has(code));
  }
  read() { return this._state; }
  reset() { this._down.clear(); for (const key of Object.keys(this._state)) this._state[key] = false; }
  dispose() { this._target.removeEventListener("keydown", this._onKeyDown); this._target.removeEventListener("keyup", this._onKeyUp); window.removeEventListener("blur", this._onBlur); this.reset(); }
}

export class PlayerController {
  constructor() {
    this.position = { x:0, y:0, z:0 }; this.yaw = 0; this.speed = 0;
    this.verticalVelocity = 0; this.grounded = true;
    this.endurance = GAME_CONFIG.ENDURANCE_MAX; this.boost = GAME_CONFIG.BOOST_START;
    this.boosting = false; this.shieldActive = false; this.shieldRemaining = 0;
    this.lastCheckpointIndex = -1; this.progress = 0;
    this.dodgeRemaining = 0; this.dodgeCooldown = 0; this.dodgeDirection = 0;
    this.slowdownRemaining = 0; this.stumbleRemaining = 0; this.regenDelay = 0;
    this._hitRetry = new Map(); this._overlappingObstacles = new Set();
    this._remoteTarget = null; this._wasJumpDown = false; this._wasDodgeDown = false;
  }
  reset(position = {x:0,y:0,z:0}, yaw = 0) {
    this.position.x=position.x; this.position.y=position.y; this.position.z=position.z; this.yaw=wrapAngle(yaw); this.speed=0;
    this.verticalVelocity=0; this.grounded=true; this.endurance=GAME_CONFIG.ENDURANCE_MAX; this.boost=GAME_CONFIG.BOOST_START;
    this.boosting=false; this.shieldActive=false; this.shieldRemaining=0; this.dodgeRemaining=0; this.dodgeCooldown=0;
    this.dodgeDirection=0; this.slowdownRemaining=0; this.stumbleRemaining=0; this.regenDelay=0;
    this._hitRetry.clear(); this._overlappingObstacles.clear(); this._remoteTarget=null; this._wasJumpDown=false; this._wasDodgeDown=false;
  }
  grantBoost(amount = GAME_CONFIG.BOOST_PICKUP_AMOUNT) { if (Number.isFinite(amount)) this.boost=clamp(this.boost+Math.max(0,amount),0,GAME_CONFIG.BOOST_MAX); }
  grantShield(durationSeconds = GAME_CONFIG.SHIELD_DURATION) { this.shieldRemaining=Math.max(this.shieldRemaining,Math.max(0,durationSeconds)); this.shieldActive=this.shieldRemaining>0; }
  setRemoteTarget(state) {
    if (!state?.position) return;
    const {x,y,z}=state.position; const yaw=state.rotation ?? state.yaw;
    if (![x,y,z,yaw].every(Number.isFinite)) return;
    this._remoteTarget={x,y,z,yaw:wrapAngle(yaw),speed:Number.isFinite(state.speed)?state.speed:0};
  }
  updateRemote(dt) {
    if (!this._remoteTarget) return;
    const a=1-Math.exp(-PLAYER_TUNING.REMOTE_SMOOTHING*dt), t=this._remoteTarget;
    this.position.x += (t.x-this.position.x)*a; this.position.y += (t.y-this.position.y)*a; this.position.z += (t.z-this.position.z)*a;
    this.yaw=wrapAngle(this.yaw+wrapAngle(t.yaw-this.yaw)*a); this.speed += (t.speed-this.speed)*a;
  }
  update(dt, input, trackData, emit = () => {}) {
    const cfg=GAME_CONFIG, t=PLAYER_TUNING; dt=clamp(Number.isFinite(dt)?dt:0,0,t.MAX_DELTA); if (!dt) return;
    this.dodgeCooldown=Math.max(0,this.dodgeCooldown-dt); this.dodgeRemaining=Math.max(0,this.dodgeRemaining-dt);
    this.slowdownRemaining=Math.max(0,this.slowdownRemaining-dt); this.stumbleRemaining=Math.max(0,this.stumbleRemaining-dt);
    this.shieldRemaining=Math.max(0,this.shieldRemaining-dt); this.shieldActive=this.shieldRemaining>0;
    this.regenDelay=Math.max(0,this.regenDelay-dt);
    if (this.regenDelay<=0 && this.endurance<cfg.ENDURANCE_MAX && this.stumbleRemaining<=0) this.endurance=clamp(this.endurance+cfg.ENDURANCE_REGEN_PER_SEC*dt,0,cfg.ENDURANCE_MAX);
    const controls=input || {};
    const canMove=this.stumbleRemaining<=0;
    const wantsBoost=!!controls.boost && this.boost>0 && canMove;
    this.boosting=wantsBoost;
    if (this.boosting) this.boost=clamp(this.boost-cfg.BOOST_DRAIN_PER_SEC*dt,0,cfg.BOOST_MAX);
    if (this.boost<=0) this.boosting=false;
    const maxSpeed=this.boosting?cfg.BOOST_SPEED:cfg.BASE_SPEED;
    if (!canMove) this.speed=Math.max(0,this.speed-t.BRAKE_DECEL*dt);
    else if (controls.back) this.speed=Math.max(0,this.speed-t.BRAKE_DECEL*dt);
    else if (controls.forward) this.speed=Math.min(maxSpeed,this.speed+cfg.ACCELERATION*dt);
    else this.speed=Math.max(0,this.speed-t.COAST_DECEL*dt);
    if (this.slowdownRemaining>0) this.speed=Math.min(this.speed,cfg.BASE_SPEED*cfg.OBSTACLE_SLOWDOWN_FACTOR);
    const steer=(controls.left?1:0)-(controls.right?1:0);
    if (canMove && steer) this.yaw=wrapAngle(this.yaw+steer*cfg.TURN_RATE_DEG*Math.PI/180*Math.min(1,this.speed/t.MIN_STEER_SPEED)*dt);
    if (canMove && controls.jump && !this._wasJumpDown && this.grounded) { this.verticalVelocity=cfg.JUMP_VELOCITY; this.grounded=false; emit("jump",this.getState()); }
    if (canMove && controls.dodge && !this._wasDodgeDown && this.dodgeCooldown<=0 && this.dodgeRemaining<=0) {
      this.dodgeRemaining=cfg.DODGE_DURATION; this.dodgeCooldown=cfg.DODGE_COOLDOWN; this.dodgeDirection=steer || (controls.left?1:-1); emit("dodge",this.getState());
    }
    this._wasJumpDown=!!controls.jump; this._wasDodgeDown=!!controls.dodge;
    if (this.dodgeRemaining>0) {
      const sideX=Math.cos(this.yaw)*this.dodgeDirection, sideZ=-Math.sin(this.yaw)*this.dodgeDirection;
      const total=Math.max(cfg.DODGE_DURATION,0.001); const lateral=cfg.DODGE_DISTANCE*dt/total;
      this.position.x+=sideX*lateral; this.position.z+=sideZ*lateral;
    }
    this.position.x+=-Math.sin(this.yaw)*this.speed*dt; this.position.z+=-Math.cos(this.yaw)*this.speed*dt;
    if (!this.grounded) { this.verticalVelocity-=cfg.GRAVITY*dt; this.position.y+=this.verticalVelocity*dt; if (this.position.y<=0) { this.position.y=0; this.verticalVelocity=0; this.grounded=true; emit("land",this.getState()); } }
    this._processObstacles(trackData,dt,emit);
    this._processPickups(trackData,emit);
    const center=trackData?.getProgress;
    if (typeof center==="function") { const p=center.call(trackData,this.position,this.lastCheckpointIndex); if (Number.isFinite(p)) this.progress=Math.max(this.progress,p); }
    if (this.position.y< t.FALL_Y && typeof trackData?.getRespawnTransform==="function") { const tr=trackData.getRespawnTransform(this.lastCheckpointIndex); if (tr?.position) { this.reset(tr.position,tr.yaw??tr.rotation??0); emit("respawn",this.getState()); } }
  }
  _processObstacles(trackData,dt,emit) {
    const cfg=GAME_CONFIG, t=PLAYER_TUNING;
    const bounds=typeof trackData?.getObstacleBounds==="function"?trackData.getObstacleBounds():Array.isArray(trackData?.obstacleBounds)?trackData.obstacleBounds:[];
    const overlapping=new Set();
    for (const b of bounds) {
      if (!b || b.active===false || !b.min || !b.max) continue;
      const r=t.PLAYER_RADIUS, x=this.position.x, z=this.position.z, feet=this.position.y;
      const hit=x+r>=b.min.x && x-r<=b.max.x && z+r>=b.min.z && z-r<=b.max.z && feet+t.PLAYER_HEIGHT>=b.min.y && feet<=b.max.y;
      if (!hit) continue;
      const id=String(b.id ?? `${b.kind}:${b.min.x}:${b.min.z}`); overlapping.add(id);
      if (this._overlappingObstacles.has(id)) continue;
      this._hitRetry.set(id,t.COLLISION_RETRY_SECONDS);
      if (this.shieldActive) { this.shieldActive=false; this.shieldRemaining=0; emit("shield-absorbed",{obstacleId:id,state:this.getState()}); }
      else {
        this.slowdownRemaining=Math.max(this.slowdownRemaining,cfg.OBSTACLE_SLOWDOWN_TIME); this.speed=Math.min(this.speed,cfg.BASE_SPEED*cfg.OBSTACLE_SLOWDOWN_FACTOR);
        if (b.kind==="debris" || b.kind==="brick" || b.kind==="pipe" || b.kind==="plank") {
          this.endurance=clamp(this.endurance-cfg.ENDURANCE_DEBRIS_DAMAGE,0,cfg.ENDURANCE_MAX); this.regenDelay=cfg.ENDURANCE_REGEN_DELAY;
          emit("damage",{obstacleId:id,kind:b.kind,endurance:this.endurance,state:this.getState()});
          if (this.endurance<=0) { this.stumbleRemaining=cfg.STUMBLE_DURATION; this.speed*=0.25; emit("stumble",this.getState()); }
        } else emit("obstacle-hit",{obstacleId:id,kind:b.kind,state:this.getState()});
      }
    }
    for (const [id,remaining] of this._hitRetry) { if (!overlapping.has(id)) this._hitRetry.delete(id); else this._hitRetry.set(id,Math.max(0,remaining-dt)); }
    this._overlappingObstacles=overlapping;
  }
  _processPickups(trackData,emit) {
    const cfg=GAME_CONFIG; const pickups=typeof trackData?.getPickupSpawns==="function"?trackData.getPickupSpawns():Array.isArray(trackData?.pickups)?trackData.pickups:[];
    for (const p of pickups) {
      if (!p || p.active===false || !p.position) continue;
      const dx=this.position.x-p.position.x, dz=this.position.z-p.position.z, dy=this.position.y-p.position.y;
      if (dx*dx+dz*dz>1.6*1.6 || Math.abs(dy)>2.5) continue;
      if (p.type==="boost") { this.grantBoost(cfg.BOOST_PICKUP_AMOUNT); emit("pickup",{id:p.id,type:"boost",state:this.getState()}); }
      else if (p.type==="shield") { this.grantShield(cfg.SHIELD_DURATION); emit("pickup",{id:p.id,type:"shield",state:this.getState()}); }
      else continue;
      if (typeof trackData?.setPickupActive==="function") trackData.setPickupActive(p.id,false);
      else p.active=false;
    }
  }
  getState(peerId="unknown") { return {peerId,position:{x:this.position.x,y:this.position.y,z:this.position.z},rotation:this.yaw,speed:this.speed,endurance:this.endurance,boost:this.boost,boosting:this.boosting,shieldActive:this.shieldActive,lastCheckpointIndex:this.lastCheckpointIndex,progress:this.progress}; }
}
