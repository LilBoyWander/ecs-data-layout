import {
  MAX_COLD_COMPONENTS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type SeedData,
} from './types';

function createRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSeedData(count: number, coldComponentCount: number): SeedData {
  const normalizedColdCount = Math.max(0, Math.min(MAX_COLD_COMPONENTS, coldComponentCount));
  const random = createRandom(4000 + count * 13 + normalizedColdCount * 307);
  const data: SeedData = {
    count,
    coldComponentCount: normalizedColdCount,
    x: new Float32Array(count),
    y: new Float32Array(count),
    velocityX: new Float32Array(count),
    velocityY: new Float32Array(count),
    health: new Float32Array(count),
    energy: new Float32Array(count),
    age: new Float32Array(count),
    group: new Uint8Array(count),
    cold: Array.from({ length: normalizedColdCount }, () => new Float32Array(count)),
  };

  for (let index = 0; index < count; index += 1) {
    data.x[index] = random() * WORLD_WIDTH;
    data.y[index] = random() * WORLD_HEIGHT;
    data.velocityX[index] = (random() - 0.5) * 62;
    data.velocityY[index] = (random() - 0.5) * 62;
    data.health[index] = 55 + random() * 45;
    data.energy[index] = 35 + random() * 65;
    data.age[index] = random() * 180;
    data.group[index] = Math.floor(random() * 4);
    for (let component = 0; component < normalizedColdCount; component += 1) {
      data.cold[component][index] = random() * 1000;
    }
  }

  return data;
}
