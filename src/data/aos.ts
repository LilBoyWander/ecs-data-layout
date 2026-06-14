import type {
  DataStore,
  SeedData,
  SystemTimings,
  WorkloadName,
} from './types';
import { WORLD_HEIGHT, WORLD_WIDTH } from './types';
import { clampPosition, SEASON_DAMAGE, SEASON_ENERGY } from './systems';

interface Entity {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  health: number;
  energy: number;
  age: number;
  group: number;
  cold0?: number;
  cold1?: number;
  cold2?: number;
  cold3?: number;
  cold4?: number;
  cold5?: number;
  cold6?: number;
  cold7?: number;
}

/**
 * Conventional object-oriented storage: each entity owns all of its hot and cold fields.
 */
export class ArrayOfStructuresStore implements DataStore {
  readonly layout = 'aos' as const;
  readonly count: number;
  readonly coldComponentCount: number;
  private readonly entities: Entity[];

  constructor(seed: SeedData) {
    this.count = seed.count;
    this.coldComponentCount = seed.coldComponentCount;
    this.entities = new Array<Entity>(seed.count);
    for (let index = 0; index < seed.count; index += 1) {
      const entity: Entity = {
        x: seed.x[index],
        y: seed.y[index],
        velocityX: seed.velocityX[index],
        velocityY: seed.velocityY[index],
        health: seed.health[index],
        energy: seed.energy[index],
        age: seed.age[index],
        group: seed.group[index],
      };
      if (seed.coldComponentCount > 0) entity.cold0 = seed.cold[0][index];
      if (seed.coldComponentCount > 1) entity.cold1 = seed.cold[1][index];
      if (seed.coldComponentCount > 2) entity.cold2 = seed.cold[2][index];
      if (seed.coldComponentCount > 3) entity.cold3 = seed.cold[3][index];
      if (seed.coldComponentCount > 4) entity.cold4 = seed.cold[4][index];
      if (seed.coldComponentCount > 5) entity.cold5 = seed.cold[5][index];
      if (seed.coldComponentCount > 6) entity.cold6 = seed.cold[6][index];
      if (seed.coldComponentCount > 7) entity.cold7 = seed.cold[7][index];
      this.entities[index] = entity;
    }
  }

  step(deltaTime: number, season: number, workload: WorkloadName): SystemTimings {
    let movement = 0;
    let vitals = 0;
    let scan = 0;
    let checksum = 0;

    if (workload === 'movement' || workload === 'simulation') {
      const startedAt = performance.now();
      for (let index = 0; index < this.entities.length; index += 1) {
        const entity = this.entities[index];
        entity.x += entity.velocityX * deltaTime;
        entity.y += entity.velocityY * deltaTime;
        [entity.x, entity.velocityX] = clampPosition(entity.x, entity.velocityX, WORLD_WIDTH);
        [entity.y, entity.velocityY] = clampPosition(entity.y, entity.velocityY, WORLD_HEIGHT);
      }
      movement = performance.now() - startedAt;
    }

    if (workload === 'simulation') {
      const startedAt = performance.now();
      const energyModifier = SEASON_ENERGY[season];
      const damage = SEASON_DAMAGE[season];
      for (let index = 0; index < this.entities.length; index += 1) {
        const entity = this.entities[index];
        entity.energy = Math.min(100, entity.energy + 11 * deltaTime * energyModifier);
        entity.health = Math.max(0, entity.health - damage * deltaTime);
        if (entity.energy > 55) {
          entity.health = Math.min(100, entity.health + 2.8 * deltaTime);
        }
        entity.age += deltaTime * 0.7;
      }
      vitals = performance.now() - startedAt;
    }

    if (workload === 'scan' || workload === 'simulation') {
      const startedAt = performance.now();
      for (let index = 0; index < this.entities.length; index += 1) {
        const entity = this.entities[index];
        if (workload === 'scan') {
          checksum +=
            entity.x * 0.031 +
            entity.y * 0.029 +
            entity.velocityX * 0.023 +
            entity.velocityY * 0.019 +
            entity.health * 0.017 +
            entity.energy * 0.013 +
            entity.age * 0.007 +
            entity.group;
        } else if (entity.group === 2 && entity.health < 78) {
          checksum += entity.x * 0.031 + entity.energy * 0.017 + entity.age * 0.003;
        }
        if (workload === 'scan') {
          if (this.coldComponentCount > 0) checksum += entity.cold0 ?? 0;
          if (this.coldComponentCount > 1) checksum += entity.cold1 ?? 0;
          if (this.coldComponentCount > 2) checksum += entity.cold2 ?? 0;
          if (this.coldComponentCount > 3) checksum += entity.cold3 ?? 0;
          if (this.coldComponentCount > 4) checksum += entity.cold4 ?? 0;
          if (this.coldComponentCount > 5) checksum += entity.cold5 ?? 0;
          if (this.coldComponentCount > 6) checksum += entity.cold6 ?? 0;
          if (this.coldComponentCount > 7) checksum += entity.cold7 ?? 0;
        }
      }
      scan = performance.now() - startedAt;
    }

    return { movement, vitals, scan, total: movement + vitals + scan, checksum };
  }

  getX(index: number): number {
    return this.entities[index].x;
  }

  getY(index: number): number {
    return this.entities[index].y;
  }

  getHealth(index: number): number {
    return this.entities[index].health;
  }

  checksum(): number {
    let value = 0;
    const stride = Math.max(1, Math.floor(this.entities.length / 512));
    for (let index = 0; index < this.entities.length; index += stride) {
      const entity = this.entities[index];
      value +=
        entity.x * 0.11 +
        entity.y * 0.07 +
        entity.velocityX * 0.05 +
        entity.velocityY * 0.04 +
        entity.health * 0.03 +
        entity.energy * 0.02 +
        entity.age * 0.01 +
        entity.group * 0.13;
      if (this.coldComponentCount > 0) value += (entity.cold0 ?? 0) * 0.001;
      if (this.coldComponentCount > 1) value += (entity.cold1 ?? 0) * 0.002;
      if (this.coldComponentCount > 2) value += (entity.cold2 ?? 0) * 0.003;
      if (this.coldComponentCount > 3) value += (entity.cold3 ?? 0) * 0.004;
      if (this.coldComponentCount > 4) value += (entity.cold4 ?? 0) * 0.005;
      if (this.coldComponentCount > 5) value += (entity.cold5 ?? 0) * 0.006;
      if (this.coldComponentCount > 6) value += (entity.cold6 ?? 0) * 0.007;
      if (this.coldComponentCount > 7) value += (entity.cold7 ?? 0) * 0.008;
    }
    return value;
  }
}
