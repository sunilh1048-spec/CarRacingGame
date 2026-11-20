import * as THREE from 'three';
import { StageId } from './types';

export interface ProceduralTextureSet {
  roadTexture: THREE.CanvasTexture;
  terrainTexture: THREE.CanvasTexture;
  curbTexture: THREE.CanvasTexture;
  checkeredTexture: THREE.CanvasTexture;
  contactShadowTexture: THREE.CanvasTexture;
  particleTexture: THREE.CanvasTexture;
  buildingFacadeTexture?: THREE.CanvasTexture;
  dispose: () => void;
}

function configureTexture(
  tex: THREE.CanvasTexture,
  maxAniso: number,
  isColor = true,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.anisotropy = Math.min(8, maxAniso);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.needsUpdate = true;
  return tex;
}

export function createStageTextures(
  stageId: StageId,
  maxAnisotropy: number,
): ProceduralTextureSet {
  const disposable: THREE.Texture[] = [];

  // 1. Road Surface Texture (U = across width 0..1, V = along track)
  const roadCanvas = document.createElement('canvas');
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const rctx = roadCanvas.getContext('2d')!;

  if (stageId === 'desert') {
    rctx.fillStyle = '#403833';
    rctx.fillRect(0, 0, 512, 512);
    // Warm sunlit asphalt grain + subtle sand dusting on shoulders
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const lum = 52 + Math.floor(Math.random() * 24);
      rctx.fillStyle = `rgb(${lum + 8}, ${lum + 2}, ${lum - 4})`;
      rctx.fillRect(x, y, 2, 2);
    }
    // Dusty edge gradient
    const leftDust = rctx.createLinearGradient(0, 0, 58, 0);
    leftDust.addColorStop(0, 'rgba(218, 154, 104, 0.55)');
    leftDust.addColorStop(1, 'rgba(218, 154, 104, 0)');
    rctx.fillStyle = leftDust;
    rctx.fillRect(0, 0, 58, 512);

    const rightDust = rctx.createLinearGradient(454, 0, 512, 0);
    rightDust.addColorStop(0, 'rgba(218, 154, 104, 0)');
    rightDust.addColorStop(1, 'rgba(218, 154, 104, 0.55)');
    rctx.fillStyle = rightDust;
    rctx.fillRect(454, 0, 58, 512);

    // Shoulder lines
    rctx.fillStyle = '#f3d9b1';
    rctx.fillRect(36, 0, 7, 512);
    rctx.fillRect(469, 0, 7, 512);
    // Dashed amber-cream center line
    rctx.fillStyle = '#fbbf24';
    rctx.fillRect(251, 32, 10, 180);
    rctx.fillRect(251, 288, 10, 180);
  } else if (stageId === 'snow') {
    rctx.fillStyle = '#384352';
    rctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const lum = 50 + Math.floor(Math.random() * 26);
      rctx.fillStyle = `rgb(${lum - 4}, ${lum + 3}, ${lum + 14})`;
      rctx.fillRect(x, y, 2, 2);
    }
    // Frost edging
    const leftFrost = rctx.createLinearGradient(0, 0, 68, 0);
    leftFrost.addColorStop(0, 'rgba(232, 243, 252, 0.65)');
    leftFrost.addColorStop(1, 'rgba(232, 243, 252, 0)');
    rctx.fillStyle = leftFrost;
    rctx.fillRect(0, 0, 68, 512);

    const rightFrost = rctx.createLinearGradient(444, 0, 512, 0);
    rightFrost.addColorStop(0, 'rgba(232, 243, 252, 0)');
    rightFrost.addColorStop(1, 'rgba(232, 243, 252, 0.65)');
    rctx.fillStyle = rightFrost;
    rctx.fillRect(444, 0, 68, 512);

    rctx.fillStyle = '#e0f2fe';
    rctx.fillRect(38, 0, 7, 512);
    rctx.fillRect(467, 0, 7, 512);
    rctx.fillStyle = '#bae6fd';
    rctx.fillRect(251, 32, 10, 180);
    rctx.fillRect(251, 288, 10, 180);
  } else {
    // Neon City wet dark asphalt
    rctx.fillStyle = '#1b202e';
    rctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const lum = 22 + Math.floor(Math.random() * 20);
      rctx.fillStyle = `rgb(${lum}, ${lum + 4}, ${lum + 14})`;
      rctx.fillRect(x, y, 2, 2);
    }
    // Subtle glowing cyan/rose lane strips
    rctx.fillStyle = '#38bdf8';
    rctx.fillRect(34, 0, 8, 512);
    rctx.fillStyle = '#fb7185';
    rctx.fillRect(470, 0, 8, 512);
    rctx.fillStyle = '#e2e8f0';
    rctx.fillRect(252, 28, 8, 170);
    rctx.fillRect(252, 284, 8, 170);
  }

  const roadTexture = configureTexture(
    new THREE.CanvasTexture(roadCanvas),
    maxAnisotropy,
    true,
    1,
    46,
  );
  disposable.push(roadTexture);

  // 2. Terrain Texture
  const terrCanvas = document.createElement('canvas');
  terrCanvas.width = 512;
  terrCanvas.height = 512;
  const tctx = terrCanvas.getContext('2d')!;

  if (stageId === 'desert') {
    tctx.fillStyle = '#d48655';
    tctx.fillRect(0, 0, 512, 512);
    // Wind-carved sand ripples
    for (let y = 0; y < 512; y += 8) {
      tctx.fillStyle =
        y % 16 === 0 ? 'rgba(244, 186, 130, 0.25)' : 'rgba(170, 86, 48, 0.16)';
      tctx.beginPath();
      tctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 32) {
        tctx.lineTo(x, y + Math.sin((x / 512) * Math.PI * 4) * 3);
      }
      tctx.lineTo(512, y + 5);
      tctx.lineTo(0, y + 5);
      tctx.closePath();
      tctx.fill();
    }
  } else if (stageId === 'snow') {
    tctx.fillStyle = '#e6f0f8';
    tctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      tctx.fillStyle =
        Math.random() > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(186,214,238,0.35)';
      tctx.fillRect(x, y, 3, 3);
    }
  } else {
    tctx.fillStyle = '#141726';
    tctx.fillRect(0, 0, 512, 512);
    tctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    tctx.lineWidth = 2;
    for (let g = 0; g < 512; g += 64) {
      tctx.beginPath();
      tctx.moveTo(g, 0);
      tctx.lineTo(g, 512);
      tctx.stroke();
      tctx.beginPath();
      tctx.moveTo(0, g);
      tctx.lineTo(512, g);
      tctx.stroke();
    }
  }

  const terrainTexture = configureTexture(
    new THREE.CanvasTexture(terrCanvas),
    maxAnisotropy,
    true,
    24,
    24,
  );
  disposable.push(terrainTexture);

  // 3. Alternating Curb Texture
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = 64;
  curbCanvas.height = 128;
  const cctx = curbCanvas.getContext('2d')!;
  const c1 =
    stageId === 'desert'
      ? '#f5ebd6'
      : stageId === 'snow'
        ? '#f8fafc'
        : '#38bdf8';
  const c2 =
    stageId === 'desert'
      ? '#cf5c3e'
      : stageId === 'snow'
        ? '#3b7ea1'
        : '#fb7185';
  cctx.fillStyle = c1;
  cctx.fillRect(0, 0, 64, 64);
  cctx.fillStyle = c2;
  cctx.fillRect(0, 64, 64, 64);
  const curbTexture = configureTexture(
    new THREE.CanvasTexture(curbCanvas),
    maxAnisotropy,
    true,
    1,
    130,
  );
  disposable.push(curbTexture);

  // 4. Start/Finish Checkered Texture
  const chkCanvas = document.createElement('canvas');
  chkCanvas.width = 256;
  chkCanvas.height = 64;
  const kctx = chkCanvas.getContext('2d')!;
  const sq = 16;
  for (let y = 0; y < 64; y += sq) {
    for (let x = 0; x < 256; x += sq) {
      const dark = ((x / sq) + (y / sq)) % 2 === 0;
      kctx.fillStyle = dark ? '#18181b' : '#fafaf9';
      kctx.fillRect(x, y, sq, sq);
    }
  }
  const checkeredTexture = configureTexture(
    new THREE.CanvasTexture(chkCanvas),
    maxAnisotropy,
    true,
    1,
    1,
  );
  disposable.push(checkeredTexture);

  // 5. Contact Shadow Radial Texture
  const shadCanvas = document.createElement('canvas');
  shadCanvas.width = 128;
  shadCanvas.height = 128;
  const sctx = shadCanvas.getContext('2d')!;
  const grad = sctx.createRadialGradient(64, 64, 10, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const contactShadowTexture = new THREE.CanvasTexture(shadCanvas);
  contactShadowTexture.needsUpdate = true;
  disposable.push(contactShadowTexture);

  // 6. Soft Particle Sprite Texture
  const partCanvas = document.createElement('canvas');
  partCanvas.width = 64;
  partCanvas.height = 64;
  const pctx = partCanvas.getContext('2d')!;
  const pgrad = pctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  pgrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  pgrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.65)');
  pgrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  pctx.fillStyle = pgrad;
  pctx.fillRect(0, 0, 64, 64);
  const particleTexture = new THREE.CanvasTexture(partCanvas);
  particleTexture.colorSpace = THREE.SRGBColorSpace;
  particleTexture.needsUpdate = true;
  disposable.push(particleTexture);

  // 7. Neon City Building Window Facade Texture
  let buildingFacadeTexture: THREE.CanvasTexture | undefined;
  if (stageId === 'city') {
    const bCanvas = document.createElement('canvas');
    bCanvas.width = 256;
    bCanvas.height = 512;
    const bctx = bCanvas.getContext('2d')!;
    bctx.fillStyle = '#141829';
    bctx.fillRect(0, 0, 256, 512);

    const palette = ['#fde68a', '#67e8f9', '#fda4af', '#c4b5fd', '#fed7aa'];
    for (let row = 16; row < 496; row += 24) {
      const rowColor = palette[Math.floor(Math.random() * palette.length)];
      for (let col = 14; col < 242; col += 26) {
        const lit = Math.random() > 0.34;
        bctx.fillStyle = lit ? rowColor : '#1f253d';
        bctx.globalAlpha = lit ? 0.55 + Math.random() * 0.45 : 1;
        bctx.fillRect(col, row, 16, 13);
      }
    }
    bctx.globalAlpha = 1;
    buildingFacadeTexture = configureTexture(
      new THREE.CanvasTexture(bCanvas),
      maxAnisotropy,
      true,
      1,
      2,
    );
    disposable.push(buildingFacadeTexture);
  }

  return {
    roadTexture,
    terrainTexture,
    curbTexture,
    checkeredTexture,
    contactShadowTexture,
    particleTexture,
    buildingFacadeTexture,
    dispose: () => {
      disposable.forEach((t) => t.dispose());
    },
  };
}
