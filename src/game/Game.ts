import * as THREE from 'three';
import { Explosion } from './entities/Explosion';
import { Missile } from './entities/Missile';
import { PatriotLauncher } from './entities/PatriotLauncher';
import {
  GROUND_Y,
  INITIAL_AMMO,
  INTERCEPT_RADIUS,
  MAX_CITY_HEALTH,
  type GameState,
} from './types';
import { createBallisticVelocity, pickRandom, randomRange, clamp } from './utils/math';

const CITY_TARGETS = [
  new THREE.Vector3(-18, GROUND_Y, -22),
  new THREE.Vector3(0, GROUND_Y, -28),
  new THREE.Vector3(16, GROUND_Y, -20),
  new THREE.Vector3(-8, GROUND_Y, -35),
  new THREE.Vector3(22, GROUND_Y, -32),
];

export class Game {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly launcher: PatriotLauncher;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private readonly aimPoint = new THREE.Vector3(0, 12, -35);
  private readonly clock = new THREE.Clock();

  private ballisticMissiles: Missile[] = [];
  private patriotMissiles: Missile[] = [];
  private explosions: Explosion[] = [];

  private state: GameState = {
    score: 0,
    wave: 1,
    ammo: INITIAL_AMMO,
    cityHealth: MAX_CITY_HEALTH,
    isPlaying: false,
    isGameOver: false,
  };

  private waveRemaining = 0;
  private spawnTimer = 0;
  private spawnInterval = 2.8;
  private messageTimer = 0;

  private readonly hud = {
    score: document.getElementById('score')!,
    wave: document.getElementById('wave')!,
    ammo: document.getElementById('ammo')!,
    health: document.getElementById('health')!,
    message: document.getElementById('message')!,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);
    this.scene.fog = new THREE.Fog(0x0b1220, 40, 180);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 6, 16);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;

    this.buildEnvironment();
    this.launcher = new PatriotLauncher(this.scene);

    this.bindEvents();
    this.animate();
  }

  start(): void {
    this.reset();
    this.state.isPlaying = true;
    this.beginWave();
    this.showMessage('Wave 1 — intercept incoming missiles!');
  }

  private reset(): void {
    this.clearEntities();
    this.state = {
      score: 0,
      wave: 1,
      ammo: INITIAL_AMMO,
      cityHealth: MAX_CITY_HEALTH,
      isPlaying: true,
      isGameOver: false,
    };
    this.waveRemaining = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 2.8;
    this.messageTimer = 0;
    this.updateHud();
    this.hud.message.classList.add('hidden');
  }

  private buildEnvironment(): void {
    const ambient = new THREE.AmbientLight(0x8ba4c7, 0.75);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x9ecbff, 0x1a3d2e, 0.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe8c8, 1.35);
    sun.position.set(40, 60, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x2d4a34, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(120, 40, 0x4ade80, 0x2d6b4a);
    grid.position.y = 0.02;
    this.scene.add(grid);

    for (const target of CITY_TARGETS) {
      this.addBuilding(target);
    }
  }

  private addBuilding(position: THREE.Vector3): void {
    const height = randomRange(4, 12);
    const width = randomRange(3, 7);
    const depth = randomRange(3, 7);

    const building = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.58, 0.15, randomRange(0.25, 0.45)),
        metalness: 0.2,
        roughness: 0.75,
      }),
    );
    building.position.set(position.x, height / 2, position.z);
    building.castShadow = true;
    building.receiveShadow = true;
    this.scene.add(building);

    const glow = new THREE.PointLight(0xfbbf24, 0.35, 12);
    glow.position.set(position.x, height * 0.6, position.z + depth * 0.3);
    this.scene.add(glow);
  }

  private bindEvents(): void {
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        if (this.state.isGameOver) this.start();
      }
    });
  }

  private onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private onMouseMove(event: MouseEvent): void {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button !== 0 || !this.state.isPlaying || this.state.isGameOver) return;
    this.firePatriot();
  }

  private updateAimPoint(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -6);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(plane, hit)) {
      this.aimPoint.copy(hit);
      this.aimPoint.y = clamp(this.aimPoint.y, 4, 45);
    }
  }

  private firePatriot(): void {
    if (this.state.ammo <= 0) {
      this.showMessage('No Patriot missiles remaining!', 1.5);
      return;
    }

    this.state.ammo -= 1;
    this.updateHud();

    const origin = this.launcher.getMuzzleWorldPosition();
    const direction = this.aimPoint.clone().sub(origin).normalize();
    const speed = 38;

    const patriot = new Missile(this.scene, {
      kind: 'patriot',
      position: origin,
      velocity: direction.multiplyScalar(speed),
      color: 0x38bdf8,
      trailColor: 0x7dd3fc,
    });

    this.patriotMissiles.push(patriot);
  }

  private spawnBallisticMissile(): void {
    const target = pickRandom(CITY_TARGETS).clone();
    target.x += randomRange(-4, 4);
    target.z += randomRange(-4, 4);

    const startX = randomRange(-55, 55);
    const startZ = randomRange(-75, -45);
    const start = new THREE.Vector3(startX, randomRange(55, 75), startZ);

    const flightTime = randomRange(7, 10) - this.state.wave * 0.15;
    const velocity = createBallisticVelocity(start, target, Math.max(flightTime, 5));

    const missile = new Missile(this.scene, {
      kind: 'ballistic',
      position: start,
      velocity,
      color: 0xef4444,
      trailColor: 0xfca5a5,
    });

    this.ballisticMissiles.push(missile);
  }

  private beginWave(): void {
    this.waveRemaining = 4 + this.state.wave * 2;
    this.spawnInterval = Math.max(1.1, 2.8 - this.state.wave * 0.18);
    this.spawnTimer = 0.5;
  }

  private checkInterceptions(): void {
    for (const patriot of this.patriotMissiles) {
      if (!patriot.alive) continue;

      for (const ballistic of this.ballisticMissiles) {
        if (!ballistic.alive) continue;

        const dist = patriot.position.distanceTo(ballistic.position);
        if (dist < INTERCEPT_RADIUS) {
          this.destroyMissile(ballistic, 0xff6b35);
          this.destroyMissile(patriot, 0x38bdf8);
          this.state.score += 100 + this.state.wave * 25;
          this.updateHud();
          this.showMessage('Intercept!', 0.8);
          break;
        }
      }
    }
  }

  private destroyMissile(missile: Missile, color: number): void {
    missile.alive = false;
    this.explosions.push(new Explosion(this.scene, missile.position.clone(), color));
    missile.dispose(this.scene);
  }

  private handleGroundImpacts(): void {
    for (const ballistic of this.ballisticMissiles) {
      if (!ballistic.alive || !ballistic.hitGround) continue;

      ballistic.alive = false;
      this.explosions.push(new Explosion(this.scene, ballistic.position.clone(), 0xef4444));
      ballistic.dispose(this.scene);
      this.state.cityHealth = Math.max(0, this.state.cityHealth - 15);
      this.updateHud();
      this.showMessage('Impact! City damaged.', 1.2);

      if (this.state.cityHealth <= 0) {
        this.endGame(false);
      }
    }

    for (const patriot of this.patriotMissiles) {
      if (!patriot.alive || !patriot.hitGround) continue;
      patriot.alive = false;
      patriot.dispose(this.scene);
    }
  }

  private updateWaveLogic(dt: number): void {
    if (this.waveRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnBallisticMissile();
        this.waveRemaining -= 1;
        this.spawnTimer = this.spawnInterval;
      }
    } else if (
      this.ballisticMissiles.length === 0 &&
      this.patriotMissiles.length === 0 &&
      !this.state.isGameOver
    ) {
      this.state.wave += 1;
      this.state.ammo = Math.min(this.state.ammo + 4, INITIAL_AMMO + this.state.wave * 2);
      this.updateHud();
      this.beginWave();
      this.showMessage(`Wave ${this.state.wave} incoming!`);
    }
  }

  private endGame(won: boolean): void {
    this.state.isPlaying = false;
    this.state.isGameOver = true;
    const text = won
      ? `Victory! Final score: ${this.state.score}`
      : `City lost. Score: ${this.state.score} — Press R to retry`;
    this.showMessage(text, 999);
  }

  private showMessage(text: string, duration = 2.5): void {
    this.hud.message.textContent = text;
    this.hud.message.classList.remove('hidden');
    this.messageTimer = duration;
  }

  private updateHud(): void {
    this.hud.score.textContent = String(this.state.score);
    this.hud.wave.textContent = String(this.state.wave);
    this.hud.ammo.textContent = String(this.state.ammo);
    this.hud.health.textContent = `${this.state.cityHealth}%`;
  }

  private updateCamera(): void {
    const launcherPos = this.launcher.root.position;
    const offset = new THREE.Vector3(
      -Math.sin(this.launcher.yaw) * 6,
      3.8,
      Math.cos(this.launcher.yaw) * 6,
    );

    const desired = launcherPos.clone().add(offset);
    this.camera.position.lerp(desired, 0.1);

    const lookTarget = this.aimPoint.clone();
    lookTarget.y = clamp(lookTarget.y, 6, 30);
    this.camera.lookAt(lookTarget);
  }

  private pruneEntities(): void {
    this.ballisticMissiles = this.ballisticMissiles.filter((m) => m.alive);
    this.patriotMissiles = this.patriotMissiles.filter((m) => m.alive);
    this.explosions = this.explosions.filter((e) => {
      if (!e.alive) {
        e.dispose(this.scene);
        return false;
      }
      return true;
    });
  }

  private clearEntities(): void {
    for (const m of [...this.ballisticMissiles, ...this.patriotMissiles]) {
      m.dispose(this.scene);
    }
    for (const e of this.explosions) {
      e.dispose(this.scene);
    }
    this.ballisticMissiles = [];
    this.patriotMissiles = [];
    this.explosions = [];
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state.isPlaying && !this.state.isGameOver) {
      this.updateAimPoint();
      this.launcher.aimAtTarget(this.aimPoint, dt);
      this.updateCamera();

      for (const m of this.ballisticMissiles) m.update(dt);
      for (const m of this.patriotMissiles) m.update(dt);
      for (const e of this.explosions) e.update(dt);

      this.checkInterceptions();
      this.handleGroundImpacts();
      this.updateWaveLogic(dt);
      this.pruneEntities();

      if (this.messageTimer > 0) {
        this.messageTimer -= dt;
        if (this.messageTimer <= 0 && !this.state.isGameOver) {
          this.hud.message.classList.add('hidden');
        }
      }
    } else {
      this.updateCamera();
    }

    this.renderer.render(this.scene, this.camera);
  };
}
