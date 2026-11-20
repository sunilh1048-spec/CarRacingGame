import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ProceduralTextureSet } from './textures';
import { BuiltTrack, ROAD_HALF_WIDTH } from './track';
import { StageConfig } from './types';

export interface BuiltStage {
  group: THREE.Group;
  update: (elapsed: number, dt: number, focusPos: THREE.Vector3) => void;
  dispose: () => void;
}

// Deterministic seeded pseudo-random helper so each stage layout is consistent
function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildStageEnvironment(
  config: StageConfig,
  track: BuiltTrack,
  textures: ProceduralTextureSet,
): BuiltStage {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  // Terrain height function tailored to each biome, always clearing the road corridor
  const getTerrainHeight = (x: number, z: number): number => {
    const { dist, y: trackY } = track.nearestTrackDistanceXZ(x, z);
    const roadClear = ROAD_HALF_WIDTH + 3.2;

    if (config.id === 'desert') {
      const dunes =
        Math.sin(x * 0.025) * Math.cos(z * 0.022) * 3.8 +
        Math.sin((x + z) * 0.012) * 4.5 +
        Math.max(0, (Math.hypot(x - 60, z - 40) - 210) * 0.14);
      const blend = THREE.MathUtils.smoothstep(dist, roadClear, roadClear + 18);
      return THREE.MathUtils.lerp(trackY - 0.85, dunes, blend);
    }

    if (config.id === 'snow') {
      const hills =
        Math.sin(x * 0.024 + 1.1) * Math.cos(z * 0.024) * 5.2 +
        Math.cos((x - z) * 0.015) * 5.8 +
        Math.max(0, (Math.hypot(x + 70, z - 60) - 195) * 0.22);
      const blend = THREE.MathUtils.smoothstep(dist, roadClear, roadClear + 20);
      return THREE.MathUtils.lerp(trackY - 0.9, hills, blend);
    }

    // Neon City: flat urban plaza with harbor basin on +Z edge
    const blend = THREE.MathUtils.smoothstep(dist, roadClear, roadClear + 10);
    return THREE.MathUtils.lerp(trackY - 0.75, -0.35, blend);
  };

  // 1. Sculpted Extended Terrain Plane (900 x 900)
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(920, 920, 96, 96));
  terrainGeo.rotateX(-Math.PI / 2);
  // Center terrain roughly on track midpoint
  const centerX = config.id === 'snow' ? -70 : 65;
  const centerZ = 45;
  const posAttr = terrainGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const wx = posAttr.getX(i) + centerX;
    const wz = posAttr.getZ(i) + centerZ;
    posAttr.setXYZ(i, wx, getTerrainHeight(wx, wz), wz);
  }
  terrainGeo.computeVertexNormals();

  const terrainMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainTexture,
      roughness: config.id === 'snow' ? 0.82 : config.id === 'desert' ? 0.92 : 0.48,
      metalness: config.id === 'city' ? 0.22 : 0.02,
    }),
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);

  // 2. Gradient Sky Dome for Warm/Cool Atmospheric Horizon
  const skyGeo = trackGeo(new THREE.SphereGeometry(520, 24, 16));
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  const topColor = new THREE.Color(config.skyHex);
  const horColor = new THREE.Color(config.horizonHex);
  const tmpColor = new THREE.Color();
  const skyPos = skyGeo.attributes.position;
  for (let i = 0; i < skyPos.count; i++) {
    const y = skyPos.getY(i);
    const t = THREE.MathUtils.clamp((y + 20) / 260, 0, 1);
    tmpColor.lerpColors(horColor, topColor, Math.pow(t, 0.65));
    skyColors[i * 3] = tmpColor.r;
    skyColors[i * 3 + 1] = tmpColor.g;
    skyColors[i * 3 + 2] = tmpColor.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyColors, 3));
  const skyMat = trackMat(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.position.set(centerX, 0, centerZ);
  group.add(skyDome);

  const rng = createRng(
    config.id === 'desert' ? 101 : config.id === 'snow' ? 202 : 303,
  );
  const dummy = new THREE.Object3D();

  // =========================================================================
  // STAGE 1: DESERT ("Sunstone Canyon")
  // =========================================================================
  if (config.id === 'desert') {
    // Tiered Sandstone Mesas & Horizon Rock Buttes
    const mesaMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xc2613a,
        roughness: 0.9,
        metalness: 0.02,
      }),
    );
    const mesaCapMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97b4f,
        roughness: 0.86,
        metalness: 0.02,
      }),
    );

    const mesaSpots: [number, number, number, number][] = [
      [-115, -40, 34, 28],
      [95, -165, 42, 34],
      [255, -80, 38, 30],
      [265, 95, 45, 32],
      [155, 240, 40, 26],
      [-75, 225, 36, 29],
      [78, 22, 16, 15], // Interior oasis canyon rock
    ];

    for (const [mx, mz, rad, h] of mesaSpots) {
      const mesaGroup = new THREE.Group();
      const baseY = getTerrainHeight(mx, mz) - 1.5;
      mesaGroup.position.set(mx, baseY, mz);

      const baseGeo = trackGeo(new THREE.CylinderGeometry(rad * 0.72, rad, h * 0.65, 9));
      const baseMesh = new THREE.Mesh(baseGeo, mesaMat);
      baseMesh.position.y = h * 0.325;
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;

      const capGeo = trackGeo(new THREE.CylinderGeometry(rad * 0.52, rad * 0.68, h * 0.38, 9));
      const capMesh = new THREE.Mesh(capGeo, mesaCapMat);
      capMesh.position.y = h * 0.8;
      capMesh.castShadow = true;
      capMesh.receiveShadow = true;

      mesaGroup.add(baseMesh, capMesh);
      mesaGroup.rotation.y = rng() * Math.PI;
      group.add(mesaGroup);
    }

    // Monumental Sandstone Arch over the far canyon bend (near P4/P5)
    const archCenter = track.samples[150].pos;
    const archTan = track.samples[150].tan;
    const archGroup = new THREE.Group();
    archGroup.position.copy(archCenter);
    archGroup.rotation.y = Math.atan2(-archTan.x, -archTan.z);
    const archGeo = trackGeo(new THREE.TorusGeometry(18, 3.2, 8, 20, Math.PI));
    const archMesh = new THREE.Mesh(archGeo, mesaMat);
    archMesh.position.y = -0.5;
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
    archGroup.add(archMesh);
    group.add(archGroup);

    // Instanced Saguaro Cacti (composite trunk + arms merged into 1 geometry)
    const trunkG = new THREE.CylinderGeometry(0.42, 0.48, 4.4, 8);
    trunkG.translate(0, 2.2, 0);
    const armLG = new THREE.CylinderGeometry(0.28, 0.32, 1.8, 7);
    armLG.translate(-0.72, 2.6, 0);
    const armBridgeL = new THREE.BoxGeometry(0.75, 0.46, 0.46);
    armBridgeL.translate(-0.4, 1.9, 0);
    const armRG = new THREE.CylinderGeometry(0.26, 0.3, 1.5, 7);
    armRG.translate(0.72, 3.0, 0);
    const armBridgeR = new THREE.BoxGeometry(0.75, 0.44, 0.44);
    armBridgeR.translate(0.4, 2.4, 0);

    const cactusGeo = trackGeo(
      mergeGeometries([trunkG, armLG, armBridgeL, armRG, armBridgeR]),
    );
    [trunkG, armLG, armBridgeL, armRG, armBridgeR].forEach((g) => g.dispose());

    const cactusMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        metalness: 0.02,
      }),
    );

    const cactusPositions: [number, number, number][] = [];
    for (let i = 0; i < 240 && cactusPositions.length < 110; i++) {
      const cx = (rng() - 0.5) * 440 + centerX;
      const cz = (rng() - 0.5) * 440 + centerZ;
      const { dist } = track.nearestTrackDistanceXZ(cx, cz);
      if (dist > ROAD_HALF_WIDTH + 5.5 && dist < 165) {
        cactusPositions.push([cx, getTerrainHeight(cx, cz) - 0.2, cz]);
      }
    }

    const cactusInst = new THREE.InstancedMesh(
      cactusGeo,
      cactusMat,
      cactusPositions.length,
    );
    cactusInst.castShadow = true;
    cactusInst.receiveShadow = true;
    const cactusTint = new THREE.Color();
    cactusPositions.forEach(([x, y, z], idx) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      const s = 0.85 + rng() * 0.4;
      dummy.scale.set(s, s * (0.9 + rng() * 0.25), s);
      dummy.updateMatrix();
      cactusInst.setMatrixAt(idx, dummy.matrix);
      cactusTint.setHSL(0.29 + (rng() - 0.5) * 0.04, 0.45, 0.34 + rng() * 0.08);
      cactusInst.setColorAt(idx, cactusTint);
    });
    cactusInst.instanceMatrix.needsUpdate = true;
    if (cactusInst.instanceColor) cactusInst.instanceColor.needsUpdate = true;
    cactusInst.computeBoundingSphere();
    group.add(cactusInst);

    // Instanced Desert Boulders
    const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.5, 0));
    rockGeo.translate(0, 0.7, 0);
    const rockMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.92,
      }),
    );
    const rockSpots: [number, number, number][] = [];
    for (let i = 0; i < 180 && rockSpots.length < 85; i++) {
      const rx = (rng() - 0.5) * 400 + centerX;
      const rz = (rng() - 0.5) * 400 + centerZ;
      const { dist } = track.nearestTrackDistanceXZ(rx, rz);
      if (dist > ROAD_HALF_WIDTH + 4.5 && dist < 170) {
        rockSpots.push([rx, getTerrainHeight(rx, rz) - 0.25, rz]);
      }
    }
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    rockSpots.forEach(([x, y, z], idx) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4);
      dummy.scale.set(0.8 + rng() * 1.4, 0.6 + rng() * 0.9, 0.8 + rng() * 1.3);
      dummy.updateMatrix();
      rockInst.setMatrixAt(idx, dummy.matrix);
      cactusTint.setHSL(0.055 + (rng() - 0.5) * 0.02, 0.48, 0.46 + rng() * 0.1);
      rockInst.setColorAt(idx, cactusTint);
    });
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  // =========================================================================
  // STAGE 2: SNOWY MOUNTAIN ("Frostpine Pass")
  // =========================================================================
  if (config.id === 'snow') {
    // Ring of Snow-Capped Alpine Peaks
    const peakMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x768fa8,
        roughness: 0.85,
      }),
    );
    const snowCapMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f8fc,
        roughness: 0.72,
      }),
    );

    const peakCoords: [number, number, number, number][] = [
      [-260, -140, 72, 95],
      [-120, -210, 80, 105],
      [60, -180, 68, 86],
      [-310, 45, 85, 110],
      [-280, 210, 74, 92],
      [-90, 310, 76, 88],
      [115, 225, 65, 82],
      [145, 30, 62, 74],
    ];
    for (const [px, pz, rad, h] of peakCoords) {
      const mGroup = new THREE.Group();
      mGroup.position.set(px, getTerrainHeight(px, pz) - 4, pz);
      const baseG = trackGeo(new THREE.ConeGeometry(rad, h, 7));
      const baseM = new THREE.Mesh(baseG, peakMat);
      baseM.position.y = h * 0.5;
      const capG = trackGeo(new THREE.ConeGeometry(rad * 0.48, h * 0.48, 7));
      const capM = new THREE.Mesh(capG, snowCapMat);
      capM.position.y = h * 0.76;
      mGroup.add(baseM, capM);
      mGroup.rotation.y = rng() * Math.PI;
      group.add(mGroup);
    }

    // Instanced Multi-Tiered Snowy Alpine Pine Trees (bottom-center pivot)
    const pineTrunk = new THREE.CylinderGeometry(0.28, 0.38, 1.5, 7);
    pineTrunk.translate(0, 0.75, 0);
    const tier1 = new THREE.ConeGeometry(1.9, 3.0, 8);
    tier1.translate(0, 2.6, 0);
    const tier2 = new THREE.ConeGeometry(1.45, 2.5, 8);
    tier2.translate(0, 4.1, 0);
    const tier3 = new THREE.ConeGeometry(0.95, 2.0, 8);
    tier3.translate(0, 5.4, 0);

    const pineGeo = trackGeo(mergeGeometries([pineTrunk, tier1, tier2, tier3]));
    [pineTrunk, tier1, tier2, tier3].forEach((g) => g.dispose());

    const pineMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8,
      }),
    );

    const pineSpots: [number, number, number][] = [];
    for (let i = 0; i < 360 && pineSpots.length < 160; i++) {
      const tx = (rng() - 0.5) * 440 + centerX;
      const tz = (rng() - 0.5) * 440 + centerZ;
      const { dist } = track.nearestTrackDistanceXZ(tx, tz);
      if (dist > ROAD_HALF_WIDTH + 5.2 && dist < 175) {
        pineSpots.push([tx, getTerrainHeight(tx, tz) - 0.2, tz]);
      }
    }

    const pineInst = new THREE.InstancedMesh(pineGeo, pineMat, pineSpots.length);
    pineInst.castShadow = true;
    pineInst.receiveShadow = true;
    const pineColor = new THREE.Color();
    pineSpots.forEach(([x, y, z], idx) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      const s = 0.85 + rng() * 0.55;
      dummy.scale.set(s, s * (0.9 + rng() * 0.3), s);
      dummy.updateMatrix();
      pineInst.setMatrixAt(idx, dummy.matrix);
      pineColor.setHSL(0.42 + (rng() - 0.5) * 0.05, 0.34, 0.28 + rng() * 0.14);
      pineInst.setColorAt(idx, pineColor);
    });
    pineInst.instanceMatrix.needsUpdate = true;
    if (pineInst.instanceColor) pineInst.instanceColor.needsUpdate = true;
    pineInst.computeBoundingSphere();
    group.add(pineInst);

    // Cozy Glowing Alpine Timber Chalets (Composite 5-part Groups)
    const wallMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x6f4e37, roughness: 0.85 }),
    );
    const roofMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65 }),
    );
    const winMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 1.8,
        roughness: 0.2,
      }),
    );

    const chaletCoords: [number, number, number][] = [
      [-18, 82, 0.4],
      [22, 42, -0.5],
      [-75, 22, 1.1],
      [-155, 76, 0.2],
      [-92, 148, -0.7],
    ];
    for (const [cx, cz, rot] of chaletCoords) {
      const chalet = new THREE.Group();
      const cy = getTerrainHeight(cx, cz) - 0.2;
      chalet.position.set(cx, cy, cz);
      chalet.rotation.y = rot;

      const cabinBody = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(6.8, 4.2, 8.2)),
        wallMat,
      );
      cabinBody.position.y = 2.1;
      cabinBody.castShadow = true;
      cabinBody.receiveShadow = true;

      const roofGeo = trackGeo(new THREE.ConeGeometry(6.4, 3.6, 4));
      roofGeo.rotateY(Math.PI / 4);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.y = 5.8;
      roof.castShadow = true;

      const chimney = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.9, 2.2, 0.9)),
        wallMat,
      );
      chimney.position.set(1.8, 6.2, -1.6);

      const frontWin = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(2.2, 1.6, 0.2)),
        winMat,
      );
      frontWin.position.set(0, 2.1, 4.15);

      const sideWin = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.2, 1.4, 2.4)),
        winMat,
      );
      sideWin.position.set(3.45, 2.1, 0);

      chalet.add(cabinBody, roof, chimney, frontWin, sideWin);
      group.add(chalet);
    }
  }

  // =========================================================================
  // STAGE 3: DENSE NEON CITY ("Lantern Harbor")
  // =========================================================================
  if (config.id === 'city') {
    // 1. Dense Instanced Skyscrapers with Lit Cozy Windows
    const bldgGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    bldgGeo.translate(0, 0.5, 0); // bottom-center pivot!
    const bldgMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.buildingFacadeTexture,
        emissiveMap: textures.buildingFacadeTexture,
        emissive: 0xffffff,
        emissiveIntensity: 0.72,
        roughness: 0.42,
        metalness: 0.35,
      }),
    );

    const bldgSpots: [number, number, number, number, number][] = [];
    for (let i = 0; i < 420 && bldgSpots.length < 105; i++) {
      const bx = (rng() - 0.5) * 420 + centerX;
      const bz = (rng() - 0.5) * 420 + centerZ;
      const { dist } = track.nearestTrackDistanceXZ(bx, bz);
      if (dist > ROAD_HALF_WIDTH + 12 && dist < 195) {
        const w = 11 + rng() * 14;
        const d = 11 + rng() * 14;
        const h = 24 + rng() * 68;
        bldgSpots.push([bx, bz, w, h, d]);
      }
    }

    const bldgInst = new THREE.InstancedMesh(bldgGeo, bldgMat, bldgSpots.length);
    bldgInst.receiveShadow = true;
    const bldgTint = new THREE.Color();
    bldgSpots.forEach(([x, z, w, h, d], idx) => {
      dummy.position.set(x, -0.5, z);
      dummy.rotation.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      bldgInst.setMatrixAt(idx, dummy.matrix);
      bldgTint.setHSL(0.62 + (rng() - 0.5) * 0.14, 0.35, 0.72 + rng() * 0.25);
      bldgInst.setColorAt(idx, bldgTint);
    });
    bldgInst.instanceMatrix.needsUpdate = true;
    if (bldgInst.instanceColor) bldgInst.instanceColor.needsUpdate = true;
    bldgInst.computeBoundingSphere();
    group.add(bldgInst);

    // 2. Rooftop Neon Crown Strips (Instanced Glowing Roof Accents)
    const crownGeo = trackGeo(new THREE.BoxGeometry(1.04, 0.85, 1.04));
    const crownMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, bldgSpots.length);
    const neonPalette = [0x38bdf8, 0xfb7185, 0xfbbf24, 0xa78bfa, 0x34d399];
    bldgSpots.forEach(([x, z, w, h, d], idx) => {
      dummy.position.set(x, h - 1.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w, 1, d);
      dummy.updateMatrix();
      crownInst.setMatrixAt(idx, dummy.matrix);
      bldgTint.setHex(neonPalette[idx % neonPalette.length]);
      crownInst.setColorAt(idx, bldgTint);
    });
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    crownInst.computeBoundingSphere();
    group.add(crownInst);

    // 3. Roadside Glowing Streetlamps (Instanced along the track)
    const polePart = new THREE.CylinderGeometry(0.14, 0.18, 6.2, 6);
    polePart.translate(0, 3.1, 0);
    const armPart = new THREE.BoxGeometry(1.4, 0.16, 0.16);
    armPart.translate(0.6, 6.1, 0);
    const lampGeo = trackGeo(mergeGeometries([polePart, armPart]));
    polePart.dispose();
    armPart.dispose();

    const bulbGeo = trackGeo(new THREE.SphereGeometry(0.32, 8, 8));
    const poleMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.7,
        roughness: 0.3,
      }),
    );
    const bulbMat = trackMat(
      new THREE.MeshBasicMaterial({ color: 0xffe4b5 }),
    );

    const lampCount = 48;
    const poleInst = new THREE.InstancedMesh(lampGeo, poleMat, lampCount);
    const bulbInst = new THREE.InstancedMesh(bulbGeo, bulbMat, lampCount);
    const lampOffset = ROAD_HALF_WIDTH + 1.8;

    for (let i = 0; i < lampCount; i++) {
      const sIdx = Math.floor((i / lampCount) * track.samples.length);
      const s = track.samples[sIdx];
      const side = i % 2 === 0 ? 1 : -1;
      const lx = s.pos.x + s.right.x * lampOffset * side;
      const lz = s.pos.z + s.right.z * lampOffset * side;
      const rotY = Math.atan2(-s.right.z * side, s.right.x * side);

      dummy.position.set(lx, s.pos.y, lz);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      // Bulb sits at tip of arm
      const bx = lx + Math.cos(rotY) * 1.15;
      const bz = lz - Math.sin(rotY) * 1.15;
      dummy.position.set(bx, s.pos.y + 5.95, bz);
      dummy.updateMatrix();
      bulbInst.setMatrixAt(i, dummy.matrix);
    }
    poleInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    group.add(poleInst, bulbInst);

    // 4. Glowing Neon Archway Portals spanning key curves
    const portalTs = [0.22, 0.52, 0.78];
    const portalPillarGeo = trackGeo(new THREE.BoxGeometry(0.75, 9.2, 0.75));
    const portalBeamGeo = trackGeo(
      new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 4.4, 0.75, 0.75),
    );
    portalTs.forEach((pt, idx) => {
      const s = track.samples[Math.floor(pt * track.samples.length)];
      const pGroup = new THREE.Group();
      pGroup.position.copy(s.pos);
      pGroup.rotation.y = Math.atan2(-s.tan.x, -s.tan.z);

      const neonCol = idx === 1 ? 0xfb7185 : 0x38bdf8;
      const pMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: neonCol,
          emissiveIntensity: 1.8,
          roughness: 0.25,
        }),
      );
      const pL = new THREE.Mesh(portalPillarGeo, pMat);
      pL.position.set(-(ROAD_HALF_WIDTH + 1.8), 4.6, 0);
      const pR = new THREE.Mesh(portalPillarGeo, pMat);
      pR.position.set(ROAD_HALF_WIDTH + 1.8, 4.6, 0);
      const pTop = new THREE.Mesh(portalBeamGeo, pMat);
      pTop.position.set(0, 9.2, 0);
      pGroup.add(pL, pR, pTop);
      group.add(pGroup);
    });
  }

  // =========================================================================
  // 3. Ambient Atmospheric Particles (Sunlit Dust / Snowflakes / City Rain)
  // =========================================================================
  const pCount = config.id === 'snow' ? 650 : 320;
  const pPositions = new Float32Array(pCount * 3);
  const pOffsets = new Float32Array(pCount);
  const boxSpan = 140;

  for (let i = 0; i < pCount; i++) {
    pPositions[i * 3] = (rng() - 0.5) * boxSpan;
    pPositions[i * 3 + 1] = rng() * 32;
    pPositions[i * 3 + 2] = (rng() - 0.5) * boxSpan;
    pOffsets[i] = rng() * Math.PI * 2;
  }

  const pGeo = trackGeo(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const pMat = trackMat(
    new THREE.PointsMaterial({
      color: config.particleColorHex,
      map: textures.particleTexture,
      size: config.id === 'snow' ? 0.72 : config.id === 'desert' ? 0.55 : 0.42,
      transparent: true,
      opacity: config.id === 'snow' ? 0.85 : 0.45,
      depthWrite: false,
    }),
  );
  const weatherPoints = new THREE.Points(pGeo, pMat);
  weatherPoints.frustumCulled = false;
  group.add(weatherPoints);

  const update = (elapsed: number, dt: number, focusPos: THREE.Vector3) => {
    const pos = pGeo.attributes.position as THREE.BufferAttribute;
    const fallSpeed =
      config.id === 'snow' ? 5.2 : config.id === 'city' ? 16.0 : 0.7;

    for (let i = 0; i < pCount; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);

      if (config.id === 'snow') {
        y -= fallSpeed * dt;
        x += Math.sin(elapsed * 1.2 + pOffsets[i]) * 1.4 * dt;
      } else if (config.id === 'city') {
        y -= fallSpeed * dt;
      } else {
        y += Math.sin(elapsed * 0.8 + pOffsets[i]) * 0.35 * dt;
        x += 1.6 * dt;
      }

      // Wrap smoothly in local volume around focusPos
      if (y < 0) y += 32;
      if (y > 32) y -= 32;

      const half = boxSpan * 0.5;
      if (x - focusPos.x > half) x -= boxSpan;
      if (x - focusPos.x < -half) x += boxSpan;
      if (z - focusPos.z > half) z -= boxSpan;
      if (z - focusPos.z < -half) z += boxSpan;

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  };

  return {
    group,
    update,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
