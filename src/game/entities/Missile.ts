import * as THREE from 'three';
import { GROUND_Y } from '../types';
import type { MissileConfig, MissileKind } from '../types';
import { applyGravity } from '../utils/math';

const TRAIL_LENGTH = 24;

export class Missile {
  readonly kind: MissileKind;
  readonly mesh: THREE.Group;
  readonly velocity: THREE.Vector3;
  readonly trailPositions: THREE.Vector3[] = [];
  private readonly trailLine: THREE.Line;
  private readonly body: THREE.Mesh;
  alive = true;
  hitGround = false;

  constructor(scene: THREE.Scene, config: MissileConfig) {
    this.kind = config.kind;
    this.velocity = config.velocity.clone();

    this.mesh = new THREE.Group();
    this.mesh.position.copy(config.position);

    const bodyGeo =
      config.kind === 'ballistic'
        ? new THREE.ConeGeometry(0.35, 1.8, 8)
        : new THREE.CylinderGeometry(0.18, 0.18, 1.4, 8);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: config.color,
      emissive: config.color,
      emissiveIntensity: 0.35,
      metalness: 0.6,
      roughness: 0.35,
    });

    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.rotation.x = Math.PI / 2;
    this.mesh.add(this.body);

    const trailGeo = new THREE.BufferGeometry();
    const trailPoints = new Float32Array(TRAIL_LENGTH * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPoints, 3));

    const trailMat = new THREE.LineBasicMaterial({
      color: config.trailColor,
      transparent: true,
      opacity: 0.75,
    });

    this.trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(this.trailLine);
    scene.add(this.mesh);

    this.pushTrailPoint();
  }

  update(dt: number): void {
    if (!this.alive) return;

    if (this.kind === 'ballistic') {
      applyGravity(this.velocity, dt);
    }

    this.mesh.position.addScaledVector(this.velocity, dt);
    this.alignToVelocity();
    this.pushTrailPoint();
    this.updateTrailGeometry();

    if (this.mesh.position.y <= GROUND_Y) {
      this.hitGround = true;
      this.mesh.position.y = GROUND_Y;
    }
  }

  get position(): THREE.Vector3 {
    return this.mesh.position;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    scene.remove(this.trailLine);
    this.body.geometry.dispose();
    (this.body.material as THREE.Material).dispose();
    this.trailLine.geometry.dispose();
    (this.trailLine.material as THREE.Material).dispose();
  }

  private alignToVelocity(): void {
    if (this.velocity.lengthSq() < 0.001) return;
    const direction = this.velocity.clone().normalize();
    const lookTarget = this.mesh.position.clone().add(direction);
    this.mesh.lookAt(lookTarget);
    this.mesh.rotateX(Math.PI / 2);
  }

  private pushTrailPoint(): void {
    this.trailPositions.unshift(this.mesh.position.clone());
    if (this.trailPositions.length > TRAIL_LENGTH) {
      this.trailPositions.pop();
    }
  }

  private updateTrailGeometry(): void {
    const positions = this.trailLine.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const point = this.trailPositions[i];
      if (point) {
        positions.setXYZ(i, point.x, point.y, point.z);
      } else {
        positions.setXYZ(i, 0, -1000, 0);
      }
    }
    positions.needsUpdate = true;
  }
}
