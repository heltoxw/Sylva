import * as THREE from 'three';
import { fbm2D, groundHeightAt, TERRAIN_SIZE, terrainSurfaceInfo, WORLD_PLAY_RADIUS } from './terrain';
import { ProceduralTextureSet } from './textures';

export interface InteractiveTree {
  id: number;
  kind: 'pine' | 'birch';
  group: THREE.Group;
  trunkGroup: THREE.Group;
  stumpMesh: THREE.Mesh;
  hitFlashMeshes: THREE.Mesh[];
  x: number;
  z: number;
  y: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  state: 'standing' | 'falling' | 'felled';
  fallTimer: number;
  fallDirX: number;
  fallDirZ: number;
  shakeTimer: number;
}

export interface InteractiveBoulder {
  id: number;
  group: THREE.Group;
  x: number;
  z: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  depleted: boolean;
  shakeTimer: number;
}

export interface ResourcePickup {
  id: number;
  kind: 'wood' | 'stone' | 'berries';
  amount: number;
  mesh: THREE.Group;
  x: number;
  z: number;
  baseY: number;
  vx: number;
  vy: number;
  vz: number;
  settled: boolean;
  age: number;
}

export interface CampfireEntity {
  id: number;
  group: THREE.Group;
  x: number;
  z: number;
  y: number;
  light: THREE.PointLight;
  flames: THREE.Mesh[];
  fuelTimer: number;
  isStarter: boolean;
}

export interface WoodWallEntity {
  id: number;
  kind: 'wood_wall' | 'wood_gate';
  group: THREE.Group;
  x: number;
  z: number;
  y: number;
  rotationY: number;
  halfWidth: number;
  halfDepth: number;
  hp: number;
  maxHp: number;
}

export interface WolfEntity {
  id: number;
  group: THREE.Group;
  legs: THREE.Group[];
  head: THREE.Group;
  x: number;
  z: number;
  rotY: number;
  hp: number;
  state: 'prowl' | 'chase' | 'flee';
  attackCooldown: number;
  walkPhase: number;
}

export interface WorldRefs {
  terrainMesh: THREE.Mesh;
  grassUniforms: { uTime: { value: number } };
  sunbeamsGroup: THREE.Group;
  trees: InteractiveTree[];
  boulders: InteractiveBoulder[];
  pickups: ResourcePickup[];
  campfires: CampfireEntity[];
  walls: WoodWallEntity[];
  wolves: WolfEntity[];
  disposables: Array<{ dispose: () => void }>;
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createCrossedTuftGeometry(width: number, height: number): THREE.BufferGeometry {
  // Two crossed vertical quads at 60deg for volumetric grass/foliage tufts
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const angles = [0, Math.PI / 3, (Math.PI * 2) / 3];
  angles.forEach((ang, idx) => {
    const hw = width * 0.5;
    const dx = Math.cos(ang) * hw;
    const dz = Math.sin(ang) * hw;
    const nx = -Math.sin(ang);
    const nz = Math.cos(ang);
    const base = idx * 4;

    positions.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    normals.push(nx, 0.35, nz, nx, 0.35, nz, nx, 0.35, nz, nx, 0.35, nz);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createFernRosetteGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const frondCount = 5;
  for (let i = 0; i < frondCount; i++) {
    const yaw = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.25;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const w = 0.22;
    const len = 0.85;
    const midH = 0.36;
    const tipH = 0.22;

    const base = i * 6;
    const addPt = (lx: number, ly: number, lz: number, u: number, v: number) => {
      positions.push(lx * cos - lz * sin, ly, lx * sin + lz * cos);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    };

    addPt(-w, 0.02, 0.05, 0, 0);
    addPt(w, 0.02, 0.05, 1, 0);
    addPt(-w, midH, len * 0.5, 0, 0.5);
    addPt(w, midH, len * 0.5, 1, 0.5);
    addPt(-w * 0.65, tipH, len, 0, 1);
    addPt(w * 0.65, tipH, len, 1, 1);

    indices.push(
      base,
      base + 1,
      base + 3,
      base,
      base + 3,
      base + 2,
      base + 2,
      base + 3,
      base + 5,
      base + 2,
      base + 5,
      base + 4,
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildTerrainMesh(textures: ProceduralTextureSet): THREE.Mesh {
  const segs = 150;
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDirt = new THREE.Color('#5b4936');
  const cMoss = new THREE.Color('#435b2c');
  const cForest = new THREE.Color('#354326');
  const cRock = new THREE.Color('#535652');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const info = terrainSurfaceInfo(x, z);
    pos.setY(i, info.height);

    tmp.copy(cForest);
    tmp.lerp(cMoss, info.mossFactor * 0.78);
    tmp.lerp(cDirt, info.pathFactor * 0.85);
    if (info.slope > 0.35) {
      tmp.lerp(cRock, Math.min(1, (info.slope - 0.35) * 1.45));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: textures.groundAlbedo,
    normalMap: textures.groundNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: textures.groundRoughness,
    roughness: 0.9,
    metalness: 0.03,
    vertexColors: true,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildInstancedFoliageAndPerimeter(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  rand: () => number,
): {
  grassUniforms: { uTime: { value: number } };
  disposables: Array<{ dispose: () => void }>;
} {
  const disposables: Array<{ dispose: () => void }> = [];
  const grassUniforms = { uTime: { value: 0 } };

  // 1. Alpha-Cutout Crossed Grass Tufts (5,500 instances with wind sway)
  const tuftGeo = createCrossedTuftGeometry(0.68, 0.56);
  const grassMat = new THREE.MeshStandardMaterial({
    map: textures.grassTuftAlpha,
    alphaTest: 0.38,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassUniforms.uTime;
    shader.vertexShader =
      `uniform float uTime;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float hFactor = clamp(position.y / 0.56, 0.0, 1.0);
         vec4 instPos = vec4(0.0, 0.0, 0.0, 1.0);
         #ifdef USE_INSTANCING
           instPos = instanceMatrix * instPos;
         #endif
         float gust = sin(uTime * 1.9 + instPos.x * 0.25 + instPos.z * 0.22) * 0.14
                    + cos(uTime * 3.3 + instPos.z * 0.45) * 0.045;
         transformed.x += gust * hFactor * hFactor;
         transformed.z += gust * 0.45 * hFactor * hFactor;`,
      );
  };

  const grassCount = 5500;
  const grassMesh = new THREE.InstancedMesh(tuftGeo, grassMat, grassCount);
  grassMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;
  while (placed < grassCount && attempts < grassCount * 3) {
    attempts++;
    const r = 3.8 + Math.sqrt(rand()) * (WORLD_PLAY_RADIUS + 4);
    const theta = rand() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const info = terrainSurfaceInfo(x, z);
    if (info.pathFactor > 0.72 && rand() < 0.78) continue;

    dummy.position.set(x, info.height - 0.04, z);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    const s = 0.72 + rand() * 0.88;
    dummy.scale.set(s, 0.78 + rand() * 0.65, s);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(placed, dummy.matrix);

    // Natural olive-emerald grass tint variation
    color.setHSL(0.21 + rand() * 0.07, 0.3 + rand() * 0.2, 0.75 + rand() * 0.35);
    grassMesh.setColorAt(placed, color);
    placed++;
  }
  grassMesh.count = placed;
  grassMesh.instanceMatrix.needsUpdate = true;
  if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  grassMesh.computeBoundingSphere();
  scene.add(grassMesh);
  disposables.push(tuftGeo, grassMat);

  // 2. Alpha-Cutout Multi-Frond Fern Rosettes (550 instances)
  const fernGeo = createFernRosetteGeometry();
  const fernMat = new THREE.MeshStandardMaterial({
    map: textures.fernFrondAlpha,
    alphaTest: 0.38,
    roughness: 0.76,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  fernMat.onBeforeCompile = grassMat.onBeforeCompile;

  const fernCount = 550;
  const fernMesh = new THREE.InstancedMesh(fernGeo, fernMat, fernCount);
  fernMesh.castShadow = true;
  fernMesh.receiveShadow = true;

  for (let i = 0; i < fernCount; i++) {
    const r = 6 + Math.sqrt(rand()) * (WORLD_PLAY_RADIUS - 2);
    const theta = rand() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = groundHeightAt(x, z);
    dummy.position.set(x, y - 0.02, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    const s = 0.75 + rand() * 0.85;
    dummy.scale.set(s, s * (0.85 + rand() * 0.35), s);
    dummy.updateMatrix();
    fernMesh.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.24 + rand() * 0.05, 0.32, 0.72 + rand() * 0.32);
    fernMesh.setColorAt(i, color);
  }
  fernMesh.instanceMatrix.needsUpdate = true;
  if (fernMesh.instanceColor) fernMesh.instanceColor.needsUpdate = true;
  fernMesh.computeBoundingSphere();
  scene.add(fernMesh);
  disposables.push(fernGeo, fernMat);

  // 3. Instanced Dense Perimeter Conifer Forest (240 realistic multi-tier needle pines)
  const perimCount = 240;
  const pTrunkGeo = new THREE.CylinderGeometry(0.18, 0.44, 11.5, 8);
  pTrunkGeo.translate(0, 5.75, 0);
  const pTrunkMat = new THREE.MeshStandardMaterial({
    map: textures.pineBarkAlbedo,
    normalMap: textures.pineBarkNormal,
    roughness: 0.92,
    metalness: 0.02,
  });

  // Crossed pine-needle foliage crown geometry for perimeter trees (no solid cones!)
  const pCrownGeo = createCrossedTuftGeometry(5.6, 8.8);
  pCrownGeo.translate(0, 3.2, 0);
  const pCrownMat = new THREE.MeshStandardMaterial({
    map: textures.pineBranchAlpha,
    alphaTest: 0.36,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const pTrunks = new THREE.InstancedMesh(pTrunkGeo, pTrunkMat, perimCount);
  const pCanopies = new THREE.InstancedMesh(pCrownGeo, pCrownMat, perimCount);
  pTrunks.receiveShadow = true;

  for (let i = 0; i < perimCount; i++) {
    const r = 56 + rand() * 44;
    const theta = (i / perimCount) * Math.PI * 2 + (rand() - 0.5) * 0.18;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = groundHeightAt(x, z);
    const s = 0.9 + rand() * 0.85;
    dummy.position.set(x, y - 0.3, z);
    dummy.rotation.set((rand() - 0.5) * 0.04, rand() * Math.PI * 2, (rand() - 0.5) * 0.04);
    dummy.scale.set(s, s * (0.95 + rand() * 0.45), s);
    dummy.updateMatrix();
    pTrunks.setMatrixAt(i, dummy.matrix);
    pCanopies.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.26 + rand() * 0.05, 0.25 + rand() * 0.15, 0.65 + rand() * 0.3);
    pCanopies.setColorAt(i, color);
  }
  pTrunks.instanceMatrix.needsUpdate = true;
  pCanopies.instanceMatrix.needsUpdate = true;
  if (pCanopies.instanceColor) pCanopies.instanceColor.needsUpdate = true;
  pTrunks.computeBoundingSphere();
  pCanopies.computeBoundingSphere();
  scene.add(pTrunks, pCanopies);
  disposables.push(pTrunkGeo, pTrunkMat, pCrownGeo, pCrownMat);

  // 4. Scattered Ground Rocks/Pebbles
  const pebbleGeo = new THREE.IcosahedronGeometry(0.18, 1);
  const pebbleMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    normalMap: textures.rockNormal,
    roughness: 0.88,
    metalness: 0.04,
  });
  const pebbleCount = 260;
  const pebbleMesh = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
  pebbleMesh.receiveShadow = true;
  for (let i = 0; i < pebbleCount; i++) {
    const r = 3.5 + Math.sqrt(rand()) * (WORLD_PLAY_RADIUS - 2);
    const theta = rand() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = groundHeightAt(x, z);
    dummy.position.set(x, y + 0.02, z);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    dummy.scale.set(0.6 + rand() * 1.4, 0.35 + rand() * 0.5, 0.6 + rand() * 1.3);
    dummy.updateMatrix();
    pebbleMesh.setMatrixAt(i, dummy.matrix);
  }
  pebbleMesh.instanceMatrix.needsUpdate = true;
  pebbleMesh.computeBoundingSphere();
  scene.add(pebbleMesh);
  disposables.push(pebbleGeo, pebbleMat);

  return { grassUniforms, disposables };
}

export function createCompositeTree(
  id: number,
  kind: 'pine' | 'birch',
  x: number,
  z: number,
  scale: number,
  textures: ProceduralTextureSet,
  rand: () => number,
): InteractiveTree {
  const y = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const trunkGroup = new THREE.Group();
  group.add(trunkGroup);

  const barkMat = new THREE.MeshStandardMaterial({
    map: kind === 'pine' ? textures.pineBarkAlbedo : textures.birchBarkAlbedo,
    normalMap: textures.pineBarkNormal,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.92,
    metalness: 0.02,
  });
  const woodEndMat = new THREE.MeshStandardMaterial({
    map: textures.woodEndAlbedo,
    roughness: 0.85,
  });

  // Grounded stump (stays visible after chopping)
  const stumpGeo = new THREE.CylinderGeometry(0.28 * scale, 0.42 * scale, 0.56 * scale, 11);
  stumpGeo.translate(0, 0.27 * scale, 0);
  const stumpMesh = new THREE.Mesh(stumpGeo, [barkMat, woodEndMat, barkMat]);
  stumpMesh.castShadow = true;
  stumpMesh.receiveShadow = true;
  group.add(stumpMesh);

  // Flared organic roots
  for (let r = 0; r < 4; r++) {
    const angle = (r / 4) * Math.PI * 2 + rand() * 0.45;
    const rootCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * 0.16 * scale, 0.42 * scale, Math.sin(angle) * 0.16 * scale),
      new THREE.Vector3(Math.cos(angle) * 0.48 * scale, 0.12 * scale, Math.sin(angle) * 0.48 * scale),
      new THREE.Vector3(Math.cos(angle) * 0.72 * scale, -0.05 * scale, Math.sin(angle) * 0.72 * scale),
    ]);
    const rootMesh = new THREE.Mesh(new THREE.TubeGeometry(rootCurve, 6, 0.1 * scale, 6, false), barkMat);
    rootMesh.castShadow = true;
    rootMesh.receiveShadow = true;
    group.add(rootMesh);
  }

  const hitFlashMeshes: THREE.Mesh[] = [];

  if (kind === 'pine') {
    // Realistic tall pine trunk with slight organic bend + radiating boughs & alpha-cutout pine needle sprays!
    const trunkH = 10.6 * scale;
    const leanX = (rand() - 0.5) * 0.35 * scale;
    const leanZ = (rand() - 0.5) * 0.35 * scale;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.45 * scale, 0),
      new THREE.Vector3(leanX * 0.35, trunkH * 0.45, leanZ * 0.35),
      new THREE.Vector3(leanX, trunkH, leanZ),
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 10, 0.24 * scale, 9, false);
    // Taper trunk smoothly upward
    const tPos = trunkGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const py = tPos.getY(i);
      const t = Math.max(0, Math.min(1, py / trunkH));
      const taper = 1.15 - t * 0.72;
      const center = trunkCurve.getPoint(t);
      tPos.setXYZ(
        i,
        center.x + (tPos.getX(i) - center.x) * taper,
        py,
        center.z + (tPos.getZ(i) - center.z) * taper,
      );
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunkGroup.add(trunk);
    hitFlashMeshes.push(trunk);

    const needleMat = new THREE.MeshStandardMaterial({
      map: textures.pineBranchAlpha,
      alphaTest: 0.38,
      roughness: 0.8,
      metalness: 0.02,
      side: THREE.DoubleSide,
      color: new THREE.Color().setHSL(0.26 + rand() * 0.04, 0.2, 0.85 + rand() * 0.2),
    });

    // 18 radiating bough sprays from 2.6m up to crown apex
    const sprayGeo = new THREE.PlaneGeometry(2.35 * scale, 2.35 * scale);
    sprayGeo.translate(0, 1.08 * scale, 0);
    const tierCount = 16;
    for (let t = 0; t < tierCount; t++) {
      const frac = t / (tierCount - 1);
      const yPos = (2.6 + frac * 7.6) * scale;
      const centerPt = trunkCurve.getPoint(Math.min(1, yPos / trunkH));
      const tierRadius = (1 - frac * 0.76) * 1.12;
      const branchesInTier = t > 12 ? 2 : 3;

      for (let b = 0; b < branchesInTier; b++) {
        const yaw = (b / branchesInTier) * Math.PI * 2 + t * 1.1 + rand() * 0.4;
        const boughGroup = new THREE.Group();
        boughGroup.position.copy(centerPt);
        boughGroup.rotation.y = yaw;

        // Small woody branch limb
        const limb = new THREE.Mesh(
          new THREE.CylinderGeometry(0.022 * scale, 0.045 * scale, 1.35 * tierRadius * scale, 5),
          barkMat,
        );
        limb.rotation.z = -Math.PI * 0.38;
        limb.position.set(0.65 * tierRadius * scale, -0.15 * scale, 0);
        boughGroup.add(limb);

        // Two crossed needle branch cards angled naturally outward & slightly drooping
        const cardA = new THREE.Mesh(sprayGeo, needleMat);
        cardA.scale.set(tierRadius, tierRadius, 1);
        cardA.rotation.z = -Math.PI * 0.42;
        cardA.rotation.x = 0.22;
        cardA.castShadow = true;
        cardA.receiveShadow = true;
        boughGroup.add(cardA);

        const cardB = new THREE.Mesh(sprayGeo, needleMat);
        cardB.scale.set(tierRadius, tierRadius, 1);
        cardB.rotation.z = -Math.PI * 0.42;
        cardB.rotation.x = -0.35;
        cardB.rotation.y = 0.65;
        cardB.castShadow = true;
        boughGroup.add(cardB);

        trunkGroup.add(boughGroup);
      }
    }
  } else {
    // Deciduous / Birch woodland tree with curved main trunk, forked limbs & leafy sprays (IMG_0252)
    const trunkH = 6.8 * scale;
    const bendX = (rand() - 0.5) * 0.55 * scale;
    const bendZ = (rand() - 0.5) * 0.55 * scale;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.4 * scale, 0),
      new THREE.Vector3(bendX * 0.4, trunkH * 0.5, bendZ * 0.4),
      new THREE.Vector3(bendX, trunkH, bendZ),
    ]);
    const trunkGeo = new THREE.TubeGeometry(trunkCurve, 9, 0.21 * scale, 9, false);
    const tPos = trunkGeo.attributes.position;
    for (let i = 0; i < tPos.count; i++) {
      const py = tPos.getY(i);
      const t = Math.max(0, Math.min(1, py / trunkH));
      const taper = 1.15 - t * 0.65;
      const center = trunkCurve.getPoint(t);
      tPos.setXYZ(
        i,
        center.x + (tPos.getX(i) - center.x) * taper,
        py,
        center.z + (tPos.getZ(i) - center.z) * taper,
      );
    }
    trunkGeo.computeVertexNormals();
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunkGroup.add(trunk);
    hitFlashMeshes.push(trunk);

    const leafMat = new THREE.MeshStandardMaterial({
      map: textures.leafBranchAlpha,
      alphaTest: 0.36,
      roughness: 0.78,
      metalness: 0.02,
      side: THREE.DoubleSide,
      color: new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.22, 0.88 + rand() * 0.2),
    });

    const leafCardGeo = new THREE.PlaneGeometry(2.6 * scale, 2.6 * scale);
    const branchTargets = [
      { x: 1.4, y: 5.5, z: 0.7 },
      { x: -1.35, y: 5.2, z: -0.6 },
      { x: 0.5, y: 6.3, z: -1.4 },
      { x: -0.6, y: 6.1, z: 1.35 },
      { x: 0.1, y: 7.3, z: 0.1 },
    ];
    branchTargets.forEach((bt) => {
      const startPt = trunkCurve.getPoint(0.68);
      const endPt = new THREE.Vector3(bt.x * scale, bt.y * scale, bt.z * scale);
      const bCurve = new THREE.CatmullRomCurve3([startPt, endPt]);
      const limb = new THREE.Mesh(new THREE.TubeGeometry(bCurve, 5, 0.075 * scale, 6, false), barkMat);
      limb.castShadow = true;
      trunkGroup.add(limb);

      // 3 crossed leaf spray cards at each branch tip for airy realistic foliage
      for (let k = 0; k < 3; k++) {
        const card = new THREE.Mesh(leafCardGeo, leafMat);
        card.position.copy(endPt).add(new THREE.Vector3((rand() - 0.5) * 0.6, (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.6));
        card.rotation.set((rand() - 0.5) * 0.9, (k / 3) * Math.PI + rand() * 0.4, (rand() - 0.5) * 0.8);
        card.castShadow = true;
        card.receiveShadow = true;
        trunkGroup.add(card);
      }
    });
  }

  return {
    id,
    kind,
    group,
    trunkGroup,
    stumpMesh,
    hitFlashMeshes,
    x,
    z,
    y,
    radius: 0.45 * scale,
    height: (kind === 'pine' ? 10.6 : 7.5) * scale,
    hp: 100,
    maxHp: 100,
    state: 'standing',
    fallTimer: 0,
    fallDirX: 1,
    fallDirZ: 0,
    shakeTimer: 0,
  };
}

export function createCompositeBoulder(
  id: number,
  x: number,
  z: number,
  scale: number,
  textures: ProceduralTextureSet,
  rand: () => number,
): InteractiveBoulder {
  const y = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // High-detail sculpted FBM granite boulder with vertex-colored moss cap on upward normals
  const mainGeo = new THREE.IcosahedronGeometry(1.18 * scale, 3);
  const pos = mainGeo.attributes.position;
  const seedX = rand() * 50;
  const seedZ = rand() * 50;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const disp = 0.82 + fbm2D(vx * 1.4 + seedX, vz * 1.4 + vy * 0.9 + seedZ, 3) * 0.34;
    pos.setXYZ(i, vx * disp, vy * (vy > 0 ? 0.72 : 0.55) * disp, vz * disp);
  }
  mainGeo.computeVertexNormals();

  const norm = mainGeo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const cGranite = new THREE.Color('#8f948e');
  const cMoss = new THREE.Color('#4d6932');
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const ny = norm.getY(i);
    const mossWeight = Math.max(0, Math.min(1, (ny - 0.35) * 2.1));
    cTmp.copy(cGranite).lerp(cMoss, mossWeight);
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  mainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const rockMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    normalMap: textures.rockNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.86,
    metalness: 0.06,
    vertexColors: true,
  });

  const mainMesh = new THREE.Mesh(mainGeo, rockMat);
  mainMesh.position.y = 0.48 * scale;
  mainMesh.rotation.y = rand() * Math.PI * 2;
  mainMesh.castShadow = true;
  mainMesh.receiveShadow = true;
  group.add(mainMesh);

  // Accompanying rubble stones
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand();
    const subGeo = new THREE.IcosahedronGeometry((0.32 + rand() * 0.2) * scale, 1);
    const sub = new THREE.Mesh(
      subGeo,
      new THREE.MeshStandardMaterial({
        map: textures.rockAlbedo,
        normalMap: textures.rockNormal,
        roughness: 0.88,
      }),
    );
    sub.position.set(Math.cos(a) * 0.98 * scale, 0.15 * scale, Math.sin(a) * 0.98 * scale);
    sub.scale.set(1.2, 0.65, 1.0);
    sub.rotation.set(rand(), rand(), rand());
    sub.castShadow = true;
    sub.receiveShadow = true;
    group.add(sub);
  }

  return {
    id,
    group,
    x,
    z,
    y,
    radius: 1.18 * scale,
    hp: 90,
    maxHp: 90,
    depleted: false,
    shakeTimer: 0,
  };
}

export function createResourcePickup(
  id: number,
  kind: 'wood' | 'stone' | 'berries',
  amount: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
  withPop = true,
): ResourcePickup {
  const baseY = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, baseY + (withPop ? 0.6 : 0.05), z);

  if (kind === 'wood') {
    const barkMat = new THREE.MeshStandardMaterial({
      map: textures.pineBarkAlbedo,
      normalMap: textures.pineBarkNormal,
      roughness: 0.9,
    });
    const endMat = new THREE.MeshStandardMaterial({ map: textures.woodEndAlbedo, roughness: 0.8 });
    const logGeo = new THREE.CylinderGeometry(0.11, 0.12, 0.72, 10);
    logGeo.rotateZ(Math.PI / 2);
    const log1 = new THREE.Mesh(logGeo, [barkMat, endMat, endMat]);
    log1.position.set(0, 0.12, 0);
    log1.castShadow = true;
    group.add(log1);

    const log2 = new THREE.Mesh(logGeo, [barkMat, endMat, endMat]);
    log2.position.set(0.04, 0.25, 0.08);
    log2.rotation.y = 0.45;
    log2.castShadow = true;
    group.add(log2);
  } else if (kind === 'stone') {
    const rockMat = new THREE.MeshStandardMaterial({
      map: textures.rockAlbedo,
      normalMap: textures.rockNormal,
      roughness: 0.86,
    });
    const s1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), rockMat);
    s1.scale.set(1.2, 0.75, 1.0);
    s1.position.y = 0.14;
    s1.castShadow = true;
    group.add(s1);
    const s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), rockMat);
    s2.position.set(0.16, 0.1, 0.1);
    group.add(s2);
  } else {
    const leafMat = new THREE.MeshStandardMaterial({
      map: textures.leafBranchAlpha,
      alphaTest: 0.36,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const berryMat = new THREE.MeshStandardMaterial({ color: '#c42736', roughness: 0.32, metalness: 0.05 });
    const bush = new THREE.Mesh(createCrossedTuftGeometry(0.45, 0.4), leafMat);
    group.add(bush);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), berryMat);
      b.position.set(Math.cos(a) * 0.14, 0.22 + (i % 2) * 0.06, Math.sin(a) * 0.14);
      group.add(b);
    }
  }

  const angle = Math.random() * Math.PI * 2;
  const speed = withPop ? 1.8 + Math.random() * 1.8 : 0;

  return {
    id,
    kind,
    amount,
    mesh: group,
    x,
    z,
    baseY,
    vx: Math.cos(angle) * speed,
    vy: withPop ? 3.5 + Math.random() * 1.5 : 0,
    vz: Math.sin(angle) * speed,
    settled: !withPop,
    age: 0,
  };
}

export function createCampfire(
  id: number,
  x: number,
  z: number,
  textures: ProceduralTextureSet,
  isStarter = false,
): CampfireEntity {
  const y = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.rockAlbedo,
    normalMap: textures.rockNormal,
    color: '#787974',
    roughness: 0.9,
  });
  const charWoodMat = new THREE.MeshStandardMaterial({
    map: textures.pineBarkAlbedo,
    normalMap: textures.pineBarkNormal,
    color: '#3a281d',
    roughness: 0.92,
  });
  const emberMat = new THREE.MeshStandardMaterial({
    color: '#ff5214',
    emissive: '#ff460a',
    emissiveIntensity: 2.6,
    roughness: 0.7,
  });

  // 10 river stones
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), stoneMat);
    stone.position.set(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62);
    stone.scale.set(1.25, 0.68, 1.0);
    stone.rotation.y = a;
    stone.castShadow = true;
    stone.receiveShadow = true;
    group.add(stone);
  }

  const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.52, 0.07, 14), emberMat);
  bed.position.y = 0.04;
  group.add(bed);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.88, 8), charWoodMat);
    log.position.set(Math.cos(a) * 0.1, 0.18, Math.sin(a) * 0.1);
    log.rotation.z = Math.PI / 2 - 0.38;
    log.rotation.y = a;
    log.castShadow = true;
    group.add(log);
  }

  const flames: THREE.Mesh[] = [];
  const flameColors = ['#ffaa2b', '#ff6418', '#ffe385'];
  for (let i = 0; i < 3; i++) {
    const fMat = new THREE.MeshBasicMaterial({
      color: flameColors[i],
      transparent: true,
      opacity: 0.88,
    });
    const fMesh = new THREE.Mesh(new THREE.ConeGeometry(0.18 - i * 0.04, 0.7 - i * 0.12, 7), fMat);
    fMesh.position.set((i - 1) * 0.07, 0.35, (i % 2 === 0 ? 1 : -1) * 0.05);
    group.add(fMesh);
    flames.push(fMesh);
  }

  const light = new THREE.PointLight('#ff8438', 6.0, 20, 1.65);
  light.position.set(0, 0.85, 0);
  group.add(light);

  return {
    id,
    group,
    x,
    z,
    y,
    light,
    flames,
    fuelTimer: isStarter ? 9999 : 240,
    isStarter,
  };
}

export function createWoodWall(
  id: number,
  kind: 'wood_wall' | 'wood_gate',
  x: number,
  z: number,
  rotationY: number,
  textures: ProceduralTextureSet,
  isGhost = false,
): WoodWallEntity {
  const y = groundHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotationY;

  const plankMat = isGhost
    ? new THREE.MeshStandardMaterial({
        color: '#4ade80',
        transparent: true,
        opacity: 0.48,
        roughness: 0.5,
      })
    : new THREE.MeshStandardMaterial({
        map: textures.woodPlankAlbedo,
        normalMap: textures.woodPlankNormal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.86,
        metalness: 0.03,
      });

  const postMat = isGhost
    ? plankMat
    : new THREE.MeshStandardMaterial({
        map: textures.pineBarkAlbedo,
        normalMap: textures.pineBarkNormal,
        roughness: 0.92,
        metalness: 0.02,
      });

  const ropeMat = isGhost
    ? plankMat
    : new THREE.MeshStandardMaterial({ color: '#9c8359', roughness: 0.95 });

  const width = 3.0;
  const height = kind === 'wood_gate' ? 2.65 : 2.15;

  [-width / 2 + 0.12, width / 2 - 0.12].forEach((px) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, height + 0.5, 10), postMat);
    post.position.set(px, (height - 0.25) / 2, 0);
    if (!isGhost) {
      post.castShadow = true;
      post.receiveShadow = true;
    }
    group.add(post);

    if (kind === 'wood_gate') {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 10), postMat);
      tip.position.set(px, height + 0.16, 0);
      group.add(tip);
    }

    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.025, 6, 12), ropeMat);
    lash.rotation.x = Math.PI / 2;
    lash.position.set(px, height - 0.38, 0);
    group.add(lash);
  });

  if (kind === 'wood_wall') {
    // 6 stacked notched round-timber logs (like IMG_0251)
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, width - 0.08, 10), plankMat);
      log.rotation.z = Math.PI / 2;
      log.position.set(0, 0.18 + i * 0.33, 0);
      if (!isGhost) {
        log.castShadow = true;
        log.receiveShadow = true;
      }
      group.add(log);
    }
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.35, 8), plankMat);
    brace.position.set(0, 1.05, 0.14);
    brace.rotation.z = 0.85;
    if (!isGhost) brace.castShadow = true;
    group.add(brace);
  } else {
    const stakeCount = 10;
    for (let i = 0; i < stakeCount; i++) {
      const sx = -width / 2 + 0.3 + (i * (width - 0.6)) / (stakeCount - 1);
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, height, 8), plankMat);
      stake.position.set(sx, height / 2 - 0.05, 0);
      if (!isGhost) {
        stake.castShadow = true;
        stake.receiveShadow = true;
      }
      group.add(stake);

      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.32, 8), plankMat);
      spike.position.set(sx, height + 0.11, 0);
      group.add(spike);
    }
    [0.65, 1.75].forEach((by) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width - 0.1, 0.14, 0.12), postMat);
      rail.position.set(0, by, 0.12);
      if (!isGhost) rail.castShadow = true;
      group.add(rail);
    });
  }

  return {
    id,
    kind,
    group,
    x,
    z,
    y,
    rotationY,
    halfWidth: width / 2,
    halfDepth: 0.25,
    hp: kind === 'wood_gate' ? 220 : 160,
    maxHp: kind === 'wood_gate' ? 220 : 160,
  };
}

export function createWolfEntity(x: number, z: number): WolfEntity {
  const group = new THREE.Group();
  const y = groundHeightAt(x, z);
  group.position.set(x, y, z);

  const furMat = new THREE.MeshStandardMaterial({ color: '#393c40', roughness: 0.9, metalness: 0.03 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: '#5f6165', roughness: 0.92 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff9d2e' });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.62, 6, 12), furMat);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.56;
  body.castShadow = true;
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), bellyMat);
  chest.scale.set(0.95, 1.0, 1.1);
  chest.position.set(0, 0.56, 0.28);
  chest.castShadow = true;
  group.add(chest);

  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.52);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), furMat);
  skull.scale.set(0.9, 0.85, 1.1);
  skull.castShadow = true;
  head.add(skull);
  const snout = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.16, 5, 8), bellyMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, -0.04, 0.2);
  head.add(snout);
  [-0.085, 0.085].forEach((ex) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 5), furMat);
    ear.position.set(ex, 0.17, -0.04);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), eyeMat);
    eye.position.set(ex * 0.85, 0.04, 0.14);
    head.add(eye);
  });
  group.add(head);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.52, 6), furMat);
  tail.rotation.x = -Math.PI * 0.68;
  tail.position.set(0, 0.56, -0.62);
  group.add(tail);

  const legs: THREE.Group[] = [];
  const legPos: [number, number][] = [
    [-0.14, 0.34],
    [0.14, 0.34],
    [-0.14, -0.34],
    [0.14, -0.34],
  ];
  legPos.forEach(([lx, lz]) => {
    const pivot = new THREE.Group();
    pivot.position.set(lx, 0.44, lz);
    const legMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.046, 0.36, 5, 8), furMat);
    legMesh.position.y = -0.22;
    legMesh.castShadow = true;
    pivot.add(legMesh);
    group.add(pivot);
    legs.push(pivot);
  });

  return {
    id: Math.floor(Math.random() * 100000),
    group,
    legs,
    head,
    x,
    z,
    rotY: 0,
    hp: 65,
    state: 'prowl',
    attackCooldown: 0,
    walkPhase: Math.random() * Math.PI * 2,
  };
}

export function buildForestWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
): WorldRefs {
  const rand = seededRand(42819);
  const disposables: Array<{ dispose: () => void }> = [];

  const terrainMesh = buildTerrainMesh(textures);
  scene.add(terrainMesh);
  disposables.push(terrainMesh.geometry, terrainMesh.material as THREE.Material);

  const foliage = buildInstancedFoliageAndPerimeter(scene, textures, rand);
  disposables.push(...foliage.disposables);

  // Volumetric-feeling golden sunbeam light shafts filtering through forest canopy
  const sunbeamsGroup = new THREE.Group();
  const beamGeo = new THREE.CylinderGeometry(0.6, 3.2, 26, 8, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffe6b0',
    transparent: true,
    opacity: 0.045,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (let i = 0; i < 10; i++) {
    const r = 4 + rand() * 34;
    const a = rand() * Math.PI * 2;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(bx, groundHeightAt(bx, bz) + 11, bz);
    beam.rotation.z = -0.32;
    beam.rotation.x = 0.22;
    sunbeamsGroup.add(beam);
  }
  scene.add(sunbeamsGroup);
  disposables.push(beamGeo, beamMat);

  // Starter central campfire
  const campfires: CampfireEntity[] = [];
  const starterFire = createCampfire(1, 0, -2.1, textures, true);
  scene.add(starterFire.group);
  campfires.push(starterFire);

  // Weathered log bench beside starter campfire
  const benchGroup = new THREE.Group();
  const bx = -2.7;
  const bz = -1.6;
  benchGroup.position.set(bx, groundHeightAt(bx, bz), bz);
  benchGroup.rotation.y = 0.85;
  const logMat = new THREE.MeshStandardMaterial({
    map: textures.pineBarkAlbedo,
    normalMap: textures.pineBarkNormal,
    roughness: 0.9,
  });
  const endMat = new THREE.MeshStandardMaterial({ map: textures.woodEndAlbedo, roughness: 0.82 });
  const benchLog = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 2.2, 10), [logMat, endMat, endMat]);
  benchLog.rotation.z = Math.PI / 2;
  benchLog.position.y = 0.23;
  benchLog.castShadow = true;
  benchLog.receiveShadow = true;
  benchGroup.add(benchLog);
  scene.add(benchGroup);
  disposables.push(logMat, endMat, benchLog.geometry);

  // 58 interactive composite trees with realistic alpha-cutout needle/leaf sprays
  const trees: InteractiveTree[] = [];
  let treeId = 1;
  for (let i = 0; i < 58; i++) {
    const ring = i < 16 ? 9.5 + rand() * 14 : 18 + rand() * 40;
    const angle = (i / (i < 16 ? 16 : 40)) * Math.PI * 2 + (rand() - 0.5) * 0.45;
    const x = Math.cos(angle) * ring;
    const z = Math.sin(angle) * ring;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4.3)) continue;
    const kind: 'pine' | 'birch' = rand() < 0.68 ? 'pine' : 'birch';
    const scale = 0.85 + rand() * 0.45;
    const tree = createCompositeTree(treeId++, kind, x, z, scale, textures, rand);
    scene.add(tree.group);
    trees.push(tree);
  }

  // 22 high-detail mossy boulders
  const boulders: InteractiveBoulder[] = [];
  let boulderId = 1;
  for (let i = 0; i < 22; i++) {
    const r = 10 + rand() * 46;
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.0)) continue;
    if (boulders.some((b) => Math.hypot(b.x - x, b.z - z) < 4.5)) continue;
    const b = createCompositeBoulder(boulderId++, x, z, 0.78 + rand() * 0.65, textures, rand);
    scene.add(b.group);
    boulders.push(b);
  }

  // Initial forageable pickups
  const pickups: ResourcePickup[] = [];
  let pickupId = 1;
  for (let i = 0; i < 18; i++) {
    const r = 7 + rand() * 34;
    const a = rand() * Math.PI * 2;
    const kind = i % 3 === 0 ? 'berries' : i % 3 === 1 ? 'stone' : 'wood';
    const p = createResourcePickup(
      pickupId++,
      kind,
      kind === 'berries' ? 2 : 1,
      Math.cos(a) * r,
      Math.sin(a) * r,
      textures,
      false,
    );
    scene.add(p.mesh);
    pickups.push(p);
  }

  // Fallen mossy logs on forest floor (IMG_0250)
  for (let i = 0; i < 12; i++) {
    const r = 10 + rand() * 36;
    const a = rand() * Math.PI * 2;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    const ly = groundHeightAt(lx, lz);
    const flGeo = new THREE.CylinderGeometry(0.28, 0.34, 3.8 + rand() * 2, 10);
    const flMesh = new THREE.Mesh(flGeo, [logMat, endMat, endMat]);
    flMesh.position.set(lx, ly + 0.24, lz);
    flMesh.rotation.z = Math.PI / 2;
    flMesh.rotation.y = rand() * Math.PI;
    flMesh.castShadow = true;
    flMesh.receiveShadow = true;
    scene.add(flMesh);
    disposables.push(flGeo);
  }

  return {
    terrainMesh,
    grassUniforms: foliage.grassUniforms,
    sunbeamsGroup,
    trees,
    boulders,
    pickups,
    campfires,
    walls: [],
    wolves: [],
    disposables,
  };
}
