import * as THREE from 'three';

const MAX_PARTICLES = 40;
const LIFETIME = 0.9;

export class Explosion {
  private readonly points: THREE.Points;
  private readonly velocities: THREE.Vector3[] = [];
  private time = 0;
  alive = true;

  constructor(scene: THREE.Scene, position: THREE.Vector3, color: number) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.55,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.position.copy(position);
    scene.add(this.points);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2,
      ).normalize();
      this.velocities.push(dir.multiplyScalar(4 + Math.random() * 8));
    }
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time >= LIFETIME) {
      this.alive = false;
      return;
    }

    const positions = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const fade = 1 - this.time / LIFETIME;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const vel = this.velocities[i]!;
      positions.setX(i, positions.getX(i) + vel.x * dt);
      positions.setY(i, positions.getY(i) + vel.y * dt);
      positions.setZ(i, positions.getZ(i) + vel.z * dt);
      vel.y -= 12 * dt;
    }

    positions.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = fade;
    (this.points.material as THREE.PointsMaterial).size = 0.55 * (0.4 + fade * 0.6);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
