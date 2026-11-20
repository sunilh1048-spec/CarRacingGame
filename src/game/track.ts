import * as THREE from 'three';
import { MinimapPoint, StageConfig } from './types';
import { ProceduralTextureSet } from './textures';

export const ROAD_HALF_WIDTH = 7.25;
export const CURB_WIDTH = 1.3;
export const TRACK_SAMPLES = 360;

export interface TrackProjection {
  t: number;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  lateralOffset: number;
  distanceSq: number;
}

export interface BoostPadItem {
  t: number;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
}

export interface StarOrbItem {
  t: number;
  lateral: number;
  position: THREE.Vector3;
  group: THREE.Group;
  cooldown: number;
}

export interface BuiltTrack {
  group: THREE.Group;
  curve: THREE.CatmullRomCurve3;
  totalLength: number;
  samples: {
    t: number;
    pos: THREE.Vector3;
    tan: THREE.Vector3;
    right: THREE.Vector3;
  }[];
  boostPads: BoostPadItem[];
  starOrbs: StarOrbItem[];
  minimapPoints: MinimapPoint[];
  mapBounds: { minX: number; maxX: number; minZ: number; maxZ: number; scale: number; offsetX: number; offsetY: number };
  toMinimap: (x: number, z: number) => MinimapPoint;
  projectPoint: (pos: THREE.Vector3, hintT?: number) => TrackProjection;
  sampleAtT: (t: number, outPos: THREE.Vector3, outTan: THREE.Vector3, outRight: THREE.Vector3) => void;
  nearestTrackDistanceXZ: (x: number, z: number) => { dist: number; y: number };
  updateDynamic: (elapsed: number, dt: number) => void;
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);

export function buildTrack(
  config: StageConfig,
  textures: ProceduralTextureSet,
): BuiltTrack {
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

  const controlVecs = config.trackPoints.map(
    ([x, y, z]) => new THREE.Vector3(x, y, z),
  );
  const curve = new THREE.CatmullRomCurve3(controlVecs, true, 'catmullrom', 0.5);
  const totalLength = curve.getLength();

  const samples: BuiltTrack['samples'] = [];
  for (let i = 0; i < TRACK_SAMPLES; i++) {
    const t = i / TRACK_SAMPLES;
    const pos = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    // Keep road cross-section horizontal in XZ so car never rolls awkwardly
    const right = new THREE.Vector3().crossVectors(tan, UP).normalize();
    samples.push({ t, pos, tan, right });
  }

  // Minimap coordinate normalization into 0..100 box
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of samples) {
    if (s.pos.x < minX) minX = s.pos.x;
    if (s.pos.x > maxX) maxX = s.pos.x;
    if (s.pos.z < minZ) minZ = s.pos.z;
    if (s.pos.z > maxZ) maxZ = s.pos.z;
  }
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const pad = 10;
  const avail = 100 - pad * 2;
  const scale = avail / Math.max(spanX, spanZ);
  const offsetX = pad + (avail - spanX * scale) * 0.5;
  const offsetY = pad + (avail - spanZ * scale) * 0.5;

  const toMinimap = (x: number, z: number): MinimapPoint => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + (z - minZ) * scale,
  });

  const minimapPoints: MinimapPoint[] = [];
  for (let i = 0; i < TRACK_SAMPLES; i += 4) {
    minimapPoints.push(toMinimap(samples[i].pos.x, samples[i].pos.z));
  }

  // Build Road Ribbon Geometry
  const segCount = TRACK_SAMPLES;
  const roadVerts = new Float32Array((segCount + 1) * 2 * 3);
  const roadUvs = new Float32Array((segCount + 1) * 2 * 2);
  const roadIndices: number[] = [];

  // Curb + Solid Road Embankment Geometry
  const curbVerts = new Float32Array((segCount + 1) * 4 * 3);
  const curbUvs = new Float32Array((segCount + 1) * 4 * 2);
  const curbIndices: number[] = [];

  const bankVerts = new Float32Array((segCount + 1) * 4 * 3);
  const bankIndices: number[] = [];

  for (let i = 0; i <= segCount; i++) {
    const s = samples[i % segCount];
    const vCoord = i / segCount;

    // Road left (-right) and right (+right)
    const lx = s.pos.x - s.right.x * ROAD_HALF_WIDTH;
    const ly = s.pos.y;
    const lz = s.pos.z - s.right.z * ROAD_HALF_WIDTH;

    const rx = s.pos.x + s.right.x * ROAD_HALF_WIDTH;
    const ry = s.pos.y;
    const rz = s.pos.z + s.right.z * ROAD_HALF_WIDTH;

    const rIdx = i * 6;
    roadVerts[rIdx] = lx;
    roadVerts[rIdx + 1] = ly;
    roadVerts[rIdx + 2] = lz;
    roadVerts[rIdx + 3] = rx;
    roadVerts[rIdx + 4] = ry;
    roadVerts[rIdx + 5] = rz;

    const uvIdx = i * 4;
    roadUvs[uvIdx] = 0;
    roadUvs[uvIdx + 1] = vCoord;
    roadUvs[uvIdx + 2] = 1;
    roadUvs[uvIdx + 3] = vCoord;

    // Curbs (inner edge at ROAD_HALF_WIDTH, outer edge at ROAD_HALF_WIDTH + CURB_WIDTH, slightly raised +0.08)
    const lOutX = s.pos.x - s.right.x * (ROAD_HALF_WIDTH + CURB_WIDTH);
    const lOutZ = s.pos.z - s.right.z * (ROAD_HALF_WIDTH + CURB_WIDTH);
    const rOutX = s.pos.x + s.right.x * (ROAD_HALF_WIDTH + CURB_WIDTH);
    const rOutZ = s.pos.z + s.right.z * (ROAD_HALF_WIDTH + CURB_WIDTH);

    const cIdx = i * 12;
    // 0: left outer, 1: left inner, 2: right inner, 3: right outer
    curbVerts[cIdx] = lOutX;
    curbVerts[cIdx + 1] = ly + 0.14;
    curbVerts[cIdx + 2] = lOutZ;

    curbVerts[cIdx + 3] = lx;
    curbVerts[cIdx + 4] = ly + 0.02;
    curbVerts[cIdx + 5] = lz;

    curbVerts[cIdx + 6] = rx;
    curbVerts[cIdx + 7] = ry + 0.02;
    curbVerts[cIdx + 8] = rz;

    curbVerts[cIdx + 9] = rOutX;
    curbVerts[cIdx + 10] = ry + 0.14;
    curbVerts[cIdx + 11] = rOutZ;

    const cuvIdx = i * 8;
    curbUvs[cuvIdx] = 0;
    curbUvs[cuvIdx + 1] = vCoord;
    curbUvs[cuvIdx + 2] = 1;
    curbUvs[cuvIdx + 3] = vCoord;
    curbUvs[cuvIdx + 4] = 0;
    curbUvs[cuvIdx + 5] = vCoord;
    curbUvs[cuvIdx + 6] = 1;
    curbUvs[cuvIdx + 7] = vCoord;

    // Embankment walls down from outer curbs into terrain
    const drop = -4.2;
    bankVerts[cIdx] = lOutX;
    bankVerts[cIdx + 1] = ly + 0.14;
    bankVerts[cIdx + 2] = lOutZ;

    bankVerts[cIdx + 3] = lOutX - s.right.x * 1.4;
    bankVerts[cIdx + 4] = ly + drop;
    bankVerts[cIdx + 5] = lOutZ - s.right.z * 1.4;

    bankVerts[cIdx + 6] = rOutX;
    bankVerts[cIdx + 7] = ry + 0.14;
    bankVerts[cIdx + 8] = rOutZ;

    bankVerts[cIdx + 9] = rOutX + s.right.x * 1.4;
    bankVerts[cIdx + 10] = ry + drop;
    bankVerts[cIdx + 11] = rOutZ + s.right.z * 1.4;

    if (i < segCount) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      roadIndices.push(a, c, b, b, c, d);

      const ca = i * 4;
      // Left curb quad
      curbIndices.push(ca, ca + 4, ca + 1, ca + 1, ca + 4, ca + 5);
      // Right curb quad
      curbIndices.push(ca + 2, ca + 6, ca + 3, ca + 3, ca + 6, ca + 7);

      // Left outer embankment
      bankIndices.push(ca + 1, ca + 5, ca, ca, ca + 5, ca + 4);
      // Right outer embankment
      bankIndices.push(ca + 2, ca + 6, ca + 3, ca + 3, ca + 6, ca + 7);
    }
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadVerts, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUvs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.roadTexture,
      roughness: config.id === 'city' ? 0.34 : 0.78,
      metalness: config.id === 'city' ? 0.18 : 0.04,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  const curbGeo = trackGeo(new THREE.BufferGeometry());
  curbGeo.setAttribute('position', new THREE.BufferAttribute(curbVerts, 3));
  curbGeo.setAttribute('uv', new THREE.BufferAttribute(curbUvs, 2));
  curbGeo.setIndex(curbIndices);
  curbGeo.computeVertexNormals();

  const curbMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.curbTexture,
      roughness: 0.55,
      metalness: 0.08,
    }),
  );
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.receiveShadow = true;
  curbMesh.castShadow = true;
  group.add(curbMesh);

  const bankGeo = trackGeo(new THREE.BufferGeometry());
  bankGeo.setAttribute('position', new THREE.BufferAttribute(bankVerts, 3));
  bankGeo.setIndex(bankIndices);
  bankGeo.computeVertexNormals();

  const bankColor =
    config.id === 'desert'
      ? 0xb5683f
      : config.id === 'snow'
        ? 0x7b93ad
        : 0x242a3d;
  const bankMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: bankColor,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  const bankMesh = new THREE.Mesh(bankGeo, bankMat);
  bankMesh.receiveShadow = true;
  group.add(bankMesh);

  // Start / Finish Gantry & Checkered Line (at t = 0)
  const startSample = samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.pos);
  // Orient gantry -Z along track tangent
  const gantryAngle = Math.atan2(-startSample.tan.x, -startSample.tan.z);
  gantryGroup.rotation.y = gantryAngle;

  const chkGeo = trackGeo(new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 3.2));
  chkGeo.rotateX(-Math.PI / 2);
  const chkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.checkeredTexture,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const chkStrip = new THREE.Mesh(chkGeo, chkMat);
  chkStrip.position.y = 0.03;
  chkStrip.receiveShadow = true;
  gantryGroup.add(chkStrip);

  const pillarGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.55, 7.6, 12));
  const pillarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: config.id === 'city' ? 0x1e293b : 0xf4efe6,
      roughness: 0.45,
      metalness: 0.4,
    }),
  );
  const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
  leftPillar.position.set(-(ROAD_HALF_WIDTH + 1.0), 3.8, 0);
  leftPillar.castShadow = true;
  const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
  rightPillar.position.set(ROAD_HALF_WIDTH + 1.0, 3.8, 0);
  rightPillar.castShadow = true;
  gantryGroup.add(leftPillar, rightPillar);

  const beamGeo = trackGeo(
    new THREE.BoxGeometry(ROAD_HALF_WIDTH * 2 + 3.2, 1.35, 0.9),
  );
  const beamMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: config.id === 'city' ? 0x0f172a : 0x27272a,
      roughness: 0.4,
      metalness: 0.5,
    }),
  );
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 7.3, 0);
  beam.castShadow = true;
  gantryGroup.add(beam);

  const bannerGeo = trackGeo(
    new THREE.BoxGeometry(ROAD_HALF_WIDTH * 1.85, 0.85, 1.0),
  );
  const bannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.checkeredTexture,
      emissive: config.id === 'city' ? 0x38bdf8 : 0xf59e0b,
      emissiveIntensity: config.id === 'city' ? 0.55 : 0.25,
      roughness: 0.3,
    }),
  );
  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 7.3, 0);
  gantryGroup.add(banner);
  group.add(gantryGroup);

  // Boost Pads (4 evenly spaced along straights/sweeps)
  const boostPads: BoostPadItem[] = [];
  const boostPadTs = [0.16, 0.42, 0.68, 0.88];
  const padGeo = trackGeo(new THREE.PlaneGeometry(3.6, 5.2));
  padGeo.rotateX(-Math.PI / 2);
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.6,
      roughness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

  for (const bt of boostPadTs) {
    const idx = Math.floor(bt * TRACK_SAMPLES) % TRACK_SAMPLES;
    const s = samples[idx];
    const mesh = new THREE.Mesh(padGeo, padMat);
    mesh.position.copy(s.pos);
    mesh.position.y += 0.04;
    mesh.rotation.y = Math.atan2(-s.tan.x, -s.tan.z);
    group.add(mesh);
    boostPads.push({ t: bt, position: s.pos.clone(), mesh });
  }

  // Collectible Cozy Star Orbs (10 along racing line)
  const starOrbs: StarOrbItem[] = [];
  const starGeo = trackGeo(new THREE.OctahedronGeometry(0.68, 0));
  const ringGeo = trackGeo(new THREE.TorusGeometry(0.95, 0.07, 8, 20));
  const starMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.18,
      metalness: 0.6,
    }),
  );
  const ringMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.65,
    }),
  );

  const orbConfigs: [number, number][] = [
    [0.08, -2.5],
    [0.24, 3.0],
    [0.33, -2.8],
    [0.48, 2.2],
    [0.56, -3.2],
    [0.64, 0.0],
    [0.74, 2.8],
    [0.82, -2.4],
    [0.93, 2.5],
  ];

  for (const [ot, lat] of orbConfigs) {
    const idx = Math.floor(ot * TRACK_SAMPLES) % TRACK_SAMPLES;
    const s = samples[idx];
    const orbGroup = new THREE.Group();
    const pos = s.pos.clone().addScaledVector(s.right, lat);
    pos.y += 1.15;
    orbGroup.position.copy(pos);

    const star = new THREE.Mesh(starGeo, starMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3;
    orbGroup.add(star, ring);
    group.add(orbGroup);

    starOrbs.push({
      t: ot,
      lateral: lat,
      position: pos,
      group: orbGroup,
      cooldown: 0,
    });
  }

  // Track sampling & projection helpers (zero heap allocations during hot lookup)
  const _tmpA = new THREE.Vector3();
  const _tmpB = new THREE.Vector3();

  const sampleAtT = (
    rawT: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outRight: THREE.Vector3,
  ) => {
    const t = ((rawT % 1) + 1) % 1;
    const fIdx = t * TRACK_SAMPLES;
    const i0 = Math.floor(fIdx) % TRACK_SAMPLES;
    const i1 = (i0 + 1) % TRACK_SAMPLES;
    const alpha = fIdx - Math.floor(fIdx);

    const s0 = samples[i0];
    const s1 = samples[i1];
    outPos.lerpVectors(s0.pos, s1.pos, alpha);
    outTan.lerpVectors(s0.tan, s1.tan, alpha).normalize();
    outRight.lerpVectors(s0.right, s1.right, alpha).normalize();
  };

  const projectPoint = (pos: THREE.Vector3, hintT?: number): TrackProjection => {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintT !== undefined) {
      const center = Math.floor((((hintT % 1) + 1) % 1) * TRACK_SAMPLES);
      const windowRadius = 26;
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const idx = (center + offset + TRACK_SAMPLES) % TRACK_SAMPLES;
        const s = samples[idx];
        const dx = pos.x - s.pos.x;
        const dz = pos.z - s.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = idx;
        }
      }
      // Fallback full scan if player wandered very far
      if (bestDistSq > 900) {
        for (let i = 0; i < TRACK_SAMPLES; i++) {
          const s = samples[i];
          const dx = pos.x - s.pos.x;
          const dz = pos.z - s.pos.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
      }
    } else {
      for (let i = 0; i < TRACK_SAMPLES; i++) {
        const s = samples[i];
        const dx = pos.x - s.pos.x;
        const dz = pos.z - s.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    // Sub-segment refinement using adjacent sample
    const prevIdx = (bestIdx - 1 + TRACK_SAMPLES) % TRACK_SAMPLES;
    const nextIdx = (bestIdx + 1) % TRACK_SAMPLES;
    const sBest = samples[bestIdx];
    const sPrev = samples[prevIdx];
    const sNext = samples[nextIdx];

    _tmpA.subVectors(pos, sBest.pos);
    const alongDot = _tmpA.x * sBest.tan.x + _tmpA.z * sBest.tan.z;

    let refinedT = sBest.t;
    const outPos = new THREE.Vector3();
    const outTan = new THREE.Vector3();
    const outRight = new THREE.Vector3();

    if (alongDot >= 0) {
      const segLen = _tmpB.subVectors(sNext.pos, sBest.pos).length() || 1;
      const alpha = THREE.MathUtils.clamp(alongDot / segLen, 0, 1);
      refinedT = (bestIdx + alpha) / TRACK_SAMPLES;
      outPos.lerpVectors(sBest.pos, sNext.pos, alpha);
      outTan.lerpVectors(sBest.tan, sNext.tan, alpha).normalize();
      outRight.lerpVectors(sBest.right, sNext.right, alpha).normalize();
    } else {
      const segLen = _tmpB.subVectors(sBest.pos, sPrev.pos).length() || 1;
      const alpha = THREE.MathUtils.clamp(1 + alongDot / segLen, 0, 1);
      refinedT = ((prevIdx + alpha) / TRACK_SAMPLES + 1) % 1;
      outPos.lerpVectors(sPrev.pos, sBest.pos, alpha);
      outTan.lerpVectors(sPrev.tan, sBest.tan, alpha).normalize();
      outRight.lerpVectors(sPrev.right, sBest.right, alpha).normalize();
    }

    const dx = pos.x - outPos.x;
    const dz = pos.z - outPos.z;
    const lateralOffset = dx * outRight.x + dz * outRight.z;

    return {
      t: ((refinedT % 1) + 1) % 1,
      point: outPos,
      tangent: outTan,
      right: outRight,
      lateralOffset,
      distanceSq: dx * dx + dz * dz,
    };
  };

  const nearestTrackDistanceXZ = (x: number, z: number) => {
    let minD2 = Infinity;
    let bestY = 0;
    for (let i = 0; i < TRACK_SAMPLES; i += 2) {
      const s = samples[i];
      const dx = x - s.pos.x;
      const dz = z - s.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minD2) {
        minD2 = d2;
        bestY = s.pos.y;
      }
    }
    return { dist: Math.sqrt(minD2), y: bestY };
  };

  const updateDynamic = (elapsed: number, dt: number) => {
    for (let i = 0; i < starOrbs.length; i++) {
      const orb = starOrbs[i];
      if (orb.cooldown > 0) {
        orb.cooldown = Math.max(0, orb.cooldown - dt);
        orb.group.visible = orb.cooldown === 0;
      }
      if (orb.group.visible) {
        orb.group.rotation.y = elapsed * 2.2 + i * 0.7;
        orb.group.position.y =
          orb.position.y + Math.sin(elapsed * 3.1 + i) * 0.22;
      }
    }
    padMat.emissiveIntensity = 1.3 + Math.sin(elapsed * 4.5) * 0.45;
  };

  return {
    group,
    curve,
    totalLength,
    samples,
    boostPads,
    starOrbs,
    minimapPoints,
    mapBounds: { minX, maxX, minZ, maxZ, scale, offsetX, offsetY },
    toMinimap,
    projectPoint,
    sampleAtT,
    nearestTrackDistanceXZ,
    updateDynamic,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
