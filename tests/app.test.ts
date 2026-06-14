import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EcsDataLayoutApp } from '../src/app';

function createCanvasContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_target, property) {
      if (property === 'createLinearGradient') {
        return () => gradient;
      }
      return vi.fn();
    },
  });
}

describe('ECS teaching interface', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(createCanvasContext());
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('mounts the contextual lesson and applies workload experiments', () => {
    const root = document.querySelector<HTMLDivElement>('#app');
    expect(root).not.toBeNull();
    new EcsDataLayoutApp(root!).mount();

    expect(root!.querySelector('#insight-title')?.textContent).toContain('SoA');
    expect(root!.querySelector('#race-verdict')?.textContent).toContain('Collecting');

    root!.querySelector<HTMLButtonElement>('[data-experiment="hot-loop"]')?.click();

    expect(root!.querySelector<HTMLInputElement>('#entity-slider')?.value).toBe('100000');
    expect(root!.querySelector<HTMLInputElement>('#cold-slider')?.value).toBe('8');
    expect(root!.querySelector<HTMLSelectElement>('#workload-select')?.value).toBe('movement');
    expect(root!.querySelector('#insight-touched')?.textContent).toBe('4 / 16');
    expect(root!.querySelector('#experiment-summary')?.textContent).toContain('100K');
  });
});
