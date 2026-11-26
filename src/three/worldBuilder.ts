import * as THREE from 'three';
import type { BakedTrackData, ClimateType, TrackPalette } from '../shared/types';
import {
  computeTerrainHeight,
  computeTerrainHeightWithHint,
  minDistanceToTrack,
  projectPointOnTrack,
} from '../game/tracks';

import type { WeatherVisualParams } from '../game/weather';

export interface BuiltWorld {
  root: THREE.Group;
  gantryLights: {
    redMat: THREE.MeshStandardMaterial;
    amberMat: THREE.MeshStandardMaterial;
    greenMat: THREE.MeshStandardMaterial;
  };
  sunLight: THREE.DirectionalLight;
  applyWeather: (
    weather: WeatherVisualParams,
    dt: number,
    focusPos: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

function createRoadTexture(
  roadHex: string,
  stripeHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = roadHex;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle fine asphalt micro-texture (deterministic, smooth)
  for (let i = 0; i < 1800; i++) {
    const x = (i * 149) % 512;
    const y = (i * 271) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.018)' : 'rgba(0,0,0,0.03)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Outer edge lines
  ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
  ctx.fillRect(20, 0, 10, 512);
  ctx.fillRect(482, 0, 10, 512);

  // Dashed center stripe
  ctx.fillStyle = stripeHex;
  ctx.fillRect(250, 24, 12, 196);
  ctx.fillRect(250, 280, 12, 196);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCheckeredTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const size = 16;
  for (let y = 0; y < 64; y += size) {
    for (let x = 0; x < 256; x += size) {
      const dark = ((x / size) + (y / size)) % 2 === 0;
      ctx.fillStyle = dark ? '#0f172a' : '#f8fafc';
      ctx.fillRect(x, y, size, size);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSkyDome(palette: TrackPalette): {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  updateColors: (topHex: string, horizonHex: string) => void;
} {
  const geo = new THREE.SphereGeometry(420, 24, 16);
  const pos = geo.attributes.position;
  const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
  geo.setAttribute('color', colorAttr);

  const topColor = new THREE.Color();
  const horizonColor = new THREE.Color();
  const tmp = new THREE.Color();
  let lastTop = '';
  let lastHorizon = '';

  const updateColors = (topHex: string, horizonHex: string) => {
    if (topHex === lastTop && horizonHex === lastHorizon) return;
    lastTop = topHex;
    lastHorizon = horizonHex;
    topColor.set(topHex);
    horizonColor.set(horizonHex);
    const colors = colorAttr.array as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, (y + 20) / 260));
      tmp.copy(horizonColor).lerp(topColor, Math.pow(t, 0.72));
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    colorAttr.needsUpdate = true;
  };

  updateColors(palette.skyTop, palette.skyHorizon);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  return { mesh, geo, mat, updateColors };
}

function buildTerrainMesh(
  baked: BakedTrackData,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Mesh {
  const palette = baked.definition.palette;
  const size = baked.definition.worldRadius * 2;
  const segs = 96;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(palette.terrainLow);
  const cMid = new THREE.Color(palette.terrainMid);
  const cHigh = new THREE.Color(palette.terrainHigh);
  const cRock = new THREE.Color(palette.rockColor);
  const tmp = new THREE.Color();

  let hint: number | undefined;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const res = computeTerrainHeightWithHint(baked, x, z, hint);
    const y = res.y;
    hint = res.sampleIndex;
    pos.setY(i, y);

    // Deterministic low-poly vertex color variation based on elevation
    const jitter = ((Math.sin(x * 0.19) * Math.cos(z * 0.17)) + 1) * 0.5;
    if (y < -3) {
      tmp.copy(cRock).lerp(cLow, 0.25 + jitter * 0.2);
    } else if (y < 6) {
      tmp.copy(cLow).lerp(cMid, 0.25 + jitter * 0.55);
    } else if (y < 14) {
      tmp.copy(cMid).lerp(cHigh, (y - 6) / 8);
    } else {
      tmp.copy(cHigh).lerp(cRock, Math.min(1, (y - 14) / 14));
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geometries.push(geo);

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
  });
  materials.push(mat);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildRoadRibbon(
  baked: BakedTrackData,
  maxAnisotropy: number,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): { group: THREE.Group; roadMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const samples = baked.samples;
  const n = samples.length;
  const palette = baked.definition.palette;

  // 1. Road Surface Mesh
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= n; i++) {
    const s = samples[i % n];
    const hw = s.width * 0.5;
    const lx = s.x - s.rx * hw;
    const lz = s.z - s.rz * hw;
    const rx = s.x + s.rx * hw;
    const rz = s.z + s.rz * hw;

    positions.push(lx, s.y + 0.04, lz);
    positions.push(rx, s.y + 0.04, rz);

    const vCoord = (i / n) * (baked.totalLength / 14);
    uvs.push(0, vCoord, 1, vCoord);

    if (i < n) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  geometries.push(roadGeo);

  const roadTex = createRoadTexture(
    palette.roadColor,
    palette.roadStripeColor,
    maxAnisotropy,
  );
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(roadMat);

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 2. Shoulder Curbs (Left & Right, per-quad vertices for crisp alternating blocks)
  const curbGeoL: number[] = [];
  const curbColL: number[] = [];
  const curbIdxL: number[] = [];
  const cA = new THREE.Color(palette.curbA);
  const cB = new THREE.Color(palette.curbB);

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < n; i++) {
      const s0Curb = samples[i];
      const s1Curb = samples[(i + 1) % n];
      const hw0 = s0Curb.width * 0.5;
      const hw1 = s1Curb.width * 0.5;

      const x00 = s0Curb.x + s0Curb.rx * side * hw0;
      const z00 = s0Curb.z + s0Curb.rz * side * hw0;
      const x01 = s0Curb.x + s0Curb.rx * side * (hw0 + 0.95);
      const z01 = s0Curb.z + s0Curb.rz * side * (hw0 + 0.95);

      const x10 = s1Curb.x + s1Curb.rx * side * hw1;
      const z10 = s1Curb.z + s1Curb.rz * side * hw1;
      const x11 = s1Curb.x + s1Curb.rx * side * (hw1 + 0.95);
      const z11 = s1Curb.z + s1Curb.rz * side * (hw1 + 0.95);

      const base = curbGeoL.length / 3;
      curbGeoL.push(
        x00, s0Curb.y + 0.06, z00,
        x01, s0Curb.y + 0.09, z01,
        x10, s1Curb.y + 0.06, z10,
        x11, s1Curb.y + 0.09, z11,
      );

      const col = Math.floor(i / 2) % 2 === 0 ? cA : cB;
      for (let v = 0; v < 4; v++) {
        curbColL.push(col.r, col.g, col.b);
      }

      if (side === 1) {
        curbIdxL.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      } else {
        curbIdxL.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }

  const curbGeo = new THREE.BufferGeometry();
  curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbGeoL, 3));
  curbGeo.setAttribute('color', new THREE.Float32BufferAttribute(curbColL, 3));
  curbGeo.setIndex(curbIdxL);
  curbGeo.computeVertexNormals();
  geometries.push(curbGeo);

  const curbMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.05,
    flatShading: true,
  });
  materials.push(curbMat);
  const curbMesh = new THREE.Mesh(curbGeo, curbMat);
  curbMesh.receiveShadow = true;
  group.add(curbMesh);

  // 3. Start/Finish Line Strip at sample 0 (y = road + 0.08 to prevent Z-fighting)
  const s0 = samples[0];
  const checkTex = createCheckeredTexture(maxAnisotropy);
  const lineGeo = new THREE.PlaneGeometry(s0.width, 2.8);
  lineGeo.rotateX(-Math.PI / 2);
  geometries.push(lineGeo);
  const lineMat = new THREE.MeshStandardMaterial({
    map: checkTex,
    color: 0xffffff,
    roughness: 0.65,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  materials.push(lineMat);
  const lineMesh = new THREE.Mesh(lineGeo, lineMat);
  lineMesh.position.set(s0.x, s0.y + 0.08, s0.z);
  lineMesh.rotation.y = Math.atan2(s0.tx, s0.tz);
  group.add(lineMesh);

  return { group, roadMat };
}

function buildBridgesAndTunnels(
  baked: BakedTrackData,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  castShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const samples = baked.samples;
  const n = samples.length;
  const palette = baked.definition.palette;

  // Bridge Materials
  const deckMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.bridgeDeckColor),
    roughness: 0.8,
    metalness: 0.15,
    flatShading: true,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.bridgeRailColor),
    roughness: 0.35,
    metalness: 0.65,
    flatShading: true,
  });
  const pierMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.rockColor),
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true,
  });

  // Tunnel Materials
  const tunnelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.tunnelWallColor),
    roughness: 0.86,
    metalness: 0.12,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const tunnelLightMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.tunnelLightColor),
    emissive: new THREE.Color(palette.tunnelLightColor),
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  materials.push(deckMat, railMat, pierMat, tunnelMat, tunnelLightMat);

  // Reusable segment geometries
  const deckSegGeo = new THREE.BoxGeometry(1, 0.7, 1);
  const railPostGeo = new THREE.BoxGeometry(0.28, 1.35, 0.28);
  const railBarGeo = new THREE.BoxGeometry(0.22, 0.22, 1);
  const pierGeo = new THREE.BoxGeometry(1.6, 1, 1.6);
  const trussBeamGeo = new THREE.BoxGeometry(0.32, 3.8, 0.32);

  // Barrel vault arch for tunnel segments (half-cylinder shell)
  const archRadius = 8.4;
  const tunnelShellGeo = new THREE.CylinderGeometry(
    archRadius,
    archRadius,
    1,
    10,
    1,
    true,
    0,
    Math.PI,
  );
  // Orient cylinder axis along Z, arch upward along +Y
  tunnelShellGeo.rotateZ(Math.PI / 2);
  tunnelShellGeo.rotateY(Math.PI / 2);

  const tunnelRibGeo = new THREE.TorusGeometry(archRadius - 0.15, 0.35, 5, 10, Math.PI);
  const tunnelLightGeo = new THREE.BoxGeometry(1.6, 0.22, 1.4);

  geometries.push(
    deckSegGeo,
    railPostGeo,
    railBarGeo,
    pierGeo,
    trussBeamGeo,
    tunnelShellGeo,
    tunnelRibGeo,
    tunnelLightGeo,
  );

  const segLen = baked.totalLength / n;
  const dummy = new THREE.Object3D();

  // Count bridge & tunnel samples for InstancedMesh batching
  const bridgeIndices: number[] = [];
  const tunnelIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (samples[i].segmentType === 'bridge') bridgeIndices.push(i);
    else if (samples[i].segmentType === 'tunnel') tunnelIndices.push(i);
  }

  // Build Instanced Bridge Components
  if (bridgeIndices.length > 0) {
    const count = bridgeIndices.length;
    const deckInst = new THREE.InstancedMesh(deckSegGeo, deckMat, count);
    const railLInst = new THREE.InstancedMesh(railBarGeo, railMat, count);
    const railRInst = new THREE.InstancedMesh(railBarGeo, railMat, count);
    const postInst = new THREE.InstancedMesh(railPostGeo, railMat, count * 2);
    deckInst.receiveShadow = true;
    deckInst.castShadow = castShadow;

    const pierList: Array<{ x: number; y: number; z: number; h: number }> = [];

    bridgeIndices.forEach((idx, k) => {
      const s = samples[idx];
      const yaw = Math.atan2(s.tx, s.tz);
      const pitch = -Math.asin(Math.max(-0.99, Math.min(0.99, s.ty)));
      const hw = s.width * 0.5 + 0.6;

      // Deck slab directly beneath road
      dummy.position.set(s.x, s.y - 0.34, s.z);
      dummy.rotation.set(pitch, yaw, 0, 'YXZ');
      dummy.scale.set(s.width + 1.5, 1, segLen * 1.15);
      dummy.updateMatrix();
      deckInst.setMatrixAt(k, dummy.matrix);

      // Left & Right Top Rail Bars
      dummy.position.set(s.x - s.rx * hw, s.y + 1.15, s.z - s.rz * hw);
      dummy.rotation.set(pitch, yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, segLen * 1.15);
      dummy.updateMatrix();
      railLInst.setMatrixAt(k, dummy.matrix);

      dummy.position.set(s.x + s.rx * hw, s.y + 1.15, s.z + s.rz * hw);
      dummy.updateMatrix();
      railRInst.setMatrixAt(k, dummy.matrix);

      // Vertical Rail Posts
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(s.x - s.rx * hw, s.y + 0.65, s.z - s.rz * hw);
      dummy.updateMatrix();
      postInst.setMatrixAt(k * 2, dummy.matrix);

      dummy.position.set(s.x + s.rx * hw, s.y + 0.65, s.z + s.rz * hw);
      dummy.updateMatrix();
      postInst.setMatrixAt(k * 2 + 1, dummy.matrix);

      // Bridge support piers every 5 samples (skipping piers that would block a lower road underpass)
      if (k % 5 === 0) {
        const groundY = computeTerrainHeight(baked, s.x, s.z);
        const h = Math.max(4, s.y - groundY + 2);
        for (const side of [-1, 1]) {
          const px = s.x + s.rx * side * (hw - 1.2);
          const pz = s.z + s.rz * side * (hw - 1.2);
          let blocksLowerRoad = false;
          for (let j = 0; j < n; j++) {
            const other = samples[j];
            if (other.segmentType === 'bridge') continue;
            if (s.y - other.y > 3.0) {
              const d = Math.hypot(px - other.x, pz - other.z);
              if (d < other.width * 0.5 + 3.4) {
                blocksLowerRoad = true;
                break;
              }
            }
          }
          if (!blocksLowerRoad) {
            pierList.push({
              x: px,
              y: s.y - 0.5 - h * 0.5,
              z: pz,
              h,
            });
          }
        }
      }
    });

    [deckInst, railLInst, railRInst, postInst].forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    });

    if (pierList.length > 0) {
      const pierInst = new THREE.InstancedMesh(pierGeo, pierMat, pierList.length);
      pierList.forEach((p, idx) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, p.h, 1);
        dummy.updateMatrix();
        pierInst.setMatrixAt(idx, dummy.matrix);
      });
      pierInst.instanceMatrix.needsUpdate = true;
      pierInst.computeBoundingSphere();
      group.add(pierInst);
    }
  }

  // Build Instanced Tunnel Vaults & Ceiling Lights
  if (tunnelIndices.length > 0) {
    const count = tunnelIndices.length;
    const shellInst = new THREE.InstancedMesh(tunnelShellGeo, tunnelMat, count);
    const ribIndices = tunnelIndices.filter((_, k) => k % 3 === 0);
    const ribInst = new THREE.InstancedMesh(
      tunnelRibGeo,
      pierMat,
      Math.max(1, ribIndices.length),
    );
    const lightIndices = tunnelIndices.filter((_, k) => k % 4 === 0);
    const lightInst = new THREE.InstancedMesh(
      tunnelLightGeo,
      tunnelLightMat,
      Math.max(1, lightIndices.length),
    );

    tunnelIndices.forEach((idx, k) => {
      const s = samples[idx];
      const yaw = Math.atan2(s.tx, s.tz);
      const pitch = -Math.asin(Math.max(-0.99, Math.min(0.99, s.ty)));

      dummy.position.set(s.x, s.y - 0.2, s.z);
      dummy.rotation.set(pitch, yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, segLen * 1.24);
      dummy.updateMatrix();
      shellInst.setMatrixAt(k, dummy.matrix);
    });

    ribIndices.forEach((idx, k) => {
      const s = samples[idx];
      const yaw = Math.atan2(s.tx, s.tz);
      const pitch = -Math.asin(Math.max(-0.99, Math.min(0.99, s.ty)));
      dummy.position.set(s.x, s.y - 0.15, s.z);
      dummy.rotation.set(pitch, yaw, 0, 'YXZ');
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ribInst.setMatrixAt(k, dummy.matrix);
    });

    lightIndices.forEach((idx, k) => {
      const s = samples[idx];
      const yaw = Math.atan2(s.tx, s.tz);
      dummy.position.set(s.x, s.y + archRadius - 0.55, s.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lightInst.setMatrixAt(k, dummy.matrix);
    });

    [shellInst, ribInst, lightInst].forEach((im) => {
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
    });

    // Build contiguous tunnel runs to place monumental portals (with real arched holes)
    // and sculpted 3D mountain ridges arching cleanly over the tunnel vault.
    const tunnelRuns: number[][] = [];
    let currentRun: number[] = [];
    for (let i = 0; i < n; i++) {
      if (samples[i].segmentType === 'tunnel') {
        currentRun.push(i);
      } else if (currentRun.length > 0) {
        tunnelRuns.push(currentRun);
        currentRun = [];
      }
    }
    if (currentRun.length > 0) {
      tunnelRuns.push(currentRun);
    }

    // Portal facade with true semicircular tunnel hole cut out via Shape.holes
    const portalHoleR = archRadius - 0.15;
    const portalHalfW = 15.5;
    const portalWallH = 14.5;
    const portalShape = new THREE.Shape();
    portalShape.moveTo(-portalHalfW, -1.0);
    portalShape.lineTo(portalHalfW, -1.0);
    portalShape.lineTo(portalHalfW * 0.84, portalWallH);
    portalShape.lineTo(0, portalWallH + 2.4);
    portalShape.lineTo(-portalHalfW * 0.84, portalWallH);
    portalShape.closePath();

    const archHole = new THREE.Path();
    archHole.moveTo(-portalHoleR, -1.0);
    archHole.lineTo(-portalHoleR, 0.4);
    archHole.absarc(0, 0.4, portalHoleR, Math.PI, 0, true);
    archHole.lineTo(portalHoleR, -1.0);
    archHole.closePath();
    portalShape.holes.push(archHole);

    const portalGeo = new THREE.ExtrudeGeometry(portalShape, {
      depth: 2.4,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.3,
      bevelSegments: 1,
      curveSegments: 12,
    });
    portalGeo.translate(0, 0, -1.2);

    const wingGeo = new THREE.BoxGeometry(1.4, 9.5, 6.2);
    const chevronGeo = new THREE.BoxGeometry(11.0, 0.9, 0.4);
    const beaconGeo = new THREE.BoxGeometry(0.9, 0.9, 0.6);
    geometries.push(portalGeo, wingGeo, chevronGeo, beaconGeo);

    const portalMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.rockColor),
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true,
    });
    const mountainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.03,
      flatShading: true,
    });
    const chevronMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    materials.push(portalMat, mountainMat, chevronMat);

    const cMid = new THREE.Color(palette.terrainMid);
    const cHigh = new THREE.Color(palette.terrainHigh);
    const cRock = new THREE.Color(palette.rockColor);
    const cTmp = new THREE.Color();

    for (const run of tunnelRuns) {
      if (run.length < 3) continue;

      // 1. Entrance & Exit Portals
      const startSample = samples[run[0]];
      const endSample = samples[run[run.length - 1]];
      const portalEnds = [
        { s: startSample, flip: false },
        { s: endSample, flip: true },
      ];

      for (const end of portalEnds) {
        const s = end.s;
        const baseYaw = Math.atan2(s.tx, s.tz) + (end.flip ? Math.PI : 0);
        const portalGroup = new THREE.Group();
        portalGroup.position.set(s.x, s.y, s.z);
        portalGroup.rotation.y = baseYaw;

        const facade = new THREE.Mesh(portalGeo, portalMat);
        portalGroup.add(facade);

        // Flared retaining wing walls leading drivers into the tunnel mouth
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(wingGeo, portalMat);
          wing.position.set(side * (portalHoleR + 1.8), 3.6, -3.4);
          wing.rotation.y = -side * 0.25;
          portalGroup.add(wing);
        }

        // Overhead clearance warning bar & glowing beacons on outer approach face (-Z)
        const bar = new THREE.Mesh(chevronGeo, chevronMat);
        bar.position.set(0, archRadius + 1.45, -1.55);
        portalGroup.add(bar);

        for (const bx of [-4.6, 4.6]) {
          const beacon = new THREE.Mesh(beaconGeo, tunnelLightMat);
          beacon.position.set(bx, archRadius + 1.45, -1.65);
          portalGroup.add(beacon);
        }

        group.add(portalGroup);
      }

      // 2. Sculpted 3D Mountain Massif bridging over the tunnel bore (leaving bore hollow)
      // Cross-section stations along run:
      // 7 profile vertices per station: [-38, -17, -8.5, 0, +8.5, +17, +38]
      const cols = 7;
      const mPositions: number[] = [];
      const mColors: number[] = [];
      const mIndices: number[] = [];

      for (let k = 0; k < run.length; k++) {
        const s = samples[run[k]];
        const u = run.length > 1 ? k / (run.length - 1) : 0.5;
        const crestEnv = Math.sin(Math.PI * u); // 0 at portal edges -> 1 at mountain peak center
        const cragA = Math.sin(k * 0.85) * 2.4 * crestEnv;
        const cragB = Math.cos(k * 1.35) * 1.8 * crestEnv;

        const profileOffsets = [-38, -18, -8.8, 0, 8.8, 18, 38];
        const profileHeights = [
          -3.0,
          10.5 + crestEnv * 8.5 + cragA * 0.5,
          11.2 + crestEnv * 13.0 + cragB,
          12.0 + crestEnv * 17.5 + cragA,
          11.2 + crestEnv * 13.0 - cragB * 0.7,
          10.5 + crestEnv * 8.5 - cragA * 0.4,
          -3.0,
        ];

        for (let c = 0; c < cols; c++) {
          const lat = profileOffsets[c];
          const py = s.y + profileHeights[c];
          const px = s.x + s.rx * lat;
          const pz = s.z + s.rz * lat;
          mPositions.push(px, py, pz);

          if (c === 0 || c === cols - 1) {
            cTmp.copy(cMid);
          } else if (c === 3) {
            cTmp.copy(cHigh).lerp(cRock, 0.35);
          } else {
            cTmp.copy(cRock).lerp(cHigh, 0.45);
          }
          mColors.push(cTmp.r, cTmp.g, cTmp.b);
        }

        if (k < run.length - 1) {
          const r0 = k * cols;
          const r1 = (k + 1) * cols;
          for (let c = 0; c < cols - 1; c++) {
            mIndices.push(r0 + c, r1 + c, r0 + c + 1);
            mIndices.push(r0 + c + 1, r1 + c, r1 + c + 1);
          }
        }
      }

      const mountainGeo = new THREE.BufferGeometry();
      mountainGeo.setAttribute('position', new THREE.Float32BufferAttribute(mPositions, 3));
      mountainGeo.setAttribute('color', new THREE.Float32BufferAttribute(mColors, 3));
      mountainGeo.setIndex(mIndices);
      mountainGeo.computeVertexNormals();
      geometries.push(mountainGeo);

      const mountainMesh = new THREE.Mesh(mountainGeo, mountainMat);
      mountainMesh.receiveShadow = true;
      mountainMesh.castShadow = castShadow;
      group.add(mountainMesh);
    }
  }

  return group;
}

function buildStartGantry(
  baked: BakedTrackData,
  maxAnisotropy: number,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): {
  gantryGroup: THREE.Group;
  redMat: THREE.MeshStandardMaterial;
  amberMat: THREE.MeshStandardMaterial;
  greenMat: THREE.MeshStandardMaterial;
} {
  const s0 = baked.samples[0];
  const gantryGroup = new THREE.Group();
  gantryGroup.position.set(s0.x, s0.y, s0.z);
  gantryGroup.rotation.y = Math.atan2(s0.tx, s0.tz);

  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.65,
    flatShading: true,
  });
  const bannerTex = createCheckeredTexture(maxAnisotropy);
  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    color: 0xffffff,
    roughness: 0.55,
  });
  const redMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0xef4444,
    emissiveIntensity: 0.25,
  });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.2,
  });
  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x14532d,
    emissive: 0x22c55e,
    emissiveIntensity: 0.2,
  });
  materials.push(trussMat, bannerMat, redMat, amberMat, greenMat);

  const hw = s0.width * 0.5 + 1.2;
  const pillarGeo = new THREE.BoxGeometry(0.75, 7.6, 0.75);
  const beamGeo = new THREE.BoxGeometry(hw * 2 + 1.2, 1.4, 0.9);
  const bannerGeo = new THREE.BoxGeometry(hw * 1.7, 1.25, 1.02);
  const lampGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.45, 10);
  lampGeo.rotateX(Math.PI / 2);
  geometries.push(pillarGeo, beamGeo, bannerGeo, lampGeo);

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, trussMat);
    pillar.position.set(side * hw, 3.8, 0);
    gantryGroup.add(pillar);
  }

  const beam = new THREE.Mesh(beamGeo, trussMat);
  beam.position.set(0, 7.2, 0);
  gantryGroup.add(beam);

  const banner = new THREE.Mesh(bannerGeo, bannerMat);
  banner.position.set(0, 7.2, 0);
  gantryGroup.add(banner);

  // Countdown signal pods facing oncoming grid (-Z in gantry local space)
  const lights = [
    { x: -1.4, mat: redMat },
    { x: 0, mat: amberMat },
    { x: 1.4, mat: greenMat },
  ];
  for (const l of lights) {
    const lamp = new THREE.Mesh(lampGeo, l.mat);
    lamp.position.set(l.x, 6.05, -0.45);
    gantryGroup.add(lamp);
  }

  return { gantryGroup, redMat, amberMat, greenMat };
}

function buildInstancedScenery(
  baked: BakedTrackData,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Group {
  const group = new THREE.Group();
  const palette = baked.definition.palette;
  const climate: ClimateType = baked.definition.climate;

  // Deterministic pseudo-random generator
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const treeSpots: Array<{ x: number; y: number; z: number; scale: number; rot: number }> = [];
  const rockSpots: Array<{ x: number; y: number; z: number; scale: number; rot: number }> = [];

  const radius = baked.definition.worldRadius * 0.84;
  for (let i = 0; i < 480; i++) {
    const x = (rand() * 2 - 1) * radius;
    const z = (rand() * 2 - 1) * radius;
    // Keep clear of all track legs (safe across Figure-8 crossings), bridges, and tunnel mouths
    const minDist = minDistanceToTrack(x, z, baked);
    if (minDist < 15.5) continue;

    const proj = projectPointOnTrack(x, z, baked);
    const dist = Math.sqrt(proj.distSq);
    if (proj.segmentType === 'bridge' && dist < proj.halfWidth + 24) continue;
    if (proj.segmentType === 'tunnel' && dist < proj.halfWidth + 14) continue;

    const y = computeTerrainHeight(baked, x, z);
    if (palette.waterColor && y < palette.waterLevel + 0.8) continue;

    if (i % 3 === 0) {
      rockSpots.push({
        x,
        y,
        z,
        scale: 0.85 + rand() * 0.45,
        rot: rand() * Math.PI * 2,
      });
    } else {
      treeSpots.push({
        x,
        y,
        z,
        scale: 0.85 + rand() * 0.3, // ±15% natural variation
        rot: rand() * Math.PI * 2,
      });
    }
  }

  const dummy = new THREE.Object3D();
  const cA = new THREE.Color(palette.foliageA);
  const cB = new THREE.Color(palette.foliageB);
  const tmpColor = new THREE.Color();

  // Build climate-specific composite instanced trees (trunk + foliage layers)
  if (treeSpots.length > 0) {
    const count = treeSpots.length;

    if (climate === 'desert') {
      // Saguaro low-poly cacti (trunk + side arms)
      const cactusBodyGeo = new THREE.CylinderGeometry(0.45, 0.55, 5.2, 6);
      cactusBodyGeo.translate(0, 2.6, 0);
      const cactusArmGeo = new THREE.CylinderGeometry(0.28, 0.32, 2.0, 6);
      cactusArmGeo.translate(0.75, 3.1, 0);
      geometries.push(cactusBodyGeo, cactusArmGeo);

      const cactusMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        flatShading: true,
      });
      materials.push(cactusMat);

      const bodyInst = new THREE.InstancedMesh(cactusBodyGeo, cactusMat, count);
      const armInst = new THREE.InstancedMesh(cactusArmGeo, cactusMat, count);
      treeSpots.forEach((s, i) => {
        dummy.position.set(s.x, s.y - 0.1, s.z);
        dummy.rotation.set(0, s.rot, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);
        armInst.setMatrixAt(i, dummy.matrix);
        tmpColor.copy(cA).lerp(cB, rand());
        bodyInst.setColorAt(i, tmpColor);
        armInst.setColorAt(i, tmpColor);
      });
      [bodyInst, armInst].forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      });
    } else if (climate === 'tropical') {
      // Low-poly coastal palm trees (slender trunk + wide crown fronds)
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 6.2, 6);
      trunkGeo.translate(0, 3.1, 0);
      const crownGeo = new THREE.ConeGeometry(2.8, 1.5, 6);
      crownGeo.translate(0, 6.4, 0);
      geometries.push(trunkGeo, crownGeo);

      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x78553a,
        roughness: 0.9,
        flatShading: true,
      });
      const crownMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.72,
        flatShading: true,
      });
      materials.push(trunkMat, crownMat);

      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, count);
      treeSpots.forEach((s, i) => {
        dummy.position.set(s.x, s.y - 0.15, s.z);
        dummy.rotation.set((rand() - 0.5) * 0.1, s.rot, (rand() - 0.5) * 0.1);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);
        crownInst.setMatrixAt(i, dummy.matrix);
        tmpColor.copy(cA).lerp(cB, rand());
        crownInst.setColorAt(i, tmpColor);
      });
      [trunkInst, crownInst].forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      });
    } else {
      // Multi-tiered low-poly pines / autumn trees (trunk + lower cone + upper cone)
      const trunkGeo = new THREE.CylinderGeometry(0.32, 0.48, 2.4, 6);
      trunkGeo.translate(0, 1.2, 0);
      const coneLowGeo = new THREE.ConeGeometry(2.3, 4.2, 6);
      coneLowGeo.translate(0, 4.0, 0);
      const coneHighGeo = new THREE.ConeGeometry(1.65, 3.4, 6);
      coneHighGeo.translate(0, 6.2, 0);
      geometries.push(trunkGeo, coneLowGeo, coneHighGeo);

      const trunkMat = new THREE.MeshStandardMaterial({
        color: 0x5c4033,
        roughness: 0.92,
        flatShading: true,
      });
      const leafMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.78,
        flatShading: true,
      });
      materials.push(trunkMat, leafMat);

      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const lowInst = new THREE.InstancedMesh(coneLowGeo, leafMat, count);
      const highInst = new THREE.InstancedMesh(coneHighGeo, leafMat, count);

      treeSpots.forEach((s, i) => {
        dummy.position.set(s.x, s.y - 0.15, s.z);
        dummy.rotation.set(0, s.rot, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        trunkInst.setMatrixAt(i, dummy.matrix);
        lowInst.setMatrixAt(i, dummy.matrix);
        highInst.setMatrixAt(i, dummy.matrix);

        tmpColor.copy(cA).lerp(cB, rand());
        lowInst.setColorAt(i, tmpColor);
        highInst.setColorAt(i, tmpColor);
      });

      [trunkInst, lowInst, highInst].forEach((im) => {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        group.add(im);
      });
    }
  }

  // Faceted Low-Poly Rocks / Boulders
  if (rockSpots.length > 0) {
    const rockGeo = new THREE.DodecahedronGeometry(1.8, 0);
    rockGeo.translate(0, 0.7, 0);
    geometries.push(rockGeo);

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });
    materials.push(rockMat);

    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockSpots.length);
    const baseRock = new THREE.Color(palette.rockColor);

    rockSpots.forEach((s, i) => {
      dummy.position.set(s.x, s.y - 0.25, s.z);
      dummy.rotation.set(rand() * 0.4, s.rot, rand() * 0.4);
      dummy.scale.set(s.scale * 1.25, s.scale * 0.85, s.scale);
      dummy.updateMatrix();
      rockInst.setMatrixAt(i, dummy.matrix);

      tmpColor.copy(baseRock).multiplyScalar(0.85 + rand() * 0.3);
      rockInst.setColorAt(i, tmpColor);
    });
    rockInst.instanceMatrix.needsUpdate = true;
    if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
    rockInst.computeBoundingSphere();
    group.add(rockInst);
  }

  return group;
}

function buildGrandstands(
  baked: BakedTrackData,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  castShadow: boolean,
): THREE.Group {
  const group = new THREE.Group();
  const samples = baked.samples;
  const n = samples.length;
  const palette = baked.definition.palette;

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });
  const bleacherMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.72,
    metalness: 0.12,
    flatShading: true,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.65,
    flatShading: true,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.45,
    metalness: 0.2,
    flatShading: true,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.curbA),
    roughness: 0.45,
    metalness: 0.15,
    flatShading: true,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.78,
    flatShading: true,
  });
  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  });
  materials.push(
    concreteMat,
    bleacherMat,
    steelMat,
    canopyMat,
    accentMat,
    glassMat,
    crowdMat,
  );

  const standLen = 26;
  const baseGeo = new THREE.BoxGeometry(standLen, 2.4, 9.8);
  const tierGeo = new THREE.BoxGeometry(standLen - 0.8, 0.95, 2.2);
  const sideWallGeo = new THREE.BoxGeometry(0.65, 5.2, 9.6);
  const postGeo = new THREE.BoxGeometry(0.42, 7.6, 0.42);
  const roofGeo = new THREE.BoxGeometry(standLen + 1.6, 0.36, 9.6);
  const fasciaGeo = new THREE.BoxGeometry(standLen + 1.6, 0.55, 0.35);
  const crowdGeo = new THREE.BoxGeometry(0.55, 0.92, 0.48);

  geometries.push(
    baseGeo,
    tierGeo,
    sideWallGeo,
    postGeo,
    roofGeo,
    fasciaGeo,
    crowdGeo,
  );

  const crowdPositions: Array<{ x: number; y: number; z: number; yaw: number; colorIdx: number }> = [];
  const crowdColors = [
    new THREE.Color('#ef4444'),
    new THREE.Color('#f59e0b'),
    new THREE.Color('#38bdf8'),
    new THREE.Color('#22c55e'),
    new THREE.Color('#f8fafc'),
    new THREE.Color('#a855f7'),
  ];

  const standConfigs = [
    { t: 0.955, side: 1 },
    { t: 0.045, side: 1 },
    { t: 0.14, side: -1 },
    { t: 0.54, side: 1 },
    { t: 0.78, side: -1 },
  ];

  for (let cfgIdx = 0; cfgIdx < standConfigs.length; cfgIdx++) {
    const cfg = standConfigs[cfgIdx];
    const s = samples[Math.floor(cfg.t * n) % n];
    if (s.segmentType !== 'road') continue;

    const offsetDist = s.width * 0.5 + 9.2;
    const gx = s.x + s.rx * cfg.side * offsetDist;
    const gz = s.z + s.rz * cfg.side * offsetDist;

    // Ensure grandstand footprint never overlaps any crossing track leg
    if (minDistanceToTrack(gx, gz, baked) < s.width * 0.5 + 6.5) continue;
    if (minDistanceToTrack(gx + s.tx * 11, gz + s.tz * 11, baked) < s.width * 0.5 + 5.5) continue;
    if (minDistanceToTrack(gx - s.tx * 11, gz - s.tz * 11, baked) < s.width * 0.5 + 5.5) continue;

    const groundY = computeTerrainHeight(baked, gx, gz);
    if (palette.waterColor && groundY < palette.waterLevel + 0.6) continue;

    // Local +Z faces directly toward track centerline
    const yaw = Math.atan2(-s.rx * cfg.side, -s.rz * cfg.side);
    const standGroup = new THREE.Group();
    standGroup.position.set(gx, groundY, gz);
    standGroup.rotation.y = yaw;

    // Concrete foundation sunk -0.8m to ground cleanly on sloped terrain
    const base = new THREE.Mesh(baseGeo, concreteMat);
    base.position.set(0, 0.2, 0);
    base.receiveShadow = true;
    standGroup.add(base);

    // 4 stepped bleacher rows rising from front (+Z) to rear (-Z)
    for (let row = 0; row < 4; row++) {
      const rz = 3.0 - row * 2.0;
      const ry = 1.65 + row * 0.92;
      const tier = new THREE.Mesh(tierGeo, bleacherMat);
      tier.position.set(0, ry, rz);
      tier.castShadow = castShadow;
      tier.receiveShadow = true;
      standGroup.add(tier);

      // Populate spectators on this bleacher row
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      for (let col = -11; col <= 11; col += 1.45) {
        const hash = Math.abs(Math.sin((cfgIdx + 1) * 31.7 + row * 17.3 + col * 7.1));
        if (hash < 0.28) continue;
        const lx = col + (hash - 0.5) * 0.35;
        const lz = rz + 0.15;
        const wx = gx + lx * cosY + lz * sinY;
        const wz = gz - lx * sinY + lz * cosY;
        crowdPositions.push({
          x: wx,
          y: groundY + ry + 0.85,
          z: wz,
          yaw,
          colorIdx: Math.floor(hash * 97) % crowdColors.length,
        });
      }
    }

    // Side end walls
    for (const sx of [-standLen * 0.5 + 0.32, standLen * 0.5 - 0.32]) {
      const wall = new THREE.Mesh(sideWallGeo, concreteMat);
      wall.position.set(sx, 2.6, 0);
      standGroup.add(wall);
    }

    // Rear support columns
    for (const px of [-standLen * 0.45, -standLen * 0.15, standLen * 0.15, standLen * 0.45]) {
      const post = new THREE.Mesh(postGeo, steelMat);
      post.position.set(px, 4.9, -4.2);
      standGroup.add(post);
    }

    // Angled cantilevered canopy roof + accent front fascia
    const roof = new THREE.Mesh(roofGeo, canopyMat);
    roof.position.set(0, 8.6, -0.3);
    roof.rotation.x = -0.11;
    roof.castShadow = castShadow;
    standGroup.add(roof);

    const fascia = new THREE.Mesh(fasciaGeo, accentMat);
    fascia.position.set(0, 9.0, 4.45);
    standGroup.add(fascia);

    group.add(standGroup);
  }

  // Batched Instanced Crowd Spectators across all grandstands
  if (crowdPositions.length > 0) {
    const crowdInst = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdPositions.length);
    const dummy = new THREE.Object3D();
    crowdPositions.forEach((c, idx) => {
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.scale.set(1, 0.9 + (idx % 3) * 0.08, 1);
      dummy.updateMatrix();
      crowdInst.setMatrixAt(idx, dummy.matrix);
      crowdInst.setColorAt(idx, crowdColors[c.colorIdx]);
    });
    crowdInst.instanceMatrix.needsUpdate = true;
    if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
    crowdInst.computeBoundingSphere();
    group.add(crowdInst);
  }

  // Paddock / Pit Garages & Race Control Tower opposite the starting grid (side = -1)
  const sGrid = samples[Math.floor(0.975 * n) % n];
  const pitDist = sGrid.width * 0.5 + 10.5;
  const px = sGrid.x - sGrid.rx * pitDist;
  const pz = sGrid.z - sGrid.rz * pitDist;
  if (minDistanceToTrack(px, pz, baked) >= sGrid.width * 0.5 + 7.5) {
    const pitGroundY = computeTerrainHeight(baked, px, pz);
    if (!palette.waterColor || pitGroundY >= palette.waterLevel + 0.6) {
      const pitYaw = Math.atan2(sGrid.rx, sGrid.rz);
      const paddock = new THREE.Group();
      paddock.position.set(px, pitGroundY, pz);
      paddock.rotation.y = pitYaw;

      const garageGeo = new THREE.BoxGeometry(24, 4.8, 7.5);
      const doorGeo = new THREE.BoxGeometry(4.2, 2.8, 0.35);
      const towerGeo = new THREE.BoxGeometry(5.6, 12.0, 5.6);
      const controlDeckGeo = new THREE.BoxGeometry(6.4, 2.4, 6.4);
      const towerCapGeo = new THREE.BoxGeometry(6.8, 0.5, 6.8);
      geometries.push(garageGeo, doorGeo, towerGeo, controlDeckGeo, towerCapGeo);

      const garage = new THREE.Mesh(garageGeo, canopyMat);
      garage.position.set(0, 1.8, 0);
      garage.castShadow = castShadow;
      garage.receiveShadow = true;
      paddock.add(garage);

      for (const dx of [-8.2, -2.7, 2.7, 8.2]) {
        const door = new THREE.Mesh(doorGeo, steelMat);
        door.position.set(dx, 1.1, 3.7);
        paddock.add(door);
      }

      const garageTrim = new THREE.Mesh(new THREE.BoxGeometry(24.4, 0.55, 7.8), accentMat);
      geometries.push(garageTrim.geometry);
      garageTrim.position.set(0, 4.3, 0);
      paddock.add(garageTrim);

      // Race Control Timing Tower at pit exit end
      const tower = new THREE.Mesh(towerGeo, concreteMat);
      tower.position.set(14.5, 5.4, -0.5);
      paddock.add(tower);

      const deck = new THREE.Mesh(controlDeckGeo, glassMat);
      deck.position.set(14.5, 11.4, -0.5);
      paddock.add(deck);

      const cap = new THREE.Mesh(towerCapGeo, accentMat);
      cap.position.set(14.5, 12.8, -0.5);
      paddock.add(cap);

      group.add(paddock);
    }
  }

  return group;
}

export function buildTrackWorld(
  scene: THREE.Scene,
  baked: BakedTrackData,
  options: { maxAnisotropy: number; isSoftwareGl: boolean },
): BuiltWorld {
  const root = new THREE.Group();
  const palette = baked.definition.palette;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  scene.fog = new THREE.FogExp2(palette.fogColor, palette.fogDensity);
  scene.background = new THREE.Color(palette.skyHorizon);

  // Sky Dome
  const sky = createSkyDome(palette);
  geometries.push(sky.geo);
  materials.push(sky.mat);
  root.add(sky.mesh);

  // Warm/Cool Contrast Lighting Rig
  const hemi = new THREE.HemisphereLight(
    palette.hemiSky,
    palette.hemiGround,
    palette.hemiIntensity,
  );
  root.add(hemi);

  const sunLight = new THREE.DirectionalLight(palette.sunColor, palette.sunIntensity);
  sunLight.position.set(95, 130, 80);
  if (!options.isSoftwareGl) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 20;
    sunLight.shadow.camera.far = 360;
    const d = 145;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
  }
  root.add(sunLight);

  // Terrain Mesh
  const terrain = buildTerrainMesh(baked, geometries, materials);
  root.add(terrain);

  // Water / Frozen Lake Plane if climate includes water
  if (palette.waterColor) {
    const waterGeo = new THREE.PlaneGeometry(
      baked.definition.worldRadius * 2,
      baked.definition.worldRadius * 2,
    );
    waterGeo.rotateX(-Math.PI / 2);
    geometries.push(waterGeo);

    const isIce = baked.definition.climate === 'arctic';
    const waterMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.waterColor),
      roughness: isIce ? 0.18 : 0.25,
      metalness: isIce ? 0.35 : 0.15,
      transparent: !isIce,
      opacity: isIce ? 1 : 0.84,
      flatShading: true,
    });
    materials.push(waterMat);

    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = palette.waterLevel;
    root.add(waterMesh);
  }

  // Road, Curbs, Start Line
  const roadBuilt = buildRoadRibbon(
    baked,
    options.maxAnisotropy,
    geometries,
    materials,
  );
  root.add(roadBuilt.group);

  // Bridges & Tunnels
  const structuresGroup = buildBridgesAndTunnels(
    baked,
    geometries,
    materials,
    !options.isSoftwareGl,
  );
  root.add(structuresGroup);

  // Start Gantry + Lights
  const gantry = buildStartGantry(
    baked,
    options.maxAnisotropy,
    geometries,
    materials,
  );
  root.add(gantry.gantryGroup);

  // Instanced Climate Scenery (Trees, Cacti, Rocks)
  const sceneryGroup = buildInstancedScenery(baked, geometries, materials);
  root.add(sceneryGroup);

  // Trackside Spectator Grandstands & Race Control Paddock
  const grandstandsGroup = buildGrandstands(
    baked,
    geometries,
    materials,
    !options.isSoftwareGl,
  );
  root.add(grandstandsGroup);

  // Low-Poly Instanced Rain Precipitation Volume (Zero-GC per frame)
  const rainCount = 460;
  const rainGeo = new THREE.BoxGeometry(0.085, 2.3, 0.085);
  geometries.push(rainGeo);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xe0f2fe,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  materials.push(rainMat);

  const rainInst = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
  rainInst.frustumCulled = false;
  rainInst.visible = false;
  root.add(rainInst);

  const rainOffsetsX = new Float32Array(rainCount);
  const rainOffsetsY = new Float32Array(rainCount);
  const rainOffsetsZ = new Float32Array(rainCount);
  const rainSpeeds = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    const h1 = Math.abs(Math.sin(i * 12.9898 + 1.23)) % 1;
    const h2 = Math.abs(Math.sin(i * 78.233 + 4.56)) % 1;
    const h3 = Math.abs(Math.sin(i * 45.164 + 7.89)) % 1;
    rainOffsetsX[i] = (h1 - 0.5) * 72;
    rainOffsetsY[i] = h2 * 36;
    rainOffsetsZ[i] = (h3 - 0.5) * 72;
    rainSpeeds[i] = 32 + (i % 7) * 2.4;
  }

  const rainDummy = new THREE.Object3D();
  const fogExp = new THREE.FogExp2(palette.fogColor, palette.fogDensity);
  scene.fog = fogExp;
  const bgColor = new THREE.Color(palette.skyHorizon);
  scene.background = bgColor;

  const applyWeather = (
    weather: WeatherVisualParams,
    dt: number,
    focusPos: THREE.Vector3,
  ) => {
    fogExp.color.set(weather.fogColor);
    fogExp.density = weather.fogDensity;
    bgColor.set(weather.skyHorizon);

    sky.updateColors(weather.skyTop, weather.skyHorizon);

    sunLight.color.set(weather.sunColor);
    sunLight.intensity = weather.sunIntensity;
    sunLight.position.set(
      weather.sunPosition[0],
      weather.sunPosition[1],
      weather.sunPosition[2],
    );

    hemi.color.set(weather.hemiSky);
    hemi.groundColor.set(weather.hemiGround);
    hemi.intensity = weather.hemiIntensity;

    roadBuilt.roadMat.roughness = weather.roadRoughness;
    roadBuilt.roadMat.metalness = weather.roadMetalness;

    if (weather.rainIntensity > 0.02) {
      rainInst.visible = true;
      rainMat.opacity = 0.68 * weather.rainIntensity;
      const windDrift = 8.5 * dt;
      for (let i = 0; i < rainCount; i++) {
        rainOffsetsY[i] -= rainSpeeds[i] * dt;
        rainOffsetsX[i] += windDrift;
        if (rainOffsetsY[i] < -4) rainOffsetsY[i] += 36;
        if (rainOffsetsX[i] > 36) rainOffsetsX[i] -= 72;

        rainDummy.position.set(
          focusPos.x + rainOffsetsX[i],
          focusPos.y + rainOffsetsY[i],
          focusPos.z + rainOffsetsZ[i],
        );
        rainDummy.rotation.set(0, 0, -0.18);
        rainDummy.updateMatrix();
        rainInst.setMatrixAt(i, rainDummy.matrix);
      }
      rainInst.instanceMatrix.needsUpdate = true;
    } else {
      rainInst.visible = false;
    }
  };

  scene.add(root);

  return {
    root,
    gantryLights: {
      redMat: gantry.redMat,
      amberMat: gantry.amberMat,
      greenMat: gantry.greenMat,
    },
    sunLight,
    applyWeather,
    dispose: () => {
      scene.remove(root);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => {
        const std = m as THREE.MeshStandardMaterial;
        std.map?.dispose();
        m.dispose();
      });
    },
  };
}
