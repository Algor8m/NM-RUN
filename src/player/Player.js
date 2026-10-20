// Person 2 public player entity. Rendering + gameplay API; networking stays in Person 3.
import * as THREE from "three";
import { GAME_CONFIG } from "../shared/config.js";
import { PlayerController, PLAYER_TUNING } from "./PlayerController.js";

export const PLAYER_CHARACTERS = Object.freeze([
  { name: "Tanishi", color: 0xd9468d, accent: 0xf6c8dc, hair: 0x241a22, style: "glasses" },
  { name: "Yash", color: 0xc28a52, accent: 0x253c5a, hair: 0x201b18, style: "jacket" },
  { name: "Anjali", color: 0x159b91, accent: 0xe8c9a2, hair: 0x241a22, style: "longhair" },
  { name: "Ritam", color: 0x24272e, accent: 0xd8c69d, hair: 0x241a22, style: "dhoti" }
]);
const NO_INPUT = Object.freeze({forward:false,back:false,left:false,right:false,jump:false,dodge:false,boost:false});
let shared=null;
function getShared(){
  if(!shared) shared={
    legGeo:new THREE.BoxGeometry(.16,.5,.16), torsoGeo:new THREE.BoxGeometry(.5,.6,.3),
    headGeo:new THREE.IcosahedronGeometry(.22,1), hairGeo:new THREE.SphereGeometry(.235,8,6),
    armGeo:new THREE.BoxGeometry(.13,.48,.14), shoeGeo:new THREE.BoxGeometry(.19,.1,.28),
    glassesGeo:new THREE.BoxGeometry(.34,.055,.035), packGeo:new THREE.BoxGeometry(.36,.4,.18),
    headMat:new THREE.MeshStandardMaterial({color:0xf1c9a5,flatShading:true}),
    skinMat:new THREE.MeshStandardMaterial({color:0xc98f6d,flatShading:true})
  };
  return shared;
}
function createNameSprite(name){
  if(typeof document==="undefined") return null;
  const canvas=document.createElement("canvas");canvas.width=256;canvas.height=64;const ctx=canvas.getContext("2d");
  if(!ctx)return null;ctx.fillStyle="rgba(0,0,0,.68)";ctx.fillRect(0,0,256,64);ctx.fillStyle="#fff";ctx.font="bold 30px sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(String(name).slice(0,24),128,32,240);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.scale.set(1.65,.41,1);sprite.position.set(0,2.02,0);return sprite;
}
function profileFor(name,color){
  return PLAYER_CHARACTERS.find(c=>c.name.toLowerCase()===String(name||"").toLowerCase()) || {name:name||"Player",color:color??0x3b82f6,accent:0x475569,hair:0x241a22,style:"default"};
}

export class Player {
  constructor({peerId,name="",color=undefined,isLocal=false}={}){
    this.peerId=peerId??"unknown";this.name=name;this.isLocal=!!isLocal;this.controlsEnabled=true;this.controller=new PlayerController();this._listeners=new Map();this._disposed=false;
    this.mesh=new THREE.Group();this.mesh.name=`Player_${this.peerId}`;this._nameSprite=null;this._bodyMaterial=null;this._accentMaterial=null;this._extraMaterials=[];this._limbs=[];this._walkTime=0;
    this.setCharacter(name||"Player",color);this._syncMesh();
  }
  _clearCharacter(){
    for(const child of [...this.mesh.children]){this.mesh.remove(child);if(child.isSprite&&child.material){child.material.map?.dispose();child.material.dispose();} }
    this._bodyMaterial?.dispose();this._accentMaterial?.dispose();for(const m of this._extraMaterials)m.dispose();this._extraMaterials=[];this._limbs=[];
  }
  setCharacter(name,color){
    this._clearCharacter();this.name=name||"Player";this.character=profileFor(this.name,color);const p=this.character,s=getShared();
    const baseColor=color??p.color;this._bodyMaterial=new THREE.MeshStandardMaterial({color:baseColor,flatShading:true});this._accentMaterial=new THREE.MeshStandardMaterial({color:p.accent,flatShading:true});
    const hairMat=new THREE.MeshStandardMaterial({color:p.hair,flatShading:true});this._extraMaterials.push(hairMat);
    const add=(geo,mat,x,y,z,limb=false)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;this.mesh.add(m);if(limb)this._limbs.push({mesh:m,baseY:y,phase:x<0?0:Math.PI});return m;};
    // Friendly low-poly character, built from simple shapes so no external model files are needed.
    add(s.legGeo,this._accentMaterial,-.12,.25,0,true);add(s.legGeo,this._accentMaterial,.12,.25,0,true);
    add(s.shoeGeo,this._bodyMaterial,-.12,.055,-.055);add(s.shoeGeo,this._bodyMaterial,.12,.055,-.055);
    add(s.torsoGeo,this._bodyMaterial,0,.8,0);
    add(s.armGeo,this._bodyMaterial,-.32,.82,0,true);add(s.armGeo,this._bodyMaterial,.32,.82,0,true);
    add(s.headGeo,s.headMat,0,1.3,0);add(s.hairGeo,hairMat,0,1.43,.015);
    // Hair silhouette and outfit accents differ slightly per named avatar.
    if(p.style==="longhair"){add(new THREE.BoxGeometry(.12,.44,.12),hairMat,-.2,1.19,.04);add(new THREE.BoxGeometry(.12,.44,.12),hairMat,.2,1.19,.04);}
    if(p.style==="jacket"){add(new THREE.BoxGeometry(.07,.55,.33),this._accentMaterial,-.14,.81,-.01);add(new THREE.BoxGeometry(.07,.55,.33),this._accentMaterial,.14,.81,-.01);}
    if(p.style==="glasses"){const glassMat=new THREE.MeshStandardMaterial({color:0x1e293b,metalness:.35,roughness:.4});this._extraMaterials.push(glassMat);add(s.glassesGeo,glassMat,0,1.31,-.205);}
    if(p.style==="dhoti"){add(new THREE.BoxGeometry(.38,.46,.2),this._accentMaterial,0,.32,.015);add(new THREE.BoxGeometry(.42,.045,.23),this._bodyMaterial,0,.47,-.01);}
    this._nameSprite=createNameSprite(this.name);if(this._nameSprite)this.mesh.add(this._nameSprite);
  }
  _syncMesh(){this.mesh.position.set(this.controller.position.x,this.controller.position.y,this.controller.position.z);this.mesh.rotation.y=this.controller.yaw;}
  get position(){return this.controller.position;} get yaw(){return this.controller.yaw;} get speed(){return this.controller.speed;}
  on(eventName,listener){if(typeof listener!=="function")return()=>{};if(!this._listeners.has(eventName))this._listeners.set(eventName,new Set());this._listeners.get(eventName).add(listener);return()=>this.off(eventName,listener);}
  off(eventName,listener){this._listeners.get(eventName)?.delete(listener);}
  _emit(eventName,payload){for(const listener of this._listeners.get(eventName)||[]){try{listener(payload);}catch(error){console.error(`Player event listener '${eventName}' failed`,error);}}}
  update(deltaSeconds,inputState,trackData=null){
    if(this._disposed||!Number.isFinite(deltaSeconds)||deltaSeconds<=0)return;
    const dt=Math.min(deltaSeconds,PLAYER_TUNING.MAX_DELTA);
    if(this.isLocal){const input=this.controlsEnabled&&inputState?inputState:NO_INPUT;this.controller.update(dt,input,trackData,(name,payload)=>this._emit(name,payload));}
    else this.controller.updateRemote(dt);
    this._walkTime+=dt*Math.max(0,this.controller.speed)*.65;
    const moving=this.controller.speed>0.5&&this.controller.grounded;
    for(const limb of this._limbs){const swing=moving?Math.sin(this._walkTime+limb.phase)*.22:0;limb.mesh.position.y=limb.baseY+swing;}
    if(!this.controller.grounded){this.mesh.rotation.z=Math.sin(this.controller.yaw)*.02;}
    else this.mesh.rotation.z=0;
    this._syncMesh();
  }
  getState(){return this.controller.getState(this.peerId);}
  applyRemoteState(state){if(this.isLocal||!state?.position)return;this.controller.setRemoteTarget(state);if(!this.controller._remoteTarget)return;
    if(!this._hasRemoteSnapshot){const t=this.controller._remoteTarget;this.controller.position.x=t.x;this.controller.position.y=t.y;this.controller.position.z=t.z;this.controller.yaw=t.yaw;this.controller.speed=t.speed;this._hasRemoteSnapshot=true;this._syncMesh();}
  }
  setControlsEnabled(enabled){this.controlsEnabled=!!enabled;}
  teleportTo(transform){const p=transform?.position,yaw=transform?(transform.yaw??transform.rotation??0):0;if(!p||![p.x,p.y,p.z,yaw].every(Number.isFinite)){console.warn("Player.teleportTo: invalid transform",transform);return;}this.controller.reset(p,yaw);this._syncMesh();}
  grantBoost(amount=GAME_CONFIG.BOOST_PICKUP_AMOUNT){this.controller.grantBoost(amount);this._emit("boost-changed",this.getState());}
  grantShield(durationSeconds=GAME_CONFIG.SHIELD_DURATION){this.controller.grantShield(durationSeconds);this._emit("shield-changed",this.getState());}
  setRaceProgress(lastCheckpointIndex,progress){if(Number.isInteger(lastCheckpointIndex))this.controller.lastCheckpointIndex=lastCheckpointIndex;if(Number.isFinite(progress))this.controller.progress=Math.max(this.controller.progress,progress);}
  dispose(){if(this._disposed)return;this._disposed=true;if(this.mesh.parent)this.mesh.parent.remove(this.mesh);this._clearCharacter();this._listeners.clear();}
}
