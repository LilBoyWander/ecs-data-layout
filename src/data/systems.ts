import { WORLD_HEIGHT, WORLD_WIDTH } from './types';

export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const SEASON_ENERGY = [1.35, 0.65, 1.15, 0.45] as const;
export const SEASON_DAMAGE = [0.15, 2.1, 0.55, 2.8] as const;

export function clampPosition(position: number, velocity: number, maximum: number): [number, number] {
  if (position < 0) {
    return [0, Math.abs(velocity) * 0.92];
  }
  if (position > maximum) {
    return [maximum, -Math.abs(velocity) * 0.92];
  }
  return [position, velocity];
}

export function updateVitals(
  health: number,
  energy: number,
  age: number,
  deltaTime: number,
  season: number,
): [number, number, number] {
  const nextEnergy = Math.min(100, energy + 11 * deltaTime * SEASON_ENERGY[season]);
  let nextHealth = Math.max(0, health - SEASON_DAMAGE[season] * deltaTime);
  if (nextEnergy > 55) {
    nextHealth = Math.min(100, nextHealth + 2.8 * deltaTime);
  }
  return [nextHealth, nextEnergy, age + deltaTime * 0.7];
}

export function wrapWorldX(value: number): number {
  return Math.max(0, Math.min(WORLD_WIDTH, value));
}

export function wrapWorldY(value: number): number {
  return Math.max(0, Math.min(WORLD_HEIGHT, value));
}
