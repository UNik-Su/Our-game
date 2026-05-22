import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// GAME CONFIGURATION & GLOBALS
// ==========================================
const CONFIG = {
    customModelUrl: 'us_marine_-_vietnam_1960s_-_free_download.glb',
    modelScale: 1.1,
    modelRotationY: Math.PI 
};

const activeMixers = [];
const keys = {}; // FIXED: Added missing input tracking definition
let yaw = 0, pitch = 0;

const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
if (isTouchDevice) { 
    const editBtn = document.getElementById('btn-edit-hud');
    if (editBtn) editBtn.style.display = 'block'; 
}

let globalSens = parseFloat(localStorage.getItem('voxSens')) || 1.0;
let lifetimeKills = parseInt(localStorage.getItem('voxKills')) || 0;
let playerName = localStorage.getItem('voxName') || '';
let useGyro = false;

document.getElementById('sens-slider').value = globalSens;
document.getElementById('sens-val').innerText = globalSens.toFixed(1);
document.getElementById('lifetime-kills').innerText = lifetimeKills;
document.getElementById('player-profile-name').value = playerName;

document.getElementById('sens-slider').addEventListener('input', (e) => { 
    globalSens = parseFloat(e.target.value); 
    document.getElementById('sens-val').innerText = globalSens.toFixed(1); 
    localStorage.setItem('voxSens', globalSens); 
});
document.getElementById('player-profile-name').addEventListener('input', (e) => { 
    playerName = e.target.value; 
    localStorage.setItem('voxName', playerName); 
});

function saveKills(amt) { 
    lifetimeKills += amt; 
    localStorage.setItem('voxKills', lifetimeKills); 
    document.getElementById('lifetime-kills').innerText = lifetimeKills; 
}

// ==========================================
// FIXED FULLSCREEN HARDWARE INTERFACE
// ==========================================
function toggleFullscreen() {
    const doc = window.document.documentElement;
    const isFull = document.fullscreenElement || 
                   document.webkitFullscreenElement || 
                   document.mozFullScreenElement || 
                   document.msFullscreenElement;
    
    if (!isFull) {
        const req = doc.requestFullscreen || 
                    doc.webkitRequestFullscreen || 
                    doc.mozRequestFullScreen || 
                    doc.msRequestFullscreen;
        if (req) {
            req.call(doc).catch(() => { window.scrollTo(0, 1); });
        } else {
            window.scrollTo(0, 1);
            alert("🔒 iOS Safari Note: To play in full-screen on iPhone, tap the browser's 'Share' button and choose 'Add to Home Screen'!");
        }
    } else {
        const exit = document.exitFullscreen || 
                     document.webkitExitFullscreen || 
                     document.mozCancelFullScreen || 
                     document.msExitFullscreen;
        if (exit) exit.call(document);
    }
}

const fsBtn = document.getElementById('btn-fullscreen');
if (fsBtn) {
    fsBtn.addEventListener('click', toggleFullscreen);
    fsBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleFullscreen();
    }, { passive: false });
}

// ==========================================
// EDITABLE HUD PRESETS
// ==========================================
const hudBtns = document.querySelectorAll('.m-btn');
hudBtns.forEach(btn => { 
    const savedPos = localStorage.getItem('voxHud_' + btn.id); 
    if(savedPos) { 
        const p = JSON.parse(savedPos); 
        btn.style.left = p.left; btn.style.top = p.top; 
        btn.style.right = 'auto'; btn.style.bottom = 'auto'; 
    } 
});

let isEditingHud = false, dragEl = null, dOffsetX = 0, dOffsetY = 0;
document.getElementById('btn-edit-hud').onclick = () => { 
    isEditingHud = true; 
    document.getElementById('start-screen').style.display = 'none'; 
    document.getElementById('touch-controls').style.display = 'block'; 
    document.getElementById('hud-edit-overlay').style.display = 'block'; 
    document.getElementById('touch-controls').classList.add('hud-editable'); 
};
document.getElementById('btn-save-hud').onclick = () => { 
    isEditingHud = false; 
    document.getElementById('hud-edit-overlay').style.display = 'none'; 
    document.getElementById('touch-controls').classList.remove('hud-editable'); 
    document.getElementById('touch-controls').style.display = 'none'; 
    document.getElementById('start-screen').style.display = 'flex'; 
    hudBtns.forEach(btn => { 
        localStorage.setItem('voxHud_' + btn.id, JSON.stringify({ left: btn.style.left, top: btn.style.top })); 
    }); 
};

document.addEventListener('touchstart', e => { 
    if(!isEditingHud) return; 
    const t = e.target; 
    if(t.classList.contains('m-btn')) { 
        dragEl = t; 
        const rect = dragEl.getBoundingClientRect(); 
        dOffsetX = e.touches[0].clientX - rect.left; 
        dOffsetY = e.touches[0].clientY - rect.top; 
        dragEl.style.left = rect.left + 'px'; 
        dragEl.style.top = rect.top + 'px'; 
        dragEl.style.right = 'auto'; dragEl.style.bottom = 'auto'; 
    } 
}, {passive:false});
document.addEventListener('touchmove', e => { 
    if(!isEditingHud || !dragEl) return; 
    e.preventDefault(); 
    dragEl.style.left = (e.touches[0].clientX - dOffsetX) + 'px'; 
    dragEl.style.top = (e.touches[0].clientY - dOffsetY) + 'px'; 
}, {passive:false});
document.addEventListener('touchend', () => { dragEl = null; });

// ==========================================
// AUDIO LOGIC
// ==========================================
let audioCtx;
class Sfx {
    static init() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); }
    static playTone(f, t, d, v=0.1) { if(!audioCtx) return; const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = t; o.frequency.value = f; g.gain.setValueAtTime(v, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + d); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + d); }
    static shoot(wpn) { if(!audioCtx) return; const t = audioCtx.currentTime; const bufSize = audioCtx.sampleRate * 0.4, buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1; const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = (wpn === 'sniper' || wpn === 'm24') ? 'lowpass' : 'bandpass'; filter.frequency.value = (wpn === 'sniper' || wpn === 'm24') ? 900 : (wpn==='shotgun' ? 1400 : 2200); const noiseGain = audioCtx.createGain(); noiseGain.gain.setValueAtTime(0.7, t); noiseGain.gain.exponentialRampToValueAtTime(0.001, t + ((wpn==='sniper'||wpn==='m24')?0.4:0.18)); noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(audioCtx.destination); noise.start(t); const osc = audioCtx.createOscillator(), oscGain = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime((wpn==='sniper'||wpn==='m24')?130:180, t); osc.frequency.exponentialRampToValueAtTime(35, t + 0.12); oscGain.gain.setValueAtTime(0.6, t); oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22); osc.connect(oscGain); oscGain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.22); }
    static explode() { if(!audioCtx) return; const t = audioCtx.currentTime; const bufSize = audioCtx.sampleRate * 1.5, buffer = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate), data = buffer.getChannelData(0); for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1; const noise = audioCtx.createBufferSource(); noise.buffer = buffer; const filter = audioCtx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.setValueAtTime(800, t); filter.frequency.exponentialRampToValueAtTime(10, t + 1.0); const gain = audioCtx.createGain(); gain.gain.setValueAtTime(1.0, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0); noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination); noise.start(t); const osc = audioCtx.createOscillator(), oGain = audioCtx.createGain(); osc.type = 'sine'; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(20, t + 0.5); oGain.gain.setValueAtTime(1.0, t); oGain.gain.exponentialRampToValueAtTime(0.01, t + 0.8); osc.connect(oGain); oGain.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.8); }
    static hit() { this.playTone(950, 'square', 0.08, 0.2); }
    static coin() { this.playTone(1300, 'sine', 0.1, 0.1); setTimeout(() => this.playTone(1700, 'sine', 0.18, 0.12), 80); }
    static jump() { this.playTone(180, 'triangle', 0.15, 0.15); }
    static hurt() { this.playTone(90, 'sawtooth', 0.25, 0.4); }
}

// ==========================================
// GAME STATE MANAGEMENT
// ==========================================
const state = { mode: 'none', isPlaying: false, isAiming: false, isSprinting: false, isCrouching: false, inShop: false, coins: 0, score: 0, hp: 100, nextFireTime: 0, ammo: 12, grenades: 3, matchDeaths: 0, isFiring: false, isChargingGrenade: false, grenadeCharge: 0, team: -1, is1v3: false };
const WIN_TARGET = 20;

const weapons = {
    pistol: { id: 'pistol', name: 'M1911 Tactical', dmg: 35, fireRate: 350, maxAmmo: 12, cost: 0, type: 'semi', spread: 0.015, zoom: 55, aimSens: 0.6 },
    smg: { id: 'smg', name: 'Vector SMG', dmg: 18, fireRate: 75, maxAmmo: 30, cost: 120, type: 'auto', spread: 0.045, zoom: 60, aimSens: 0.65 },
    shotgun: { id: 'shotgun', name: 'Trench Gun', dmg: 14, fireRate: 750, maxAmmo: 6, cost: 280, type: 'spread', pellets: 8, spread: 0.11, zoom: 65, aimSens: 0.7 },
    ar: { id: 'ar', name: 'M4A1 Carbine', dmg: 28, fireRate: 130, maxAmmo: 25, cost: 450, type: 'auto', spread: 0.025, zoom: 45, aimSens: 0.5 },
    ak47: { id: 'ak47', name: 'AK-47 Assault', dmg: 34, fireRate: 105, maxAmmo: 30, cost: 600, type: 'auto', spread: 0.035, zoom: 50, aimSens: 0.55 },
    m24: { id: 'm24', name: 'M24 Sniper', dmg: 90, fireRate: 900, maxAmmo: 5, cost: 750, type: 'semi', spread: 0.0, zoom: 20, aimSens: 0.2 },
    sniper: { id: 'sniper', name: 'AWP Sniper', dmg: 100, fireRate: 1400, maxAmmo: 5, cost: 850, type: 'semi', spread: 0.0, zoom: 15, aimSens: 0.15 },
    ultimate: { id: 'ultimate', name: 'DEATH MACHINE', dmg: 14, fireRate: 900, maxAmmo: 300, cost: 9999, type: 'auto', spread: 0.085, zoom: 50, aimSens: 0.4 } 
};
let currentWeapon = weapons.pistol;
let inventory = ['pistol'];

// ==========================================
// SCENE SETUP
// ==========================================
const mapSize = 160;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x87CEFA); scene.fog = new THREE.FogExp2(0x87CEFA, 0.008); 
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
document.getElementById('game-container').appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const sunLight = new THREE.DirectionalLight(0xfff5b6, 1.5); sunLight.position.set(60, 110, 40); sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 1024; sunLight.shadow.mapSize.height = 1024; sunLight.shadow.bias = -0.0005; scene.add(sunLight);

const cube = new THREE.BoxGeometry(1,1,1);
const theSun = new THREE.Mesh(new THREE.BoxGeometry(15,15,15), new THREE.MeshBasicMaterial({color: 0xFFFFAA})); theSun.position.set(150, 200, 100); scene.add(theSun);

// ==========================================
// MAP & MAP COLLISIONS
// ==========================================
const colliders = [], raycastTargets = [], jumpPads = [], explosiveBarrels = [];
function registerAABB(mesh, sX, sY, sZ) { colliders.push({ minX: mesh.position.x - sX/2, maxX: mesh.position.x + sX/2, minY: mesh.position.y - sY/2, maxY: mesh.position.y + sY/2, minZ: mesh.position.z - sZ/2, maxZ: mesh.position.z + sZ/2 }); }
function checkCollisions(tX, tY, tZ, thick = 0.55) { if (Math.abs(tX) > mapSize/2 - 2.5 || Math.abs(tZ) > mapSize/2 - 2.5) return true; for (let c of colliders) { if (tX+thick > c.minX && tX-thick < c.maxX && tZ+thick > c.minZ && tZ-thick < c.maxZ) { if (tY < c.maxY && tY + 1.2 > c.minY) return true; } } return false; }
function getFloorHeight(tX, tY, tZ, thick = 0.4) { let highest = 0; for (let c of colliders) { if (tX+thick > c.minX && tX-thick < c.maxX && tZ+thick > c.minZ && tZ-thick < c.maxZ) { if (c.maxY <= tY + 0.35 && c.maxY > highest) highest = c.maxY; } } return highest; }

const floor = new THREE.Mesh(new THREE.PlaneGeometry(mapSize, mapSize), new THREE.MeshStandardMaterial({ color: 0x4CAF50, roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); raycastTargets.push(floor);

function addObj(c, px, py, pz, sx, sy, sz, type="wall") {
    const m = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; scene.add(m); 
    if(type !== "none") raycastTargets.push(m);
    if(type==="wall") registerAABB(m, sx, sy, sz); else if(type==="pad") jumpPads.push(m); else if(type==="barrel") { m.hp = 40; explosiveBarrels.push(m); registerAABB(m,sx,sy,sz); }
    return m;
}

for(let i=0; i<85; i++) {
    const rx = (Math.random()-0.5)*(mapSize-15), rz = (Math.random()-0.5)*(mapSize-15); const d = Math.random();
    if(d < 0.15) addObj(0x8D6E63, rx, 2.0, rz, 4, 4, 4); 
    else if (d < 0.25) addObj(0x8D6E63, rx, 1.0, rz, 2, 2, 2); 
    else if (d < 0.40) { addObj(0x5D4037, rx, 3.0, rz, 1.2, 6, 1.2); const leaves = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({ color: 0x2E7D32 })); leaves.scale.set(5.5, 5.5, 5.5); leaves.position.set(rx, 7.0, rz); leaves.castShadow = true; scene.add(leaves); raycastTargets.push(leaves); } 
    else if (d < 0.55) addObj(0x9E9E9E, rx, 2.0, rz, 10, 4, 1.5); else if (d < 0.65) addObj(0x9E9E9E, rx, 2.0, rz, 1.5, 4, 10); 
    else if (d < 0.75) { const colors = [0x1976D2, 0xD32F2F, 0x388E3C]; addObj(colors[Math.floor(Math.random()*colors.length)], rx, 3.5, rz, 5, 7, 12); } 
    else if (d < 0.80) { addObj(0x616161, rx-2, 3, rz-2, 0.5, 6, 0.5); addObj(0x616161, rx+2, 3, rz-2, 0.5, 6, 0.5); addObj(0x616161, rx-2, 3, rz+2, 0.5, 6, 0.5); addObj(0x616161, rx+2, 3, rz+2, 0.5, 6, 0.5); addObj(0x424242, rx, 6.25, rz, 5.5, 0.5, 5.5); } 
    else if (d < 0.88) { addObj(0x757575, rx, 0.5, rz, 4, 1, 4); addObj(0x757575, rx+1, 1.5, rz, 2, 1, 4); addObj(0x757575, rx+1.5, 2.5, rz, 1, 1, 4); } 
    else if (d < 0.94) addObj(0x00E5FF, rx, 0.15, rz, 3.0, 0.3, 3.0, "pad");
    else addObj(0xF44336, rx, 1.1, rz, 1.6, 2.2, 1.6, "barrel");
}

// ==========================================
// GLTF INTERFACE AND LOADERS
// ==========================================
function createWeaponMesh(type) {
    const group = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({color: 0x222222}), grey = new THREE.MeshStandardMaterial({color: 0x555555}), wood = new THREE.MeshStandardMaterial({color: 0x5D4037});
    const addP = (mat, sx,sy,sz, px,py,pz) => { const m = new THREE.Mesh(cube, mat); m.scale.set(sx,sy,sz); m.position.set(px,py,pz); m.castShadow=true; group.add(m); return m; };
    if(type==='pistol') { addP(grey, 0.12,0.18,0.5, 0,0.1,0); addP(dark, 0.12,0.25,0.15, 0,-0.1,0.15); } 
    else if(type==='smg') { addP(grey, 0.15,0.25,0.7, 0,0.1,0); addP(dark, 0.15,0.3,0.15, 0,-0.15,0.1); addP(dark, 0.1,0.35,0.15, 0,-0.15,-0.15); } 
    else if(type==='ar') { addP(grey, 0.12,0.2,1.2, 0,0.1,-0.2); addP(dark, 0.15,0.3,0.15, 0,-0.2, 0.2); addP(dark, 0.1,0.4,0.15, 0,-0.15, 0); addP(dark, 0.12,0.25,0.5, 0,0.1, 0.5); } 
    else if(type==='ak47') { addP(grey, 0.12,0.15,1.1, 0,0.1,-0.2); addP(wood, 0.12,0.3,0.15, 0,-0.2,0.3); addP(wood, 0.15,0.2,0.5, 0,0.05,0.4); addP(dark, 0.08,0.35,0.15, 0,-0.1,0.05); } 
    else if(type==='shotgun') { addP(grey, 0.15,0.2,1.2, 0,0.1,-0.2); addP(wood, 0.15,0.25,0.6, 0,0.05,0.4); addP(wood, 0.18,0.2,0.4, 0,0.05,-0.4); } 
    else if(type==='m24') { addP(dark, 0.1,0.15,1.6, 0,0.1,-0.3); addP(wood, 0.12,0.25,0.15, 0,-0.1,0.3); addP(wood, 0.12,0.2,0.8, 0,0.05,0.5); addP(dark, 0.08,0.1,0.4, 0,0.25,0.1); }
    else if(type==='sniper') { addP(grey, 0.1,0.15,1.8, 0,0.1,-0.4); addP(dark, 0.12,0.25,0.15, 0,-0.1,0.3); addP(dark, 0.12,0.2,0.6, 0,0.1,0.6); addP(dark, 0.08,0.1,0.4, 0,0.25,0.1); }
    else if(type==='ultimate') { addP(grey, 0.3, 0.3, 1.2, 0, 0, -0.3); addP(dark, 0.35, 0.4, 0.6, 0, 0.05, 0.3); addP(wood, 0.1, 0.4, 0.15, 0, -0.2, 0.5); addP(wood, 0.4, 0.1, 0.15, 0, 0.3, 0.2); }
    return group;
}

function createRig(hexColor, isEnemy = false) {
    const rig = { wWeight: 0, animations: {}, currentActionName: 'idle', mixer: null };
    const root = new THREE.Group(); rig.root = root;
    const mat = new THREE.MeshStandardMaterial({ color: hexColor, transparent: true, opacity: 0.001 }); rig.mat = mat;
    
    const pelvis = new THREE.Group(); pelvis.position.y = 0.8; root.add(pelvis); rig.pelvis = pelvis;
    const torso = new THREE.Group(); torso.position.y = 0.2; pelvis.add(torso); rig.torso = torso;
    
    const bodyMesh = new THREE.Mesh(cube, mat); bodyMesh.scale.set(isEnemy ? 1.25 : 1.0, isEnemy ? 1.30 : 1.2, 0.55); bodyMesh.position.y = 0.6; torso.add(bodyMesh); rig.bMesh = bodyMesh;
    const head = new THREE.Group(); head.position.y = 1.2; torso.add(head); rig.head = head;
    const headMesh = new THREE.Mesh(cube, mat); headMesh.scale.set(0.75, 0.75, 0.75); headMesh.position.y = 0.37; head.add(headMesh); rig.hMesh = headMesh;

    const armR = new THREE.Group(); armR.position.set(0.55, 1.0, 0); torso.add(armR); rig.armR = armR;
    const armL = new THREE.Group(); armL.position.set(-0.55, 1.0, 0); torso.add(armL); rig.armL = armL;
    const legR = new THREE.Group(); legR.position.set(0.25, 0, 0); pelvis.add(legR); rig.legR = legR;
    const legL = new THREE.Group(); legL.position.set(-0.25, 0, 0); pelvis.add(legL); rig.legL = legL;

    const wpnHolder = new THREE.Group(); wpnHolder.position.set(0.2, -0.4, 0.4); torso.add(wpnHolder); rig.wpnHolder = wpnHolder;
    const flash = new THREE.PointLight(0xFFE066, 0, 6); flash.position.set(0, 0, -1.0); wpnHolder.add(flash); rig.flash = flash;

    const loader = new GLTFLoader();
    loader.load(CONFIG.customModelUrl, (gltf) => {
        const model = gltf.scene;
        model.scale.setScalar(CONFIG.modelScale);
        model.rotation.y = CONFIG.modelRotationY;
        model.position.y = -0.8; 
        model.traverse(child => { 
            if (child.isMesh) { 
                child.castShadow = true; 
                child.receiveShadow = true; 
                child.userData.rig = rig; 
                raycastTargets.push(child); 
            } 
        });
        root.add(model);
        if (gltf.animations && gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model); rig.mixer = mixer; activeMixers.push(mixer);
            gltf.animations.forEach(clip => {
                const name = clip.name.toLowerCase(); const action = mixer.clipAction(clip);
                if (name.includes('idle')) rig.animations.idle = action;
                else if (name.includes('run') || name.includes('sprint')) rig.animations.run = action;
                else if (name.includes('walk')) rig.animations.walk = action;
            });
            if (!rig.animations.idle) rig.animations.idle = mixer.clipAction(gltf.animations[0]);
            if (!rig.animations.walk && gltf.animations[1]) rig.animations.walk = mixer.clipAction(gltf.animations[1]);
            if (rig.animations.idle) rig.animations.idle.play();
        }
    });

    bodyMesh.userData.rig = rig; headMesh.userData.rig = rig;
    return rig;
}

function createNameTag(nameString) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.strokeStyle = 'black'; ctx.lineWidth = 4;
    ctx.strokeText(nameString, 128, 48); ctx.fillText(nameString, 128, 48);
    const tex = new THREE.CanvasTexture(canvas); const spriteMat = new THREE.SpriteMaterial({map: tex, depthTest: true}); const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4, 1.0, 1); sprite.position.y = 2.4; return sprite;
}

function fadeRigAnimation(grid, targetActionName) {
    if (!grid.animations || !grid.animations[targetActionName]) return; if (grid.currentActionName === targetActionName) return;
    const currentAction = grid.animations[grid.currentActionName]; const nextAction = grid.animations[targetActionName];
    grid.currentActionName = targetActionName; if (currentAction) currentAction.fadeOut(0.2); nextAction.reset().fadeIn(0.2).play();
}

function animateRig(rig, lVX, lVZ, isGnd, dt, aimPitch = 0) {
    const spd = Math.sqrt(lVX*lVX + lVZ*lVZ);
    if (rig.mixer) { if (!isGnd) { fadeRigAnimation(rig, 'idle'); } else if (spd > 0.1) { fadeRigAnimation(rig, state.isSprinting ? 'run' : 'walk'); } else { fadeRigAnimation(rig, 'idle'); } }
    const sec = performance.now() * 0.001; rig.wWeight = THREE.MathUtils.lerp(rig.wWeight, (spd>0.08 && isGnd)?1:0, dt*11);
    const t = sec*13.5; const br = Math.sin(sec*2.2)*0.014; const vB = Math.abs(Math.sin(t))*0.09*rig.wWeight;
    rig.pelvis.position.y = 0.8 + vB + (br*(1-rig.wWeight)); rig.torso.rotation.set((lVZ>0?0.07:0)*rig.wWeight + (aimPitch*0.4), 0, 0); rig.head.rotation.set(aimPitch, 0, 0);
}

const myChar = createRig(0x424242, false); scene.add(myChar.root);
const camPiv = new THREE.Object3D(); camPiv.position.set(0, 2.2, 0); myChar.root.add(camPiv); camera.position.set(1.4, 0.4, 4.2); camPiv.add(camera);

let myWpnMesh = null;
function equip(w) {
    currentWeapon = w; state.ammo = w.maxAmmo; document.getElementById('weapon-name').innerText = w.name; document.getElementById('ammo-val').innerText = state.ammo; document.getElementById('max-ammo-val').innerText = w.maxAmmo;
    if(myWpnMesh) myChar.wpnHolder.remove(myWpnMesh); myWpnMesh = createWeaponMesh(w.id); myChar.wpnHolder.add(myWpnMesh);
}
equip(weapons.pistol);

const gyroToggle = document.getElementById('gyro-toggle');
gyroToggle.addEventListener('click', async () => {
    if (gyroToggle.checked) {
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') { alert("Requires HTTPS context for orientation readings."); gyroToggle.checked = false; useGyro = false; return; }
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            try { const permission = await DeviceMotionEvent.requestPermission(); if (permission === 'granted') { useGyro = true; } else { gyroToggle.checked = false; useGyro = false; } } catch (err) { gyroToggle.checked = false; useGyro = false; }
        } else { useGyro = true; }
    } else { useGyro = false; }
});

window.addEventListener('devicemotion', (e) => {
    if (useGyro && state.isPlaying && e.rotationRate) {
        let rotX = e.rotationRate.alpha || 0; let rotY = e.rotationRate.beta || 0; const gyroSens = (state.isAiming ? currentWeapon.aimSens : 1.0) * globalSens * 0.00065; let orientation = window.orientation || 0;
        if (orientation === 90 || orientation === -90) { yaw -= rotX * gyroSens * (orientation === 90 ? 1 : -1); pitch = Math.max(-Math.PI/2.8, Math.min(Math.PI/2.8, pitch - rotY * gyroSens * (orientation === 90 ? 1 : -1))); }
        else { yaw -= rotX * gyroSens; pitch = Math.max(-Math.PI/2.8, Math.min(Math.PI/2.8, pitch - rotY * gyroSens)); }
    }
});

const activeGrenades = [], sparks = [], bulletShells = [], bulletTracers = [];
const trajMat = new THREE.LineDashedMaterial({ color: 0x00FF00, dashSize: 0.5, gapSize: 0.2, linewidth: 2 });
const trajGeo = new THREE.BufferGeometry(); const trajLine = new THREE.Line(trajGeo, trajMat); scene.add(trajLine); trajLine.visible = false;

function tossGrenade(startPos, velocity) { const g = new THREE.Mesh(cube, new THREE.MeshStandardMaterial({color: 0x1B5E20})); g.scale.set(0.3, 0.3, 0.3); g.position.copy(startPos); scene.add(g); activeGrenades.push({m: g, v: velocity, t: performance.now() + 2000}); }
function releaseGrenadeAction() { if(state.grenades <= 0 || !state.isPlaying || !state.isChargingGrenade) return; state.grenades--; document.getElementById('grenade-val').innerText = state.grenades; const start = myChar.root.position.clone().add(new THREE.Vector3(0,1.5,0)); const force = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(12 + state.grenadeCharge * 18).add(new THREE.Vector3(0, 4 + state.grenadeCharge * 8, 0)); tossGrenade(start, force); sendNetData({type: 'nade', px:start.x, py:start.y, pz:start.z, vx:force.x, vy:force.y, vz:force.z}); state.isChargingGrenade = false; state.grenadeCharge = 0; trajLine.visible = false; }
function spawnVFX(pos, col, amt=3, spd=10, size=0.04, dir=null) { const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1.0 }); for(let i=0; i<amt; i++) { const m = new THREE.Mesh(cube, mat); m.scale.set(size, size, size); m.position.copy(pos); scene.add(m); let vx, vy, vz; if (dir) { vx = dir.x * spd + (Math.random()-0.5) * spd * 0.5; vy = dir.y * spd + (Math.random()-0.5) * spd * 0.5; vz = dir.z * spd + (Math.random()-0.5) * spd * 0.5; } else { vx = (Math.random()-0.5)*spd; vy = Math.random()*(spd*0.5)+1; vz = (Math.random()-0.5)*spd; } sparks.push({ m: m, mat: mat, v: new THREE.Vector3(vx, vy, vz), l: 1.0, baseSize: size }); } }
function spawnTracer(startPos, endPos, colorHex = 0xFFD700) { const dist = startPos.distanceTo(endPos); const mid = startPos.clone().lerp(endPos, 0.5); const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, depthTest: true }); const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, dist), mat); mesh.position.copy(mid); mesh.lookAt(endPos); scene.add(mesh); bulletTracers.push({ mesh: mesh, mat: mat, life: 1.0 }); }
function spawnShell(pos, curYaw) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.08), new THREE.MeshStandardMaterial({color: 0xFFD700})); m.position.copy(pos); scene.add(m); const ejectDir = new THREE.Vector3(1, 0.8, -0.2).applyAxisAngle(new THREE.Vector3(0,1,0), curYaw + (Math.random()*0.4 - 0.2)); bulletShells.push({m, v: ejectDir.multiplyScalar(5 + Math.random()*3), life: 2.0}); }

let peer, myId, isHost = false, maxPlayers = 2; const PEER_PREFIX = "voxst-v3x-"; let hostConns = []; let clientConn = null; const ghostSquad = {}; const bots = [];

document.getElementById('btn-solo').onclick = () => { autoFullscreen(); Sfx.init(); state.mode = 'solo'; document.getElementById('start-screen').style.display = 'none'; if(isTouchDevice) document.getElementById('touch-controls').style.display = 'block'; document.getElementById('ui-layer').style.display = 'block'; state.isPlaying = true; for(let i=0; i<8; i++) spawnBot(); };
document.getElementById('btn-multi-menu').onclick = () => { document.getElementById('menu-main').style.display = 'none'; document.getElementById('menu-multi').style.display = 'flex'; };
document.getElementById('btn-back').onclick = () => { document.getElementById('menu-multi').style.display = 'none'; document.getElementById('menu-main').style.display = 'flex'; };
document.getElementById('btn-host-1v1').onclick = () => { maxPlayers = 2; state.is1v3 = false; initP2P(true); };
document.getElementById('btn-host-2v2').onclick = () => { maxPlayers = 4; state.is1v3 = false; initP2P(true); };
document.getElementById('btn-host-1v3').onclick = () => { maxPlayers = 4; state.is1v3 = true; initP2P(true); };
document.getElementById('btn-join').onclick = () => { initP2P(false); };

function generateRoomCode() { const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; let rawCode = ""; for(let i=0; i<6; i++) rawCode += charset.charAt(Math.floor(Math.random() * charset.length)); return rawCode; }
function initP2P(host) {
    if (typeof Peer === 'undefined') { alert("Network mesh failed to resolve global contexts."); return; }
    autoFullscreen(); Sfx.init(); state.mode = 'multi'; isHost = host; document.getElementById('start-screen').style.display = 'none'; document.getElementById('ui-layer').style.display = 'block'; if(isTouchDevice) document.getElementById('touch-controls').style.display = 'block'; state.isPlaying = true;
    myChar.root.position.set((Math.random()-0.5)*60, 15, (Math.random()-0.5)*60); const ri = document.getElementById('room-info'); ri.style.display = 'inline-block';
    const rawCode = host ? generateRoomCode() : String(document.getElementById('join-id').value).trim().toUpperCase(); const roomCode = PEER_PREFIX + rawCode;
    peer = host ? new Peer(roomCode) : new Peer();
    peer.on('open', (id) => { myId = id; if (isHost) { state.team = 0; ri.innerText = "[ROOM: " + rawCode + "] 1/" + maxPlayers; peer.on('connection', c => { hostConns.push(c); c.on('open', () => c.send({type: 'init', team: hostConns.length%2})); c.on('data', d => processNetData(d)); }); } else { ri.innerText = "CONNECTING..."; clientConn = peer.connect(roomCode); clientConn.on('open', () => ri.innerText = "[ROOM: " + rawCode + "]"); clientConn.on('data', d => processNetData(d)); } });
}
function sendNetData(data) { if (state.mode !== 'multi') return; if (isHost) { hostConns.forEach(hc => hc.send(data)); } else if (clientConn && clientConn.open) { clientConn.send(data); } }

function processNetData(d) {
    if(d.type === 'init') state.team = d.team;
    if(d.type === 'sync') {
        if(!ghostSquad[d.id]) { ghostSquad[d.id] = createRig(0xD32F2F, true); scene.add(ghostSquad[d.id].root); ghostSquad[d.id].wpnHolder.add(createWeaponMesh('ar')); }
        const g = ghostSquad[d.id]; g.root.position.set(d.x, d.y, d.z); g.root.rotation.y = d.yaw; animateRig(g, d.lvX, d.lvZ, d.gnd, d.dt, d.p);
    }
    if(d.type === 'shoot' && ghostSquad[d.id]) { Sfx.shoot(d.wpn); }
    if(d.type === 'hit' && d.targetId === myId) { applyDamage(d.dmg, new THREE.Vector3(d.ax, d.ay, d.az)); }
    if(d.type === 'kill') { registerKill(); }
    if(d.type === 'nade') { tossGrenade(new THREE.Vector3(d.px,d.py,d.pz), new THREE.Vector3(d.vx,d.vy,d.vz)); }
}

function spawnBot() { const b = createRig(0xC62828, true); b.root.position.set((Math.random()-0.5)*140, 15, (Math.random()-0.5)*140); b.hp = 100; b.nxtS = 0; scene.add(b.root); bots.push(b); b.wpnHolder.add(createWeaponMesh('ar')); b.root.add(createNameTag("BOT")); }
function killBot(bMatch) { if(!bMatch) return; scene.remove(bMatch.root); let idx = bots.indexOf(bMatch); if(idx > -1) bots.splice(idx, 1); registerKill(); if(state.mode === 'solo') setTimeout(spawnBot, 2000); }
function registerKill() { state.score++; state.coins+=50; document.getElementById('score-val').innerText=state.score; document.getElementById('coin-val').innerText=state.coins; saveKills(1); Sfx.coin(); if (state.mode === 'multi' && state.score >= WIN_TARGET) showMatchOverScreen(true); }

function showDamageIndicator(attackerPos) { if(!attackerPos) return; const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir); camDir.y = 0; const attDir = attackerPos.clone().sub(myChar.root.position); attDir.y = 0; const cross = camDir.clone().cross(attDir).y; const dot = camDir.dot(attDir.normalize()); const angle = Math.atan2(cross, dot) * (180 / Math.PI); document.getElementById('damage-indicator-container').style.transform = `translate(-50%, -50%) rotate(${-angle}deg)`; document.getElementById('dmg-arc').style.opacity = '1'; setTimeout(() => { document.getElementById('dmg-arc').style.opacity = '0'; }, 100); }
function showDeathScreen() { state.isPlaying = false; document.getElementById('ui-layer').style.display = 'none'; document.getElementById('touch-controls').style.display = 'none'; document.getElementById('death-screen').style.display = 'flex'; document.getElementById('death-kills').innerText = state.score; document.getElementById('death-coins').innerText = state.coins; }
function showMatchOverScreen(isVictory) { state.isPlaying = false; document.getElementById('ui-layer').style.display = 'none'; document.getElementById('touch-controls').style.display = 'none'; const moScreen = document.getElementById('match-over-screen'); moScreen.style.display = 'flex'; document.getElementById('match-over-title').innerText = isVictory ? "VICTORY" : "DEFEAT"; document.getElementById('mo-kills').innerText = state.score; }

document.getElementById('btn-leave-match').onclick = () => location.reload();
document.getElementById('btn-retry').onclick = () => { state.hp = 100; state.ammo = currentWeapon.maxAmmo; state.grenades = 3; document.getElementById('hp-val').innerText=100; document.getElementById('ammo-val').innerText=state.ammo; myChar.root.position.set((Math.random()-0.5)*60, 15, (Math.random()-0.5)*60); document.getElementById('death-screen').style.display = 'none'; document.getElementById('ui-layer').style.display = 'block'; document.getElementById('touch-controls').style.display = 'block'; state.isPlaying = true; };

function applyDamage(dmg, attackerPos = null) {
    if(!state.isPlaying) return; state.hp -= dmg; document.getElementById('hp-val').innerText = state.hp; Sfx.hurt(); if (attackerPos) showDamageIndicator(attackerPos);
    document.getElementById('damage-flash').style.opacity = 0.5; setTimeout(()=>document.getElementById('damage-flash').style.opacity=0, 100);
    if(state.hp <= 0) { if(state.mode === 'multi') { state.matchDeaths++; sendNetData({type: 'kill'}); } showDeathScreen(); }
}
function detonateBarrel(obj) { if(!explosiveBarrels.includes(obj)) return; scene.remove(obj); explosiveBarrels.splice(explosiveBarrels.indexOf(obj),1); spawnVFX(obj.position, 0xFF5722, 25); Sfx.explode(); if(myChar.root.position.distanceTo(obj.position)<10) applyDamage(60, obj.position); bots.forEach(b => { if(b.root.position.distanceTo(obj.position)<10) { b.hp = 0; killBot(b); } }); }

const ray = new THREE.Raycaster();
function fire() {
    if(state.ammo<=0 || performance.now()<state.nextFireTime) return;
    state.ammo--; document.getElementById('ammo-val').innerText=state.ammo; state.nextFireTime=performance.now()+(60000/currentWeapon.fireRate);
    myChar.flash.intensity=3; setTimeout(()=>myChar.flash.intensity=0, 40);
    const wpnWorldPos = new THREE.Vector3(); myChar.wpnHolder.getWorldPosition(wpnWorldPos);
    const muzzPos = wpnWorldPos.clone().add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(1.2));
    const camDir = camera.getWorldDirection(new THREE.Vector3()); ray.set(camera.getWorldPosition(new THREE.Vector3()), camDir);
    const centerHits = ray.intersectObjects(raycastTargets); const centralTarget = centerHits.length > 0 ? centerHits[0].point : ray.origin.clone().add(camDir.multiplyScalar(200));
    sendNetData({type: 'shoot', id: myId, wpn: currentWeapon.id, tx: centralTarget.x, ty: centralTarget.y, tz: centralTarget.z});
    myWpnMesh.position.z += 0.25; spawnVFX(muzzPos, 0xFFB300, 4, 20, 0.035, camDir); spawnShell(wpnWorldPos, yaw);
    const curSpread = state.isAiming ? currentWeapon.spread * 0.2 : currentWeapon.spread;
    ray.setFromCamera(new THREE.Vector2((Math.random()-0.5)*curSpread, (Math.random()-0.5)*curSpread), camera);
    const hits = ray.intersectObjects(raycastTargets);
    if(hits.length > 0) {
        const obj = hits[0].object, pnt = hits[0].point;
        const hitRig = obj.userData.grid || obj.userData.rig;
        if (hitRig) {
            const bMatch = bots.find(b => b === hitRig);
            if(bMatch) { bMatch.hp -= currentWeapon.dmg; Sfx.hit(); spawnVFX(pnt, 0xD32F2F, 3, 10, 0.05); if(bMatch.hp <= 0) killBot(bMatch); }
        } else if (explosiveBarrels.includes(obj)) detonateBarrel(obj);
    }
}

function toggleShop() { if(!state.isPlaying) return; state.inShop = !state.inShop; document.getElementById('shop-ui').style.display = state.inShop ? 'block' : 'none'; if(state.inShop) { const c = document.getElementById('shop-items-container'); c.innerHTML=''; Object.values(weapons).forEach(w => { if (w.id === 'ultimate') return; c.innerHTML += `<div class="shop-item"><div><b>${w.name}</b></div><button class="buy-btn" onclick="window.eq('${w.id}')">EQUIP</button></div>`; }); } }
document.getElementById('close-shop-btn').onclick = toggleShop; window.eq = (id) => { equip(weapons[id]); toggleShop(); };

let pVelY=0, pGnd=true, canDoubleJump=true;
function doJump() { if(pGnd) { pVelY = 14.5; pGnd = false; canDoubleJump = true; Sfx.jump(); } else if (canDoubleJump) { pVelY = 12.0; canDoubleJump = false; Sfx.jump(); } }

document.addEventListener('keydown', e => { keys[e.code]=true; if(e.code==='KeyR'){state.ammo=currentWeapon.maxAmmo; document.getElementById('ammo-val').innerText=state.ammo;} if(e.code==='KeyB')toggleShop(); if(e.code==='ShiftLeft' && pGnd) { state.isSprinting = true; } if(e.code==='Space' && !e.repeat) doJump(); });
document.addEventListener('keyup', e => { keys[e.code]=false; if(e.code==='ShiftLeft') state.isSprinting = false; });

let moveTouchId = null, lookTouchId = null; const jVec = new THREE.Vector2(0,0); let tOrg={x:0,y:0};
const mz = document.getElementById('move-zone'), lz = document.getElementById('look-zone'), kb = document.getElementById('joystick');
mz.addEventListener('touchstart', e => { e.preventDefault(); if(moveTouchId !== null) return; const t = e.changedTouches[0]; moveTouchId = t.identifier; tOrg={x:t.clientX, y:t.clientY}; }, {passive:false});
mz.addEventListener('touchmove', e => { e.preventDefault(); for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === moveTouchId) { let dx=e.changedTouches[i].clientX-tOrg.x, dy=e.changedTouches[i].clientY-tOrg.y; const d=Math.sqrt(dx*dx+dy*dy); if(d>40){dx=(dx/d)*40; dy=(dy/d)*40;} kb.style.transform=`translate(${dx}px, ${dy}px)`; jVec.set(dx/40, dy/40); } } }, {passive:false});
mz.addEventListener('touchend', (e) => { for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === moveTouchId) { moveTouchId = null; kb.style.transform=`translate(0,0)`; jVec.set(0,0); } } });

let lastT={x:0,y:0};
lz.addEventListener('touchstart', e => { e.preventDefault(); if(lookTouchId !== null) return; const t = e.changedTouches[0]; lookTouchId = t.identifier; lastT={x:t.clientX, y:t.clientY}; }, {passive:false});
lz.addEventListener('touchmove', e => { e.preventDefault(); const sens = state.isAiming ? currentWeapon.aimSens * globalSens : globalSens; for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === lookTouchId) { yaw-=(e.changedTouches[i].clientX-lastT.x)*0.0045*sens; pitch=Math.max(-Math.PI/2.8, Math.min(Math.PI/2.8, pitch-(e.changedTouches[i].clientY-lastT.y)*0.0045*sens)); lastT={x:e.changedTouches[i].clientX, y:e.changedTouches[i].clientY}; } } }, {passive:false});
lz.addEventListener('touchend', (e) => { for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === lookTouchId) { lookTouchId = null; } } });

document.getElementById('btn-fire').addEventListener('touchstart', e=>{ e.preventDefault(); state.isFiring = true; fire(); });
document.getElementById('btn-fire').addEventListener('touchend', e=>{ e.preventDefault(); state.isFiring = false; });
document.getElementById('btn-jump').addEventListener('touchstart', e=>{ e.preventDefault(); doJump(); });
document.getElementById('btn-reload').addEventListener('touchstart', e=>{ e.preventDefault(); state.ammo=currentWeapon.maxAmmo; document.getElementById('ammo-val').innerText=state.ammo; });
document.getElementById('btn-shop').addEventListener('touchstart', e=>{ e.preventDefault(); toggleShop(); });
document.getElementById('btn-aim').addEventListener('touchstart', e => { e.preventDefault(); state.isAiming = !state.isAiming; });

// ==========================================
// TICK RUNNER SYSTEM
// ==========================================
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate); const dt = Math.min(clock.getDelta(), 0.08);
    for (let i = activeMixers.length - 1; i >= 0; i--) { activeMixers[i].update(dt); }
    camera.fov = THREE.MathUtils.lerp(camera.fov, state.isAiming ? currentWeapon.zoom : 75, dt * 15); camera.updateProjectionMatrix();
    if(state.isPlaying && !state.inShop) {
        if(state.isFiring && currentWeapon.type === 'auto') fire();
        myChar.root.rotation.y = yaw; camPiv.rotation.x = pitch; let mX=0, mZ=0; if(moveTouchId !== null){mX=jVec.x; mZ=jVec.y;}
        const walkSpd = state.isSprinting ? 22.0 : 12.5; const vel = new THREE.Vector3(mX, 0, mZ).normalize().multiplyScalar(walkSpd * dt); vel.applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        if(!checkCollisions(myChar.root.position.x+vel.x, myChar.root.position.y, myChar.root.position.z)) myChar.root.position.x += vel.x;
        if(!checkCollisions(myChar.root.position.x, myChar.root.position.y, myChar.root.position.z+vel.z)) myChar.root.position.z += vel.z;
        let floorY = getFloorHeight(myChar.root.position.x, myChar.root.position.y, myChar.root.position.z); pVelY -= 29.0 * dt; myChar.root.position.y += pVelY * dt;
        if(myChar.root.position.y <= floorY) { myChar.root.position.y = floorY; pVelY = 0; pGnd = true; canDoubleJump = true; }
        const animSpeedScale = walkSpd / 12.5; animateRig(myChar, mX * animSpeedScale, -mZ * animSpeedScale, pGnd, dt, pitch);
        if(state.mode === 'multi') sendNetData({ type: 'sync', id: myId, name: playerName, team: state.team, x: myChar.root.position.x, y: myChar.root.position.y, z: myChar.root.position.z, yaw: yaw, lvX: mX * animSpeedScale, lvZ: -mZ * animSpeedScale, gnd: pGnd, dt: dt, p: pitch, wpnId: currentWeapon.id });
        if(state.mode === 'solo') {
            const time = performance.now();
            bots.forEach(b => {
                const dist = b.root.position.distanceTo(myChar.root.position);
                b.root.lookAt(myChar.root.position.x, b.root.position.y, myChar.root.position.z);
                if(dist > 9.5) { const fwd = new THREE.Vector3(0,0,1).applyQuaternion(b.root.quaternion); if(!checkCollisions(b.root.position.x+fwd.x*(4.5*dt), b.root.position.y, b.root.position.z+fwd.z*(4.5*dt))) { b.root.position.x+=fwd.x*(4.5*dt); b.root.position.z+=fwd.z*(4.5*dt); } animateRig(b, 0, 1, true, dt, 0); } 
                else { animateRig(b, 0, 0, true, dt, 0); if(time > b.nxtS) { Sfx.shoot('smg'); applyDamage(12, b.root.position); b.nxtS = time + 1200; } }
            });
        } 
    }
    for(let i=bulletShells.length-1; i>=0; i--) { bulletShells[i].life -= dt; if(bulletShells[i].life <= 0) { scene.remove(bulletShells[i].m); bulletShells.splice(i,1); } }
    for(let i=sparks.length-1; i>=0; i--) { sparks[i].l -= dt * 4.0; if(sparks[i].l <= 0) { scene.remove(sparks[i].m); sparks.splice(i,1); } else { sparks[i].v.y -= 9.8 * dt; sparks[i].m.position.addScaledVector(sparks[i].v, dt); } }
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
animate();