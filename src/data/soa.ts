import type {
  DataStore,
  SeedData,
  SystemTimings,
  WorkloadName,
} from './types';
import { WORLD_HEIGHT, WORLD_WIDTH } from './types';
import { SEASON_DAMAGE, SEASON_ENERGY } from './systems';

/**
 * Data-oriented storage: each component is packed into one contiguous typed array.
 */
export class StructureOfArraysStore implements DataStore {
  readonly layout = 'soa' as const;
  readonly count: number;
  readonly coldComponentCount: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly velocityX: Float32Array;
  private readonly velocityY: Float32Array;
  private readonly health: Float32Array;
  private readonly energy: Float32Array;
  private readonly age: Float32Array;
  private readonly group: Uint8Array;
  private readonly cold: Float32Array[];

  constructor(seed: SeedData) {
    this.count = seed.count;
    this.coldComponentCount = seed.coldComponentCount;
    this.x = seed.x.slice();
    this.y = seed.y.slice();
    this.velocityX = seed.velocityX.slice();
    this.velocityY = seed.velocityY.slice();
    this.health = seed.health.slice();
    this.energy = seed.energy.slice();
    this.age = seed.age.slice();
    this.group = seed.group.slice();
    this.cold = seed.cold.map((component) => component.slice());
  }

  step(deltaTime: number, season: number, workload: WorkloadName): SystemTimings {
    let movement = 0;
    let vitals = 0;
    let scan = 0;
    let checksum = 0;

    if (workload === 'movement' || workload === 'simulation') {
      const startedAt = performance.now();
      // The hot loop names exactly four packed columns. Health, energy, group, age, and every
      // cold component remain in separate arrays and never enter this traversal. That omission,
      // rather than "typed arrays are always faster", is the access-pattern lesson under test.
      for (let index = 0; index < this.count; index += 1) {
        let x = this.x[index] + this.velocityX[index] * deltaTime;
        let y = this.y[index] + this.velocityY[index] * deltaTime;
        let velocityX = this.velocityX[index];
        let velocityY = this.velocityY[index];

        if (x < 0) {
          x = 0;
          velocityX = Math.abs(velocityX) * 0.92;
        } else if (x > WORLD_WIDTH) {
          x = WORLD_WIDTH;
          velocityX = -Math.abs(velocityX) * 0.92;
        }
        if (y < 0) {
          y = 0;
          velocityY = Math.abs(velocityY) * 0.92;
        } else if (y > WORLD_HEIGHT) {
          y = WORLD_HEIGHT;
          velocityY = -Math.abs(velocityY) * 0.92;
        }

        this.x[index] = x;
        this.y[index] = y;
        this.velocityX[index] = velocityX;
        this.velocityY[index] = velocityY;
      }
      movement = performance.now() - startedAt;
    }

    if (workload === 'simulation') {
      const startedAt = performance.now();
      const energyModifier = SEASON_ENERGY[season];
      const damage = SEASON_DAMAGE[season];
      for (let index = 0; index < this.count; index += 1) {
        const energy = Math.min(100, this.energy[index] + 11 * deltaTime * energyModifier);
        let health = Math.max(0, this.health[index] - damage * deltaTime);
        if (energy > 55) {
          health = Math.min(100, health + 2.8 * deltaTime);
        }
        this.energy[index] = energy;
        this.health[index] = health;
        this.age[index] += deltaTime * 0.7;
      }
      vitals = performance.now() - startedAt;
    }

    if (workload === 'scan' || workload === 'simulation') {
      const startedAt = performance.now();
      for (let index = 0; index < this.count; index += 1) {
        if (workload === 'scan') {
          checksum +=
            this.x[index] * 0.031 +
            this.y[index] * 0.029 +
            this.velocityX[index] * 0.023 +
            this.velocityY[index] * 0.019 +
            this.health[index] * 0.017 +
            this.energy[index] * 0.013 +
            this.age[index] * 0.007 +
            this.group[index];
        } else if (this.group[index] === 2 && this.health[index] < 78) {
          checksum += this.x[index] * 0.031 + this.energy[index] * 0.017 + this.age[index] * 0.003;
        }
        if (workload === 'scan') {
          for (let component = 0; component < this.cold.length; component += 1) {
            checksum += this.cold[component][index];
          }
        }
      }
      scan = performance.now() - startedAt;
    }

    return { movement, vitals, scan, total: movement + vitals + scan, checksum };
  }

  getX(index: number): number {
    return this.x[index];
  }

  getY(index: number): number {
    return this.y[index];
  }

  getHealth(index: number): number {
    return this.health[index];
  }

  checksum(): number {
    let value = 0;
    // Keep state validation out of the measured systems. Both stores use the same sampling
    // stride and weights, so a low delta demonstrates equivalent evolution rather than speed.
    const stride = Math.max(1, Math.floor(this.count / 512));
    for (let index = 0; index < this.count; index += stride) {
      value +=
        this.x[index] * 0.11 +
        this.y[index] * 0.07 +
        this.velocityX[index] * 0.05 +
        this.velocityY[index] * 0.04 +
        this.health[index] * 0.03 +
        this.energy[index] * 0.02 +
        this.age[index] * 0.01 +
        this.group[index] * 0.13;
      for (let component = 0; component < this.cold.length; component += 1) {
        value += this.cold[component][index] * 0.001 * (component + 1);
      }
    }
    return value;
  }
}
