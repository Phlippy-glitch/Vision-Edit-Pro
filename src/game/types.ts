import * as THREE from 'three';

export type MissileKind = 'ballistic' | 'patriot';

export interface MissileConfig {
  kind: MissileKind;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: number;
  trailColor: number;
}

export interface GameState {
  score: number;
  wave: number;
  ammo: number;
  cityHealth: number;
  isPlaying: boolean;
  isGameOver: boolean;
}

export const INITIAL_AMMO = 12;
export const MAX_CITY_HEALTH = 100;
export const INTERCEPT_RADIUS = 3.5;
export const GROUND_Y = 0;
