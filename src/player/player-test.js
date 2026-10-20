// TEST-ONLY harness: sample ground, obstacles, pickups, camera and HUD.
// The production track is owned by Person 1; production renderer/bootstrap by Person 4.
import * as THREE from "three";
import { Player } from "./Player.js";
import { KeyboardInput, PlayerController } from "./PlayerController.js";
import { GAME_CONFIG } from "./test-only/config.mock.js";

const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x9ad7ff);scene.fog=new THREE.Fog(0x9ad7ff,90,350);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,1000);camera.position.set(0,5,10);
scene.add(new THREE.HemisphereLight(0xffffff,0x557755,1));const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(15,30,10);sun.castShadow=true;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(1000,1000),new THREE.MeshStandardMaterial({color:0x6fbf73}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);scene.add(new THREE.GridHelper(1000,200,0x336633,0x4d9a55));
const postGeo=new THREE.BoxGeometry(.35,2.5,.35),postMat=new THREE.MeshStandardMaterial({color:0xfacc15});for(let i=0;i<25;i++){for(const x of [-5.5,5.5]){const m=new THREE.Mesh(postGeo,postMat);m.position.set(x,1.25,-i*12);scene.add(m);}}
function addBox(color,position,size){const m=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,flatShading:true}));m.position.set(position.x,position.y,position.z);m.castShadow=true;scene.add(m);return m;}
// Test-only obstacle boxes use the exact P1 contract shape: {id,kind,min,max,active}.
const obstacleBounds=[
 {id:"test-debris-1",kind:"debris",min:{x:-1.1,y:0,z:-24.5},max:{x:1.1,y:1.2,z:-22.5},active:true},
 {id:"test-barricade-1",kind:"barricade",min:{x:2.6,y:0,z:-42.5},max:{x:4.2,y:2.2,z:-40.5},active:true}
];
addBox(0xef4444,{x:0,y:.6,z:-23.5},[2.2,1.2,2]);addBox(0xf97316,{x:3.4,y:1.1,z:-41.5},[1.6,2.2,2]);
const pickups=[
 {id:"test-boost-1",type:"boost",position:{x:-2.7,y:.8,z:-12},active:true},
 {id:"test-shield-1",type:"shield",position:{x:2.7,y:.8,z:-32},active:true}
];
const pickupMeshes=new Map();for(const p of pickups){const m=addBox(p.type==="boost"?0x22d3ee:0xa78bfa,p.position,[.7,.7,.7]);pickupMeshes.set(p.id,m);}
const mockTrack={getObstacleBounds:()=>obstacleBounds,getPickupSpawns:()=>pickups,setPickupActive(id,active){const p=pickups.find(x=>x.id===id);if(p)p.active=active;const m=pickupMeshes.get(id);if(m)m.visible=active;},getProgress(position){return Math.max(0,-position.z/100);},getRespawnTransform(){return {position:{x:0,y:0,z:0},yaw:0};}};
const START={position:{x:0,y:0,z:0},yaw:0},keyboard=new KeyboardInput();
function ensureElement(id,tag="pre"){
  let el=document.getElementById(id);
  if(!el){
    el=document.createElement(tag);el.id=id;
    const panel=document.getElementById("panel");
    (panel||document.body).appendChild(el);
    console.warn(`NM Run test harness: missing #${id}; recreated it.`);
  }
  return el;
}
const characterSelect=ensureElement("character-select","select");
if(!characterSelect.options.length){for(const name of ["Tanishi","Yash","Anjali","Ritam"]){const option=document.createElement("option");option.textContent=name;option.value=name;characterSelect.appendChild(option);}}
const player=new Player({peerId:"local-test",name:"Tanishi",isLocal:true});scene.add(player.mesh);player.teleportTo(START);
characterSelect.addEventListener("change",()=>{player.setCharacter(characterSelect.value);scene.add(player.mesh);});
let jumpRequested=false;const jumpButton=document.getElementById("btn-jump");
const requestJump=()=>{jumpRequested=true;jumpButton.blur();};jumpButton.addEventListener("click",requestJump);
jumpButton.addEventListener("pointerdown",e=>{e.preventDefault();requestJump();});
const remote=new Player({peerId:"remote-test",name:"REMOTE (DISPLAY ONLY)",color:0xf59e0b,isLocal:false});scene.add(remote.mesh);remote.applyRemoteState({position:{x:4,y:0,z:-8},rotation:0,speed:0});
const status=ensureElement("status"),state=ensureElement("state"),controlsButton=ensureElement("btn-controls","button");let controlsOn=true;
if(!controlsButton.textContent.trim())controlsButton.textContent="Controls: ON";
controlsButton.addEventListener("click",()=>{controlsOn=!controlsOn;player.setControlsEnabled(controlsOn);controlsButton.textContent=`Controls: ${controlsOn?"ON":"OFF"}`;controlsButton.blur();});
document.getElementById("btn-reset").addEventListener("click",()=>{player.teleportTo(START);controlsButton.blur();});
document.getElementById("btn-boost").addEventListener("click",()=>{player.grantBoost(35);});document.getElementById("btn-shield").addEventListener("click",()=>{player.grantShield(8);});
document.getElementById("btn-tests").addEventListener("click",()=>{
 const out=document.getElementById("test-results"); const results=[];
 const check=(name,condition,detail="")=>results.push({name,ok:!!condition,detail});
 const c=new PlayerController();
 c.update(.05,{forward:true},null); check("Forward acceleration",c.speed>0,`speed=${c.speed.toFixed(2)}`);
 const jumpEvents=[]; c.reset(); c.update(.016,{jump:true},null,(n)=>jumpEvents.push(n)); check("Jump impulse + grounded state",!c.grounded&&c.verticalVelocity>0&&jumpEvents.includes("jump")); const jumpStartY=c.position.y; c.update(.1,{jump:false},null); check("Jump visibly raises player",c.position.y>jumpStartY&&c.position.y>0,`y=${c.position.y.toFixed(2)}`); for(let i=0;i<40;i++)c.update(.05,{jump:false},null); check("Jump lands and can be repeated",c.grounded&&c.position.y===0); c.update(.016,{jump:true},null); check("Second jump works after landing",!c.grounded&&c.verticalVelocity>0);
 c.reset(); c.update(.016,{dodge:true,left:true},null); check("Dodge starts",c.dodgeRemaining>0&&c.dodgeCooldown>0); const remaining=c.dodgeCooldown; c.update(.016,{dodge:true,left:true},null); check("Held dodge does not retrigger",c.dodgeCooldown<remaining&&c.dodgeRemaining>0); for(let i=0;i<16;i++) c.update(.1,{dodge:false},null); c.update(.016,{dodge:true},null); check("Dodge can be used after cooldown",c.dodgeCooldown>0);
 c.reset(); c.boost=60; c.update(.5,{boost:true,forward:true},null); check("Boost drains meter and activates",c.boosting&&c.boost<60,`boost=${c.boost.toFixed(1)}`);
 c.reset(); c.speed=10; const debris={id:"unit-debris",kind:"debris",min:{x:-1,y:0,z:-1},max:{x:1,y:2,z:1},active:true}; const track={getObstacleBounds:()=>[debris]}; c.update(.016,{},track); check("Obstacle hit slows player",c.slowdownRemaining>0&&c.speed<=GAME_CONFIG.BASE_SPEED*GAME_CONFIG.OBSTACLE_SLOWDOWN_FACTOR); check("Debris damages endurance",c.endurance===GAME_CONFIG.ENDURANCE_MAX-GAME_CONFIG.ENDURANCE_DEBRIS_DAMAGE,`endurance=${c.endurance}`);
 c.reset(); c.speed=10; c.grantShield(8); const events=[]; c.update(.016,{},track,(n)=>events.push(n)); check("Shield absorbs hit",!c.shieldActive&&c.endurance===100&&events.includes("shield-absorbed"));
 c.reset(); c.endurance=25; c.regenDelay=0; c.update(.1,{},null); check("Endurance regenerates",c.endurance>25,`endurance=${c.endurance.toFixed(1)}`);
 c.reset(); c.grantBoost(35); check("Boost grant is capped",c.boost===65,`boost=${c.boost}`); c.grantShield(8); check("Shield grant activates",c.shieldActive);
 c.reset(); c.endurance=GAME_CONFIG.ENDURANCE_DEBRIS_DAMAGE; c.update(.016,{},track); check("Zero endurance triggers recovery",c.stumbleRemaining>0&&c.speed>=0,`stumble=${c.stumbleRemaining.toFixed(2)}`);
 c.reset(); const pickup={id:"unit-boost",type:"boost",position:{x:0,y:0,z:0},active:true}; const pickupTrack={getPickupSpawns:()=>[pickup],setPickupActive:(id,active)=>{pickup.active=active;}}; c.boost=0; c.update(.016,{},pickupTrack); check("Pickup grants boost and deactivates",c.boost===GAME_CONFIG.BOOST_PICKUP_AMOUNT&&!pickup.active,`boost=${c.boost}`);
 c.reset(); c.setRemoteTarget({position:{x:10,y:0,z:-10},rotation:1,speed:5}); c.updateRemote(.016); check("Remote state interpolates",c.position.x>0&&c.position.x<10,`x=${c.position.x.toFixed(2)}`);
 const state=c.getState("test-peer"); check("Snapshot schema",state.peerId==="test-peer"&&state.position&&Number.isFinite(state.rotation)&&Number.isFinite(state.progress));
 document.title=results.every(r=>r.ok)?"NM Run P2 Checks PASS":"NM Run P2 Checks FAIL";
 out.textContent=results.map(r=>`${r.ok?"PASS":"FAIL"}  ${r.name}${r.detail?" — "+r.detail:""}`).join("\n"); out.style.color=results.every(r=>r.ok)?"#86efac":"#fca5a5";
});
const eventNames=["jump","land","dodge","damage","obstacle-hit","shield-absorbed","stumble","pickup","respawn"];
let lastEvent="No gameplay events yet";for(const name of eventNames)player.on(name,data=>{lastEvent=`${name}: ${data?.kind||data?.type||data?.obstacleId||""}`;});
window.addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
const desired=new THREE.Vector3(),look=new THREE.Vector3();function updateCamera(dt){const p=player.position,yaw=player.yaw;desired.set(p.x+Math.sin(yaw)*8,p.y+4.5,p.z+Math.cos(yaw)*8);camera.position.lerp(desired,1-Math.exp(-5*dt));look.set(p.x-Math.sin(yaw)*3,p.y+1,p.z-Math.cos(yaw)*3);camera.lookAt(look);}
const isAutoTest=new URLSearchParams(location.search).has("autotest");
let last=performance.now(),fps=60,uiTimer=0;
function frame(now){if(!isAutoTest)requestAnimationFrame(frame);const raw=(now-last)/1000;last=now;if(!(raw>0))return;const dt=Math.min(raw,.1);const physicalInput=keyboard.read();const input={...physicalInput,jump:physicalInput.jump||jumpRequested};jumpRequested=false;player.update(dt,input,mockTrack);remote.update(dt,input,null);updateCamera(dt);sun.position.set(player.position.x+15,30,player.position.z+10);sun.target.position.set(player.position.x,0,player.position.z);fps=fps*.9+(1/raw)*.1;
 for(const [id,m] of pickupMeshes){if(m.visible)m.rotation.y+=dt*1.5;}
 renderer.render(scene,camera);uiTimer+=dt;if(uiTimer>.1){uiTimer=0;const s=player.getState();if(status)status.textContent=`FPS: ${fps.toFixed(0)}\nSpeed: ${s.speed.toFixed(1)} / ${s.boosting?"BOOST":"normal"}\nEndurance: ${s.endurance.toFixed(0)} / 100\nBoost: ${s.boost.toFixed(0)} / 100\nGrounded: ${player.controller.grounded}\nDodge cooldown: ${player.controller.dodgeCooldown.toFixed(1)}s\nShield: ${s.shieldActive?`ACTIVE (${player.controller.shieldRemaining.toFixed(1)}s)`:"off"}\nSlowdown: ${player.controller.slowdownRemaining.toFixed(1)}s\nStumble: ${player.controller.stumbleRemaining.toFixed(1)}s\nProgress (test estimate): ${s.progress.toFixed(2)}\nLast event: ${lastEvent}`;if(state)state.textContent="getState():\n"+JSON.stringify(s,null,1);}}
if(!isAutoTest)requestAnimationFrame(frame);
window.addEventListener("beforeunload",()=>{keyboard.dispose();player.dispose();remote.dispose();renderer.dispose();});

if (isAutoTest) document.getElementById("btn-tests").click();
