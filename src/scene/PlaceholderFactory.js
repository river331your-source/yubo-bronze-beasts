import * as THREE from 'three';

const BRONZE = 0x6b7c3a;

function makeMesh(geometry, color = BRONZE, offset = { x: 0, y: 0, z: 0 }) {
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      metalness: 0.85,
      roughness: 0.35,
    })
  );
  mesh.position.set(offset.x, offset.y, offset.z);
  mesh.userData.originalPosition = mesh.position.clone();
  mesh.userData.originalRotation = mesh.rotation.clone();
  return mesh;
}

function buildGroup(artifactId, parts) {
  const group = new THREE.Group();
  group.name = artifactId;
  parts.forEach((part) => group.add(part));
  return group;
}

/** 五件文物各不相同的程序化占位模型，OBJ 未就绪时使用 */
export function createPlaceholderModel(artifactId) {
  switch (artifactId) {
    case 'fuhao-xiao-zun': {
      const body = new THREE.Group();
      body.name = 'body';
      body.add(
        makeMesh(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 12), 0x7a8c4a, { x: 0, y: 0.15, z: 0 }),
        makeMesh(new THREE.BoxGeometry(0.15, 0.25, 0.3), 0x8b7355, { x: 0, y: 0.35, z: 0.35 })
      );
      const lid = new THREE.Group();
      lid.name = 'lid';
      lid.add(
        makeMesh(new THREE.SphereGeometry(0.45, 16, 12), 0x6b7c3a, { x: 0, y: 0.55, z: 0 }),
        makeMesh(new THREE.ConeGeometry(0.12, 0.35, 8), 0x5a6b2a, { x: -0.28, y: 0.95, z: 0 }),
        makeMesh(new THREE.ConeGeometry(0.12, 0.35, 8), 0x5a6b2a, { x: 0.28, y: 0.95, z: 0 })
      );
      return buildGroup(artifactId, [body, lid]);
    }

    case 'shenshou-bronze':
      return buildGroup(artifactId, [
        makeMesh(new THREE.CylinderGeometry(0.3, 0.45, 0.9, 8), 0x4a5c3a, { x: 0, y: 0.5, z: 0 }),
        makeMesh(new THREE.TorusGeometry(0.55, 0.08, 8, 24), 0x6b7c3a, { x: 0, y: 0.85, z: 0 }),
        makeMesh(new THREE.ConeGeometry(0.2, 0.5, 6), 0x5a6b2a, { x: -0.35, y: 1.1, z: 0 }),
        makeMesh(new THREE.ConeGeometry(0.2, 0.5, 6), 0x5a6b2a, { x: 0.35, y: 1.1, z: 0 }),
        makeMesh(new THREE.SphereGeometry(0.18, 12, 8), 0xc9a227, { x: 0, y: 1.25, z: 0.2 }),
      ]);

    case 'shoumian-fang-gong':
      return buildGroup(artifactId, [
        makeMesh(new THREE.BoxGeometry(0.9, 0.5, 0.5), 0x6b7c3a, { x: 0, y: 0.35, z: 0 }),
        makeMesh(new THREE.BoxGeometry(0.7, 0.15, 0.35), 0x5a6b2a, { x: 0, y: 0.7, z: 0 }),
        makeMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), 0x8b7355, { x: -0.35, y: 0.65, z: 0 }),
        makeMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), 0x8b7355, { x: 0.35, y: 0.65, z: 0 }),
        makeMesh(new THREE.BoxGeometry(0.25, 0.2, 0.15), 0x7a8c4a, { x: 0, y: 0.45, z: 0.28 }),
      ]);

    case 'panlong-he':
      return buildGroup(artifactId, [
        makeMesh(new THREE.SphereGeometry(0.4, 16, 12), 0x6b7c3a, { x: 0, y: 0.45, z: 0 }),
        makeMesh(new THREE.TorusKnotGeometry(0.25, 0.06, 64, 8), 0x5a6b2a, { x: 0, y: 0.75, z: 0 }),
        makeMesh(new THREE.CylinderGeometry(0.08, 0.12, 0.5, 8), 0x8b7355, { x: 0.45, y: 0.55, z: 0 }),
        makeMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), 0x7a8c4a, { x: -0.4, y: 0.5, z: 0.1 }),
        makeMesh(new THREE.TorusGeometry(0.15, 0.04, 8, 16), 0xc9a227, { x: 0, y: 0.2, z: 0 }),
      ]);

    case 'pu-yan-he':
      return buildGroup(artifactId, [
        makeMesh(new THREE.SphereGeometry(0.35, 16, 12), 0x6b7c3a, { x: 0, y: 0.5, z: 0 }),
        makeMesh(new THREE.CylinderGeometry(0.2, 0.35, 0.6, 12), 0x5a6b2a, { x: 0, y: 0.2, z: 0 }),
        makeMesh(new THREE.ConeGeometry(0.15, 0.4, 8), 0x7a8c4a, { x: 0, y: 0.85, z: -0.15 }),
        makeMesh(new THREE.SphereGeometry(0.1, 8, 6), 0x8b7355, { x: 0, y: 1.05, z: 0 }),
        makeMesh(new THREE.BoxGeometry(0.12, 0.18, 0.1), 0xc9a227, { x: 0, y: 1.15, z: 0.05 }),
      ]);

    default:
      return buildGroup(artifactId, [
        makeMesh(new THREE.IcosahedronGeometry(0.6, 1), BRONZE, { x: 0, y: 0.5, z: 0 }),
      ]);
  }
}
