import { ArrayOfStructuresStore } from './aos';
import { StructureOfArraysStore } from './soa';
import type {
  BenchmarkReport,
  BenchmarkResult,
  DataStore,
  LayoutName,
  SeedData,
  SystemTimings,
  WorkloadName,
} from './types';

const FIXED_DELTA = 1 / 60;
const WARMUP_STEPS = 10;
const SAMPLE_COUNT = 18;

export interface BenchmarkOptions {
  warmupSteps?: number;
  sampleCount?: number;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index];
}

function summarize(
  layout: LayoutName,
  count: number,
  samples: SystemTimings[],
  checksum: number,
): BenchmarkResult {
  const totals = samples.map((sample) => sample.total);
  const median = percentile(totals, 0.5);
  return {
    layout,
    median,
    p95: percentile(totals, 0.95),
    movementMedian: percentile(samples.map((sample) => sample.movement), 0.5),
    vitalsMedian: percentile(samples.map((sample) => sample.vitals), 0.5),
    scanMedian: percentile(samples.map((sample) => sample.scan), 0.5),
    entitiesPerSecond: median <= 0 ? 0 : (count * 1000) / median,
    checksum,
  };
}

function warmStore(
  store: DataStore,
  workload: WorkloadName,
  season: number,
  warmupSteps: number,
): void {
  for (let step = 0; step < warmupSteps; step += 1) {
    store.step(FIXED_DELTA, season, workload);
  }
}

/**
 * Both stores are constructed from one immutable seed and run for the same number of fixed simulation steps.
 * The checksum is intentionally separate from timed system loops.
 */
export function runBenchmark(
  seed: SeedData,
  workload: WorkloadName,
  season: number,
  options: BenchmarkOptions = {},
): BenchmarkReport {
  const warmupSteps = options.warmupSteps ?? WARMUP_STEPS;
  const sampleCount = options.sampleCount ?? SAMPLE_COUNT;
  const aosStore = new ArrayOfStructuresStore(seed);
  const soaStore = new StructureOfArraysStore(seed);

  warmStore(aosStore, workload, season, warmupSteps);
  warmStore(soaStore, workload, season, warmupSteps);

  const aosSamples: SystemTimings[] = [];
  const soaSamples: SystemTimings[] = [];
  // Alternating the first runner reduces the chance that one layout consistently inherits
  // a warmer CPU, a fresher JIT tier, or the same background-browser interruption.
  for (let sample = 0; sample < sampleCount; sample += 1) {
    if (sample % 2 === 0) {
      aosSamples.push(aosStore.step(FIXED_DELTA, season, workload));
      soaSamples.push(soaStore.step(FIXED_DELTA, season, workload));
    } else {
      soaSamples.push(soaStore.step(FIXED_DELTA, season, workload));
      aosSamples.push(aosStore.step(FIXED_DELTA, season, workload));
    }
  }
  const aosChecksum = aosStore.checksum();
  const soaChecksum = soaStore.checksum();
  const aos = summarize('aos', seed.count, aosSamples, aosChecksum);
  const soa = summarize('soa', seed.count, soaSamples, soaChecksum);
  const denominator = Math.max(1, Math.abs(aosChecksum), Math.abs(soaChecksum));
  const parityError = (Math.abs(aosChecksum - soaChecksum) / denominator) * 100;
  const winner: LayoutName = aos.median <= soa.median ? 'aos' : 'soa';
  const faster = Math.max(aos.median, soa.median);
  const slower = Math.max(0.0001, Math.min(aos.median, soa.median));

  return {
    aos,
    soa,
    parityError,
    winner,
    speedup: faster / slower,
    sampleCount,
  };
}
