import * as THREE from 'three';
import type { CarChassisId, PaintFinishId } from '../shared/types';

export interface CarVisualRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheelMeshes: THREE.Object3D[];
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  paintMat: THREE.MeshPhysicalMaterial;
  nameSprite?: THREE.Sprite;
  dispose: () => void;
}

export function applyPaintFinishToMaterial(
  mat: THREE.MeshPhysicalMaterial,
  colorHex: string,
  finish: PaintFinishId,
): void {
  mat.color.set(colorHex);
  switch (finish) {
    case 'metallic':
      mat.roughness = 0.26;
      mat.metalness = 0.86;
      mat.clearcoat = 0.65;
      mat.clearcoatRoughness = 0.14;
      break;
    case 'matte':
      mat.roughness = 0.84;
      mat.metalness = 0.08;
      mat.clearcoat = 0.0;
      mat.clearcoatRoughness = 0.6;
      break;
    case 'chrome':
      mat.roughness = 0.1;
      mat.metalness = 0.96;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.04;
      break;
    case 'gloss':
    default:
      mat.roughness = 0.22;
      mat.metalness = 0.34;
      mat.clearcoat = 0.9;
      mat.clearcoatRoughness = 0.08;
      break;
  }
  mat.needsUpdate = true;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 6, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedShadowTexture: THREE.CanvasTexture | null = null;

function createNameplateSprite(name: string, colorHex: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(11, 15, 23, 0.85)';
  ctx.beginPath();
  ctx.roundRect(12, 12, 232, 40, 8);
  ctx.fill();

  ctx.fillStyle = colorHex;
  ctx.fillRect(18, 20, 8, 24);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.slice(0, 14), 36, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.3, 0.58, 1);
  sprite.position.set(0, 1.95, 0);
  return sprite;
}

/**
 * Builds one of 4 composite low-poly car chassis models with configurable PBR paint finishes.
 * Pivoted at bottom-center (y = 0) with forward direction +Z.
 */
export function buildLowPolyCar(options: {
  primaryColor: string;
  chassisId?: CarChassisId;
  paintFinish?: PaintFinishId;
  driverName?: string;
  castShadow?: boolean;
}): CarVisualRig {
  const chassisId: CarChassisId = options.chassisId ?? 'gt_coupe';
  const paintFinish: PaintFinishId = options.paintFinish ?? 'gloss';
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const castShadow = options.castShadow ?? false;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // 1. Contact Shadow Disc at ground plane (y = 0.03)
  if (!sharedShadowTexture) {
    sharedShadowTexture = createContactShadowTexture();
  }
  const shadowGeo = new THREE.PlaneGeometry(2.7, 4.8);
  shadowGeo.rotateX(-Math.PI / 2);
  geometries.push(shadowGeo);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: sharedShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.72,
  });
  materials.push(shadowMat);
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.03;
  root.add(shadowMesh);

  // Materials with distinct PBR roughness contrast (>= 0.25 delta between body, glass, trim, tires)
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.primaryColor),
    flatShading: true,
  });
  applyPaintFinishToMaterial(paintMat, options.primaryColor, paintFinish);

  const cabinGlassMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.1,
    metalness: 0.75,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.72,
    metalness: 0.15,
    flatShading: true,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    roughness: 0.9,
    metalness: 0.05,
    flatShading: true,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.22,
    metalness: 0.85,
    flatShading: true,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    emissive: 0xef4444,
    emissiveIntensity: 0.7,
    roughness: 0.3,
  });
  materials.push(
    paintMat,
    cabinGlassMat,
    trimMat,
    tireMat,
    rimMat,
    headlightMat,
    brakeLightMat,
  );

  // Shared lights helper
  const lightGeo = new THREE.BoxGeometry(0.32, 0.12, 0.08);
  geometries.push(lightGeo);

  let wheelFrontX = 0.92;
  let wheelFrontZ = 1.3;
  let wheelRearX = 0.92;
  let wheelRearZ = -1.28;
  let wheelRadius = 0.36;
  let wheelWidth = 0.28;

  if (chassisId === 'formula_open') {
    // --- FORMULA AERO (Open-Wheel GP Car) ---
    wheelFrontX = 1.04;
    wheelFrontZ = 1.42;
    wheelRearX = 1.06;
    wheelRearZ = -1.36;
    wheelRadius = 0.39;
    wheelWidth = 0.38;

    // Tapered central monocoque + nosecone
    const monoShape = new THREE.Shape();
    monoShape.moveTo(-2.05, 0.28);
    monoShape.lineTo(2.28, 0.24);
    monoShape.lineTo(2.34, 0.42);
    monoShape.lineTo(1.25, 0.64);
    monoShape.lineTo(0.25, 0.74);
    monoShape.lineTo(-0.55, 1.04); // engine airbox peak
    monoShape.lineTo(-1.85, 0.78);
    monoShape.lineTo(-2.08, 0.46);
    monoShape.closePath();

    const monoGeo = new THREE.ExtrudeGeometry(monoShape, {
      depth: 0.72,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 1,
    });
    monoGeo.translate(0, 0, -0.36);
    monoGeo.rotateY(-Math.PI / 2);
    geometries.push(monoGeo);
    const monoMesh = new THREE.Mesh(monoGeo, paintMat);
    monoMesh.castShadow = castShadow;
    monoMesh.receiveShadow = true;
    bodyGroup.add(monoMesh);

    // Sidepods (left & right aerodynamic pods)
    const podGeo = new THREE.BoxGeometry(0.46, 0.42, 1.82);
    geometries.push(podGeo);
    for (const sx of [-0.56, 0.56]) {
      const pod = new THREE.Mesh(podGeo, paintMat);
      pod.position.set(sx, 0.46, -0.34);
      pod.castShadow = castShadow;
      bodyGroup.add(pod);
    }

    // Floor plank & suspension wishbone arms
    const floorGeo = new THREE.BoxGeometry(1.42, 0.08, 3.3);
    const armGeo = new THREE.BoxGeometry(1.96, 0.07, 0.14);
    geometries.push(floorGeo, armGeo);
    const floorMesh = new THREE.Mesh(floorGeo, trimMat);
    floorMesh.position.set(0, 0.22, -0.1);
    bodyGroup.add(floorMesh);
    for (const az of [1.4, -1.34]) {
      const arm = new THREE.Mesh(armGeo, trimMat);
      arm.position.set(0, 0.38, az);
      bodyGroup.add(arm);
    }

    // Cockpit visor + helmet + halo hoop
    const visorGeo = new THREE.BoxGeometry(0.42, 0.26, 0.58);
    const helmetGeo = new THREE.DodecahedronGeometry(0.2, 0);
    const haloGeo = new THREE.BoxGeometry(0.56, 0.07, 0.78);
    geometries.push(visorGeo, helmetGeo, haloGeo);
    const visor = new THREE.Mesh(visorGeo, cabinGlassMat);
    visor.position.set(0, 0.78, 0.2);
    const helmet = new THREE.Mesh(helmetGeo, rimMat);
    helmet.position.set(0, 0.88, -0.04);
    const halo = new THREE.Mesh(haloGeo, trimMat);
    halo.position.set(0, 0.96, 0.16);
    bodyGroup.add(visor, helmet, halo);

    // Wide low front wing + endplates
    const fWingGeo = new THREE.BoxGeometry(2.26, 0.07, 0.48);
    const fEndGeo = new THREE.BoxGeometry(0.06, 0.22, 0.52);
    geometries.push(fWingGeo, fEndGeo);
    const fWing = new THREE.Mesh(fWingGeo, trimMat);
    fWing.position.set(0, 0.24, 2.24);
    bodyGroup.add(fWing);
    for (const ex of [-1.12, 1.12]) {
      const ep = new THREE.Mesh(fEndGeo, paintMat);
      ep.position.set(ex, 0.31, 2.24);
      bodyGroup.add(ep);
    }

    // Tall rear GP wing + endplates
    const rWingGeo = new THREE.BoxGeometry(1.94, 0.08, 0.42);
    const rEndGeo = new THREE.BoxGeometry(0.07, 0.58, 0.48);
    geometries.push(rWingGeo, rEndGeo);
    const rWing = new THREE.Mesh(rWingGeo, paintMat);
    rWing.position.set(0, 1.14, -1.96);
    rWing.rotation.x = 0.12;
    rWing.castShadow = castShadow;
    bodyGroup.add(rWing);
    for (const ex of [-0.96, 0.96]) {
      const ep = new THREE.Mesh(rEndGeo, trimMat);
      ep.position.set(ex, 0.9, -1.96);
      bodyGroup.add(ep);
    }

    // Center rain light + nose LED strips
    const tl = new THREE.Mesh(lightGeo, brakeLightMat);
    tl.position.set(0, 0.54, -2.1);
    bodyGroup.add(tl);
    for (const lx of [-0.22, 0.22]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.scale.set(0.55, 0.65, 1);
      hl.position.set(lx, 0.38, 2.34);
      bodyGroup.add(hl);
    }
  } else if (chassisId === 'rally_hatch') {
    // --- RALLY SPEC (Boxy Wide-Body Group-B Hatch) ---
    wheelFrontX = 0.96;
    wheelFrontZ = 1.24;
    wheelRearX = 0.96;
    wheelRearZ = -1.24;
    wheelRadius = 0.39;
    wheelWidth = 0.3;

    // Muscular tall hatchback hull
    const rallyShape = new THREE.Shape();
    rallyShape.moveTo(-1.95, 0.36);
    rallyShape.lineTo(1.96, 0.36);
    rallyShape.lineTo(2.04, 0.78);
    rallyShape.lineTo(1.45, 0.92);
    rallyShape.lineTo(0.86, 0.96);
    rallyShape.lineTo(0.32, 1.46); // steep rally windshield
    rallyShape.lineTo(-1.42, 1.46); // long hatchback roof
    rallyShape.lineTo(-1.96, 0.96); // hatch rear slope
    rallyShape.lineTo(-2.02, 0.54);
    rallyShape.closePath();

    const rallyGeo = new THREE.ExtrudeGeometry(rallyShape, {
      depth: 1.76,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    rallyGeo.translate(0, 0, -0.88);
    rallyGeo.rotateY(-Math.PI / 2);
    geometries.push(rallyGeo);
    const hullMesh = new THREE.Mesh(rallyGeo, paintMat);
    hullMesh.castShadow = castShadow;
    hullMesh.receiveShadow = true;
    bodyGroup.add(hullMesh);

    // Wide box fender flares
    const flareGeo = new THREE.BoxGeometry(2.02, 0.34, 0.76);
    geometries.push(flareGeo);
    for (const fz of [1.24, -1.24]) {
      const flare = new THREE.Mesh(flareGeo, trimMat);
      flare.position.set(0, 0.52, fz);
      bodyGroup.add(flare);
    }

    // Wrap-around dark rally windshield + side glass band
    const glassGeo = new THREE.BoxGeometry(1.52, 0.42, 1.62);
    const scoopGeo = new THREE.BoxGeometry(0.46, 0.14, 0.62);
    const wingGeo = new THREE.BoxGeometry(1.78, 0.09, 0.36);
    const mudflapGeo = new THREE.BoxGeometry(1.96, 0.16, 0.14);
    geometries.push(glassGeo, scoopGeo, wingGeo, mudflapGeo);

    const glass = new THREE.Mesh(glassGeo, cabinGlassMat);
    glass.position.set(0, 1.2, -0.45);
    const scoop = new THREE.Mesh(scoopGeo, rimMat);
    scoop.position.set(0, 1.54, -0.2);
    const wing = new THREE.Mesh(wingGeo, trimMat);
    wing.position.set(0, 1.48, -1.78);
    wing.rotation.x = 0.18;
    const skid = new THREE.Mesh(mudflapGeo, trimMat);
    skid.position.set(0, 0.32, 1.98);
    bodyGroup.add(glass, scoop, wing, skid);

    // Quad rally headlights + taillights
    for (const lx of [-0.66, -0.24, 0.24, 0.66]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.scale.set(0.7, 0.9, 1);
      hl.position.set(lx, 0.64, 2.06);
      bodyGroup.add(hl);
    }
    for (const lx of [-0.66, 0.66]) {
      const tl = new THREE.Mesh(lightGeo, brakeLightMat);
      tl.position.set(lx, 0.78, -2.02);
      bodyGroup.add(tl);
    }
  } else if (chassisId === 'hyper_prototype') {
    // --- LE MANS PROTOTYPE (Low-Slung Endurance Hypercar) ---
    wheelFrontX = 0.96;
    wheelFrontZ = 1.38;
    wheelRearX = 0.98;
    wheelRearZ = -1.34;
    wheelRadius = 0.37;
    wheelWidth = 0.32;

    // Ultra-low aerodynamic deck
    const protoShape = new THREE.Shape();
    protoShape.moveTo(-2.14, 0.28);
    protoShape.lineTo(2.14, 0.26);
    protoShape.lineTo(2.26, 0.44);
    protoShape.lineTo(1.75, 0.68);
    protoShape.lineTo(0.82, 0.72);
    protoShape.lineTo(-1.82, 0.78);
    protoShape.lineTo(-2.18, 0.56);
    protoShape.closePath();

    const protoGeo = new THREE.ExtrudeGeometry(protoShape, {
      depth: 1.82,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    protoGeo.translate(0, 0, -0.91);
    protoGeo.rotateY(-Math.PI / 2);
    geometries.push(protoGeo);
    const hull = new THREE.Mesh(protoGeo, paintMat);
    hull.castShadow = castShadow;
    hull.receiveShadow = true;
    bodyGroup.add(hull);

    // Sculpted wheel arch blisters
    const archGeo = new THREE.BoxGeometry(0.48, 0.32, 0.98);
    geometries.push(archGeo);
    for (const ax of [-0.72, 0.72]) {
      for (const az of [1.26, -1.24]) {
        const arch = new THREE.Mesh(archGeo, paintMat);
        arch.position.set(ax, 0.68, az);
        bodyGroup.add(arch);
      }
    }

    // Teardrop central canopy + dorsal shark fin
    const domeGeo = new THREE.CylinderGeometry(0.48, 0.68, 1.55, 8);
    domeGeo.rotateX(Math.PI / 2);
    domeGeo.scale(1, 0.58, 1);
    const finGeo = new THREE.BoxGeometry(0.08, 0.46, 1.48);
    const splitterGeo = new THREE.BoxGeometry(2.02, 0.07, 0.46);
    const wingGeo = new THREE.BoxGeometry(1.98, 0.07, 0.4);
    const strutGeo = new THREE.BoxGeometry(0.08, 0.42, 0.2);
    geometries.push(domeGeo, finGeo, splitterGeo, wingGeo, strutGeo);

    const dome = new THREE.Mesh(domeGeo, cabinGlassMat);
    dome.position.set(0, 0.88, 0.08);
    const fin = new THREE.Mesh(finGeo, paintMat);
    fin.position.set(0, 1.06, -1.08);
    const splitter = new THREE.Mesh(splitterGeo, trimMat);
    splitter.position.set(0, 0.24, 2.1);
    const wing = new THREE.Mesh(wingGeo, trimMat);
    wing.position.set(0, 1.24, -2.02);
    wing.rotation.x = 0.14;
    wing.castShadow = castShadow;
    bodyGroup.add(dome, fin, splitter, wing);

    for (const sx of [-0.48, 0.48]) {
      const strut = new THREE.Mesh(strutGeo, trimMat);
      strut.position.set(sx, 0.98, -1.96);
      bodyGroup.add(strut);
    }

    // Blade LED headlights + full-width rear light bar
    const bladeGeo = new THREE.BoxGeometry(1.56, 0.09, 0.08);
    geometries.push(bladeGeo);
    const rearBar = new THREE.Mesh(bladeGeo, brakeLightMat);
    rearBar.position.set(0, 0.64, -2.18);
    bodyGroup.add(rearBar);
    for (const lx of [-0.68, 0.68]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.position.set(lx, 0.56, 2.22);
      bodyGroup.add(hl);
    }
  } else {
    // --- APEX GT (Classic Wedge GT Coupe) ---
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-2.05, 0.34);
    hullShape.lineTo(2.05, 0.32);
    hullShape.lineTo(2.12, 0.56);
    hullShape.lineTo(1.75, 0.78);
    hullShape.lineTo(0.85, 0.86);
    hullShape.lineTo(-1.88, 0.92);
    hullShape.lineTo(-2.12, 0.62);
    hullShape.closePath();

    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.07,
      bevelSegments: 1,
    });
    hullGeo.translate(0, 0, -0.86);
    hullGeo.rotateY(-Math.PI / 2);
    geometries.push(hullGeo);

    const hullMesh = new THREE.Mesh(hullGeo, paintMat);
    hullMesh.castShadow = castShadow;
    hullMesh.receiveShadow = true;
    bodyGroup.add(hullMesh);

    const skirtGeo = new THREE.BoxGeometry(1.86, 0.16, 4.16);
    geometries.push(skirtGeo);
    const skirtMesh = new THREE.Mesh(skirtGeo, trimMat);
    skirtMesh.position.set(0, 0.34, 0);
    skirtMesh.castShadow = castShadow;
    bodyGroup.add(skirtMesh);

    const cabinShape = new THREE.Shape();
    cabinShape.moveTo(-1.18, 0.86);
    cabinShape.lineTo(0.82, 0.84);
    cabinShape.lineTo(0.32, 1.32);
    cabinShape.lineTo(-0.78, 1.32);
    cabinShape.closePath();

    const cabinGeo = new THREE.ExtrudeGeometry(cabinShape, {
      depth: 1.32,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 1,
    });
    cabinGeo.translate(0, 0, -0.66);
    cabinGeo.rotateY(-Math.PI / 2);
    geometries.push(cabinGeo);

    const cabinMesh = new THREE.Mesh(cabinGeo, cabinGlassMat);
    cabinMesh.castShadow = castShadow;
    bodyGroup.add(cabinMesh);

    const roofGeo = new THREE.BoxGeometry(1.22, 0.07, 1.05);
    const splitterGeo = new THREE.BoxGeometry(1.92, 0.08, 0.34);
    const wingGeo = new THREE.BoxGeometry(1.88, 0.07, 0.34);
    const strutGeo = new THREE.BoxGeometry(0.08, 0.28, 0.16);
    const stripeGeo = new THREE.BoxGeometry(0.42, 0.03, 1.12);
    geometries.push(roofGeo, splitterGeo, wingGeo, strutGeo, stripeGeo);

    const roofMesh = new THREE.Mesh(roofGeo, paintMat);
    roofMesh.position.set(0, 1.35, -0.22);
    const splitterMesh = new THREE.Mesh(splitterGeo, trimMat);
    splitterMesh.position.set(0, 0.28, 2.04);
    const wingMesh = new THREE.Mesh(wingGeo, trimMat);
    wingMesh.position.set(0, 1.18, -1.94);
    wingMesh.rotation.x = 0.14;
    wingMesh.castShadow = castShadow;
    const stripeMesh = new THREE.Mesh(stripeGeo, rimMat);
    stripeMesh.position.set(0, 0.85, 1.32);
    stripeMesh.rotation.x = 0.09;
    bodyGroup.add(roofMesh, splitterMesh, wingMesh, stripeMesh);

    for (const sx of [-0.56, 0.56]) {
      const strut = new THREE.Mesh(strutGeo, trimMat);
      strut.position.set(sx, 1.02, -1.9);
      bodyGroup.add(strut);
    }

    for (const lx of [-0.64, 0.64]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.position.set(lx, 0.62, 2.13);
      bodyGroup.add(hl);

      const tl = new THREE.Mesh(lightGeo, brakeLightMat);
      tl.position.set(lx, 0.72, -2.12);
      bodyGroup.add(tl);
    }
  }

  // Four Low-Poly Wheels (Tire + Alloy Rim)
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 12);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.58,
    wheelRadius * 0.58,
    wheelWidth + 0.02,
    8,
  );
  rimGeo.rotateZ(Math.PI / 2);
  geometries.push(tireGeo, rimGeo);

  const wheelMeshes: THREE.Object3D[] = [];
  const frontLeftPivot = new THREE.Group();
  const frontRightPivot = new THREE.Group();

  const makeWheel = () => {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = castShadow;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wg.add(tire, rim);
    return wg;
  };

  frontLeftPivot.position.set(wheelFrontX, wheelRadius, wheelFrontZ);
  const flWheel = makeWheel();
  frontLeftPivot.add(flWheel);
  root.add(frontLeftPivot);
  wheelMeshes.push(flWheel);

  frontRightPivot.position.set(-wheelFrontX, wheelRadius, wheelFrontZ);
  const frWheel = makeWheel();
  frontRightPivot.add(frWheel);
  root.add(frontRightPivot);
  wheelMeshes.push(frWheel);

  for (const rx of [wheelRearX, -wheelRearX]) {
    const rearPivot = new THREE.Group();
    rearPivot.position.set(rx, wheelRadius, wheelRearZ);
    const rw = makeWheel();
    rearPivot.add(rw);
    root.add(rearPivot);
    wheelMeshes.push(rw);
  }

  let nameSprite: THREE.Sprite | undefined;
  if (options.driverName) {
    nameSprite = createNameplateSprite(options.driverName, options.primaryColor);
    root.add(nameSprite);
  }

  return {
    root,
    bodyGroup,
    frontLeftPivot,
    frontRightPivot,
    wheelMeshes,
    brakeLightMat,
    headlightMat,
    paintMat,
    nameSprite,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      if (nameSprite) {
        (nameSprite.material as THREE.SpriteMaterial).map?.dispose();
        nameSprite.material.dispose();
      }
    },
  };
}
