import * as THREE from 'three';

export interface ProceduralTextureSet {
  groundAlbedo: THREE.CanvasTexture;
  groundNormal: THREE.CanvasTexture;
  groundRoughness: THREE.CanvasTexture;
  pineBarkAlbedo: THREE.CanvasTexture;
  pineBarkNormal: THREE.CanvasTexture;
  birchBarkAlbedo: THREE.CanvasTexture;
  woodPlankAlbedo: THREE.CanvasTexture;
  woodPlankNormal: THREE.CanvasTexture;
  woodEndAlbedo: THREE.CanvasTexture;
  rockAlbedo: THREE.CanvasTexture;
  rockNormal: THREE.CanvasTexture;
  fabricNormal: THREE.CanvasTexture;
  leatherNormal: THREE.CanvasTexture;
  pineBranchAlpha: THREE.CanvasTexture;
  leafBranchAlpha: THREE.CanvasTexture;
  grassTuftAlpha: THREE.CanvasTexture;
  fernFrondAlpha: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  particleSoft: THREE.CanvasTexture;
  fabricFlannel: THREE.CanvasTexture;
  fabricCamo: THREE.CanvasTexture;
  fabricDenim: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function configureColorTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
  clamp = false,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function configureDataTexture(
  canvas: HTMLCanvasElement,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Converts a grayscale height canvas into a tangent-space RGB normal map canvas.
 */
function heightToNormalCanvas(heightCanvas: HTMLCanvasElement, strength = 2.5): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const hCtx = heightCanvas.getContext('2d')!;
  const src = hCtx.getImageData(0, 0, w, h).data;

  const [nCanvas, nCtx] = makeCanvas(w, h);
  const out = nCtx.createImageData(w, h);
  const dst = out.data;

  const sample = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = sample(x - 1, y);
      const hR = sample(x + 1, y);
      const hU = sample(x, y - 1);
      const hD = sample(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hU - hD) * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }
  nCtx.putImageData(out, 0, 0);
  return nCanvas;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.min(8, Math.max(1, maxAnisotropy));

  // 1. Forest Floor Albedo + Height -> Normal + Roughness (with damp mud glints)
  const [gCanvas, gCtx] = makeCanvas(512, 512);
  const [gHCanvas, gHCtx] = makeCanvas(256, 256);
  const [gRCanvas, gRCtx] = makeCanvas(256, 256);

  gCtx.fillStyle = '#332c21';
  gCtx.fillRect(0, 0, 512, 512);
  gHCtx.fillStyle = '#808080';
  gHCtx.fillRect(0, 0, 256, 256);
  gRCtx.fillStyle = '#dcdcdc';
  gRCtx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1.2 + Math.random() * 5.2;
    const pick = Math.random();
    if (pick < 0.36) gCtx.fillStyle = 'rgba(48, 66, 30, 0.42)';
    else if (pick < 0.68) gCtx.fillStyle = 'rgba(62, 48, 32, 0.44)';
    else if (pick < 0.88) gCtx.fillStyle = 'rgba(32, 42, 22, 0.48)';
    else gCtx.fillStyle = 'rgba(92, 75, 52, 0.34)';
    gCtx.beginPath();
    gCtx.arc(x, y, r, 0, Math.PI * 2);
    gCtx.fill();

    const v = Math.floor(85 + Math.random() * 110);
    gHCtx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    gHCtx.beginPath();
    gHCtx.arc(x * 0.5, y * 0.5, r * 0.5, 0, Math.PI * 2);
    gHCtx.fill();
  }
  // Damp patches (lower roughness so sunlight glints on mud/dew)
  for (let i = 0; i < 28; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 10 + Math.random() * 22;
    gRCtx.fillStyle = 'rgba(72, 72, 72, 0.45)';
    gRCtx.beginPath();
    gRCtx.arc(x, y, r, 0, Math.PI * 2);
    gRCtx.fill();
  }
  // Pine needle litter
  gCtx.lineWidth = 1.1;
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI * 2;
    const len = 4 + Math.random() * 8;
    gCtx.strokeStyle = Math.random() < 0.55 ? 'rgba(94, 70, 38, 0.48)' : 'rgba(54, 72, 34, 0.42)';
    gCtx.beginPath();
    gCtx.moveTo(x, y);
    gCtx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    gCtx.stroke();
  }
  const groundAlbedo = configureColorTexture(gCanvas, aniso, 24, 24);
  const groundNormal = configureDataTexture(heightToNormalCanvas(gHCanvas, 2.8), aniso, 24, 24);
  const groundRoughness = configureDataTexture(gRCanvas, aniso, 24, 24);

  // 2. Pine Bark Albedo + Normal
  const [pbCanvas, pbCtx] = makeCanvas(256, 512);
  const [pbHCanvas, pbHCtx] = makeCanvas(256, 512);
  pbCtx.fillStyle = '#3b291d';
  pbCtx.fillRect(0, 0, 256, 512);
  pbHCtx.fillStyle = '#707070';
  pbHCtx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 620; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 512;
    const w = 3 + Math.random() * 13;
    const h = 24 + Math.random() * 82;
    const isCrevice = Math.random() < 0.42;
    pbCtx.fillStyle = isCrevice
      ? 'rgba(20, 13, 9, 0.65)'
      : Math.random() < 0.78
        ? 'rgba(84, 58, 39, 0.48)'
        : 'rgba(62, 84, 36, 0.45)'; // lichen/moss on bark
    pbCtx.fillRect(x, y, w, h);

    const hv = isCrevice ? 30 : 195;
    pbHCtx.fillStyle = `rgba(${hv},${hv},${hv},0.55)`;
    pbHCtx.fillRect(x, y, w, h);
  }
  const pineBarkAlbedo = configureColorTexture(pbCanvas, aniso, 2, 4);
  const pineBarkNormal = configureDataTexture(heightToNormalCanvas(pbHCanvas, 4.2), aniso, 2, 4);

  // 3. Birch Bark
  const [bbCanvas, bbCtx] = makeCanvas(256, 512);
  bbCtx.fillStyle = '#cbc5b8';
  bbCtx.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 240; i++) {
    const y = Math.random() * 512;
    const x = Math.random() * 256;
    const w = 18 + Math.random() * 52;
    const h = 2 + Math.random() * 6;
    bbCtx.fillStyle = Math.random() < 0.7 ? 'rgba(38, 35, 32, 0.78)' : 'rgba(98, 92, 82, 0.52)';
    bbCtx.fillRect(x, y, w, h);
  }
  const birchBarkAlbedo = configureColorTexture(bbCanvas, aniso, 1, 3);

  // 4. Weathered Timber Plank Albedo + Normal
  const [wpCanvas, wpCtx] = makeCanvas(256, 256);
  const [wpHCanvas, wpHCtx] = makeCanvas(256, 256);
  wpCtx.fillStyle = '#62472f';
  wpCtx.fillRect(0, 0, 256, 256);
  wpHCtx.fillStyle = '#808080';
  wpHCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const shade = 78 + Math.floor(Math.sin(y * 0.25) * 16 + (Math.random() - 0.5) * 18);
    wpCtx.fillStyle = `rgb(${shade + 20}, ${Math.floor(shade * 0.76)}, ${Math.floor(shade * 0.48)})`;
    wpCtx.fillRect(0, y, 256, 2);
    const hv = 100 + Math.floor(Math.sin(y * 0.4) * 35 + Math.random() * 45);
    wpHCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    wpHCtx.fillRect(0, y, 256, 2);
  }
  for (let k = 0; k < 7; k++) {
    const kx = 28 + Math.random() * 200;
    const ky = 20 + Math.random() * 216;
    wpCtx.fillStyle = 'rgba(40, 25, 14, 0.58)';
    wpCtx.beginPath();
    wpCtx.ellipse(kx, ky, 11, 4.5, 0, 0, Math.PI * 2);
    wpCtx.fill();
  }
  const woodPlankAlbedo = configureColorTexture(wpCanvas, aniso, 1, 1);
  const woodPlankNormal = configureDataTexture(heightToNormalCanvas(wpHCanvas, 2.5), aniso, 1, 1);

  // 5. Cut wood end grain
  const [weCanvas, weCtx] = makeCanvas(128, 128);
  weCtx.fillStyle = '#b98b5a';
  weCtx.fillRect(0, 0, 128, 128);
  for (let r = 6; r < 62; r += 5) {
    weCtx.strokeStyle = r % 10 === 0 ? 'rgba(92, 58, 30, 0.65)' : 'rgba(138, 96, 56, 0.45)';
    weCtx.lineWidth = 2;
    weCtx.beginPath();
    weCtx.arc(64, 64, r, 0, Math.PI * 2);
    weCtx.stroke();
  }
  const woodEndAlbedo = configureColorTexture(weCanvas, aniso, 1, 1);

  // 6. Granite & Moss Rock Albedo + Normal
  const [rkCanvas, rkCtx] = makeCanvas(256, 256);
  const [rkHCanvas, rkHCtx] = makeCanvas(256, 256);
  rkCtx.fillStyle = '#5a5e5a';
  rkCtx.fillRect(0, 0, 256, 256);
  rkHCtx.fillStyle = '#808080';
  rkHCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3200; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const s = 2 + Math.random() * 8;
    const v = 56 + Math.floor(Math.random() * 76);
    rkCtx.fillStyle =
      Math.random() < 0.18
        ? 'rgba(64, 88, 42, 0.45)'
        : `rgba(${v}, ${v + 2}, ${v - 1}, 0.5)`;
    rkCtx.fillRect(x, y, s, s);
    const hv = 40 + Math.floor(Math.random() * 175);
    rkHCtx.fillStyle = `rgba(${hv},${hv},${hv},0.35)`;
    rkHCtx.fillRect(x, y, s, s);
  }
  const rockAlbedo = configureColorTexture(rkCanvas, aniso, 2, 2);
  const rockNormal = configureDataTexture(heightToNormalCanvas(rkHCanvas, 3.6), aniso, 2, 2);

  // 7. Fabric & Leather Normal Maps (for realistic clothing & vest!)
  const [fbHCanvas, fbHCtx] = makeCanvas(128, 128);
  fbHCtx.fillStyle = '#808080';
  fbHCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const weave = ((x + y) % 4 === 0 ? 150 : 105) + Math.floor((Math.random() - 0.5) * 20);
      fbHCtx.fillStyle = `rgb(${weave},${weave},${weave})`;
      fbHCtx.fillRect(x, y, 2, 2);
    }
  }
  // Subtle cloth fold creases
  for (let i = 0; i < 10; i++) {
    fbHCtx.strokeStyle = i % 2 === 0 ? 'rgba(220,220,220,0.3)' : 'rgba(40,40,40,0.3)';
    fbHCtx.lineWidth = 4;
    fbHCtx.beginPath();
    const y0 = Math.random() * 128;
    fbHCtx.moveTo(0, y0);
    fbHCtx.quadraticCurveTo(64, y0 + (Math.random() - 0.5) * 28, 128, y0 + (Math.random() - 0.5) * 16);
    fbHCtx.stroke();
  }
  const fabricNormal = configureDataTexture(heightToNormalCanvas(fbHCanvas, 1.8), aniso, 3, 3);

  const [ltHCanvas, ltHCtx] = makeCanvas(128, 128);
  ltHCtx.fillStyle = '#808080';
  ltHCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    const v = 90 + Math.floor(Math.random() * 80);
    ltHCtx.fillStyle = `rgb(${v},${v},${v})`;
    ltHCtx.beginPath();
    ltHCtx.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 0, Math.PI * 2);
    ltHCtx.fill();
  }
  const leatherNormal = configureDataTexture(heightToNormalCanvas(ltHCanvas, 2.2), aniso, 3, 3);

  // 8. Alpha-cutout Pine Branchlet Texture (photorealistic needles, NOT cones!)
  const [pBrCanvas, pBrCtx] = makeCanvas(256, 256);
  pBrCtx.clearRect(0, 0, 256, 256);
  // Central woody stem + side twigs
  const drawPineTwig = (x0: number, y0: number, x1: number, y1: number, width: number) => {
    pBrCtx.strokeStyle = '#3b2819';
    pBrCtx.lineWidth = width;
    pBrCtx.lineCap = 'round';
    pBrCtx.beginPath();
    pBrCtx.moveTo(x0, y0);
    pBrCtx.lineTo(x1, y1);
    pBrCtx.stroke();

    const steps = 42;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x0 + (x1 - x0) * t;
      const py = y0 + (y1 - y0) * t;
      const baseAngle = Math.atan2(y1 - y0, x1 - x0);
      for (let side = -1; side <= 1; side += 2) {
        for (let k = 0; k < 2; k++) {
          const ang = baseAngle + side * (0.48 + Math.random() * 0.45);
          const len = (18 + Math.random() * 24) * (1 - t * 0.35);
          const g = 52 + Math.floor(Math.random() * 38 + t * 18);
          pBrCtx.strokeStyle = `rgb(${Math.floor(g * 0.46)}, ${g}, ${Math.floor(g * 0.34)})`;
          pBrCtx.lineWidth = 1.7;
          pBrCtx.beginPath();
          pBrCtx.moveTo(px, py);
          pBrCtx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
          pBrCtx.stroke();
        }
      }
    }
  };
  drawPineTwig(128, 248, 128, 26, 5);
  drawPineTwig(128, 190, 44, 118, 3.2);
  drawPineTwig(128, 190, 212, 118, 3.2);
  drawPineTwig(128, 130, 52, 65, 2.8);
  drawPineTwig(128, 130, 204, 65, 2.8);
  const pineBranchAlpha = configureColorTexture(pBrCanvas, aniso, 1, 1, true);

  // 9. Alpha-cutout Deciduous Leaf Spray Texture
  const [lBrCanvas, lBrCtx] = makeCanvas(256, 256);
  lBrCtx.clearRect(0, 0, 256, 256);
  lBrCtx.strokeStyle = '#473625';
  lBrCtx.lineWidth = 4;
  lBrCtx.beginPath();
  lBrCtx.moveTo(128, 248);
  lBrCtx.quadraticCurveTo(122, 145, 128, 42);
  lBrCtx.stroke();
  lBrCtx.lineWidth = 2.5;
  lBrCtx.beginPath();
  lBrCtx.moveTo(126, 175);
  lBrCtx.lineTo(54, 110);
  lBrCtx.moveTo(126, 165);
  lBrCtx.lineTo(202, 102);
  lBrCtx.moveTo(126, 112);
  lBrCtx.lineTo(66, 56);
  lBrCtx.moveTo(126, 106);
  lBrCtx.lineTo(194, 52);
  lBrCtx.stroke();

  for (let i = 0; i < 85; i++) {
    const cx = 38 + Math.random() * 180;
    const cy = 28 + Math.random() * 175;
    if (Math.hypot(cx - 128, cy - 118) > 96) continue;
    const ang = Math.random() * Math.PI * 2;
    const rx = 11 + Math.random() * 11;
    const ry = 6 + Math.random() * 5;
    const g = 68 + Math.floor(Math.random() * 56);
    lBrCtx.save();
    lBrCtx.translate(cx, cy);
    lBrCtx.rotate(ang);
    lBrCtx.fillStyle = `rgb(${Math.floor(g * 0.62)}, ${g}, ${Math.floor(g * 0.34)})`;
    lBrCtx.beginPath();
    lBrCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    lBrCtx.fill();
    lBrCtx.strokeStyle = 'rgba(28, 45, 18, 0.45)';
    lBrCtx.lineWidth = 1;
    lBrCtx.beginPath();
    lBrCtx.moveTo(-rx, 0);
    lBrCtx.lineTo(rx, 0);
    lBrCtx.stroke();
    lBrCtx.restore();
  }
  const leafBranchAlpha = configureColorTexture(lBrCanvas, aniso, 1, 1, true);

  // 10. Alpha-cutout Grass Tuft Texture
  const [grCanvas, grCtx] = makeCanvas(128, 128);
  grCtx.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 16; i++) {
    const baseX = 32 + Math.random() * 64;
    const tipX = baseX + (baseX - 64) * 0.85 + (Math.random() - 0.5) * 26;
    const tipY = 8 + Math.random() * 44;
    const g = 74 + Math.floor(Math.random() * 48);
    const grad = grCtx.createLinearGradient(baseX, 128, tipX, tipY);
    grad.addColorStop(0, `rgb(${Math.floor(g * 0.38)}, ${Math.floor(g * 0.55)}, ${Math.floor(g * 0.2)})`);
    grad.addColorStop(1, `rgb(${Math.floor(g * 0.85)}, ${g + 16}, ${Math.floor(g * 0.36)})`);
    grCtx.fillStyle = grad;
    grCtx.beginPath();
    grCtx.moveTo(baseX - 4, 128);
    grCtx.quadraticCurveTo((baseX + tipX) * 0.5 - 3, (128 + tipY) * 0.5, tipX, tipY);
    grCtx.quadraticCurveTo((baseX + tipX) * 0.5 + 3, (128 + tipY) * 0.5, baseX + 4, 128);
    grCtx.closePath();
    grCtx.fill();
  }
  const grassTuftAlpha = configureColorTexture(grCanvas, aniso, 1, 1, true);

  // 11. Alpha-cutout Fern Frond Texture
  const [fnCanvas, fnCtx] = makeCanvas(128, 128);
  fnCtx.clearRect(0, 0, 128, 128);
  fnCtx.strokeStyle = '#3c5e24';
  fnCtx.lineWidth = 3;
  fnCtx.beginPath();
  fnCtx.moveTo(64, 126);
  fnCtx.lineTo(64, 8);
  fnCtx.stroke();
  for (let y = 114; y >= 14; y -= 7) {
    const t = (128 - y) / 120;
    const span = (1 - t * 0.78) * 52;
    for (let side = -1; side <= 1; side += 2) {
      fnCtx.fillStyle = `rgb(${48 + Math.floor(t * 25)}, ${86 + Math.floor(t * 34)}, 32)`;
      fnCtx.beginPath();
      fnCtx.ellipse(64 + side * span * 0.52, y, span * 0.52, 3.2, side * -0.22, 0, Math.PI * 2);
      fnCtx.fill();
    }
  }
  const fernFrondAlpha = configureColorTexture(fnCanvas, aniso, 1, 1, true);

  // 12. Soft Contact Shadow
  const [csCanvas, csCtx] = makeCanvas(128, 128);
  const csGrad = csCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  csGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  csGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  csGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 128, 128);
  const contactShadow = configureColorTexture(csCanvas, 1, 1, 1, true);

  // 13. Soft Glowing Particle Sprite
  const [ptCanvas, ptCtx] = makeCanvas(64, 64);
  const ptGrad = ptCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  ptGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  ptGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.65)');
  ptGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ptCtx.fillStyle = ptGrad;
  ptCtx.fillRect(0, 0, 64, 64);
  const particleSoft = configureColorTexture(ptCanvas, 1, 1, 1, true);

  // 14. Clothing Albedos
  const [flCanvas, flCtx] = makeCanvas(128, 128);
  flCtx.fillStyle = '#8b2422';
  flCtx.fillRect(0, 0, 128, 128);
  flCtx.fillStyle = 'rgba(20, 14, 12, 0.55)';
  for (let i = 0; i < 128; i += 32) {
    flCtx.fillRect(i, 0, 10, 128);
    flCtx.fillRect(0, i, 128, 10);
  }
  flCtx.fillStyle = 'rgba(220, 180, 140, 0.16)';
  for (let i = 16; i < 128; i += 32) {
    flCtx.fillRect(i, 0, 3, 128);
    flCtx.fillRect(0, i, 128, 3);
  }
  const fabricFlannel = configureColorTexture(flCanvas, aniso, 2, 2);

  const [cmCanvas, cmCtx] = makeCanvas(128, 128);
  cmCtx.fillStyle = '#3b433f';
  cmCtx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 110; i++) {
    cmCtx.fillStyle =
      i % 3 === 0 ? 'rgba(24, 28, 26, 0.45)' : i % 3 === 1 ? 'rgba(72, 82, 68, 0.35)' : 'rgba(54, 48, 38, 0.3)';
    cmCtx.beginPath();
    cmCtx.ellipse(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 14, 4 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
    cmCtx.fill();
  }
  const fabricCamo = configureColorTexture(cmCanvas, aniso, 2, 2);

  const [dnCanvas, dnCtx] = makeCanvas(128, 128);
  dnCtx.fillStyle = '#25374a';
  dnCtx.fillRect(0, 0, 128, 128);
  dnCtx.strokeStyle = 'rgba(180, 200, 225, 0.09)';
  dnCtx.lineWidth = 1;
  for (let i = -128; i < 256; i += 4) {
    dnCtx.beginPath();
    dnCtx.moveTo(i, 0);
    dnCtx.lineTo(i + 128, 128);
    dnCtx.stroke();
  }
  const fabricDenim = configureColorTexture(dnCanvas, aniso, 2, 2);

  const all = [
    groundAlbedo,
    groundNormal,
    groundRoughness,
    pineBarkAlbedo,
    pineBarkNormal,
    birchBarkAlbedo,
    woodPlankAlbedo,
    woodPlankNormal,
    woodEndAlbedo,
    rockAlbedo,
    rockNormal,
    fabricNormal,
    leatherNormal,
    pineBranchAlpha,
    leafBranchAlpha,
    grassTuftAlpha,
    fernFrondAlpha,
    contactShadow,
    particleSoft,
    fabricFlannel,
    fabricCamo,
    fabricDenim,
  ];

  return {
    groundAlbedo,
    groundNormal,
    groundRoughness,
    pineBarkAlbedo,
    pineBarkNormal,
    birchBarkAlbedo,
    woodPlankAlbedo,
    woodPlankNormal,
    woodEndAlbedo,
    rockAlbedo,
    rockNormal,
    fabricNormal,
    leatherNormal,
    pineBranchAlpha,
    leafBranchAlpha,
    grassTuftAlpha,
    fernFrondAlpha,
    contactShadow,
    particleSoft,
    fabricFlannel,
    fabricCamo,
    fabricDenim,
    dispose: () => {
      all.forEach((t) => t.dispose());
    },
  };
}
