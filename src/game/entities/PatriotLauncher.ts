import * as THREE from 'three';
import { clamp } from '../utils/math';

const AIM_SPEED = 2.2;
const MIN_PITCH = -0.15;
const MAX_PITCH = 1.15;

export class PatriotLauncher {
  readonly root = new THREE.Group();
  private readonly turret: THREE.Group;
  private readonly barrel: THREE.Mesh;
  yaw = 0;
  pitch = 0.45;

  constructor(scene: THREE.Scene) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.8, 1.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x4b5563, metalness: 0.5, roughness: 0.6 }),
    );
    base.position.y = 0.6;
    this.root.add(base);

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.5, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.4, roughness: 0.7 }),
    );
    platform.position.y = 1.35;
    this.root.add(platform);

    this.turret = new THREE.Group();
    this.turret.position.y = 1.8;
    this.root.add(this.turret);

    const radar = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 2.4, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.55, roughness: 0.45 }),
    );
    radar.position.set(-1.4, 1.2, 0);
    this.turret.add(radar);

    const launcherRack = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.8, 3.6),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 }),
    );
    launcherRack.position.set(0.6, 0.5, 0);
    this.turret.add(launcherRack);

    this.barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.7, roughness: 0.3 }),
    );
    this.barrel.rotation.x = Math.PI / 2;
    this.barrel.position.set(0.6, 0.9, 1.6);
    this.turret.add(this.barrel);

    for (let i = 0; i < 4; i++) {
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.65, roughness: 0.35 }),
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0.2 + (i % 2) * 0.8, 0.35 + Math.floor(i / 2) * 0.5, 0.4);
      this.turret.add(tube);
    }

    this.root.position.set(0, 0, 8);
    scene.add(this.root);
  }

  aimAtTarget(target: THREE.Vector3, dt: number): void {
    const local = target.clone().sub(this.root.position);
    const desiredYaw = Math.atan2(local.x, local.z);
    const horizontal = Math.sqrt(local.x * local.x + local.z * local.z);
    const desiredPitch = clamp(Math.atan2(local.y, horizontal), MIN_PITCH, MAX_PITCH);

    let yawDelta = desiredYaw - this.yaw;
    while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
    while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;

    this.yaw += clamp(yawDelta, -AIM_SPEED * dt, AIM_SPEED * dt);
    this.pitch += clamp(desiredPitch - this.pitch, -AIM_SPEED * dt, AIM_SPEED * dt);

    this.turret.rotation.y = this.yaw;
    this.turret.rotation.x = -this.pitch;
  }

  getMuzzleWorldPosition(): THREE.Vector3 {
    const offset = new THREE.Vector3(0.6, 0.9, 2.8);
    this.turret.localToWorld(offset);
    return offset;
  }

  getMuzzleDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3(0, 0, 1);
    this.turret.localToWorld(dir);
    dir.sub(this.turret.getWorldPosition(new THREE.Vector3())).normalize();
    return dir;
  }
}
