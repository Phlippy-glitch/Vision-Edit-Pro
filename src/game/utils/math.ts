import * as THREE from 'three';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Parabolic ballistic arc toward a ground target. */
export function createBallisticVelocity(
  start: THREE.Vector3,
  target: THREE.Vector3,
  flightTime: number,
): THREE.Vector3 {
  const gravity = 9.8;
  const displacement = target.clone().sub(start);
  const vx = displacement.x / flightTime;
  const vz = displacement.z / flightTime;
  const vy = (displacement.y + 0.5 * gravity * flightTime * flightTime) / flightTime;
  return new THREE.Vector3(vx, vy, vz);
}

export function applyGravity(velocity: THREE.Vector3, dt: number, strength = 9.8): void {
  velocity.y -= strength * dt;
}
