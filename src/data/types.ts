export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 560;
export const MAX_ENTITIES = 100_000;
export const MAX_COLD_COMPONENTS = 8;

export type LayoutName = 'aos' | 'soa';
export type WorkloadName = 'movement' | 'simulation' | 'scan';

export interface SeedData {
  count: number;
  coldComponentCount: number;
  x: Float32Array;
  y: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  health: Float32Array;
  energy: Float32Array;
  age: Float32Array;
  group: Uint8Array;
  cold: Float32Array[];
}

export interface SystemTimings {
  movement: number;
  vitals: number;
  scan: number;
  total: number;
  checksum: number;
}

export interface DataStore {
  readonly layout: LayoutName;
  readonly count: number;
  readonly coldComponentCount: number;
  step(deltaTime: number, season: number, workload: WorkloadName): SystemTimings;
  getX(index: number): number;
  getY(index: number): number;
  getHealth(index: number): number;
  checksum(): number;
}

export interface BenchmarkResult {
  layout: LayoutName;
  median: number;
  p95: number;
  movementMedian: number;
  vitalsMedian: number;
  scanMedian: number;
  entitiesPerSecond: number;
  checksum: number;
}

export interface BenchmarkReport {
  aos: BenchmarkResult;
  soa: BenchmarkResult;
  parityError: number;
  winner: LayoutName;
  speedup: number;
  sampleCount: number;
}
