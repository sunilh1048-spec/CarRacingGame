export type StageId = 'desert' | 'snow' | 'city';

export type GameMode = 'title' | 'countdown' | 'racing' | 'paused' | 'finished';

export type CameraMode = 'chase' | 'scenic' | 'hood';

export interface CarColorOption {
  id: string;
  name: string;
  bodyHex: number;
  cssHex: string;
  accentHex: number;
}

export const CAR_COLORS: CarColorOption[] = [
  {
    id: 'coral',
    name: 'Sunset Coral',
    bodyHex: 0xe86a53,
    cssHex: '#e86a53',
    accentHex: 0xf7d794,
  },
  {
    id: 'sage',
    name: 'Sage Mint',
    bodyHex: 0x56a88b,
    cssHex: '#56a88b',
    accentHex: 0xf3efe0,
  },
  {
    id: 'cream',
    name: 'Alpine Cream',
    bodyHex: 0xf0e4cf,
    cssHex: '#f0e4cf',
    accentHex: 0xd96b43,
  },
  {
    id: 'cobalt',
    name: 'Midnight Cobalt',
    bodyHex: 0x3b7dd8,
    cssHex: '#3b7dd8',
    accentHex: 0x67e8f9,
  },
];

export interface StageConfig {
  id: StageId;
  name: string;
  subtitle: string;
  tagline: string;
  accentCss: string;
  skyHex: number;
  horizonHex: number;
  fogHex: number;
  fogDensity: number;
  groundHex: number;
  roadHex: number;
  curbPrimaryHex: number;
  curbSecondaryHex: number;
  sunHex: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  particleColorHex: number;
  trackPoints: [number, number, number][];
}

export const STAGES: Record<StageId, StageConfig> = {
  desert: {
    id: 'desert',
    name: 'Sunstone Canyon',
    subtitle: 'Golden Hour Desert',
    tagline: 'Warm sandstone mesas, saguaro groves, and sweeping sunset dunes',
    accentCss: '#f59e0b',
    skyHex: 0xf6b888,
    horizonHex: 0xf9cfa4,
    fogHex: 0xf2b588,
    fogDensity: 0.0026,
    groundHex: 0xd98e5f,
    roadHex: 0x3b3532,
    curbPrimaryHex: 0xf4e8d1,
    curbSecondaryHex: 0xd46746,
    sunHex: 0xffe0b2,
    sunIntensity: 2.3,
    sunPos: [95, 72, 55],
    hemiSkyHex: 0x9ec5e6,
    hemiGroundHex: 0xb96a42,
    hemiIntensity: 0.95,
    particleColorHex: 0xffe3ba,
    trackPoints: [
      [0, 0.3, 115],
      [0, 0.5, 25],
      [45, 2.8, -62],
      [125, 5.2, -85],
      [172, 3.6, -15],
      [142, 1.5, 65],
      [90, 2.6, 105],
      [62, 1.2, 150],
      [16, 0.3, 160],
    ],
  },
  snow: {
    id: 'snow',
    name: 'Frostpine Pass',
    subtitle: 'Snowy Alpine Mountain',
    tagline: 'Crisp mountain air, glowing timber chalets, and powder-lined switchbacks',
    accentCss: '#38bdf8',
    skyHex: 0xb8d8f0,
    horizonHex: 0xdcebf7,
    fogHex: 0xcbe0f2,
    fogDensity: 0.0029,
    groundHex: 0xe6f0f8,
    roadHex: 0x384352,
    curbPrimaryHex: 0xf8fafc,
    curbSecondaryHex: 0x4b83a8,
    sunHex: 0xfff5e8,
    sunIntensity: 2.1,
    sunPos: [-70, 95, 80],
    hemiSkyHex: 0xdbeafe,
    hemiGroundHex: 0x7b98b8,
    hemiIntensity: 1.05,
    particleColorHex: 0xffffff,
    trackPoints: [
      [0, 0.5, 120],
      [0, 1.6, 35],
      [-55, 5.8, -38],
      [-130, 9.6, -58],
      [-172, 8.2, 18],
      [-118, 4.6, 86],
      [-145, 3.0, 152],
      [-68, 1.2, 178],
      [-12, 0.5, 168],
    ],
  },
  city: {
    id: 'city',
    name: 'Lantern Harbor',
    subtitle: 'Dense Neon City',
    tagline: 'Rain-kissed asphalt, warm lantern arcades, and glowing skyline expressways',
    accentCss: '#22d3ee',
    skyHex: 0x10132b,
    horizonHex: 0x1c1b3d,
    fogHex: 0x161736,
    fogDensity: 0.0033,
    groundHex: 0x171a2b,
    roadHex: 0x1e2330,
    curbPrimaryHex: 0x38bdf8,
    curbSecondaryHex: 0xfb7185,
    sunHex: 0xa5b4fc,
    sunIntensity: 1.25,
    sunPos: [65, 110, -40],
    hemiSkyHex: 0x4f46e5,
    hemiGroundHex: 0x1e1b33,
    hemiIntensity: 1.0,
    particleColorHex: 0x93c5fd,
    trackPoints: [
      [0, 0.4, 125],
      [0, 0.4, 25],
      [52, 3.4, -55],
      [130, 6.8, -75],
      [178, 6.2, 6],
      [142, 2.6, 92],
      [96, 0.6, 158],
      [28, 0.4, 174],
    ],
  },
};

export const STAGE_ORDER: StageId[] = ['desert', 'snow', 'city'];

export interface MinimapPoint {
  x: number;
  y: number;
}

export interface HudSnapshot {
  speedKmh: number;
  lap: number;
  totalLaps: number;
  position: number;
  totalRacers: number;
  raceTimeMs: number;
  bestLapMs: number | null;
  boostCharge: number; // 0..100
  isDrifting: boolean;
  isBoosting: boolean;
  starsCollected: number;
  countdownLabel: string | null;
  playerMapPos: MinimapPoint;
  rivalMapPositions: MinimapPoint[];
  trackMapPath: MinimapPoint[];
  finishStandings: {
    name: string;
    isPlayer: boolean;
    timeMs: number;
    colorCss: string;
  }[];
}
