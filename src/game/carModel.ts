import * as THREE from 'three';

export interface CarRig {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheelMeshes: THREE.Group[];
  tailLightMaterial: THREE.MeshStandardMaterial;
  boostFlameLeft: THREE.Mesh;
  boostFlameRight: THREE.Mesh;
  paintMaterial: THREE.MeshPhysicalMaterial;
  accentMaterial: THREE.MeshStandardMaterial;
  headlightSpot?: THREE.SpotLight;
  setPaintColor: (bodyHex: number, accentHex: number) => void;
  dispose: () => void;
}

export function createCozyCar(
  bodyHex: number,
  accentHex: number,
  contactShadowTex: THREE.Texture,
  withHeadlightSpot = false,
): CarRig {
  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

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

  // 1. Soft Grounded Radial Contact Shadow (y = 0.03 above road)
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(2.75, 4.75));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
  );
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.03;
  root.add(shadowPlane);

  // Shared PBR Materials with distinct roughness/metalness contrast
  const paintMaterial = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: bodyHex,
      roughness: 0.26,
      metalness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    }),
  );

  const accentMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.38,
      metalness: 0.25,
    }),
  );

  const chassisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.78,
      metalness: 0.15,
    }),
  );

  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      roughness: 0.18,
      metalness: 0.9,
    }),
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1c2536,
      roughness: 0.06,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a1c22,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );

  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff8e1,
      emissive: 0xffe4a0,
      emissiveIntensity: 2.2,
      roughness: 0.15,
    }),
  );

  const tailLightMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 1.4,
      roughness: 0.2,
    }),
  );

  // 2. Sculpted Main Body Silhouette via Beveled ExtrudeGeometry
  // Car faces -Z forward! Side profile drawn in (Z, Y) and extruded along X
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-1.95, 0.34); // Rear bumper bottom
  bodyShape.lineTo(1.92, 0.34);  // Front bumper bottom
  bodyShape.lineTo(2.02, 0.56);  // Front nose
  bodyShape.lineTo(1.86, 0.82);  // Hood front
  bodyShape.lineTo(0.95, 0.92);  // Windshield base
  bodyShape.lineTo(0.45, 1.42);  // Roof front
  bodyShape.lineTo(-0.85, 1.44); // Roof rear
  bodyShape.lineTo(-1.58, 0.96); // Fastback rear glass
  bodyShape.lineTo(-1.98, 0.88); // Trunk lip
  bodyShape.lineTo(-2.05, 0.52); // Rear bumper
  bodyShape.closePath();

  const bodyExtrude = trackGeo(
    new THREE.ExtrudeGeometry(bodyShape, {
      depth: 1.62,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.11,
      bevelSegments: 3,
      curveSegments: 8,
    }),
  );
  // Rotate so shape X (length) aligns with -Z (forward) and extrude depth centers on X
  bodyExtrude.rotateY(Math.PI / 2);
  bodyExtrude.translate(-0.81, 0, 0);
  bodyExtrude.computeVertexNormals();

  const mainBody = new THREE.Mesh(bodyExtrude, paintMaterial);
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  bodyTiltGroup.add(mainBody);

  // 3. Lower Chassis Skirt & Diffuser
  const skirtGeo = trackGeo(new THREE.BoxGeometry(1.94, 0.2, 4.12));
  const skirt = new THREE.Mesh(skirtGeo, chassisMat);
  skirt.position.set(0, 0.32, 0.02);
  skirt.castShadow = true;
  bodyTiltGroup.add(skirt);

  // 4. Racing / Cozy Accent Hood & Roof Stripe
  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.03, 2.75));
  const stripe = new THREE.Mesh(stripeGeo, accentMaterial);
  stripe.position.set(0, 0.94, -0.58);
  stripe.rotation.x = 0.06;
  bodyTiltGroup.add(stripe);

  // 5. Tinted Glass Cabin Wrap
  const cabinShape = new THREE.Shape();
  cabinShape.moveTo(-1.42, 0.96);
  cabinShape.lineTo(0.86, 0.93);
  cabinShape.lineTo(0.42, 1.38);
  cabinShape.lineTo(-0.82, 1.39);
  cabinShape.closePath();
  const cabinGeo = trackGeo(
    new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.46,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 2,
    }),
  );
  cabinGeo.rotateY(Math.PI / 2);
  cabinGeo.translate(-0.73, 0, 0);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 0.02, 0);
  bodyTiltGroup.add(cabin);

  // 6. Cozy Roof Rack + Compact Surf/Camp Luggage Pod
  const railGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.07, 1.1));
  const leftRail = new THREE.Mesh(railGeo, chromeMat);
  leftRail.position.set(-0.56, 1.5, 0.2);
  const rightRail = new THREE.Mesh(railGeo, chromeMat);
  rightRail.position.set(0.56, 1.5, 0.2);
  bodyTiltGroup.add(leftRail, rightRail);

  const podGeo = trackGeo(new THREE.CapsuleGeometry(0.18, 0.65, 4, 8));
  podGeo.rotateX(Math.PI / 2);
  podGeo.scale(1.5, 0.6, 1);
  const luggagePod = new THREE.Mesh(podGeo, accentMaterial);
  luggagePod.position.set(0, 1.58, 0.22);
  luggagePod.castShadow = true;
  bodyTiltGroup.add(luggagePod);

  // 7. Rear Cozy Ducktail Spoiler
  const spoilerGeo = trackGeo(new THREE.BoxGeometry(1.72, 0.08, 0.34));
  const spoiler = new THREE.Mesh(spoilerGeo, accentMaterial);
  spoiler.position.set(0, 1.03, 1.88);
  spoiler.rotation.x = 0.22;
  spoiler.castShadow = true;
  bodyTiltGroup.add(spoiler);

  // 8. Front Chrome Grille & Round Cozy Headlights (at -Z)
  const grilleGeo = trackGeo(new THREE.BoxGeometry(0.95, 0.2, 0.08));
  const grille = new THREE.Mesh(grilleGeo, chromeMat);
  grille.position.set(0, 0.56, -2.07);
  bodyTiltGroup.add(grille);

  const headGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16));
  headGeo.rotateX(Math.PI / 2);
  const headRimGeo = trackGeo(new THREE.TorusGeometry(0.145, 0.025, 8, 16));

  [-0.66, 0.66].forEach((hx) => {
    const bulb = new THREE.Mesh(headGeo, headlightMat);
    bulb.position.set(hx, 0.68, -2.02);
    const rim = new THREE.Mesh(headRimGeo, chromeMat);
    rim.position.set(hx, 0.68, -2.08);
    bodyTiltGroup.add(bulb, rim);
  });

  // Optional real SpotLight for Neon City night illumination
  let headlightSpot: THREE.SpotLight | undefined;
  if (withHeadlightSpot) {
    headlightSpot = new THREE.SpotLight(0xfff1d0, 16, 48, Math.PI / 4.2, 0.65, 1.5);
    headlightSpot.position.set(0, 0.85, -2.0);
    headlightSpot.target.position.set(0, 0.1, -18);
    bodyTiltGroup.add(headlightSpot);
    bodyTiltGroup.add(headlightSpot.target);
  }

  // 9. Rear Tail-Lights & Twin Chrome Exhausts with Boost Flames (at +Z)
  const tailGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.12, 0.08));
  [-0.64, 0.64].forEach((tx) => {
    const tail = new THREE.Mesh(tailGeo, tailLightMaterial);
    tail.position.set(tx, 0.72, 2.08);
    bodyTiltGroup.add(tail);
  });

  const exhaustGeo = trackGeo(new THREE.CylinderGeometry(0.065, 0.075, 0.22, 12));
  exhaustGeo.rotateX(Math.PI / 2);
  const flameGeo = trackGeo(new THREE.ConeGeometry(0.09, 0.55, 10));
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.25);

  const flameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    }),
  );

  const exLeft = new THREE.Mesh(exhaustGeo, chromeMat);
  exLeft.position.set(-0.48, 0.31, 2.08);
  const exRight = new THREE.Mesh(exhaustGeo, chromeMat);
  exRight.position.set(0.48, 0.31, 2.08);
  bodyTiltGroup.add(exLeft, exRight);

  const boostFlameLeft = new THREE.Mesh(flameGeo, flameMat);
  boostFlameLeft.position.set(-0.48, 0.31, 2.15);
  boostFlameLeft.visible = false;
  const boostFlameRight = new THREE.Mesh(flameGeo, flameMat);
  boostFlameRight.position.set(0.48, 0.31, 2.15);
  boostFlameRight.visible = false;
  bodyTiltGroup.add(boostFlameLeft, boostFlameRight);

  // Side mirrors
  const mirrorGeo = trackGeo(new THREE.BoxGeometry(0.22, 0.1, 0.14));
  const mL = new THREE.Mesh(mirrorGeo, paintMaterial);
  mL.position.set(-1.01, 0.96, -0.68);
  const mR = new THREE.Mesh(mirrorGeo, paintMaterial);
  mR.position.set(1.01, 0.96, -0.68);
  bodyTiltGroup.add(mL, mR);

  // 10. Four Composite Wheel Assemblies (Tire + Rim + Hubcap)
  const wheelRadius = 0.38;
  const tireGeo = trackGeo(new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.28, 22));
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.295, 14));
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 0.31, 10));
  hubGeo.rotateZ(Math.PI / 2);

  const makeWheel = () => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    const hub = new THREE.Mesh(hubGeo, accentMaterial);
    wg.add(tire, rim, hub);
    return wg;
  };

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(-0.96, wheelRadius, -1.25);
  const flWheel = makeWheel();
  frontLeftPivot.add(flWheel);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(0.96, wheelRadius, -1.25);
  const frWheel = makeWheel();
  frontRightPivot.add(frWheel);

  const rlWheel = makeWheel();
  rlWheel.position.set(-0.96, wheelRadius, 1.28);

  const rrWheel = makeWheel();
  rrWheel.position.set(0.96, wheelRadius, 1.28);

  root.add(frontLeftPivot, frontRightPivot, rlWheel, rrWheel);

  const wheelMeshes = [flWheel, frWheel, rlWheel, rrWheel];

  return {
    root,
    bodyTiltGroup,
    frontLeftPivot,
    frontRightPivot,
    wheelMeshes,
    tailLightMaterial,
    boostFlameLeft,
    boostFlameRight,
    paintMaterial,
    accentMaterial,
    headlightSpot,
    setPaintColor: (newBodyHex: number, newAccentHex: number) => {
      paintMaterial.color.setHex(newBodyHex);
      accentMaterial.color.setHex(newAccentHex);
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
