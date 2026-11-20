import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CozyAudioEngine } from './audio';
import { CarRig, createCozyCar } from './carModel';
import { buildStageEnvironment, BuiltStage } from './stageBuilder';
import { createStageTextures, ProceduralTextureSet } from './textures';
import {
  buildTrack,
  BuiltTrack,
  ROAD_HALF_WIDTH,
} from './track';
import {
  CameraMode,
  CAR_COLORS,
  GameMode,
  HudSnapshot,
  StageId,
  STAGES,
} from './types';

// Reusable module-scope math objects (Zero GC inside render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();

interface RivalState {
  name: string;
  colorCss: string;
  rig: CarRig;
  t: number;
  lap: number;
  totalProgress: number;
  laneOffset: number;
  targetLane: number;
  laneTimer: number;
  baseSpeed: number;
  speed: number;
  pos: THREE.Vector3;
  heading: number;
  finished: boolean;
  finishTimeMs: number;
}

interface BurstParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export interface TouchInputState {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  drift: boolean;
  boost: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onModeChange: (mode: GameMode) => void;
  onContextLost: (lost: boolean) => void;
}

export class RacingEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private audio: CozyAudioEngine;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private envRT: THREE.WebGLRenderTarget;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;

  private stageId: StageId = 'desert';
  private carColorId: string = CAR_COLORS[0].id;
  private mode: GameMode = 'title';
  private cameraMode: CameraMode = 'chase';

  private textures: ProceduralTextureSet | null = null;
  private track: BuiltTrack | null = null;
  private stageEnv: BuiltStage | null = null;
  private playerRig: CarRig | null = null;
  private rivals: RivalState[] = [];

  // Pooled particle burst system
  private burstGroup: THREE.Group;
  private burstGeo: THREE.BufferGeometry;
  private burstPool: BurstParticle[] = [];

  // Physics & Race State
  private playerPos = new THREE.Vector3();
  private playerHeading = 0; // radians, 0 faces -Z
  private playerSpeed = 0; // world units/sec
  private playerTrackT = 0;
  private playerLap = 1;
  private readonly totalLaps = 3;
  private maxCheckT = 0;
  private passedHalfway = false;
  private playerFinished = false;
  private playerFinishTimeMs = 0;

  private boostCharge = 35; // 0..100
  private driftCharge = 0;
  private isDrifting = false;
  private driftDir = 0; // -1 left, +1 right
  private driftVisualAngle = 0;
  private boostTimer = 0;
  private starsCollected = 0;

  private raceTimeMs = 0;
  private lapStartMs = 0;
  private bestLapMs: number | null = null;
  private countdownTimer = 0;
  private lastCountdownStep = -1;

  // Game feel: hitstop & camera shake
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private bodyPitch = 0;
  private bodyRoll = 0;
  private wheelSpin = 0;
  private steerVisual = 0;
  private smoothCamPos = new THREE.Vector3(0, 8, 128);
  private smoothCamLook = new THREE.Vector3(0, 1, 100);

  // Input state
  private heldKeys = new Set<string>();
  private justPressedBoost = false;
  private touchInput: TouchInputState = {
    throttle: false,
    brake: false,
    left: false,
    right: false,
    drift: false,
    boost: false,
  };

  private clock = new THREE.Clock();
  private elapsed = 0;
  private frameId = 0;
  private hudEmitAccum = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    audio: CozyAudioEngine,
    callbacks: EngineCallbacks,
  ) {
    this.container = container;
    this.audio = audio;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const aspect =
      (container.clientWidth || window.innerWidth) /
      Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 700);

    // Mandatory studio environment map via RoomEnvironment
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    pmrem.dispose();

    // Warm Key Sun + Cool Hemisphere Fill
    this.hemiLight = new THREE.HemisphereLight(0x9ec5e6, 0xb96a42, 0.95);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffe0b2, 2.2);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 220;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Initialize Pooled Particle Burst System
    this.burstGroup = new THREE.Group();
    this.burstGeo = new THREE.SphereGeometry(0.24, 6, 6);
    for (let i = 0; i < 42; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.burstGeo, mat);
      mesh.visible = false;
      this.burstGroup.add(mesh);
      this.burstPool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.4,
        active: false,
      });
    }
    this.scene.add(this.burstGroup);

    // Attach listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.handleContextLost,
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    // Build initial stage
    this.loadStage('desert');
    this.tick();
  }

  public getStageId(): StageId {
    return this.stageId;
  }

  public getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  public cycleCameraMode(): CameraMode {
    const order: CameraMode[] = ['chase', 'scenic', 'hood'];
    const next = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.cameraMode = next;
    return next;
  }

  public setCarColor(colorId: string): void {
    this.carColorId = colorId;
    const found = CAR_COLORS.find((c) => c.id === colorId) ?? CAR_COLORS[0];
    this.playerRig?.setPaintColor(found.bodyHex, found.accentHex);
  }

  public setTouchInput(partial: Partial<TouchInputState>): void {
    if (partial.boost && !this.touchInput.boost) {
      this.justPressedBoost = true;
    }
    Object.assign(this.touchInput, partial);
  }

  public loadStage(stageId: StageId): void {
    this.stageId = stageId;
    const cfg = STAGES[stageId];

    // Cleanup previous stage objects
    if (this.stageEnv) {
      this.scene.remove(this.stageEnv.group);
      this.stageEnv.dispose();
      this.stageEnv = null;
    }
    if (this.track) {
      this.scene.remove(this.track.group);
      this.track.dispose();
      this.track = null;
    }
    if (this.playerRig) {
      this.scene.remove(this.playerRig.root);
      this.playerRig.dispose();
      this.playerRig = null;
    }
    this.rivals.forEach((r) => {
      this.scene.remove(r.rig.root);
      r.rig.dispose();
    });
    this.rivals = [];
    this.textures?.dispose();

    // Scene sky & fog
    this.scene.background = new THREE.Color(cfg.horizonHex);
    this.scene.fog = new THREE.FogExp2(cfg.fogHex, cfg.fogDensity);

    // Update lighting temperatures
    this.hemiLight.color.setHex(cfg.hemiSkyHex);
    this.hemiLight.groundColor.setHex(cfg.hemiGroundHex);
    this.hemiLight.intensity = cfg.hemiIntensity;

    this.sunLight.color.setHex(cfg.sunHex);
    this.sunLight.intensity = cfg.sunIntensity;

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createStageTextures(stageId, maxAniso);
    this.track = buildTrack(cfg, this.textures);
    this.scene.add(this.track.group);

    this.stageEnv = buildStageEnvironment(cfg, this.track, this.textures);
    this.scene.add(this.stageEnv.group);

    // Spawn Player Car
    const carOpt =
      CAR_COLORS.find((c) => c.id === this.carColorId) ?? CAR_COLORS[0];
    this.playerRig = createCozyCar(
      carOpt.bodyHex,
      carOpt.accentHex,
      this.textures.contactShadowTexture,
      stageId === 'city',
    );
    this.scene.add(this.playerRig.root);

    // Spawn 3 Friendly Rivals
    const rivalDefs = [
      { name: 'Mochi', body: 0xa78bfa, accent: 0xfef3c7, css: '#a78bfa', speed: 44.5, lane: -2.6, tOffset: 0.992 },
      { name: 'Sol', body: 0xfbbf24, accent: 0x1e293b, css: '#fbbf24', speed: 46.2, lane: 2.6, tOffset: 0.986 },
      { name: 'Kaze', body: 0x38bdf8, accent: 0xf43f5e, css: '#38bdf8', speed: 47.6, lane: -2.4, tOffset: 0.981 },
    ];

    this.rivals = rivalDefs.map((rd) => {
      const rig = createCozyCar(
        rd.body,
        rd.accent,
        this.textures!.contactShadowTexture,
        false,
      );
      this.scene.add(rig.root);
      return {
        name: rd.name,
        colorCss: rd.css,
        rig,
        t: rd.tOffset,
        lap: 1,
        totalProgress: rd.tOffset - 1,
        laneOffset: rd.lane,
        targetLane: rd.lane,
        laneTimer: 2 + Math.random() * 2,
        baseSpeed: rd.speed,
        speed: 0,
        pos: new THREE.Vector3(),
        heading: 0,
        finished: false,
        finishTimeMs: 0,
      };
    });

    this.resetGridPositions();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.emitHud();
  }

  private resetGridPositions(): void {
    if (!this.track || !this.playerRig) return;

    // Player starts at t = 0.976 on right lane
    const startT = 0.976;
    this.track.sampleAtT(startT, _v1, _v2, _v3);
    this.playerPos.copy(_v1).addScaledVector(_v3, 2.5);
    this.playerHeading = Math.atan2(-_v2.x, -_v2.z);
    this.playerSpeed = 0;
    this.playerTrackT = startT;
    this.playerLap = 1;
    this.maxCheckT = 0;
    this.passedHalfway = false;
    this.playerFinished = false;
    this.playerFinishTimeMs = 0;

    this.boostCharge = 35;
    this.driftCharge = 0;
    this.isDrifting = false;
    this.driftDir = 0;
    this.driftVisualAngle = 0;
    this.boostTimer = 0;
    this.starsCollected = 0;
    this.raceTimeMs = 0;
    this.lapStartMs = 0;
    this.bestLapMs = null;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;

    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(0, this.playerHeading, 0);

    // Reset star orbs
    this.track.starOrbs.forEach((orb) => {
      orb.cooldown = 0;
      orb.group.visible = true;
    });

    // Reset Rivals
    const rivalOffsets = [
      { t: 0.992, lane: -2.6 },
      { t: 0.986, lane: 2.6 },
      { t: 0.981, lane: -2.4 },
    ];
    this.rivals.forEach((r, idx) => {
      r.t = rivalOffsets[idx].t;
      r.lap = 1;
      r.totalProgress = r.t - 1;
      r.laneOffset = rivalOffsets[idx].lane;
      r.targetLane = r.laneOffset;
      r.speed = 0;
      r.finished = false;
      r.finishTimeMs = 0;
      this.track!.sampleAtT(r.t, _v1, _v2, _v3);
      r.pos.copy(_v1).addScaledVector(_v3, r.laneOffset);
      r.heading = Math.atan2(-_v2.x, -_v2.z);
      r.rig.root.position.copy(r.pos);
      r.rig.root.rotation.set(0, r.heading, 0);
    });

    // Snap camera behind car
    this.smoothCamPos
      .copy(this.playerPos)
      .add(new THREE.Vector3(Math.sin(this.playerHeading) * 9, 4.2, Math.cos(this.playerHeading) * 9));
    this.smoothCamLook.copy(this.playerPos).add(new THREE.Vector3(0, 1.4, 0));
  }

  public startRace(): void {
    this.audio.unlock();
    this.resetGridPositions();
    this.mode = 'countdown';
    this.countdownTimer = 3.2;
    this.lastCountdownStep = 4;
    this.callbacks.onModeChange('countdown');
    this.emitHud();
  }

  public returnToTitle(): void {
    this.mode = 'title';
    this.resetGridPositions();
    this.audio.updateEngine(0, false, false, false);
    this.callbacks.onModeChange('title');
    this.emitHud();
  }

  public togglePause(): void {
    if (this.mode === 'racing') {
      this.mode = 'paused';
      this.audio.updateEngine(0, false, false, false);
      this.callbacks.onModeChange('paused');
    } else if (this.mode === 'paused') {
      this.mode = 'racing';
      this.callbacks.onModeChange('racing');
    }
  }

  private spawnBurst(
    pos: THREE.Vector3,
    colorHex: number,
    count: number,
    speed: number,
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.burstPool.length && spawned < count; i++) {
      const p = this.burstPool[i];
      if (p.active) continue;
      p.active = true;
      p.life = 0;
      p.maxLife = 0.35 + Math.random() * 0.25;
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(1.0);
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
      p.vel.set(
        (Math.random() - 0.5) * speed,
        1.5 + Math.random() * speed * 0.7,
        (Math.random() - 0.5) * speed,
      );
      spawned++;
    }
  }

  private updateBursts(dt: number): void {
    for (let i = 0; i < this.burstPool.length; i++) {
      const p = this.burstPool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 6.5 * dt;
      const ratio = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(0.4 + ratio * 1.1);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = ratio * 0.8;
    }
  }

  private isKeyHeld(codes: string[]): boolean {
    for (const c of codes) {
      if (this.heldKeys.has(c)) return true;
    }
    return false;
  }

  private updateSimulation(dt: number): void {
    if (!this.track || !this.playerRig) return;

    this.track.updateDynamic(this.elapsed, dt);
    this.updateBursts(dt);

    // Handle Countdown
    if (this.mode === 'countdown') {
      this.countdownTimer -= dt;
      const step = Math.ceil(this.countdownTimer);
      if (step !== this.lastCountdownStep && step >= 1 && step <= 3) {
        this.lastCountdownStep = step;
        this.audio.playCountdownTick(false);
      }
      if (this.countdownTimer <= 0) {
        this.mode = 'racing';
        this.audio.playCountdownTick(true);
        this.callbacks.onModeChange('racing');
      }
      this.audio.updateEngine(0.1, false, false, true);
      this.updateCamera(dt);
      return;
    }

    if (this.mode === 'paused') {
      this.updateCamera(dt);
      return;
    }

    if (this.mode === 'title') {
      this.audio.updateEngine(0, false, false, false);
      this.updateCamera(dt);
      return;
    }

    // Hitstop freeze frame on heavy wall/car bump
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCamera(dt);
      return;
    }

    // Advance Race Clock while racing
    if (this.mode === 'racing' && !this.playerFinished) {
      this.raceTimeMs += dt * 1000;
    }

    // =========================================================================
    // Player Input & Cozy Driving Physics (or Auto-Cruise if finished!)
    // =========================================================================
    let throttle = 0;
    let steerInput = 0;
    let driftHeld = false;

    if (this.mode === 'racing' && !this.playerFinished) {
      const fwd =
        this.isKeyHeld(['KeyW', 'ArrowUp']) || this.touchInput.throttle;
      const rev =
        this.isKeyHeld(['KeyS', 'ArrowDown']) || this.touchInput.brake;
      const left =
        this.isKeyHeld(['KeyA', 'ArrowLeft']) || this.touchInput.left;
      const right =
        this.isKeyHeld(['KeyD', 'ArrowRight']) || this.touchInput.right;
      driftHeld =
        this.isKeyHeld(['Space', 'ShiftLeft', 'ShiftRight']) ||
        this.touchInput.drift;

      if (fwd) throttle += 1;
      if (rev) throttle -= 1;
      if (left) steerInput += 1;
      if (right) steerInput -= 1;

      if (
        (this.justPressedBoost || this.isKeyHeld(['KeyE', 'KeyB'])) &&
        this.boostCharge >= 25 &&
        this.boostTimer <= 0.1
      ) {
        this.boostTimer = 1.45;
        this.boostCharge = Math.max(0, this.boostCharge - 35);
        this.audio.playBoost();
      }
      this.justPressedBoost = false;
    } else if (this.playerFinished) {
      // Cozy victory cruise autopilot around the track after finishing!
      throttle = 0.62;
      this.track.sampleAtT(this.playerTrackT + 0.025, _v1, _v2, _v3);
      const desiredHeading = Math.atan2(
        -(_v1.x - this.playerPos.x),
        -(_v1.z - this.playerPos.z),
      );
      let diff = desiredHeading - this.playerHeading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      steerInput = THREE.MathUtils.clamp(diff * 2.2, -1, 1);
    }

    const isBoosting = this.boostTimer > 0;
    if (isBoosting) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
    }

    const maxSpeed = isBoosting ? 64 : 49;
    const accelRate = isBoosting ? 58 : 30;

    if (throttle > 0) {
      this.playerSpeed += throttle * accelRate * dt;
    } else if (throttle < 0) {
      if (this.playerSpeed > 2) {
        this.playerSpeed -= 44 * dt; // Crisp braking
      } else {
        this.playerSpeed += throttle * 18 * dt; // Reverse
      }
    } else {
      // Gentle rolling friction
      this.playerSpeed = THREE.MathUtils.damp(this.playerSpeed, 0, 1.8, dt);
    }

    if (isBoosting && this.playerSpeed < 56) {
      this.playerSpeed = THREE.MathUtils.damp(this.playerSpeed, 62, 6.0, dt);
    }
    this.playerSpeed = THREE.MathUtils.clamp(this.playerSpeed, -18, maxSpeed);

    // Drift State Machine
    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / 14, 0, 1);
    if (driftHeld && this.playerSpeed > 18 && (steerInput !== 0 || this.isDrifting)) {
      if (!this.isDrifting) {
        this.isDrifting = true;
        this.driftDir = steerInput !== 0 ? Math.sign(steerInput) : 1;
        this.driftCharge = 0;
      }
      this.driftCharge = Math.min(100, this.driftCharge + dt * 42);
      this.boostCharge = Math.min(100, this.boostCharge + dt * 22);

      // Drift tire dust/spark bursts
      if (Math.random() < 0.45) {
        _v1.copy(this.playerPos);
        _v1.y += 0.25;
        const sparkCol =
          this.driftCharge > 60
            ? 0x38bdf8
            : this.stageId === 'snow'
              ? 0xe0f2fe
              : 0xfde68a;
        this.spawnBurst(_v1, sparkCol, 1, 3.2);
      }
    } else {
      if (this.isDrifting) {
        if (this.driftCharge >= 32) {
          this.boostTimer = Math.max(this.boostTimer, 1.15);
          this.audio.playBoost();
          this.spawnBurst(this.playerPos, 0x38bdf8, 6, 6);
        }
        this.isDrifting = false;
        this.driftDir = 0;
        this.driftCharge = 0;
      }
    }

    // Steering & Heading Integration
    const turnRate = this.isDrifting ? 2.15 : 1.78;
    const revSign = this.playerSpeed >= -0.5 ? 1 : -1;
    const effectiveSteer = this.isDrifting
      ? this.driftDir * 0.55 + steerInput * 0.72
      : steerInput;
    this.playerHeading += effectiveSteer * turnRate * speedFactor * revSign * dt;

    // Move Car in XZ along heading
    const fwdX = -Math.sin(this.playerHeading);
    const fwdZ = -Math.cos(this.playerHeading);
    this.playerPos.x += fwdX * this.playerSpeed * dt;
    this.playerPos.z += fwdZ * this.playerSpeed * dt;

    // Project onto Track Spline for Ground Y & Soft Boundary Guardrails
    const prevT = this.playerTrackT;
    const proj = this.track.projectPoint(this.playerPos, prevT);
    this.playerTrackT = proj.t;

    // Smooth vertical ground tracking
    this.playerPos.y = THREE.MathUtils.damp(
      this.playerPos.y,
      proj.point.y,
      18,
      dt,
    );

    // Keep car comfortably inside road + curbs (soft elastic rebound!)
    const maxLat = ROAD_HALF_WIDTH - 0.55;
    if (Math.abs(proj.lateralOffset) > maxLat) {
      const sign = Math.sign(proj.lateralOffset);
      const excess = Math.abs(proj.lateralOffset) - maxLat;
      this.playerPos.x -= proj.right.x * sign * excess;
      this.playerPos.z -= proj.right.z * sign * excess;

      if (Math.abs(this.playerSpeed) > 22 && excess > 0.15) {
        this.playerSpeed *= 0.82;
        this.shakeIntensity = Math.max(this.shakeIntensity, 0.35);
        this.hitstopTimer = 0.035;
        this.audio.playBump();
        this.spawnBurst(this.playerPos, 0xfbbf24, 5, 5);
      }

      // Gently nudge heading back along track tangent
      const trackHeading = Math.atan2(-proj.tangent.x, -proj.tangent.z);
      let hDiff = trackHeading - this.playerHeading;
      while (hDiff > Math.PI) hDiff -= Math.PI * 2;
      while (hDiff < -Math.PI) hDiff += Math.PI * 2;
      this.playerHeading += hDiff * Math.min(1, dt * 4.5);
    }

    // Lap & Checkpoint Tracking
    if (!this.playerFinished) {
      if (this.playerTrackT > 0.35 && this.playerTrackT < 0.72) {
        this.passedHalfway = true;
      }
      if (this.playerTrackT > this.maxCheckT && this.playerTrackT < 0.95) {
        this.maxCheckT = this.playerTrackT;
      }
      // Crossed finish line forward (from ~0.9+ to ~0.0+)
      if (prevT > 0.85 && this.playerTrackT < 0.15 && this.passedHalfway) {
        const lapDuration = this.raceTimeMs - this.lapStartMs;
        if (this.bestLapMs === null || lapDuration < this.bestLapMs) {
          this.bestLapMs = lapDuration;
        }
        this.lapStartMs = this.raceTimeMs;
        this.passedHalfway = false;
        this.maxCheckT = 0;

        if (this.playerLap >= this.totalLaps) {
          this.playerFinished = true;
          this.playerFinishTimeMs = this.raceTimeMs;
          this.mode = 'finished';
          this.audio.playFinishFanfare();
          this.callbacks.onModeChange('finished');
        } else {
          this.playerLap += 1;
          this.audio.playLapComplete();
        }
      }
    }

    // Check Boost Pads
    for (let i = 0; i < this.track.boostPads.length; i++) {
      const pad = this.track.boostPads[i];
      if (this.playerPos.distanceToSquared(pad.position) < 9.5) {
        if (this.boostTimer < 0.8) {
          this.boostTimer = 1.35;
          this.audio.playBoost();
          this.spawnBurst(this.playerPos, 0x38bdf8, 8, 7);
        }
      }
    }

    // Check Cozy Star Orbs
    for (let i = 0; i < this.track.starOrbs.length; i++) {
      const orb = this.track.starOrbs[i];
      if (orb.cooldown > 0) continue;
      const dx = this.playerPos.x - orb.position.x;
      const dz = this.playerPos.z - orb.position.z;
      if (dx * dx + dz * dz < 6.5) {
        orb.cooldown = 8.0;
        orb.group.visible = false;
        this.starsCollected += 1;
        this.boostCharge = Math.min(100, this.boostCharge + 24);
        this.audio.playStarPickup();
        this.spawnBurst(orb.position, 0xfde047, 10, 7);
      }
    }

    // Update Player Car Visual Rig (Drift Yaw, Suspension Pitch/Roll, Wheels, Flames)
    const targetDriftYaw = this.isDrifting
      ? this.driftDir * 0.28 + steerInput * 0.1
      : 0;
    this.driftVisualAngle = THREE.MathUtils.damp(
      this.driftVisualAngle,
      targetDriftYaw,
      10,
      dt,
    );
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(
      0,
      this.playerHeading + this.driftVisualAngle,
      0,
    );

    const targetPitch = isBoosting
      ? 0.045
      : throttle > 0
        ? 0.025
        : throttle < 0
          ? -0.035
          : 0;
    const targetRoll = -(steerInput * 0.065 + this.driftVisualAngle * 0.18) * speedFactor;
    this.bodyPitch = THREE.MathUtils.damp(this.bodyPitch, targetPitch, 10, dt);
    this.bodyRoll = THREE.MathUtils.damp(this.bodyRoll, targetRoll, 10, dt);
    this.playerRig.bodyTiltGroup.rotation.set(this.bodyPitch, 0, this.bodyRoll);

    // Squash & stretch subtle pulse when boosting
    const stretchZ = isBoosting ? 1.04 : 1.0;
    const squashY = isBoosting ? 0.96 : 1.0;
    this.playerRig.bodyTiltGroup.scale.set(1, squashY, stretchZ);

    this.steerVisual = THREE.MathUtils.damp(
      this.steerVisual,
      steerInput * 0.36,
      14,
      dt,
    );
    this.playerRig.frontLeftPivot.rotation.y = this.steerVisual;
    this.playerRig.frontRightPivot.rotation.y = this.steerVisual;

    this.wheelSpin -= (this.playerSpeed / 0.38) * dt;
    for (let i = 0; i < this.playerRig.wheelMeshes.length; i++) {
      this.playerRig.wheelMeshes[i].rotation.x = this.wheelSpin;
    }

    this.playerRig.tailLightMaterial.emissiveIntensity =
      throttle < 0 || this.isDrifting ? 3.4 : 1.3;
    this.playerRig.boostFlameLeft.visible = isBoosting;
    this.playerRig.boostFlameRight.visible = isBoosting;
    if (isBoosting) {
      const fScale = 0.85 + Math.sin(this.elapsed * 38) * 0.28;
      this.playerRig.boostFlameLeft.scale.set(1, 1, fScale);
      this.playerRig.boostFlameRight.scale.set(1, 1, fScale);
    }

    // Update AI Rivals
    this.updateRivals(dt);

    // Update Engine & Drift Audio
    this.audio.updateEngine(
      Math.abs(this.playerSpeed) / 48,
      this.isDrifting,
      isBoosting,
      this.mode === 'racing',
    );

    // Update Sun Shadow Camera to follow Player Car tightly
    const cfg = STAGES[this.stageId];
    this.sunLight.position.set(
      this.playerPos.x + cfg.sunPos[0] * 0.45,
      this.playerPos.y + cfg.sunPos[1] * 0.55,
      this.playerPos.z + cfg.sunPos[2] * 0.45,
    );
    this.sunLight.target.position.copy(this.playerPos);

    this.updateCamera(dt);
  }

  private updateRivals(dt: number): void {
    if (!this.track) return;
    const playerTotal =
      (this.playerLap - 1) + (this.playerTrackT > 0.9 && this.playerLap === 1 && !this.passedHalfway ? this.playerTrackT - 1 : this.playerTrackT);

    for (let i = 0; i < this.rivals.length; i++) {
      const r = this.rivals[i];
      r.laneTimer -= dt;
      if (r.laneTimer <= 0) {
        r.laneTimer = 2.5 + Math.random() * 3.0;
        r.targetLane = (Math.random() - 0.5) * 9.0;
      }
      r.laneOffset = THREE.MathUtils.damp(r.laneOffset, r.targetLane, 2.2, dt);

      // Gentle cozy rubber-banding so rivals stay competitive without feeling unfair
      const gap = playerTotal - r.totalProgress;
      const rubberBonus = THREE.MathUtils.clamp(gap * 14, -4.5, 5.5);
      const targetSpd = r.finished ? 26 : r.baseSpeed + rubberBonus;
      r.speed = THREE.MathUtils.damp(r.speed, targetSpd, 3.0, dt);

      const prevT = r.t;
      const dtProgress = (r.speed * dt) / this.track.totalLength;
      r.t = (r.t + dtProgress) % 1;

      if (prevT > 0.85 && r.t < 0.15) {
        if (r.totalProgress >= 0.5) {
          if (r.lap >= this.totalLaps && !r.finished) {
            r.finished = true;
            r.finishTimeMs = this.raceTimeMs;
          } else if (!r.finished) {
            r.lap += 1;
          }
        }
      }

      r.totalProgress += dtProgress;
      this.track.sampleAtT(r.t, _v1, _v2, _v3);
      r.pos.copy(_v1).addScaledVector(_v3, r.laneOffset);
      r.heading = Math.atan2(-_v2.x, -_v2.z);

      r.rig.root.position.copy(r.pos);
      r.rig.root.rotation.set(0, r.heading, 0);
      for (let w = 0; w < r.rig.wheelMeshes.length; w++) {
        r.rig.wheelMeshes[w].rotation.x -= (r.speed / 0.38) * dt;
      }

      // Soft Player <-> Rival nudge collision
      const dx = this.playerPos.x - r.pos.x;
      const dz = this.playerPos.z - r.pos.z;
      const distSq = dx * dx + dz * dz;
      const minSep = 2.45;
      if (distSq < minSep * minSep && distSq > 0.001) {
        const dist = Math.sqrt(distSq);
        const push = (minSep - dist) * 0.5;
        const nx = dx / dist;
        const nz = dz / dist;
        this.playerPos.x += nx * push;
        this.playerPos.z += nz * push;
        if (this.mode === 'racing' && this.shakeIntensity < 0.15) {
          this.shakeIntensity = 0.22;
          this.audio.playBump();
        }
      }
    }
  }

  private updateCamera(dt: number): void {
    if (this.mode === 'title') {
      // Cozy slow atmospheric camera orbit around parked player car on Title Screen
      const orbitAngle = this.elapsed * 0.22;
      const radius = 9.5;
      _camDesiredPos.set(
        this.playerPos.x + Math.sin(orbitAngle) * radius,
        this.playerPos.y + 3.8 + Math.sin(this.elapsed * 0.4) * 0.4,
        this.playerPos.z + Math.cos(orbitAngle) * radius,
      );
      _camDesiredLook.set(
        this.playerPos.x - 1.2,
        this.playerPos.y + 1.35,
        this.playerPos.z,
      );
      this.smoothCamPos.lerp(_camDesiredPos, 1 - Math.exp(-5 * dt));
      this.smoothCamLook.lerp(_camDesiredLook, 1 - Math.exp(-6 * dt));
      this.camera.position.copy(this.smoothCamPos);
      this.camera.lookAt(this.smoothCamLook);
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 54, 5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    const backX = Math.sin(this.playerHeading);
    const backZ = Math.cos(this.playerHeading);

    if (this.cameraMode === 'hood') {
      _camDesiredPos.set(
        this.playerPos.x - backX * 0.65,
        this.playerPos.y + 1.58,
        this.playerPos.z - backZ * 0.65,
      );
      _camDesiredLook.set(
        this.playerPos.x - backX * 18,
        this.playerPos.y + 1.2,
        this.playerPos.z - backZ * 18,
      );
      this.smoothCamPos.copy(_camDesiredPos);
      this.smoothCamLook.copy(_camDesiredLook);
    } else {
      const dist = this.cameraMode === 'scenic' ? 12.5 : 8.4;
      const height = this.cameraMode === 'scenic' ? 6.2 : 3.75;
      _camDesiredPos.set(
        this.playerPos.x + backX * dist,
        this.playerPos.y + height,
        this.playerPos.z + backZ * dist,
      );
      _camDesiredLook.set(
        this.playerPos.x - backX * 6.5,
        this.playerPos.y + 1.35,
        this.playerPos.z - backZ * 6.5,
      );
      this.smoothCamPos.x = THREE.MathUtils.damp(this.smoothCamPos.x, _camDesiredPos.x, 9, dt);
      this.smoothCamPos.y = THREE.MathUtils.damp(this.smoothCamPos.y, _camDesiredPos.y, 7, dt);
      this.smoothCamPos.z = THREE.MathUtils.damp(this.smoothCamPos.z, _camDesiredPos.z, 9, dt);

      this.smoothCamLook.x = THREE.MathUtils.damp(this.smoothCamLook.x, _camDesiredLook.x, 12, dt);
      this.smoothCamLook.y = THREE.MathUtils.damp(this.smoothCamLook.y, _camDesiredLook.y, 10, dt);
      this.smoothCamLook.z = THREE.MathUtils.damp(this.smoothCamLook.z, _camDesiredLook.z, 12, dt);
    }

    // Decaying camera shake
    this.camera.position.copy(this.smoothCamPos);
    if (this.shakeIntensity > 0.005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 12, dt);
    }
    this.camera.lookAt(this.smoothCamLook);

    // Dynamic Speed & Boost FOV widening
    const speedNorm = THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / 50, 0, 1.3);
    const targetFov =
      (this.cameraMode === 'scenic' ? 58 : 62) +
      speedNorm * 8 +
      (this.boostTimer > 0 ? 6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private emitHud(): void {
    if (!this.track) return;

    const playerProgress =
      (this.playerLap - 1) +
      (this.playerTrackT > 0.85 && this.playerLap === 1 && !this.passedHalfway
        ? this.playerTrackT - 1
        : this.playerTrackT);

    let position = 1;
    for (const r of this.rivals) {
      if (r.totalProgress > playerProgress) {
        position += 1;
      }
    }

    let countdownLabel: string | null = null;
    if (this.mode === 'countdown') {
      if (this.countdownTimer > 2.2) countdownLabel = '3';
      else if (this.countdownTimer > 1.2) countdownLabel = '2';
      else if (this.countdownTimer > 0.2) countdownLabel = '1';
      else countdownLabel = 'GO!';
    }

    const standings = [
      {
        name: 'You',
        isPlayer: true,
        progress: this.playerFinished ? 100 - this.playerFinishTimeMs * 0.00001 : playerProgress,
        timeMs: this.playerFinishTimeMs || this.raceTimeMs,
        colorCss:
          CAR_COLORS.find((c) => c.id === this.carColorId)?.cssHex ?? '#e86a53',
      },
      ...this.rivals.map((r) => ({
        name: r.name,
        isPlayer: false,
        progress: r.finished ? 100 - r.finishTimeMs * 0.00001 : r.totalProgress,
        timeMs:
          r.finishTimeMs ||
          this.raceTimeMs + Math.max(0, (playerProgress - r.totalProgress) * 14000),
        colorCss: r.colorCss,
      })),
    ]
      .sort((a, b) => b.progress - a.progress)
      .map(({ name, isPlayer, timeMs, colorCss }) => ({
        name,
        isPlayer,
        timeMs,
        colorCss,
      }));

    this.callbacks.onHudUpdate({
      speedKmh: Math.round(Math.abs(this.playerSpeed) * 3.3),
      lap: Math.min(this.playerLap, this.totalLaps),
      totalLaps: this.totalLaps,
      position,
      totalRacers: 4,
      raceTimeMs: this.raceTimeMs,
      bestLapMs: this.bestLapMs,
      boostCharge: Math.round(this.boostCharge),
      isDrifting: this.isDrifting,
      isBoosting: this.boostTimer > 0,
      starsCollected: this.starsCollected,
      countdownLabel,
      playerMapPos: this.track.toMinimap(this.playerPos.x, this.playerPos.z),
      rivalMapPositions: this.rivals.map((r) =>
        this.track!.toMinimap(r.pos.x, r.pos.z),
      ),
      trackMapPath: this.track.minimapPoints,
      finishStandings: standings,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.elapsed += dt;

    this.updateSimulation(dt);
    this.stageEnv?.update(this.elapsed, dt, this.playerPos);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.065) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private handleResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.heldKeys.add(e.code);
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      e.preventDefault();
    }
    if (e.code === 'KeyB' || e.code === 'KeyE') {
      this.justPressedBoost = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private handleBlur = (): void => {
    this.heldKeys.clear();
    this.touchInput.throttle = false;
    this.touchInput.brake = false;
    this.touchInput.left = false;
    this.touchInput.right = false;
    this.touchInput.drift = false;
    this.touchInput.boost = false;
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextLost(false);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.handleContextLost,
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );

    this.stageEnv?.dispose();
    this.track?.dispose();
    this.playerRig?.dispose();
    this.rivals.forEach((r) => r.rig.dispose());
    this.textures?.dispose();
    this.burstGeo.dispose();
    this.burstPool.forEach((p) => (p.mesh.material as THREE.Material).dispose());
    this.envRT.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
