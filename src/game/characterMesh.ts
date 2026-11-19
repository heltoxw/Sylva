import * as THREE from 'three';
import { CHARACTER_SKINS, CharacterSkin, TOOL_SPECS, ToolId, ToolSpec } from '../types/game';
import { ProceduralTextureSet } from './textures';

export type CharacterAnimState = 'idle' | 'walk' | 'sprint' | 'chop' | 'gather' | 'warm' | 'jump';

export interface CharacterRig {
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  headPivot: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  toolMount: THREE.Group;
  setSkin: (skinId: string) => void;
  setTool: (toolId: ToolId) => void;
  updateAnimation: (
    dt: number,
    state: CharacterAnimState,
    speedRatio: number,
    chopTimer: number,
    gatherTimer: number,
    elapsed: number,
  ) => void;
  dispose: () => void;
}

function makeRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hh = h / 2;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return s;
}

function createSculptedHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.122, 22, 18);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Taper lower jaw & elongate cranium slightly
    if (y < 0) {
      const jawT = Math.min(1, -y / 0.122);
      x *= 1 - jawT * 0.28;
      if (z > 0) z *= 1 + (1 - jawT) * 0.08 - jawT * 0.12;
      y *= 1.12;
    } else {
      y *= 1.04;
      x *= 0.92;
    }
    // Slight brow ridge
    if (y > 0.01 && y < 0.055 && z > 0.08) {
      z += 0.012;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildToolGroup(spec: ToolSpec): THREE.Group {
  const group = new THREE.Group();

  const handleMat = new THREE.MeshStandardMaterial({
    color: spec.handleColor,
    roughness: 0.72,
    metalness: 0.04,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor,
    roughness: 0.85,
    metalness: 0.05,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: spec.headColor,
    roughness: 0.26,
    metalness: 0.88,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: '#dfe6ed',
    roughness: 0.14,
    metalness: 0.94,
  });

  // Curved ergonomic hickory/ash handle
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.14, 0),
    new THREE.Vector3(0, 0.12, 0.018),
    new THREE.Vector3(0, 0.38, -0.012),
    new THREE.Vector3(0, 0.62, 0.005),
  ]);
  const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 10, false), handleMat);
  handle.castShadow = true;
  group.add(handle);

  const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.14, 6, 10), gripMat);
  grip.position.set(0, -0.01, 0.006);
  group.add(grip);

  if (spec.kind === 'axe') {
    const axeShape = new THREE.Shape();
    axeShape.moveTo(-0.042, -0.036);
    axeShape.lineTo(0.055, -0.044);
    axeShape.lineTo(0.15, -0.09);
    axeShape.quadraticCurveTo(0.175, 0, 0.15, 0.09);
    axeShape.lineTo(0.055, 0.044);
    axeShape.lineTo(-0.042, 0.036);
    axeShape.closePath();

    const headGeo = new THREE.ExtrudeGeometry(axeShape, {
      depth: 0.032,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.006,
      bevelSegments: 2,
    });
    headGeo.translate(0, 0, -0.016);
    const head = new THREE.Mesh(headGeo, metalMat);
    head.position.set(0, 0.56, 0.005);
    head.rotation.y = Math.PI / 2;
    head.castShadow = true;
    group.add(head);

    const bladeEdge = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.155, 4, 8), edgeMat);
    bladeEdge.position.set(0, 0.56, 0.16);
    group.add(bladeEdge);
  } else {
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.068, 10), metalMat);
    collar.position.set(0, 0.57, 0);
    collar.castShadow = true;
    group.add(collar);

    const frontPick = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.25, 8), metalMat);
    frontPick.rotation.x = Math.PI / 2 + 0.16;
    frontPick.position.set(0, 0.555, 0.13);
    frontPick.castShadow = true;
    group.add(frontPick);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.06, 8), edgeMat);
    tip.rotation.x = Math.PI / 2 + 0.16;
    tip.position.set(0, 0.538, 0.245);
    group.add(tip);

    const rearAdze = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.14, 4, 8), metalMat);
    rearAdze.rotation.x = Math.PI / 2 - 0.18;
    rearAdze.position.set(0, 0.56, -0.095);
    rearAdze.castShadow = true;
    group.add(rearAdze);
  }

  group.rotation.x = Math.PI * 0.42;
  return group;
}

export function createCharacterRig(
  initialSkinId: string,
  initialToolId: ToolId,
  textures: ProceduralTextureSet,
): CharacterRig {
  const root = new THREE.Group();

  // Soft contact shadow
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.02;
  root.add(contactShadow);

  // Materials with realistic normal maps & roughness separation
  const skinMat = new THREE.MeshStandardMaterial({ color: '#d6a485', roughness: 0.62, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#4a3525', roughness: 0.86, metalness: 0.02 });
  const hatMat = new THREE.MeshStandardMaterial({
    color: '#24292e',
    normalMap: textures.fabricNormal,
    roughness: 0.88,
    metalness: 0.04,
  });
  const jacketMat = new THREE.MeshStandardMaterial({
    color: '#3a4249',
    normalMap: textures.fabricNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.82,
    metalness: 0.04,
  });
  const vestMat = new THREE.MeshStandardMaterial({
    color: '#16181b',
    normalMap: textures.leatherNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.29,
    metalness: 0.24,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: '#2d3339',
    normalMap: textures.fabricNormal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.86,
    metalness: 0.03,
  });
  const bootsMat = new THREE.MeshStandardMaterial({
    color: '#1a1817',
    normalMap: textures.leatherNormal,
    roughness: 0.52,
    metalness: 0.12,
  });
  const packMat = new THREE.MeshStandardMaterial({
    color: '#31382d',
    normalMap: textures.fabricNormal,
    roughness: 0.84,
    metalness: 0.04,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: '#202224',
    normalMap: textures.leatherNormal,
    roughness: 0.52,
    metalness: 0.1,
  });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#151517', roughness: 0.18, metalness: 0.1 });
  const bedrollMat = new THREE.MeshStandardMaterial({
    color: '#46523d',
    normalMap: textures.fabricNormal,
    roughness: 0.9,
  });
  const buckleMat = new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.22, metalness: 0.88 });

  // Hierarchy
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.94, 0);
  root.add(pelvis);

  // Sculpted organic pelvis & tactical belt
  const hipGeo = new THREE.CylinderGeometry(0.155, 0.145, 0.15, 16);
  hipGeo.scale(1.16, 1, 0.74);
  const hipMesh = new THREE.Mesh(hipGeo, pantsMat);
  hipMesh.castShadow = true;
  pelvis.add(hipMesh);

  const beltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.052, 16), vestMat);
  beltMesh.scale.set(1.16, 1, 0.76);
  beltMesh.position.y = 0.055;
  beltMesh.castShadow = true;
  pelvis.add(beltMesh);

  const buckleMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(makeRoundedRectShape(0.055, 0.045, 0.008), {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.004,
      bevelSegments: 2,
    }),
    buckleMat,
  );
  buckleMesh.position.set(0, 0.055, 0.118);
  pelvis.add(buckleMesh);

  // Sculpted organic torso (Lathe profile: waist -> ribcage -> broad shoulders)
  const torso = new THREE.Group();
  torso.position.set(0, 0.07, 0);
  pelvis.add(torso);

  const torsoProfile = [
    new THREE.Vector2(0.145, 0.0),
    new THREE.Vector2(0.14, 0.1),
    new THREE.Vector2(0.165, 0.24),
    new THREE.Vector2(0.185, 0.37),
    new THREE.Vector2(0.165, 0.45),
    new THREE.Vector2(0.08, 0.48),
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 18);
  torsoGeo.scale(1.22, 1.0, 0.72);
  const chestMesh = new THREE.Mesh(torsoGeo, jacketMat);
  chestMesh.castShadow = true;
  chestMesh.receiveShadow = true;
  torso.add(chestMesh);

  // Jacket collar
  const collarMesh = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.026, 8, 16), jacketMat);
  collarMesh.rotation.x = Math.PI / 2 - 0.15;
  collarMesh.position.set(0, 0.465, 0.005);
  torso.add(collarMesh);

  // Folded-down jacket hood resting on upper back/collar (IMG_0250)
  const hoodDownGroup = new THREE.Group();
  const foldedHood = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.042, 8, 16, Math.PI * 1.15),
    jacketMat,
  );
  foldedHood.rotation.x = Math.PI * 0.62;
  foldedHood.rotation.z = -Math.PI * 0.08;
  foldedHood.position.set(0, 0.445, -0.05);
  foldedHood.castShadow = true;
  hoodDownGroup.add(foldedHood);
  const hoodFoldBack = new THREE.Mesh(
    new THREE.ExtrudeGeometry(makeRoundedRectShape(0.17, 0.085, 0.025), {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.014,
      bevelSegments: 2,
    }),
    jacketMat,
  );
  hoodFoldBack.position.set(0, 0.415, -0.14);
  hoodFoldBack.rotation.x = 0.25;
  hoodDownGroup.add(hoodFoldBack);
  torso.add(hoodDownGroup);

  // Contoured Tactical Vest (IMG_0250: glossy quilted leather plate carrier + MOLLE ribs + twin-strap lower back pouch)
  const vestGroup = new THREE.Group();
  const vestProfile = [
    new THREE.Vector2(0.155, 0.04),
    new THREE.Vector2(0.174, 0.22),
    new THREE.Vector2(0.184, 0.36),
    new THREE.Vector2(0.14, 0.42),
  ];
  const vestGeo = new THREE.LatheGeometry(vestProfile, 18);
  vestGeo.scale(1.18, 1.0, 0.76);
  const vestBody = new THREE.Mesh(vestGeo, vestMat);
  vestBody.castShadow = true;
  vestGroup.add(vestBody);

  // 4 horizontal quilted MOLLE ribs across upper-mid back
  const ribGeo = new THREE.ExtrudeGeometry(makeRoundedRectShape(0.24, 0.036, 0.01), {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  for (let r = 0; r < 4; r++) {
    const rib = new THREE.Mesh(ribGeo, vestMat);
    rib.position.set(0, 0.22 + r * 0.048, -0.142);
    rib.castShadow = true;
    vestGroup.add(rib);
  }

  // Beveled utility pouches on front of vest
  const pouchGeo = new THREE.ExtrudeGeometry(makeRoundedRectShape(0.095, 0.11, 0.018), {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.008,
    bevelSegments: 2,
  });
  [-0.085, 0.085].forEach((px) => {
    const pouch = new THREE.Mesh(pouchGeo, vestMat);
    pouch.position.set(px, 0.13, 0.12);
    pouch.castShadow = true;
    vestGroup.add(pouch);
  });

  // Large lower-back leather pouch with twin vertical buckle straps (IMG_0250)
  const backPouch = new THREE.Mesh(
    new THREE.ExtrudeGeometry(makeRoundedRectShape(0.23, 0.14, 0.024), {
      depth: 0.058,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
    }),
    vestMat,
  );
  backPouch.position.set(0, 0.115, -0.188);
  backPouch.castShadow = true;
  vestGroup.add(backPouch);

  [-0.058, 0.058].forEach((sx) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.15, 0.072), vestMat);
    strap.position.set(sx, 0.12, -0.16);
    vestGroup.add(strap);
    const snap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.018, 0.012), buckleMat);
    snap.position.set(sx, 0.095, -0.198);
    vestGroup.add(snap);
  });
  torso.add(vestGroup);

  // Contoured Backpack & Bedroll (used on explorer/lumberjack/warden skins)
  const backpack = new THREE.Group();
  backpack.position.set(0, 0.28, -0.165);
  const packGeo = new THREE.ExtrudeGeometry(makeRoundedRectShape(0.24, 0.31, 0.045), {
    depth: 0.095,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.018,
    bevelSegments: 3,
  });
  packGeo.translate(0, 0, -0.05);
  const packBody = new THREE.Mesh(packGeo, packMat);
  packBody.castShadow = true;
  backpack.add(packBody);

  const bedroll = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.19, 6, 12), bedrollMat);
  bedroll.rotation.z = Math.PI / 2;
  bedroll.position.set(0, 0.175, 0.005);
  bedroll.castShadow = true;
  backpack.add(bedroll);
  torso.add(backpack);

  // Head
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.48, 0);
  torso.add(headPivot);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.068, 0.09, 12), skinMat);
  neck.position.y = 0.025;
  headPivot.add(neck);

  const cranium = new THREE.Mesh(createSculptedHeadGeometry(), skinMat);
  cranium.position.y = 0.15;
  cranium.castShadow = true;
  headPivot.add(cranium);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.044, 6), skinMat);
  nose.rotation.x = Math.PI * 0.45;
  nose.position.set(0, 0.145, 0.122);
  headPivot.add(nose);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), skinMat);
    ear.scale.set(0.45, 1.0, 0.75);
    ear.position.set(side * 0.112, 0.15, -0.005);
    headPivot.add(ear);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), eyeMat);
    eye.position.set(side * 0.042, 0.168, 0.106);
    headPivot.add(eye);
  });

  // Layered hair / hats
  const hairGroup = new THREE.Group();
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    hairMat,
  );
  hairTop.position.set(0, 0.158, -0.005);
  hairTop.rotation.x = -0.2;
  hairGroup.add(hairTop);
  headPivot.add(hairGroup);

  const beanieGroup = new THREE.Group();
  const beanieDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.132, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    hatMat,
  );
  beanieDome.position.y = 0.162;
  beanieDome.rotation.x = -0.15;
  beanieGroup.add(beanieDome);
  const beanieCuff = new THREE.Mesh(new THREE.TorusGeometry(0.123, 0.022, 8, 18), hatMat);
  beanieCuff.rotation.x = Math.PI / 2 - 0.15;
  beanieCuff.position.set(0, 0.178, -0.01);
  beanieGroup.add(beanieCuff);
  headPivot.add(beanieGroup);

  const hoodGroup = new THREE.Group();
  const hoodShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.144, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.7),
    hatMat,
  );
  hoodShell.position.set(0, 0.15, -0.015);
  hoodShell.rotation.x = -0.36;
  hoodGroup.add(hoodShell);
  headPivot.add(hoodGroup);

  const capGroup = new THREE.Group();
  const capDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hatMat,
  );
  capDome.position.y = 0.168;
  capGroup.add(capDome);
  const capVisor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.125, 0.012, 16, 1, false, -Math.PI * 0.35, Math.PI * 0.7),
    hatMat,
  );
  capVisor.position.set(0, 0.184, 0.04);
  capVisor.rotation.x = 0.14;
  capGroup.add(capVisor);
  headPivot.add(capGroup);

  // Organic Arms
  function createArm(side: -1 | 1): { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group } {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.225, 0.405, 0);
    torso.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.056, 0.21, 6, 12), jacketMat);
    upperArm.position.y = -0.13;
    upperArm.castShadow = true;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 6, 12), jacketMat);
    forearm.position.y = -0.115;
    forearm.castShadow = true;
    elbow.add(forearm);

    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.012, 6, 12), vestMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.22;
    elbow.add(cuff);

    const hand = new THREE.Group();
    hand.position.set(0, -0.25, 0);
    elbow.add(hand);

    const glove = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.045, 6, 10), gloveMat);
    glove.scale.set(0.82, 1.0, 1.05);
    hand.add(glove);

    return { shoulder, elbow, hand };
  }

  const leftArm = createArm(-1);
  const rightArm = createArm(1);

  const toolMount = new THREE.Group();
  toolMount.position.set(0, -0.02, 0.03);
  rightArm.hand.add(toolMount);

  // Organic Legs & Combat Boots
  function createLeg(side: -1 | 1): { hip: THREE.Group; knee: THREE.Group } {
    const hip = new THREE.Group();
    hip.position.set(side * 0.105, -0.035, 0);
    pelvis.add(hip);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.078, 0.31, 6, 12), pantsMat);
    thigh.position.y = -0.2;
    thigh.castShadow = true;
    hip.add(thigh);

    // Beveled cargo pocket
    const cargoPocket = new THREE.Mesh(
      new THREE.ExtrudeGeometry(makeRoundedRectShape(0.095, 0.13, 0.016), {
        depth: 0.024,
        bevelEnabled: true,
        bevelThickness: 0.006,
        bevelSize: 0.005,
        bevelSegments: 2,
      }),
      pantsMat,
    );
    cargoPocket.rotation.y = side * (Math.PI / 2);
    cargoPocket.position.set(side * 0.068, -0.22, 0.01);
    hip.add(cargoPocket);

    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    hip.add(knee);

    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.061, 0.28, 6, 12), pantsMat);
    shin.position.y = -0.18;
    shin.castShadow = true;
    knee.add(shin);

    // Taller sculpted combat boot (IMG_0250)
    const bootShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.059, 0.065, 0.22, 12), bootsMat);
    bootShaft.position.y = -0.32;
    bootShaft.castShadow = true;
    knee.add(bootShaft);

    const bootFoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.11, 6, 12), bootsMat);
    bootFoot.rotation.x = Math.PI / 2;
    bootFoot.scale.set(1.0, 1.0, 0.72);
    bootFoot.position.set(0, -0.43, 0.045);
    bootFoot.castShadow = true;
    knee.add(bootFoot);

    return { hip, knee };
  }

  const leftLeg = createLeg(-1);
  const rightLeg = createLeg(1);

  let currentToolGroup: THREE.Group | null = null;

  const setSkin = (skinId: string) => {
    const skin: CharacterSkin = CHARACTER_SKINS.find((s) => s.id === skinId) || CHARACTER_SKINS[0];
    skinMat.color.set(skin.skinTone);
    hairMat.color.set(skin.hairColor);
    hatMat.color.set(skin.hatColor);
    jacketMat.color.set(skin.jacketColor);
    vestMat.color.set(skin.vestColor);
    pantsMat.color.set(skin.pantsColor);
    bootsMat.color.set(skin.bootsColor);
    packMat.color.set(skin.packColor);

    if (skin.pattern === 'flannel') {
      jacketMat.map = textures.fabricFlannel;
      jacketMat.color.set('#ffffff');
    } else if (skin.pattern === 'camo') {
      jacketMat.map = textures.fabricCamo;
      jacketMat.color.set(skin.jacketColor);
    } else if (skin.pattern === 'denim') {
      jacketMat.map = textures.fabricDenim;
      jacketMat.color.set('#ffffff');
    } else {
      jacketMat.map = null;
      jacketMat.color.set(skin.jacketColor);
    }
    jacketMat.needsUpdate = true;

    vestGroup.visible = skin.hasTacticalVest;
    backpack.visible = skin.hasBackpack;
    hoodDownGroup.visible = skin.hasHoodDown;
    hairGroup.visible = skin.hatStyle === 'none' || skin.hatStyle === 'cap';
    beanieGroup.visible = skin.hatStyle === 'beanie';
    hoodGroup.visible = skin.hatStyle === 'hood';
    capGroup.visible = skin.hatStyle === 'cap';
  };

  const setTool = (toolId: ToolId) => {
    if (currentToolGroup) {
      toolMount.remove(currentToolGroup);
      currentToolGroup.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
          else m.material.dispose();
        }
      });
    }
    const spec = TOOL_SPECS.find((t) => t.id === toolId) || TOOL_SPECS[0];
    currentToolGroup = buildToolGroup(spec);
    toolMount.add(currentToolGroup);
  };

  setSkin(initialSkinId);
  setTool(initialToolId);

  let walkCycle = 0;

  const updateAnimation = (
    dt: number,
    state: CharacterAnimState,
    speedRatio: number,
    chopTimer: number,
    gatherTimer: number,
    elapsed: number,
  ) => {
    const damp = (curr: number, target: number, lambda: number) =>
      THREE.MathUtils.damp(curr, target, lambda, dt);

    let pelvisY = 0.94;
    let torsoPitch = 0;
    let torsoYaw = 0;
    let headPitch = 0;
    let headYaw = 0;

    let lHipX = 0;
    let rHipX = 0;
    let lKneeX = 0;
    let rKneeX = 0;

    let lShX = 0.08;
    let lShZ = 0.1;
    let lElbX = -0.25;

    let rShX = -0.18;
    let rShZ = -0.1;
    let rElbX = -0.45;

    if (state === 'walk' || state === 'sprint') {
      const freq = state === 'sprint' ? 11.5 : 7.8;
      walkCycle += dt * freq * Math.max(0.4, speedRatio);
      const s = Math.sin(walkCycle);
      const c = Math.cos(walkCycle);
      const amp = state === 'sprint' ? 0.72 : 0.48;

      pelvisY = 0.94 + Math.abs(c) * (state === 'sprint' ? 0.055 : 0.032);
      torsoPitch = state === 'sprint' ? 0.22 : 0.08;
      torsoYaw = -s * 0.09;

      lHipX = s * amp;
      rHipX = -s * amp;
      lKneeX = Math.max(0, -c * amp * 1.15);
      rKneeX = Math.max(0, c * amp * 1.15);

      lShX = -s * amp * 0.85;
      lElbX = -0.35 - Math.max(0, s) * 0.35;

      rShX = s * amp * 0.55 - 0.15;
      rElbX = -0.55 - Math.max(0, -s) * 0.2;
    } else if (state === 'jump') {
      pelvisY = 0.98;
      torsoPitch = 0.1;
      lHipX = -0.45;
      rHipX = 0.25;
      lKneeX = 0.75;
      rKneeX = 0.35;
      lShX = -0.55;
      lShZ = 0.35;
      rShX = -0.65;
      rShZ = -0.25;
    } else if (state === 'warm') {
      const breathe = Math.sin(elapsed * 2.1);
      pelvisY = 0.93 + breathe * 0.008;
      torsoPitch = 0.08;
      headPitch = 0.08;
      headYaw = Math.sin(elapsed * 0.7) * 0.14;
      lShX = -0.75 + breathe * 0.03;
      lShZ = -0.15;
      lElbX = -0.55;
      rShX = -0.72 - breathe * 0.03;
      rShZ = 0.15;
      rElbX = -0.58;
    } else {
      const breathe = Math.sin(elapsed * 2.0);
      pelvisY = 0.94 + breathe * 0.008;
      torsoPitch = 0.02 + breathe * 0.015;
      headYaw = Math.sin(elapsed * 0.65) * 0.1;
      lShX = 0.06 + breathe * 0.02;
      lShZ = 0.11;
      lElbX = -0.22;
      rShX = -0.22 + breathe * 0.02;
      rShZ = -0.11;
      rElbX = -0.52;
    }

    if (chopTimer > 0) {
      const total = 0.46;
      const p = 1 - Math.min(1, chopTimer / total);
      if (p < 0.38) {
        const w = p / 0.38;
        const ease = w * w;
        torsoYaw = THREE.MathUtils.lerp(torsoYaw, -0.45, ease);
        torsoPitch = THREE.MathUtils.lerp(torsoPitch, -0.12, ease);
        rShX = THREE.MathUtils.lerp(rShX, -2.15, ease);
        rShZ = THREE.MathUtils.lerp(rShZ, -0.35, ease);
        rElbX = THREE.MathUtils.lerp(rElbX, -0.4, ease);
        lShX = THREE.MathUtils.lerp(lShX, -1.35, ease);
        lShZ = THREE.MathUtils.lerp(lShZ, -0.12, ease);
      } else {
        const s = (p - 0.38) / 0.62;
        const strike = Math.sin(Math.min(1, s * 1.45) * Math.PI * 0.5);
        torsoYaw = THREE.MathUtils.lerp(-0.45, 0.38, strike);
        torsoPitch = THREE.MathUtils.lerp(-0.12, 0.32, strike);
        rShX = THREE.MathUtils.lerp(-2.15, 0.35, strike);
        rShZ = THREE.MathUtils.lerp(-0.35, 0.12, strike);
        rElbX = THREE.MathUtils.lerp(-0.4, -0.2, strike);
        lShX = THREE.MathUtils.lerp(-1.35, 0.15, strike);
      }
    }

    if (gatherTimer > 0) {
      const p = Math.sin((gatherTimer / 0.35) * Math.PI);
      pelvisY -= p * 0.24;
      torsoPitch += p * 0.62;
      lHipX -= p * 0.55;
      lKneeX += p * 0.9;
      rHipX -= p * 0.35;
      rKneeX += p * 0.7;
      lShX -= p * 0.9;
    }

    const rate = chopTimer > 0 ? 26 : 14;
    pelvis.position.y = damp(pelvis.position.y, pelvisY, rate);
    torso.rotation.x = damp(torso.rotation.x, torsoPitch, rate);
    torso.rotation.y = damp(torso.rotation.y, torsoYaw, rate);
    headPivot.rotation.x = damp(headPivot.rotation.x, headPitch, 10);
    headPivot.rotation.y = damp(headPivot.rotation.y, headYaw, 10);

    leftLeg.hip.rotation.x = damp(leftLeg.hip.rotation.x, lHipX, 16);
    rightLeg.hip.rotation.x = damp(rightLeg.hip.rotation.x, rHipX, 16);
    leftLeg.knee.rotation.x = damp(leftLeg.knee.rotation.x, lKneeX, 16);
    rightLeg.knee.rotation.x = damp(rightLeg.knee.rotation.x, rKneeX, 16);

    leftArm.shoulder.rotation.x = damp(leftArm.shoulder.rotation.x, lShX, rate);
    leftArm.shoulder.rotation.z = damp(leftArm.shoulder.rotation.z, lShZ, rate);
    leftArm.elbow.rotation.x = damp(leftArm.elbow.rotation.x, lElbX, rate);

    rightArm.shoulder.rotation.x = damp(rightArm.shoulder.rotation.x, rShX, rate);
    rightArm.shoulder.rotation.z = damp(rightArm.shoulder.rotation.z, rShZ, rate);
    rightArm.elbow.rotation.x = damp(rightArm.elbow.rotation.x, rElbX, rate);
  };

  const dispose = () => {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose());
        else m.material.dispose();
      }
    });
  };

  return {
    root,
    pelvis,
    torso,
    headPivot,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    toolMount,
    setSkin,
    setTool,
    updateAnimation,
    dispose,
  };
}
