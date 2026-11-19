import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { soundEngine } from '../audio/soundEngine';
import {
  BUILD_COSTS,
  GamePhase,
  HotbarSlotId,
  HudSnapshot,
  LobbyPlayer,
  TOOL_SPECS,
  ToolId,
} from '../types/game';
import { CharacterAnimState, CharacterRig, createCharacterRig } from './characterMesh';
import { groundHeightAt, WORLD_PLAY_RADIUS } from './terrain';
import { createProceduralTextures, ProceduralTextureSet } from './textures';
import {
  buildForestWorld,
  createCampfire,
  createResourcePickup,
  createWolfEntity,
  createWoodWall,
  WolfEntity,
  WoodWallEntity,
  WorldRefs,
} from './worldBuilder';

// Pre-allocated math helpers (zero GC inside animation loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _camTarget = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _sunColor = new THREE.Color();
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();

interface Particle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  gravity: number;
  scaleStart: number;
  scaleEnd: number;
}

export class SurvivalEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onLobbyUpdate: (players: LobbyPlayer[]) => void;

  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;
  private world: WorldRefs;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private skyDome: THREE.Mesh;
  private skyUniforms: {
    uSunDir: { value: THREE.Vector3 };
    uDayFactor: { value: number };
    uDuskFactor: { value: number };
    uTime: { value: number };
  };
  private dustPoints: THREE.Points;

  private playerRig: CharacterRig;
  private companionRigs: CharacterRig[] = [];
  private lobbyPlayers: LobbyPlayer[] = [];

  // Particle pool
  private particles: Particle[] = [];
  private particleGroup = new THREE.Group();

  // Build ghost preview
  private ghostWall: WoodWallEntity | null = null;
  private ghostCampfire: THREE.Group | null = null;
  private ghostKind: 'campfire' | 'wood_wall' | 'wood_gate' | null = null;

  // Game state
  private phase: GamePhase = 'lobby';
  private countdownTimer = 0;
  private countdownLastBeep = 4;

  private playerX = 0;
  private playerY = 0;
  private playerZ = 0.85;
  private playerVelY = 0;
  private playerGrounded = true;
  private playerYaw = Math.PI; // Facing campfire/camera in lobby
  private currentSpeedRatio = 0;

  private camYaw = 0;
  private camPitch = 0.28;
  private camDistance = 4.3;
  private lobbyOrbitAngle = 0.35;
  private cameraShake = 0;

  // Action timers
  private chopTimer = 0;
  private chopStrikeTriggered = false;
  private gatherTimer = 0;
  private hitstopTimer = 0;
  private footstepTimer = 0;
  private fireParticleTimer = 0;

  // Survival simulation state
  private vitals = { health: 100, hunger: 92, warmth: 88, stamina: 100 };
  private inventory = { wood: 4, stone: 2, berries: 2 };
  private activeSlot: HotbarSlotId = 'tool';
  private selectedSkinId = 'tactical_ranger';
  private selectedToolId: ToolId = 'axe_survival';
  private buildRotationDeg = 0;
  private canPlaceBuild = false;
  private buildTargetX = 0;
  private buildTargetZ = 0;

  private dayNumber = 1;
  private timeOfDay = 0.26; // Start in crisp sunlit afternoon
  private treesChopped = 0;
  private wallsBuilt = 0;
  private campfiresLit = 0;
  private wolvesRepelled = 0;
  private nextEntityId = 500;
  private wolfSpawnTimer = 18;
  private toastMessage: string | null = null;
  private toastTimer = 0;

  // Input state
  private heldKeys = new Set<string>();
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private isDraggingCamera = false;
  private activeCameraPointerId: number | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Loop management
  private frameId = 0;
  private lastTimestamp = 0;
  private elapsed = 0;
  private hudEmitAccum = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onLobbyUpdate: (players: LobbyPlayer[]) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onLobbyUpdate = onLobbyUpdate;

    // 1. Software WebGL detection
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // 3. Scene, Camera & Environment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7f947f');
    this.scene.fog = new THREE.FogExp2('#7f947f', 0.0155);

    this.camera = new THREE.PerspectiveCamera(
      55,
      (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight),
      0.15,
      260,
    );

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 4. Photorealistic Procedural Atmospheric Sky Dome (Rayleigh gradient, volumetric clouds, sun halo, night stars)
    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3(0.5, 0.5, 0.4).normalize() },
      uDayFactor: { value: 1.0 },
      uDuskFactor: { value: 0.0 },
      uTime: { value: 0.0 },
    };
    const skyGeo = new THREE.SphereGeometry(195, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldDir;
        uniform vec3 uSunDir;
        uniform float uDayFactor;
        uniform float uDuskFactor;
        uniform float uTime;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.03;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);

          vec3 dayZenith = vec3(0.24, 0.44, 0.66);
          vec3 dayHorizon = vec3(0.68, 0.78, 0.79);
          vec3 duskZenith = vec3(0.18, 0.21, 0.36);
          vec3 duskHorizon = vec3(0.88, 0.48, 0.28);
          vec3 nightZenith = vec3(0.03, 0.05, 0.10);
          vec3 nightHorizon = vec3(0.08, 0.12, 0.16);

          vec3 skyTop = mix(nightZenith, dayZenith, uDayFactor);
          skyTop = mix(skyTop, duskZenith, uDuskFactor * 0.65);
          vec3 skyBot = mix(nightHorizon, dayHorizon, uDayFactor);
          skyBot = mix(skyBot, duskHorizon, uDuskFactor * 0.72);

          vec3 col = mix(skyBot, skyTop, pow(h, 0.55));

          // Sun disc & Mie scattering glow
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          float sunDisc = smoothstep(0.9982, 0.9994, sunDot);
          float sunHalo = pow(sunDot, 16.0) * 0.45 + pow(sunDot, 128.0) * 0.6;
          vec3 sunCol = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.96, 0.86), uDayFactor);
          col += sunCol * (sunHalo + sunDisc * 2.2) * (0.15 + 0.85 * uDayFactor);

          // Procedural drifting clouds above horizon
          if (dir.y > 0.03) {
            vec2 cloudUv = dir.xz / (dir.y + 0.22) * 1.45 + vec2(uTime * 0.008, uTime * 0.004);
            float c = fbm(cloudUv);
            float cloudMask = smoothstep(0.47, 0.76, c) * smoothstep(0.03, 0.22, dir.y);
            vec3 cloudCol = mix(vec3(0.16, 0.2, 0.28), vec3(0.96, 0.95, 0.93), uDayFactor);
            cloudCol = mix(cloudCol, vec3(1.0, 0.7, 0.52), uDuskFactor * 0.65);
            col = mix(col, cloudCol, cloudMask * 0.72);
          }

          // Stars at night
          if (uDayFactor < 0.35 && dir.y > 0.08) {
            vec2 starUv = floor(dir.xz / (dir.y + 0.5) * 180.0);
            float s = hash(starUv);
            if (s > 0.993) {
              col += vec3(0.85, 0.9, 1.0) * (1.0 - uDayFactor / 0.35) * 0.85;
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    // 5. Warm/Cool 3D Outdoor Lighting Rig
    this.hemiLight = new THREE.HemisphereLight('#c4dce8', '#384528', 0.82);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff2d6', 2.4);
    this.sunLight.position.set(28, 36, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 110;
    const d = 28;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 6. Procedural Textures & Forest World
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.world = buildForestWorld(this.scene, this.textures);
    this.scene.add(this.particleGroup);

    // Floating forest pollen / sun-motes catching light
    const dustCount = 240;
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 44;
      dustPositions[i * 3 + 1] = 0.6 + Math.random() * 6.5;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      map: this.textures.particleSoft,
      color: '#ffecc4',
      size: 0.14,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);
    this.world.disposables.push(dustGeo, dustMat);

    // 7. Player Character & Lobby Companions
    this.playerRig = createCharacterRig(this.selectedSkinId, this.selectedToolId, this.textures);
    this.playerY = groundHeightAt(this.playerX, this.playerZ);
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.root);

    this.initLobbySquad();

    if (!this.isSoftwareGl) {
      const w = container.clientWidth || window.innerWidth;
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.24, 0.45, 0.92);
      this.composer.addPass(bloom);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.updateAtmosphere(0);
    this.emitHud(true);
    this.lastTimestamp = performance.now();
    this.tick();
  }

  private initLobbySquad(): void {
    this.lobbyPlayers = [
      {
        id: 'local',
        name: 'Vous',
        isLocal: true,
        ready: false,
        skinId: this.selectedSkinId,
        toolId: this.selectedToolId,
      },
      {
        id: 'bot_1',
        name: 'Kael',
        isLocal: false,
        ready: true,
        skinId: 'nordic_lumberjack',
        toolId: 'axe_tactical',
      },
      {
        id: 'bot_2',
        name: 'Lyra',
        isLocal: false,
        ready: true,
        skinId: 'forest_warden',
        toolId: 'pickaxe_alpine',
      },
      {
        id: 'bot_3',
        name: 'Torin',
        isLocal: false,
        ready: false,
        skinId: 'denim_survivor',
        toolId: 'axe_survival',
      },
    ];

    const spots = [
      { x: -2.05, z: -2.4, rot: 1.05 },
      { x: 1.95, z: -2.6, rot: -1.1 },
      { x: 1.45, z: -0.65, rot: -2.3 },
    ];

    this.lobbyPlayers.slice(1).forEach((p, idx) => {
      const rig = createCharacterRig(p.skinId, p.toolId, this.textures);
      const s = spots[idx];
      rig.root.position.set(s.x, groundHeightAt(s.x, s.z), s.z);
      rig.root.rotation.y = s.rot;
      this.scene.add(rig.root);
      this.companionRigs.push(rig);
    });

    this.onLobbyUpdate([...this.lobbyPlayers]);
  }

  // ---- Public API for React UI ----

  public setSkin(skinId: string): void {
    this.selectedSkinId = skinId;
    this.playerRig.setSkin(skinId);
    this.lobbyPlayers = this.lobbyPlayers.map((p) => (p.isLocal ? { ...p, skinId } : p));
    this.onLobbyUpdate([...this.lobbyPlayers]);
    soundEngine.playUiClick(580);
  }

  public setTool(toolId: ToolId): void {
    this.selectedToolId = toolId;
    this.playerRig.setTool(toolId);
    this.lobbyPlayers = this.lobbyPlayers.map((p) => (p.isLocal ? { ...p, toolId } : p));
    this.onLobbyUpdate([...this.lobbyPlayers]);
    soundEngine.playUiClick(460);
  }

  public toggleQuickToolKind(): void {
    const current = TOOL_SPECS.find((t) => t.id === this.selectedToolId) || TOOL_SPECS[0];
    const next =
      current.kind === 'axe'
        ? TOOL_SPECS.find((t) => t.kind === 'pickaxe')!
        : TOOL_SPECS.find((t) => t.kind === 'axe')!;
    this.setTool(next.id);
    this.showToast(`Équipé : ${next.name}`);
  }

  public toggleReady(): void {
    if (this.phase !== 'lobby' && this.phase !== 'countdown') return;
    soundEngine.unlock();
    const local = this.lobbyPlayers.find((p) => p.isLocal);
    const nextReady = !local?.ready;

    this.lobbyPlayers = this.lobbyPlayers.map((p) => {
      if (p.isLocal) return { ...p, ready: nextReady };
      return p;
    });

    if (nextReady) {
      this.phase = 'countdown';
      this.countdownTimer = 3.2;
      this.countdownLastBeep = 4;
      // Remaining waiting players lock in ready shortly after
      window.setTimeout(() => {
        if (this.phase === 'countdown') {
          this.lobbyPlayers = this.lobbyPlayers.map((p) => ({ ...p, ready: true }));
          this.onLobbyUpdate([...this.lobbyPlayers]);
        }
      }, 650);
    } else {
      this.phase = 'lobby';
      this.countdownTimer = 0;
    }

    soundEngine.playUiClick(nextReady ? 680 : 380);
    this.onLobbyUpdate([...this.lobbyPlayers]);
    this.emitHud(true);
  }

  public selectHotbarSlot(slot: HotbarSlotId): void {
    if (slot === 'berries') {
      this.eatBerries();
      return;
    }
    this.activeSlot = slot;
    soundEngine.playUiClick(500);
    this.emitHud(true);
  }

  public rotateBuild(): void {
    this.buildRotationDeg = (this.buildRotationDeg + 45) % 360;
    soundEngine.playUiClick(620);
    this.emitHud(true);
  }

  public eatBerries(): void {
    if (this.inventory.berries <= 0) {
      this.showToast('Aucune baie en réserve');
      return;
    }
    if (this.vitals.hunger >= 99 && this.vitals.health >= 99) {
      this.showToast('Vous êtes déjà rassasié');
      return;
    }
    this.inventory.berries -= 1;
    this.vitals.hunger = Math.min(100, this.vitals.hunger + 28);
    this.vitals.health = Math.min(100, this.vitals.health + 12);
    soundEngine.playPickup();
    this.showToast('Baies consommées (+28 Faim, +12 Santé)');
    this.emitHud(true);
  }

  public resumeGame(): void {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.emitHud(true);
    }
  }

  public returnToLobby(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.phase = 'lobby';
    this.countdownTimer = 0;
    this.activeSlot = 'tool';
    this.clearGhost();
    this.playerX = 0;
    this.playerZ = 0.85;
    this.playerY = groundHeightAt(this.playerX, this.playerZ);
    this.playerYaw = Math.PI;
    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.companionRigs.forEach((rig) => (rig.root.visible = true));
    this.lobbyPlayers = this.lobbyPlayers.map((p) => (p.isLocal ? { ...p, ready: false } : p));
    this.onLobbyUpdate([...this.lobbyPlayers]);
    this.emitHud(true);
  }

  public setVirtualMove(x: number, y: number): void {
    this.virtualMoveX = THREE.MathUtils.clamp(x, -1, 1);
    this.virtualMoveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  public addCameraLook(dxRad: number, dyRad: number): void {
    soundEngine.unlock();
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      this.lobbyOrbitAngle -= dxRad;
      return;
    }
    if (this.phase !== 'playing') return;
    this.camYaw -= dxRad;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dyRad, -0.18, 0.95);
  }

  public triggerAction(): void {
    soundEngine.unlock();
    if (this.phase !== 'playing') return;
    this.triggerPrimaryAction();
  }

  public triggerJump(): void {
    soundEngine.unlock();
    if (this.phase !== 'playing' || !this.playerGrounded) return;
    this.playerVelY = 6.2;
    this.playerGrounded = false;
  }

  public triggerPickup(): void {
    soundEngine.unlock();
    if (this.phase !== 'playing') return;
    this.tryManualPickup();
  }

  public restartSurvival(): void {
    // Reset vitals, inventory, wolves, and place player in clearing
    this.vitals = { health: 100, hunger: 92, warmth: 88, stamina: 100 };
    this.inventory = { wood: 4, stone: 2, berries: 2 };
    this.dayNumber = 1;
    this.timeOfDay = 0.26;
    this.activeSlot = 'tool';
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.world.wolves.forEach((w) => this.scene.remove(w.group));
    this.world.wolves = [];
    this.playerX = 0;
    this.playerZ = 1.6;
    this.playerY = groundHeightAt(this.playerX, this.playerZ);
    this.phase = 'playing';
    this.emitHud(true);
  }

  // ---- Input & Lifecycle ----

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointermove', this.handlePointerMove);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointermove', this.handlePointerMove);

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handleContextMenu = (e: MouseEvent) => e.preventDefault();

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.composer?.setSize(w, h);
  };

  private handleBlur = () => {
    this.heldKeys.clear();
    this.virtualMoveX = 0;
    this.virtualMoveY = 0;
    this.isDraggingCamera = false;
    this.activeCameraPointerId = null;
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    soundEngine.unlock();
    const code = e.code;

    if (code === 'Escape') {
      if (this.phase === 'playing') {
        this.phase = 'paused';
        this.virtualMoveX = 0;
        this.virtualMoveY = 0;
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock();
        }
        this.emitHud(true);
      } else if (this.phase === 'paused') {
        this.phase = 'playing';
        this.emitHud(true);
      }
      return;
    }

    if (this.phase === 'lobby' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      this.toggleReady();
      return;
    }

    if (this.phase !== 'playing') return;

    this.heldKeys.add(code);

    if (code === 'Digit1') this.selectHotbarSlot('tool');
    else if (code === 'Digit2') this.selectHotbarSlot('campfire');
    else if (code === 'Digit3') this.selectHotbarSlot('wood_wall');
    else if (code === 'Digit4') this.selectHotbarSlot('wood_gate');
    else if (code === 'Digit5') this.selectHotbarSlot('berries');
    else if (code === 'KeyR') this.rotateBuild();
    else if (code === 'KeyF') this.triggerPrimaryAction();
    else if (code === 'KeyE') this.tryManualPickup();
    else if (code === 'KeyT' || code === 'Tab') {
      e.preventDefault();
      this.toggleQuickToolKind();
    } else if (code === 'Space' && this.playerGrounded) {
      this.playerVelY = 6.2;
      this.playerGrounded = false;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
  };

  private handlePointerDown = (e: PointerEvent) => {
    soundEngine.unlock();
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      this.isDraggingCamera = true;
      this.activeCameraPointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }
    if (this.phase !== 'playing') return;

    if (e.pointerType === 'touch') {
      // Touch drag directly on the 3D viewport rotates the third-person camera
      this.isDraggingCamera = true;
      this.activeCameraPointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      return;
    }

    if (e.button === 0) {
      // Request pointer lock on first canvas click for seamless third-person camera,
      // and also execute primary action!
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.renderer.domElement.requestPointerLock?.();
      }
      this.triggerPrimaryAction();
    } else if (e.button === 2) {
      this.isDraggingCamera = true;
      this.activeCameraPointerId = e.pointerId;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
    }
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.activeCameraPointerId === null || e.pointerId === this.activeCameraPointerId) {
      this.isDraggingCamera = false;
      this.activeCameraPointerId = null;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (this.phase === 'lobby' || this.phase === 'countdown') {
      if (this.isDraggingCamera && (this.activeCameraPointerId === null || e.pointerId === this.activeCameraPointerId)) {
        const dx = e.clientX - this.lastPointerX;
        this.lastPointerX = e.clientX;
        this.lobbyOrbitAngle -= dx * 0.008;
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (document.pointerLockElement === this.renderer.domElement) {
      this.camYaw -= e.movementX * 0.0032;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.0026, -0.18, 0.95);
    } else if (this.isDraggingCamera && (this.activeCameraPointerId === null || e.pointerId === this.activeCameraPointerId)) {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.camYaw -= dx * 0.0055;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0045, -0.18, 0.95);
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    this.camDistance = THREE.MathUtils.clamp(this.camDistance + e.deltaY * 0.003, 2.8, 7.2);
  };

  // ---- Core Actions ----

  private triggerPrimaryAction(): void {
    if (this.activeSlot === 'tool') {
      if (this.chopTimer <= 0) {
        this.chopTimer = 0.46;
        this.chopStrikeTriggered = false;
        soundEngine.playSwing();
      }
    } else if (
      this.activeSlot === 'campfire' ||
      this.activeSlot === 'wood_wall' ||
      this.activeSlot === 'wood_gate'
    ) {
      this.tryPlaceBuild(this.activeSlot);
    }
  }

  private executeStrikeHit(): void {
    const toolSpec = TOOL_SPECS.find((t) => t.id === this.selectedToolId) || TOOL_SPECS[0];
    const forwardX = Math.sin(this.playerYaw);
    const forwardZ = Math.cos(this.playerYaw);

    // 1. Check nearby standing trees in front arc
    let hitTree = null as WorldRefs['trees'][number] | null;
    let bestDist = 3.1;
    for (const tree of this.world.trees) {
      if (tree.state !== 'standing') continue;
      const dx = tree.x - this.playerX;
      const dz = tree.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist + tree.radius) continue;
      const dot = (dx * forwardX + dz * forwardZ) / Math.max(0.001, dist);
      if (dot > 0.25) {
        bestDist = dist;
        hitTree = tree;
      }
    }

    if (hitTree) {
      hitTree.hp -= toolSpec.woodDamage;
      hitTree.shakeTimer = 0.24;
      this.hitstopTimer = 0.045;
      this.cameraShake = 0.09;
      soundEngine.playWoodChop();

      const hitX = hitTree.x - forwardX * hitTree.radius;
      const hitZ = hitTree.z - forwardZ * hitTree.radius;
      this.spawnBurst(hitX, hitTree.y + 1.25, hitZ, '#c89b62', 12, 3.6);

      if (hitTree.hp <= 0) {
        hitTree.state = 'falling';
        hitTree.fallTimer = 0;
        hitTree.fallDirX = forwardX;
        hitTree.fallDirZ = forwardZ;
        this.treesChopped += 1;
        soundEngine.playTreeFall();
        this.showToast('Arbre abattu ! Récupérez le bois');
      }
      return;
    }

    // 2. Check boulders
    let hitBoulder = null as WorldRefs['boulders'][number] | null;
    let bestRockDist = 3.0;
    for (const b of this.world.boulders) {
      if (b.depleted) continue;
      const dx = b.x - this.playerX;
      const dz = b.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist > bestRockDist + b.radius) continue;
      const dot = (dx * forwardX + dz * forwardZ) / Math.max(0.001, dist);
      if (dot > 0.2) {
        bestRockDist = dist;
        hitBoulder = b;
      }
    }

    if (hitBoulder) {
      hitBoulder.hp -= toolSpec.stoneDamage;
      hitBoulder.shakeTimer = 0.2;
      this.hitstopTimer = 0.04;
      this.cameraShake = 0.08;
      soundEngine.playStoneHit();
      this.spawnBurst(hitBoulder.x, hitBoulder.y + 0.9, hitBoulder.z, '#c7cdd4', 10, 4.2);

      // Drop 1 stone per strike + bonus on break
      const drop = createResourcePickup(
        this.nextEntityId++,
        'stone',
        hitBoulder.hp <= 0 ? 3 : 1,
        hitBoulder.x,
        hitBoulder.z,
        this.textures,
        true,
      );
      this.scene.add(drop.mesh);
      this.world.pickups.push(drop);

      if (hitBoulder.hp <= 0) {
        hitBoulder.depleted = true;
        hitBoulder.group.visible = false;
        this.showToast('Rocher extrait (+3 Pierre)');
      }
      return;
    }

    // 3. Check wolves
    for (const wolf of this.world.wolves) {
      const dx = wolf.x - this.playerX;
      const dz = wolf.z - this.playerZ;
      const dist = Math.hypot(dx, dz);
      if (dist < 3.0) {
        wolf.hp -= 35;
        this.hitstopTimer = 0.04;
        this.cameraShake = 0.09;
        soundEngine.playWoodChop();
        this.spawnBurst(wolf.x, groundHeightAt(wolf.x, wolf.z) + 0.6, wolf.z, '#d9534f', 8, 3.5);
        wolf.state = 'flee';
        if (wolf.hp <= 0) {
          this.scene.remove(wolf.group);
          this.world.wolves = this.world.wolves.filter((w) => w.id !== wolf.id);
          this.wolvesRepelled += 1;
          this.showToast('Loup repoussé !');
        }
        return;
      }
    }
  }

  private tryManualPickup(): void {
    let picked = false;
    for (let i = this.world.pickups.length - 1; i >= 0; i--) {
      const p = this.world.pickups[i];
      if (Math.hypot(p.x - this.playerX, p.z - this.playerZ) < 2.8) {
        this.collectPickup(i);
        picked = true;
        break;
      }
    }
    if (picked) {
      this.gatherTimer = 0.35;
    }
  }

  private collectPickup(index: number): void {
    const p = this.world.pickups[index];
    this.inventory[p.kind] += p.amount;
    this.scene.remove(p.mesh);
    this.world.pickups.splice(index, 1);
    soundEngine.playPickup();
    const label = p.kind === 'wood' ? 'Bois' : p.kind === 'stone' ? 'Pierre' : 'Baies';
    this.showToast(`+${p.amount} ${label}`);
    this.emitHud(true);
  }

  private tryPlaceBuild(kind: 'campfire' | 'wood_wall' | 'wood_gate'): void {
    const cost = BUILD_COSTS[kind];
    if (this.inventory.wood < cost.wood || this.inventory.stone < cost.stone) {
      this.showToast(`Ressources insuffisantes (${cost.wood} Bois${cost.stone ? `, ${cost.stone} Pierre` : ''})`);
      return;
    }
    if (!this.canPlaceBuild) {
      this.showToast('Emplacement bloqué');
      return;
    }

    this.inventory.wood -= cost.wood;
    this.inventory.stone -= cost.stone;

    if (kind === 'campfire') {
      const fire = createCampfire(this.nextEntityId++, this.buildTargetX, this.buildTargetZ, this.textures, false);
      this.scene.add(fire.group);
      this.world.campfires.push(fire);
      this.campfiresLit += 1;
      this.showToast('Feu de camp allumé !');
    } else {
      const rotY = THREE.MathUtils.degToRad(this.buildRotationDeg) + this.playerYaw;
      const wall = createWoodWall(
        this.nextEntityId++,
        kind,
        this.buildTargetX,
        this.buildTargetZ,
        rotY,
        this.textures,
        false,
      );
      this.scene.add(wall.group);
      this.world.walls.push(wall);
      this.wallsBuilt += 1;
      this.showToast(`${cost.label} construit !`);
    }

    this.spawnBurst(this.buildTargetX, groundHeightAt(this.buildTargetX, this.buildTargetZ) + 0.3, this.buildTargetZ, '#b99f78', 10, 2.5);
    soundEngine.playBuildPlace();
    this.emitHud(true);
  }

  // ---- Particles & Ghost ----

  private spawnBurst(x: number, y: number, z: number, colorHex: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.08, 0.06, 0.14);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      this.particleGroup.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        mesh,
        vx: Math.cos(angle) * spd,
        vy: 1.8 + Math.random() * speed,
        vz: Math.sin(angle) * spd,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
        gravity: 11,
        scaleStart: 1,
        scaleEnd: 0.1,
      });
    }
  }

  private spawnFireEmber(x: number, y: number, z: number): void {
    const geo = new THREE.PlaneGeometry(0.14, 0.14);
    const mat = new THREE.MeshBasicMaterial({
      map: this.textures.particleSoft,
      color: Math.random() < 0.6 ? '#ff962b' : '#ffd25a',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.3, z + (Math.random() - 0.5) * 0.4);
    this.particleGroup.add(mesh);
    this.particles.push({
      mesh,
      vx: (Math.random() - 0.5) * 0.45,
      vy: 1.1 + Math.random() * 1.1,
      vz: (Math.random() - 0.5) * 0.45,
      life: 0,
      maxLife: 0.9 + Math.random() * 0.5,
      gravity: -0.35,
      scaleStart: 1,
      scaleEnd: 0.05,
    });
  }

  private clearGhost(): void {
    if (this.ghostWall) {
      this.scene.remove(this.ghostWall.group);
      this.ghostWall = null;
    }
    if (this.ghostCampfire) {
      this.scene.remove(this.ghostCampfire);
      this.ghostCampfire = null;
    }
    this.ghostKind = null;
  }

  private updateBuildGhost(): void {
    if (
      this.phase !== 'playing' ||
      (this.activeSlot !== 'campfire' && this.activeSlot !== 'wood_wall' && this.activeSlot !== 'wood_gate')
    ) {
      if (this.ghostKind !== null) this.clearGhost();
      return;
    }

    const dist = this.activeSlot === 'campfire' ? 2.6 : 3.2;
    this.buildTargetX = this.playerX + Math.sin(this.playerYaw) * dist;
    this.buildTargetZ = this.playerZ + Math.cos(this.playerYaw) * dist;
    const ty = groundHeightAt(this.buildTargetX, this.buildTargetZ);

    const cost = BUILD_COSTS[this.activeSlot];
    const hasRes = this.inventory.wood >= cost.wood && this.inventory.stone >= cost.stone;
    const blockedByTree = this.world.trees.some(
      (t) => t.state === 'standing' && Math.hypot(t.x - this.buildTargetX, t.z - this.buildTargetZ) < t.radius + 1.0,
    );
    const blockedByRock = this.world.boulders.some(
      (b) => !b.depleted && Math.hypot(b.x - this.buildTargetX, b.z - this.buildTargetZ) < b.radius + 0.9,
    );
    this.canPlaceBuild = hasRes && !blockedByTree && !blockedByRock;

    if (this.ghostKind !== this.activeSlot) {
      this.clearGhost();
      this.ghostKind = this.activeSlot;
      if (this.activeSlot === 'campfire') {
        const g = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.62, 0.14, 8, 16),
          new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.45 }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.14;
        g.add(ring);
        this.scene.add(g);
        this.ghostCampfire = g;
      } else {
        this.ghostWall = createWoodWall(-1, this.activeSlot, 0, 0, 0, this.textures, true);
        this.scene.add(this.ghostWall.group);
      }
    }

    const ghostColor = this.canPlaceBuild ? '#4ade80' : '#ef4444';
    if (this.ghostCampfire) {
      this.ghostCampfire.position.set(this.buildTargetX, ty, this.buildTargetZ);
      this.ghostCampfire.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(ghostColor);
        }
      });
    } else if (this.ghostWall) {
      this.ghostWall.group.position.set(this.buildTargetX, ty, this.buildTargetZ);
      this.ghostWall.group.rotation.y = THREE.MathUtils.degToRad(this.buildRotationDeg) + this.playerYaw;
      this.ghostWall.group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(ghostColor);
        }
      });
    }
  }

  // ---- Main Simulation Tick ----

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.elapsed += dt;
    this.world.grassUniforms.uTime.value = this.elapsed;

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastMessage = null;
      }
    }

    if (this.phase === 'countdown') {
      this.countdownTimer -= dt;
      const ceilSec = Math.ceil(this.countdownTimer);
      if (ceilSec < this.countdownLastBeep && ceilSec > 0) {
        this.countdownLastBeep = ceilSec;
        soundEngine.playCountdownBeep(false);
      }
      if (this.countdownTimer <= 0) {
        soundEngine.playCountdownBeep(true);
        this.phase = 'playing';
        this.companionRigs.forEach((rig) => (rig.root.visible = false));
        this.camYaw = Math.PI;
        this.playerYaw = 0;
        this.showToast('Survivez dans la forêt ! Coupez du bois avec la hache');
        this.emitHud(true);
      }
    }

    if (this.phase === 'lobby' || this.phase === 'countdown') {
      this.updateLobbyScene(dt);
    } else if (this.phase === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.updatePlaying(dt);
      }
    }

    this.updateCampfiresAndParticles(dt);
    this.updateAtmosphere(dt);
    if (this.isSoftwareGl || !this.composer) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render();
    }

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHud(false);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

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

  private updateLobbyScene(dt: number): void {
    if (!this.isDraggingCamera) {
      this.lobbyOrbitAngle += dt * 0.16;
    }

    this.playerRig.updateAnimation(dt, 'idle', 0, 0, 0, this.elapsed);
    this.companionRigs.forEach((rig, idx) => {
      rig.updateAnimation(dt, idx % 2 === 0 ? 'warm' : 'idle', 0, 0, 0, this.elapsed + idx * 1.3);
    });

    // Camera frames the local character heroically with campfire & forest behind
    const radius = 3.2;
    const cx = this.playerX + Math.sin(this.lobbyOrbitAngle) * radius;
    const cz = this.playerZ + Math.cos(this.lobbyOrbitAngle) * radius;
    const cy = this.playerY + 1.55;
    _camDesired.set(cx, cy, cz);
    _camTarget.set(this.playerX, this.playerY + 1.08, this.playerZ - 0.35);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camDesired.x, 7, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camDesired.y, 7, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camDesired.z, 7, dt);
    this.camera.lookAt(_camTarget);

    soundEngine.updateFireAmbience(0.45);
  }

  private updatePlaying(dt: number): void {
    // 1. Movement & sprint (keyboard + virtual mobile joystick merged)
    let moveF = this.virtualMoveY;
    let moveR = this.virtualMoveX;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) moveF += 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) moveF -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) moveR += 1;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) moveR -= 1;

    const moveMag = Math.hypot(moveF, moveR);
    if (moveMag > 1) {
      moveF /= moveMag;
      moveR /= moveMag;
    }

    const stickPush = Math.hypot(this.virtualMoveX, this.virtualMoveY);
    const wantsSprint =
      this.heldKeys.has('ShiftLeft') || this.heldKeys.has('ShiftRight') || stickPush > 0.84;
    const isMoving = moveMag > 0.08;
    const isSprinting = isMoving && wantsSprint && this.vitals.stamina > 4;

    if (isSprinting) {
      this.vitals.stamina = Math.max(0, this.vitals.stamina - 18 * dt);
    } else {
      this.vitals.stamina = Math.min(100, this.vitals.stamina + (isMoving ? 9 : 18) * dt);
    }

    const analogScale = isMoving ? THREE.MathUtils.clamp(moveMag, 0.45, 1) : 0;
    const baseSpeed = (isSprinting ? 7.6 : 4.5) * analogScale;
    let nextX = this.playerX;
    let nextZ = this.playerZ;

    if (isMoving) {
      // Camera forward projected onto XZ plane
      const forwardX = -Math.sin(this.camYaw);
      const forwardZ = -Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);

      let dirX = forwardX * moveF + rightX * moveR;
      let dirZ = forwardZ * moveF + rightZ * moveR;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;

      nextX += dirX * baseSpeed * dt;
      nextZ += dirZ * baseSpeed * dt;

      const targetYaw = Math.atan2(dirX, dirZ);
      // Shortest angular interpolation
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * (1 - Math.exp(-12 * dt));

      const targetRatio = (isSprinting ? 1 : 0.65) * analogScale;
      this.currentSpeedRatio = THREE.MathUtils.damp(this.currentSpeedRatio, targetRatio, 10, dt);

      if (this.playerGrounded) {
        this.footstepTimer -= dt;
        if (this.footstepTimer <= 0) {
          this.footstepTimer = isSprinting ? 0.28 : 0.42;
          soundEngine.playFootstep(isSprinting);
        }
      }
    } else {
      this.currentSpeedRatio = THREE.MathUtils.damp(this.currentSpeedRatio, 0, 12, dt);
    }

    // 2. Collision resolution (trees, boulders, walls, perimeter)
    const pRadius = 0.42;
    for (const tree of this.world.trees) {
      if (tree.state !== 'standing') continue;
      const dx = nextX - tree.x;
      const dz = nextZ - tree.z;
      const dist = Math.hypot(dx, dz);
      const minD = pRadius + tree.radius;
      if (dist < minD && dist > 0.001) {
        const push = minD - dist;
        nextX += (dx / dist) * push;
        nextZ += (dz / dist) * push;
      }
    }
    for (const b of this.world.boulders) {
      if (b.depleted) continue;
      const dx = nextX - b.x;
      const dz = nextZ - b.z;
      const dist = Math.hypot(dx, dz);
      const minD = pRadius + b.radius;
      if (dist < minD && dist > 0.001) {
        const push = minD - dist;
        nextX += (dx / dist) * push;
        nextZ += (dz / dist) * push;
      }
    }
    for (const w of this.world.walls) {
      const resolved = this.resolveWallCollision(nextX, nextZ, pRadius, w);
      nextX = resolved.x;
      nextZ = resolved.z;
    }

    // Clamp within playable forest basin
    const rFromCenter = Math.hypot(nextX, nextZ);
    if (rFromCenter > WORLD_PLAY_RADIUS) {
      nextX = (nextX / rFromCenter) * WORLD_PLAY_RADIUS;
      nextZ = (nextZ / rFromCenter) * WORLD_PLAY_RADIUS;
    }

    this.playerX = nextX;
    this.playerZ = nextZ;

    // 3. Vertical jump / ground clamping
    const groundY = groundHeightAt(this.playerX, this.playerZ);
    if (!this.playerGrounded) {
      this.playerVelY -= 18 * dt;
      this.playerY += this.playerVelY * dt;
      if (this.playerY <= groundY) {
        this.playerY = groundY;
        this.playerVelY = 0;
        this.playerGrounded = true;
      }
    } else {
      this.playerY = THREE.MathUtils.damp(this.playerY, groundY, 22, dt);
    }

    this.playerRig.root.position.set(this.playerX, this.playerY, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;

    // 4. Chop & Gather timers
    if (this.chopTimer > 0) {
      this.chopTimer -= dt;
      if (!this.chopStrikeTriggered && this.chopTimer <= 0.22) {
        this.chopStrikeTriggered = true;
        this.executeStrikeHit();
      }
    }
    if (this.gatherTimer > 0) {
      this.gatherTimer = Math.max(0, this.gatherTimer - dt);
    }

    // 5. Character procedural animation state
    let animState: CharacterAnimState = 'idle';
    if (!this.playerGrounded) animState = 'jump';
    else if (isMoving) animState = isSprinting ? 'sprint' : 'walk';
    this.playerRig.updateAnimation(
      dt,
      animState,
      this.currentSpeedRatio,
      this.chopTimer,
      this.gatherTimer,
      this.elapsed,
    );

    // 6. Update falling/shaking trees & boulders
    for (const tree of this.world.trees) {
      if (tree.shakeTimer > 0) {
        tree.shakeTimer -= dt;
        const shake = Math.sin(tree.shakeTimer * 55) * 0.04 * (tree.shakeTimer / 0.24);
        tree.trunkGroup.rotation.z = shake;
      } else if (tree.state === 'standing') {
        tree.trunkGroup.rotation.z = Math.sin(this.elapsed * 1.1 + tree.id) * 0.006;
      } else if (tree.state === 'falling') {
        tree.fallTimer += dt;
        const p = Math.min(1, tree.fallTimer / 0.9);
        const angle = p * p * (Math.PI * 0.49);
        _vec3A.set(-tree.fallDirZ, 0, tree.fallDirX).normalize();
        tree.trunkGroup.setRotationFromAxisAngle(_vec3A, angle);

        if (p >= 1) {
          tree.state = 'felled';
          tree.trunkGroup.visible = false;
          // Drop 3-4 wooden logs along fallen trunk
          for (let k = 0; k < 3; k++) {
            const distOffset = 1.6 + k * 1.5;
            const drop = createResourcePickup(
              this.nextEntityId++,
              'wood',
              2,
              tree.x + tree.fallDirX * distOffset,
              tree.z + tree.fallDirZ * distOffset,
              this.textures,
              true,
            );
            this.scene.add(drop.mesh);
            this.world.pickups.push(drop);
          }
          this.spawnBurst(
            tree.x + tree.fallDirX * 3.0,
            tree.y + 0.4,
            tree.z + tree.fallDirZ * 3.0,
            '#5e4a32',
            14,
            4.0,
          );
        }
      }
    }

    for (const b of this.world.boulders) {
      if (b.shakeTimer > 0) {
        b.shakeTimer -= dt;
        b.group.position.x = b.x + Math.sin(b.shakeTimer * 60) * 0.05;
      } else {
        b.group.position.x = b.x;
      }
    }

    // 7. Resource pickups physics & auto-magnetize
    for (let i = this.world.pickups.length - 1; i >= 0; i--) {
      const p = this.world.pickups[i];
      p.age += dt;
      if (!p.settled) {
        p.vy -= 12 * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const gy = groundHeightAt(p.x, p.z) + 0.05;
        let nextPy = p.mesh.position.y + p.vy * dt;
        if (nextPy <= gy) {
          nextPy = gy;
          p.settled = true;
        }
        p.baseY = gy;
        p.mesh.position.set(p.x, nextPy, p.z);
      } else {
        p.mesh.position.y = p.baseY + Math.sin(this.elapsed * 2.4 + p.id) * 0.05;
        p.mesh.rotation.y += dt * 0.8;
      }

      const distToPlayer = Math.hypot(p.x - this.playerX, p.z - this.playerZ);
      if (distToPlayer < 1.35 && p.age > 0.35) {
        this.collectPickup(i);
      }
    }

    // 8. Survival Vitals (Hunger, Warmth near fire, Health)
    this.vitals.hunger = Math.max(0, this.vitals.hunger - 0.35 * dt);

    let nearestFireDist = 999;
    for (const f of this.world.campfires) {
      const d = Math.hypot(f.x - this.playerX, f.z - this.playerZ);
      if (d < nearestFireDist) nearestFireDist = d;
    }
    const nearFire = nearestFireDist < 6.5;
    const isColdPeriod = this.timeOfDay > 0.52 && this.timeOfDay < 0.96;

    if (nearFire) {
      this.vitals.warmth = Math.min(100, this.vitals.warmth + 14 * dt);
      soundEngine.updateFireAmbience(Math.max(0, 1 - nearestFireDist / 8));
    } else {
      const drain = isColdPeriod ? 2.4 : 0.35;
      this.vitals.warmth = Math.max(0, this.vitals.warmth - drain * dt);
      soundEngine.updateFireAmbience(0);
    }

    if (this.vitals.hunger <= 0 || this.vitals.warmth <= 0) {
      this.vitals.health = Math.max(0, this.vitals.health - 2.2 * dt);
    } else if (this.vitals.hunger > 50 && this.vitals.warmth > 50) {
      this.vitals.health = Math.min(100, this.vitals.health + 0.8 * dt);
    }

    if (this.vitals.health <= 0) {
      this.phase = 'gameover';
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
      this.emitHud(true);
      return;
    }

    // 9. Nighttime wolves (rewarding wooden walls & campfires!)
    this.updateWolves(dt, isColdPeriod);

    // 10. Build ghost & Third-person camera update
    this.updateBuildGhost();
    this.updateThirdPersonCamera(dt);
  }

  private resolveWallCollision(
    px: number,
    pz: number,
    radius: number,
    wall: WoodWallEntity,
  ): { x: number; z: number } {
    const dx = px - wall.x;
    const dz = pz - wall.z;
    const cos = Math.cos(-wall.rotationY);
    const sin = Math.sin(-wall.rotationY);
    // Transform into wall local space
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;

    const clampX = THREE.MathUtils.clamp(lx, -wall.halfWidth, wall.halfWidth);
    const clampZ = THREE.MathUtils.clamp(lz, -wall.halfDepth, wall.halfDepth);

    const distX = lx - clampX;
    const distZ = lz - clampZ;
    const distSq = distX * distX + distZ * distZ;

    if (distSq < radius * radius && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      const push = radius - dist;
      const nx = distX / dist;
      const nz = distZ / dist;
      // Push out in local space, then rotate back to world space
      const worldCos = Math.cos(wall.rotationY);
      const worldSin = Math.sin(wall.rotationY);
      const wx = nx * worldCos - nz * worldSin;
      const wz = nx * worldSin + nz * worldCos;
      return { x: px + wx * push, z: pz + wz * push };
    }
    return { x: px, z: pz };
  }

  private updateWolves(dt: number, isNightOrDusk: boolean): void {
    this.wolfSpawnTimer -= dt;
    const maxWolves = isNightOrDusk ? 3 : 1;
    if (this.wolfSpawnTimer <= 0 && this.world.wolves.length < maxWolves) {
      this.wolfSpawnTimer = isNightOrDusk ? 16 : 32;
      const angle = Math.random() * Math.PI * 2;
      const r = 34 + Math.random() * 14;
      const wolf = createWolfEntity(Math.cos(angle) * r, Math.sin(angle) * r);
      this.scene.add(wolf.group);
      this.world.wolves.push(wolf);
      if (isNightOrDusk) {
        soundEngine.playWolfGrowl();
        this.showToast('Un loup rôde ! Abritez-vous derrière vos murs ou près du feu');
      }
    }

    for (const wolf of this.world.wolves) {
      if (wolf.attackCooldown > 0) wolf.attackCooldown -= dt;

      const dx = this.playerX - wolf.x;
      const dz = this.playerZ - wolf.z;
      const distToPlayer = Math.hypot(dx, dz);

      // Campfires repel wolves when close to the firelight!
      let nearBrightFire = false;
      for (const f of this.world.campfires) {
        if (Math.hypot(wolf.x - f.x, wolf.z - f.z) < 5.2) {
          nearBrightFire = true;
          break;
        }
      }

      if (nearBrightFire) {
        wolf.state = 'flee';
      } else if (distToPlayer < 22 && wolf.state !== 'flee') {
        wolf.state = 'chase';
      } else if (distToPlayer > 30 && wolf.state === 'flee') {
        wolf.state = 'prowl';
      }

      let moveAngle = wolf.rotY;
      let speed = 2.2;
      if (wolf.state === 'chase') {
        moveAngle = Math.atan2(dx, dz);
        speed = 4.3;
      } else if (wolf.state === 'flee') {
        moveAngle = Math.atan2(-dx, -dz);
        speed = 5.4;
      } else {
        moveAngle += Math.sin(this.elapsed * 0.5 + wolf.id) * 0.6 * dt;
      }

      let nx = wolf.x + Math.sin(moveAngle) * speed * dt;
      let nz = wolf.z + Math.cos(moveAngle) * speed * dt;

      // Wolves are blocked by player's wooden walls!
      for (const w of this.world.walls) {
        const res = this.resolveWallCollision(nx, nz, 0.58, w);
        if (Math.hypot(res.x - nx, res.z - nz) > 0.01) {
          // Wolf claws at the wall if chasing, unable to pass!
          if (wolf.state === 'chase' && wolf.attackCooldown <= 0) {
            wolf.attackCooldown = 1.6;
            w.hp = Math.max(20, w.hp - 8);
            soundEngine.playWoodChop();
          }
          nx = res.x;
          nz = res.z;
        }
      }

      wolf.x = nx;
      wolf.z = nz;
      wolf.rotY = moveAngle;
      wolf.group.position.set(wolf.x, groundHeightAt(wolf.x, wolf.z), wolf.z);
      wolf.group.rotation.y = wolf.rotY;

      wolf.walkPhase += dt * speed * 3.1;
      const swing = Math.sin(wolf.walkPhase) * 0.55;
      wolf.legs[0].rotation.x = swing;
      wolf.legs[1].rotation.x = -swing;
      wolf.legs[2].rotation.x = -swing;
      wolf.legs[3].rotation.x = swing;

      if (wolf.state === 'chase' && distToPlayer < 1.65 && wolf.attackCooldown <= 0) {
        wolf.attackCooldown = 1.4;
        this.vitals.health = Math.max(0, this.vitals.health - 12);
        this.cameraShake = 0.16;
        soundEngine.playWolfGrowl();
        this.showToast('Mordu par un loup ! (-12 Santé)');
      }
    }
  }

  private updateThirdPersonCamera(dt: number): void {
    // Over-the-right-shoulder third-person framing showing full survivor from boots to head
    const horizDist = Math.cos(this.camPitch) * this.camDistance;
    const vertOffset = Math.sin(this.camPitch) * this.camDistance + 1.5;
    const shoulderOffset = 0.28;
    const rightX = Math.cos(this.camYaw) * shoulderOffset;
    const rightZ = -Math.sin(this.camYaw) * shoulderOffset;

    const desiredX = this.playerX + Math.sin(this.camYaw) * horizDist + rightX;
    const desiredZ = this.playerZ + Math.cos(this.camYaw) * horizDist + rightZ;
    const terrainFloorAtCam = groundHeightAt(desiredX, desiredZ) + 0.55;
    const desiredY = Math.max(terrainFloorAtCam, this.playerY + vertOffset);

    _camDesired.set(desiredX, desiredY, desiredZ);
    _camTarget.set(this.playerX + rightX * 0.65, this.playerY + 1.22, this.playerZ + rightZ * 0.65);

    if (this.cameraShake > 0.001) {
      _camDesired.x += (Math.random() - 0.5) * this.cameraShake;
      _camDesired.y += (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake *= Math.exp(-14 * dt);
    }

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camDesired.x, 14, dt);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camDesired.y, 14, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camDesired.z, 14, dt);
    this.camera.lookAt(_camTarget);

    // Keep key directional shadow frustum centered around player for crisp shadows everywhere
    this.sunLight.target.position.set(this.playerX, this.playerY, this.playerZ);
    this.sunLight.position.set(
      this.playerX + _vec3B.x,
      this.playerY + _vec3B.y,
      this.playerZ + _vec3B.z,
    );
  }

  private updateCampfiresAndParticles(dt: number): void {
    this.fireParticleTimer += dt;
    const spawnEmberThisFrame = this.fireParticleTimer >= 0.08;
    if (spawnEmberThisFrame) this.fireParticleTimer = 0;

    for (const f of this.world.campfires) {
      f.light.intensity = 4.6 + Math.sin(this.elapsed * 13 + f.id) * 0.8 + Math.cos(this.elapsed * 21) * 0.45;
      f.flames.forEach((fl, idx) => {
        const s = 0.85 + Math.sin(this.elapsed * (11 + idx * 3) + idx) * 0.22;
        fl.scale.set(0.9 + idx * 0.05, s, 0.9);
        fl.rotation.z = Math.sin(this.elapsed * 9 + idx * 2) * 0.14;
      });
      if (spawnEmberThisFrame && Math.hypot(f.x - this.playerX, f.z - this.playerZ) < 28) {
        this.spawnFireEmber(f.x, f.y, f.z);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life += dt;
      if (pt.life >= pt.maxLife) {
        this.particleGroup.remove(pt.mesh);
        pt.mesh.geometry.dispose();
        (pt.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      pt.vy -= pt.gravity * dt;
      pt.mesh.position.x += pt.vx * dt;
      pt.mesh.position.y += pt.vy * dt;
      pt.mesh.position.z += pt.vz * dt;
      pt.mesh.lookAt(this.camera.position);
      const t = pt.life / pt.maxLife;
      const sc = THREE.MathUtils.lerp(pt.scaleStart, pt.scaleEnd, t);
      pt.mesh.scale.setScalar(sc);
      const mat = pt.mesh.material as THREE.MeshBasicMaterial;
      if (mat.transparent) mat.opacity = 1 - t;
    }
  }

  private updateAtmosphere(dt: number): void {
    // Full day cycle = ~200 seconds in playing mode; golden afternoon fixed in lobby
    if (this.phase === 'playing') {
      this.timeOfDay += dt / 200;
      if (this.timeOfDay >= 1) {
        this.timeOfDay -= 1;
        this.dayNumber += 1;
        this.showToast(`Jour ${this.dayNumber} — L'aube se lève`);
      }
    }

    // Sun elevation angle (0.25 = high noon, 0.55 = sunset, 0.75 = midnight)
    const sunAngle = (this.timeOfDay - 0.05) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle);
    const sunHoriz = Math.cos(sunAngle);

    _vec3B.set(sunHoriz * 42, Math.max(4, sunElev * 48), 22);
    if (this.phase !== 'playing') {
      this.sunLight.position.copy(_vec3B);
      this.sunLight.target.position.set(0, 0, 0);
    }

    // Color & intensity blending across day -> golden dusk -> deep night
    const dayFactor = THREE.MathUtils.clamp((sunElev + 0.15) / 0.65, 0, 1);
    const duskFactor = THREE.MathUtils.clamp(1 - Math.abs(sunElev - 0.08) * 4.5, 0, 1);

    _sunColor.set('#fff3d9').lerp(_tmpColor.set('#ff8f4a'), duskFactor * 0.85);
    if (dayFactor < 0.15) _sunColor.lerp(_tmpColor.set('#4c6b9c'), 1 - dayFactor / 0.15);
    this.sunLight.color.copy(_sunColor);
    this.sunLight.intensity = 0.42 + dayFactor * 1.95;

    this.hemiLight.intensity = 0.28 + dayFactor * 0.56;

    _skyColor.set('#131b26').lerp(_tmpColor.set('#8aa49e'), dayFactor);
    _skyColor.lerp(_tmpColor.set('#be7a58'), duskFactor * 0.48);

    _fogColor.copy(_skyColor).multiplyScalar(0.92);
    (this.scene.background as THREE.Color).copy(_fogColor);
    (this.scene.fog as THREE.FogExp2).color.copy(_fogColor);
    (this.scene.fog as THREE.FogExp2).density = 0.0135 + (1 - dayFactor) * 0.008;

    this.skyUniforms.uSunDir.value.copy(_vec3B).normalize();
    this.skyUniforms.uDayFactor.value = dayFactor;
    this.skyUniforms.uDuskFactor.value = duskFactor;
    this.skyUniforms.uTime.value = this.elapsed;

    this.world.sunbeamsGroup.visible = dayFactor > 0.25;
    this.dustPoints.position.set(this.playerX, 0, this.playerZ);
    this.dustPoints.rotation.y = this.elapsed * 0.02;
    this.dustPoints.visible = dayFactor > 0.2;
  }

  private getContextualPrompt(): { text: string | null; subtext: string | null } {
    if (this.phase !== 'playing') return { text: null, subtext: null };

    if (this.activeSlot !== 'tool') {
      const label = BUILD_COSTS[this.activeSlot as 'campfire' | 'wood_wall' | 'wood_gate'].label;
      return {
        text: `[Clic gauche] Construire : ${label}`,
        subtext: '[R] Pivoter · [1] Revenir à l’outil',
      };
    }

    // Nearby pickups
    for (const p of this.world.pickups) {
      if (Math.hypot(p.x - this.playerX, p.z - this.playerZ) < 2.5) {
        const name = p.kind === 'wood' ? 'Bois' : p.kind === 'stone' ? 'Pierre' : 'Baies sauvages';
        return { text: `[E] Ramasser ${name} (+${p.amount})`, subtext: null };
      }
    }

    // Nearby trees
    for (const t of this.world.trees) {
      if (t.state === 'standing' && Math.hypot(t.x - this.playerX, t.z - this.playerZ) < 2.9 + t.radius) {
        const name = t.kind === 'pine' ? 'Sapin' : 'Bouleau';
        return {
          text: `[Clic / F] Couper le ${name} (${Math.max(0, Math.round(t.hp))}%)`,
          subtext: this.selectedToolId.startsWith('pickaxe') ? 'Astuce : [Tab] pour équiper la Hache' : null,
        };
      }
    }

    // Nearby boulders
    for (const b of this.world.boulders) {
      if (!b.depleted && Math.hypot(b.x - this.playerX, b.z - this.playerZ) < 2.8 + b.radius) {
        return {
          text: `[Clic / F] Miner le rocher (${Math.max(0, Math.round(b.hp))}%)`,
          subtext: this.selectedToolId.startsWith('axe') ? 'Astuce : [Tab] pour équiper la Pioche' : null,
        };
      }
    }

    return { text: null, subtext: null };
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    this.toastTimer = 2.8;
  }

  private emitHud(force: boolean): void {
    if (!force && this.disposed) return;
    const prompt = this.getContextualPrompt();

    let nearFire = false;
    for (const f of this.world.campfires) {
      if (Math.hypot(f.x - this.playerX, f.z - this.playerZ) < 6.5) {
        nearFire = true;
        break;
      }
    }

    let timeLabel = 'Jour';
    if (this.timeOfDay > 0.45 && this.timeOfDay <= 0.58) timeLabel = 'Crépuscule';
    else if (this.timeOfDay > 0.58 && this.timeOfDay <= 0.92) timeLabel = 'Nuit';
    else if (this.timeOfDay > 0.92 || this.timeOfDay <= 0.12) timeLabel = 'Aube';

    this.onHudUpdate({
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.countdownTimer)),
      vitals: { ...this.vitals },
      inventory: { ...this.inventory },
      activeSlot: this.activeSlot,
      dayNumber: this.dayNumber,
      timeOfDay: this.timeOfDay,
      timeLabel,
      promptText: prompt.text,
      promptSubtext: prompt.subtext,
      nearFire,
      treesChopped: this.treesChopped,
      wallsBuilt: this.wallsBuilt,
      campfiresLit: this.campfiresLit,
      wolvesRepelled: this.wolvesRepelled,
      buildRotationDeg: this.buildRotationDeg,
      canPlaceBuild: this.canPlaceBuild,
      toastMessage: this.toastMessage,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();

    this.playerRig.dispose();
    this.companionRigs.forEach((r) => r.dispose());
    this.textures.dispose();
    this.world.disposables.forEach((d) => d.dispose());
    this.particles.forEach((pt) => {
      pt.mesh.geometry.dispose();
      (pt.mesh.material as THREE.Material).dispose();
    });

    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
