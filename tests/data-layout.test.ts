import { describe, expect, it } from 'vitest';
import { ArrayOfStructuresStore } from '../src/data/aos';
import { runBenchmark } from '../src/data/benchmark';
import { createSeedData } from '../src/data/seed';
import { StructureOfArraysStore } from '../src/data/soa';
import type { DataStore, WorkloadName } from '../src/data/types';

function parityError(first: DataStore, second: DataStore): number {
  const firstChecksum = first.checksum();
  const secondChecksum = second.checksum();
  const denominator = Math.max(1, Math.abs(firstChecksum), Math.abs(secondChecksum));
  return (Math.abs(firstChecksum - secondChecksum) / denominator) * 100;
}

describe('equivalent ECS layouts', () => {
  it('creates deterministic seed snapshots', () => {
    const first = createSeedData(128, 4);
    const second = createSeedData(128, 4);

    expect(Array.from(first.x)).toEqual(Array.from(second.x));
    expect(Array.from(first.group)).toEqual(Array.from(second.group));
    expect(Array.from(first.cold[3])).toEqual(Array.from(second.cold[3]));
  });

  it.each<WorkloadName>(['movement', 'simulation', 'scan'])(
    'preserves state parity for the %s workload',
    (workload) => {
      const seed = createSeedData(2_048, 8);
      const aos = new ArrayOfStructuresStore(seed);
      const soa = new StructureOfArraysStore(seed);

      for (let step = 0; step < 30; step += 1) {
        const season = step % 4;
        aos.step(1 / 60, season, workload);
        soa.step(1 / 60, season, workload);
      }

      expect(parityError(aos, soa)).toBeLessThan(0.001);
    },
  );

  it('reports the requested sample count and audited parity', () => {
    const report = runBenchmark(
      createSeedData(4_096, 6),
      'simulation',
      2,
      { warmupSteps: 2, sampleCount: 5 },
    );

    expect(report.sampleCount).toBe(5);
    expect(report.speedup).toBeGreaterThanOrEqual(1);
    expect(report.parityError).toBeLessThan(0.001);
    expect(report.aos.median).toBeGreaterThanOrEqual(0);
    expect(report.soa.median).toBeGreaterThanOrEqual(0);
  });
});
