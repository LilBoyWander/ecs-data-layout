import { ArrayOfStructuresStore } from './data/aos';
import { runBenchmark } from './data/benchmark';
import { createSeedData } from './data/seed';
import { StructureOfArraysStore } from './data/soa';
import { SEASON_NAMES } from './data/systems';
import {
  MAX_COLD_COMPONENTS,
  MAX_ENTITIES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type BenchmarkReport,
  type DataStore,
  type LayoutName,
  type SeedData,
  type SystemTimings,
  type WorkloadName,
} from './data/types';

interface AppElements {
  themeButton: HTMLButtonElement;
  notesButton: HTMLButtonElement;
  closeDialogButton: HTMLButtonElement;
  dialog: HTMLDialogElement;
  resetButton: HTMLButtonElement;
  stressButton: HTMLButtonElement;
  benchmarkButton: HTMLButtonElement;
  pauseToggle: HTMLInputElement;
  entitySlider: HTMLInputElement;
  entityValue: HTMLElement;
  speedSlider: HTMLInputElement;
  speedValue: HTMLElement;
  coldSlider: HTMLInputElement;
  coldValue: HTMLElement;
  workloadSelect: HTMLSelectElement;
  layoutButtons: NodeListOf<HTMLButtonElement>;
  layoutName: HTMLElement;
  layoutDescription: HTMLElement;
  canvas: HTMLCanvasElement;
  canvasEntities: HTMLElement;
  memoryDiagram: HTMLElement;
  seasonName: HTMLElement;
  fpsBadge: HTMLElement;
  frameTime: HTMLElement;
  updateTime: HTMLElement;
  renderTime: HTMLElement;
  movementTime: HTMLElement;
  vitalsTime: HTMLElement;
  scanTime: HTMLElement;
  valuesPerEntity: HTMLElement;
  hotValues: HTMLElement;
  benchmarkStatus: HTMLElement;
  benchmarkVerdict: HTMLElement;
  parityValue: HTMLElement;
  aosMedian: HTMLElement;
  aosP95: HTMLElement;
  aosThroughput: HTMLElement;
  aosMovement: HTMLElement;
  aosVitals: HTMLElement;
  aosScan: HTMLElement;
  soaMedian: HTMLElement;
  soaP95: HTMLElement;
  soaThroughput: HTMLElement;
  soaMovement: HTMLElement;
  soaVitals: HTMLElement;
  soaScan: HTMLElement;
}

type ThemeName = 'paper' | 'midnight';

const DEFAULT_ENTITY_COUNT = 50_000;
const DEFAULT_COLD_COMPONENTS = 4;
const DRAW_LIMIT = 6_000;

const EMPTY_TIMINGS: SystemTimings = {
  movement: 0,
  vitals: 0,
  scan: 0,
  total: 0,
  checksum: 0,
};

/**
 * Presents equivalent ECS-style systems over two different storage organizations.
 *
 * The live view is explanatory. The benchmark uses fresh stores, fixed timesteps, warmup passes, alternating sample
 * order, medians, and an out-of-band state checksum.
 */
export class EcsDataLayoutApp {
  private readonly root: HTMLDivElement;
  private elements!: AppElements;
  private context!: CanvasRenderingContext2D;
  private seed!: SeedData;
  private store!: DataStore;
  private layout: LayoutName = 'soa';
  private workload: WorkloadName = 'simulation';
  private theme: ThemeName = 'midnight';
  private entityCount = DEFAULT_ENTITY_COUNT;
  private coldComponentCount = DEFAULT_COLD_COMPONENTS;
  private speedMultiplier = 1;
  private season = 0;
  private seasonElapsed = 0;
  private isPaused = false;
  private lastFrameStart = performance.now();
  private frameInterval = 1000 / 60;
  private fps = 60;
  private fpsFrames = 0;
  private fpsElapsed = 0;
  private telemetryElapsed = 0;
  private renderDuration = 0;
  private timings: SystemTimings = { ...EMPTY_TIMINGS };
  private benchmark: BenchmarkReport | null = null;
  private rebuildTimer: number | null = null;

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  mount(): void {
    this.root.innerHTML = this.renderMarkup();
    this.elements = this.captureElements();
    const context = this.elements.canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D is not supported in this browser.');
    }
    this.context = context;
    this.theme = this.getPreferredTheme();
    this.applyTheme();
    this.createWorld();
    this.bindEvents();
    this.syncControls();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  private createWorld(): void {
    this.seed = createSeedData(this.entityCount, this.coldComponentCount);
    this.rebuildSelectedStore();
    this.benchmark = null;
    if (this.elements) {
      this.updateBenchmarkTelemetry();
    }
  }

  private rebuildSelectedStore(): void {
    this.store = this.layout === 'aos'
      ? new ArrayOfStructuresStore(this.seed)
      : new StructureOfArraysStore(this.seed);
    this.timings = { ...EMPTY_TIMINGS };
  }

  private bindEvents(): void {
    this.elements.themeButton.addEventListener('click', () => {
      this.theme = this.theme === 'paper' ? 'midnight' : 'paper';
      this.applyTheme();
    });
    this.elements.notesButton.addEventListener('click', () => this.elements.dialog.showModal());
    this.elements.closeDialogButton.addEventListener('click', () => this.elements.dialog.close());
    this.elements.dialog.addEventListener('click', (event) => {
      const bounds = this.elements.dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      ) {
        this.elements.dialog.close();
      }
    });

    this.elements.layoutButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const layout = button.dataset.layout;
        if (layout === 'aos' || layout === 'soa') {
          this.layout = layout;
          this.rebuildSelectedStore();
          this.syncControls();
        }
      });
    });

    this.elements.resetButton.addEventListener('click', () => {
      this.layout = 'soa';
      this.workload = 'simulation';
      this.entityCount = DEFAULT_ENTITY_COUNT;
      this.coldComponentCount = DEFAULT_COLD_COMPONENTS;
      this.speedMultiplier = 1;
      this.season = 0;
      this.seasonElapsed = 0;
      this.isPaused = false;
      this.createWorld();
      this.syncControls();
    });

    this.elements.stressButton.addEventListener('click', () => {
      this.entityCount = Math.min(MAX_ENTITIES, this.entityCount + 10_000);
      this.createWorld();
      this.syncControls();
    });

    this.elements.benchmarkButton.addEventListener('click', () => void this.runComparison());

    this.elements.entitySlider.addEventListener('input', () => {
      this.entityCount = Number.parseInt(this.elements.entitySlider.value, 10);
      this.elements.entityValue.textContent = this.entityCount.toLocaleString();
      this.queueRebuild();
    });

    this.elements.speedSlider.addEventListener('input', () => {
      this.speedMultiplier = Number.parseFloat(this.elements.speedSlider.value);
      this.elements.speedValue.textContent = `${this.speedMultiplier.toFixed(1)}x`;
    });

    this.elements.coldSlider.addEventListener('input', () => {
      this.coldComponentCount = Number.parseInt(this.elements.coldSlider.value, 10);
      this.elements.coldValue.textContent = String(this.coldComponentCount);
      this.updateDataShapeTelemetry();
      this.queueRebuild();
    });

    this.elements.workloadSelect.addEventListener('change', () => {
      const workload = this.elements.workloadSelect.value;
      if (workload === 'movement' || workload === 'simulation' || workload === 'scan') {
        this.workload = workload;
        this.benchmark = null;
        this.syncControls();
        this.updateBenchmarkTelemetry();
      }
    });

    this.elements.pauseToggle.addEventListener('change', () => {
      this.isPaused = this.elements.pauseToggle.checked;
    });

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        this.isPaused = !this.isPaused;
        this.elements.pauseToggle.checked = this.isPaused;
      } else if (event.key === '1' || event.key === '2') {
        this.layout = event.key === '1' ? 'aos' : 'soa';
        this.rebuildSelectedStore();
        this.syncControls();
      } else if (event.key.toLowerCase() === 'b') {
        void this.runComparison();
      }
    });
  }

  private queueRebuild(): void {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = window.setTimeout(() => {
      this.createWorld();
      this.syncControls();
      this.rebuildTimer = null;
    }, 160);
  }

  private loop(frameStart: number): void {
    const elapsed = frameStart - this.lastFrameStart;
    this.lastFrameStart = frameStart;
    this.frameInterval = elapsed;
    const deltaTime = Math.min(elapsed / 1000, 0.05) * this.speedMultiplier;

    if (!this.isPaused) {
      const sample = this.store.step(deltaTime, this.season, this.workload);
      this.timings = this.smoothTimings(this.timings, sample);
      this.seasonElapsed += elapsed;
      if (this.seasonElapsed >= 8_000) {
        this.season = (this.season + 1) % SEASON_NAMES.length;
        this.seasonElapsed = 0;
        this.elements.seasonName.textContent = SEASON_NAMES[this.season];
      }
    }

    const renderStartedAt = performance.now();
    this.renderCanvas();
    this.renderDuration = performance.now() - renderStartedAt;

    this.fpsFrames += 1;
    this.fpsElapsed += elapsed;
    this.telemetryElapsed += elapsed;
    if (this.fpsElapsed >= 400) {
      this.fps = (this.fpsFrames * 1000) / this.fpsElapsed;
      this.fpsFrames = 0;
      this.fpsElapsed = 0;
    }
    if (this.telemetryElapsed >= 150) {
      this.updateLiveTelemetry();
      this.telemetryElapsed = 0;
    }

    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  private smoothTimings(previous: SystemTimings, sample: SystemTimings): SystemTimings {
    const weight = 0.16;
    return {
      movement: previous.movement * (1 - weight) + sample.movement * weight,
      vitals: previous.vitals * (1 - weight) + sample.vitals * weight,
      scan: previous.scan * (1 - weight) + sample.scan * weight,
      total: previous.total * (1 - weight) + sample.total * weight,
      checksum: sample.checksum,
    };
  }

  private renderCanvas(): void {
    const context = this.context;
    const midnight = this.theme === 'midnight';
    context.fillStyle = midnight ? '#0a1119' : '#f5f3ed';
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    context.strokeStyle = midnight ? 'rgba(181, 156, 255, 0.10)' : 'rgba(90, 66, 151, 0.10)';
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += 48) {
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 40) {
      context.moveTo(0, y + 0.5);
      context.lineTo(WORLD_WIDTH, y + 0.5);
    }
    context.stroke();

    const stride = Math.max(1, Math.ceil(this.store.count / DRAW_LIMIT));
    const colors = midnight
      ? ['#ff9366', '#b59cff', '#78d8b2']
      : ['#bd4b24', '#6d52ba', '#237b5d'];
    for (let band = 0; band < colors.length; band += 1) {
      context.fillStyle = colors[band];
      context.beginPath();
      for (let index = band * stride; index < this.store.count; index += stride * colors.length) {
        const health = this.store.getHealth(index);
        if (
          (band === 0 && health >= 45) ||
          (band === 1 && (health < 45 || health >= 76)) ||
          (band === 2 && health < 76)
        ) {
          continue;
        }
        const x = this.store.getX(index);
        const y = this.store.getY(index);
        context.moveTo(x + 2, y);
        context.arc(x, y, 2, 0, Math.PI * 2);
      }
      context.fill();
    }

    const gradient = context.createLinearGradient(0, 0, WORLD_WIDTH, 0);
    gradient.addColorStop(0, midnight ? 'rgba(181, 156, 255, 0.16)' : 'rgba(109, 82, 186, 0.10)');
    gradient.addColorStop(0.5, 'transparent');
    gradient.addColorStop(1, midnight ? 'rgba(120, 216, 178, 0.13)' : 'rgba(35, 123, 93, 0.09)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private async runComparison(): Promise<void> {
    this.elements.benchmarkButton.disabled = true;
    this.elements.benchmarkStatus.textContent =
      'Warming both stores, alternating samples, and checking final state...';
    await new Promise<void>((resolve) => window.setTimeout(resolve, 30));

    const wasPaused = this.isPaused;
    this.isPaused = true;
    this.elements.pauseToggle.checked = true;
    try {
      const benchmarkSeed = createSeedData(this.entityCount, this.coldComponentCount);
      this.benchmark = runBenchmark(benchmarkSeed, this.workload, this.season);
      this.updateBenchmarkTelemetry();
    } finally {
      this.isPaused = wasPaused;
      this.elements.pauseToggle.checked = wasPaused;
      this.elements.benchmarkButton.disabled = false;
    }
  }

  private updateLiveTelemetry(): void {
    this.elements.fpsBadge.textContent = `${Math.round(this.fps)} FPS`;
    this.elements.fpsBadge.className = 'fps-badge';
    if (this.fps < 40) {
      this.elements.fpsBadge.classList.add('fps-badge--bad');
    } else if (this.fps < 55) {
      this.elements.fpsBadge.classList.add('fps-badge--warn');
    }
    this.elements.frameTime.textContent = this.frameInterval.toFixed(1);
    this.elements.updateTime.textContent = this.timings.total.toFixed(2);
    this.elements.renderTime.textContent = this.renderDuration.toFixed(2);
    this.elements.movementTime.textContent = this.timings.movement.toFixed(2);
    this.elements.vitalsTime.textContent = this.timings.vitals.toFixed(2);
    this.elements.scanTime.textContent = this.timings.scan.toFixed(2);
  }

  private updateBenchmarkTelemetry(): void {
    if (!this.benchmark) {
      this.elements.benchmarkStatus.textContent =
        'Run both layouts from one seeded snapshot using fixed simulation steps.';
      this.elements.benchmarkVerdict.textContent = 'No benchmark yet';
      this.elements.parityValue.textContent = '-';
      for (const element of [
        this.elements.aosMedian,
        this.elements.aosP95,
        this.elements.aosThroughput,
        this.elements.aosMovement,
        this.elements.aosVitals,
        this.elements.aosScan,
        this.elements.soaMedian,
        this.elements.soaP95,
        this.elements.soaThroughput,
        this.elements.soaMovement,
        this.elements.soaVitals,
        this.elements.soaScan,
      ]) {
        element.textContent = '-';
      }
      return;
    }

    const winnerName = this.benchmark.winner === 'aos'
      ? 'Array of Objects'
      : 'Structure of Arrays';
    this.elements.benchmarkStatus.textContent =
      `${this.benchmark.sampleCount} measured updates per layout after warmup. Results vary by browser and workload.`;
    this.elements.benchmarkVerdict.textContent =
      `${winnerName} was ${this.benchmark.speedup.toFixed(2)}x faster in this run`;
    this.elements.parityValue.textContent =
      `${this.benchmark.parityError.toFixed(4)}% state delta`;
    this.writeBenchmarkCard('aos', this.benchmark);
    this.writeBenchmarkCard('soa', this.benchmark);
  }

  private writeBenchmarkCard(layout: LayoutName, report: BenchmarkReport): void {
    const result = report[layout];
    const median = layout === 'aos' ? this.elements.aosMedian : this.elements.soaMedian;
    const p95 = layout === 'aos' ? this.elements.aosP95 : this.elements.soaP95;
    const throughput = layout === 'aos' ? this.elements.aosThroughput : this.elements.soaThroughput;
    const movement = layout === 'aos' ? this.elements.aosMovement : this.elements.soaMovement;
    const vitals = layout === 'aos' ? this.elements.aosVitals : this.elements.soaVitals;
    const scan = layout === 'aos' ? this.elements.aosScan : this.elements.soaScan;
    median.textContent = `${result.median.toFixed(2)} ms`;
    p95.textContent = `${result.p95.toFixed(2)} ms p95`;
    throughput.textContent = `${this.formatThroughput(result.entitiesPerSecond)} entities/s`;
    movement.textContent = `${result.movementMedian.toFixed(2)} ms`;
    vitals.textContent = `${result.vitalsMedian.toFixed(2)} ms`;
    scan.textContent = `${result.scanMedian.toFixed(2)} ms`;
  }

  private formatThroughput(value: number): string {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(0)}K`;
    }
    return value.toFixed(0);
  }

  private syncControls(): void {
    this.elements.layoutButtons.forEach((button) => {
      const active = button.dataset.layout === this.layout;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.elements.entitySlider.value = String(this.entityCount);
    this.elements.entityValue.textContent = this.entityCount.toLocaleString();
    this.elements.canvasEntities.textContent = this.entityCount.toLocaleString();
    this.elements.speedSlider.value = String(this.speedMultiplier);
    this.elements.speedValue.textContent = `${this.speedMultiplier.toFixed(1)}x`;
    this.elements.coldSlider.value = String(this.coldComponentCount);
    this.elements.coldValue.textContent = String(this.coldComponentCount);
    this.elements.workloadSelect.value = this.workload;
    this.elements.pauseToggle.checked = this.isPaused;
    this.elements.stressButton.disabled = this.entityCount >= MAX_ENTITIES;
    this.elements.layoutName.textContent = this.layout === 'aos'
      ? 'Array of Objects'
      : 'Structure of Arrays';
    this.elements.layoutDescription.textContent = this.layout === 'aos'
      ? 'Each entity record keeps hot and cold fields together. Systems walk whole object references.'
      : 'Each component column is packed independently. Systems stream only the arrays they need.';
    this.elements.memoryDiagram.className =
      `memory-diagram memory-diagram--${this.layout} memory-diagram--${this.workload}`;
    this.elements.seasonName.textContent = SEASON_NAMES[this.season];
    this.updateDataShapeTelemetry();
  }

  private updateDataShapeTelemetry(): void {
    this.elements.valuesPerEntity.textContent = String(8 + this.coldComponentCount);
    this.elements.hotValues.textContent = this.workload === 'movement'
      ? '4'
      : this.workload === 'simulation'
        ? '8'
        : String(8 + this.coldComponentCount);
  }

  private getPreferredTheme(): ThemeName {
    const stored = window.localStorage.getItem('ecs-layout-theme');
    if (stored === 'paper' || stored === 'midnight') {
      return stored;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'midnight' : 'paper';
  }

  private applyTheme(): void {
    document.documentElement.dataset.theme = this.theme;
    window.localStorage.setItem('ecs-layout-theme', this.theme);
    if (this.elements) {
      this.elements.themeButton.textContent = this.theme === 'paper' ? 'Paper' : 'Midnight';
    }
  }

  private captureElements(): AppElements {
    return {
      themeButton: this.getElement<HTMLButtonElement>('#theme-toggle'),
      notesButton: this.getElement<HTMLButtonElement>('#study-notes'),
      closeDialogButton: this.getElement<HTMLButtonElement>('#close-dialog'),
      dialog: this.getElement<HTMLDialogElement>('#study-dialog'),
      resetButton: this.getElement<HTMLButtonElement>('#reset-demo'),
      stressButton: this.getElement<HTMLButtonElement>('#stress-demo'),
      benchmarkButton: this.getElement<HTMLButtonElement>('#run-benchmark'),
      pauseToggle: this.getElement<HTMLInputElement>('#pause-sim'),
      entitySlider: this.getElement<HTMLInputElement>('#entity-slider'),
      entityValue: this.getElement<HTMLElement>('#entity-value'),
      speedSlider: this.getElement<HTMLInputElement>('#speed-slider'),
      speedValue: this.getElement<HTMLElement>('#speed-value'),
      coldSlider: this.getElement<HTMLInputElement>('#cold-slider'),
      coldValue: this.getElement<HTMLElement>('#cold-value'),
      workloadSelect: this.getElement<HTMLSelectElement>('#workload-select'),
      layoutButtons: this.root.querySelectorAll<HTMLButtonElement>('[data-layout]'),
      layoutName: this.getElement<HTMLElement>('#layout-name'),
      layoutDescription: this.getElement<HTMLElement>('#layout-description'),
      canvas: this.getElement<HTMLCanvasElement>('#ecs-canvas'),
      canvasEntities: this.getElement<HTMLElement>('#canvas-entities'),
      memoryDiagram: this.getElement<HTMLElement>('#memory-diagram'),
      seasonName: this.getElement<HTMLElement>('#season-name'),
      fpsBadge: this.getElement<HTMLElement>('#fps-badge'),
      frameTime: this.getElement<HTMLElement>('#frame-time'),
      updateTime: this.getElement<HTMLElement>('#update-time'),
      renderTime: this.getElement<HTMLElement>('#render-time'),
      movementTime: this.getElement<HTMLElement>('#movement-time'),
      vitalsTime: this.getElement<HTMLElement>('#vitals-time'),
      scanTime: this.getElement<HTMLElement>('#scan-time'),
      valuesPerEntity: this.getElement<HTMLElement>('#values-per-entity'),
      hotValues: this.getElement<HTMLElement>('#hot-values'),
      benchmarkStatus: this.getElement<HTMLElement>('#benchmark-status'),
      benchmarkVerdict: this.getElement<HTMLElement>('#benchmark-verdict'),
      parityValue: this.getElement<HTMLElement>('#parity-value'),
      aosMedian: this.getElement<HTMLElement>('#aos-median'),
      aosP95: this.getElement<HTMLElement>('#aos-p95'),
      aosThroughput: this.getElement<HTMLElement>('#aos-throughput'),
      aosMovement: this.getElement<HTMLElement>('#aos-movement'),
      aosVitals: this.getElement<HTMLElement>('#aos-vitals'),
      aosScan: this.getElement<HTMLElement>('#aos-scan'),
      soaMedian: this.getElement<HTMLElement>('#soa-median'),
      soaP95: this.getElement<HTMLElement>('#soa-p95'),
      soaThroughput: this.getElement<HTMLElement>('#soa-throughput'),
      soaMovement: this.getElement<HTMLElement>('#soa-movement'),
      soaVitals: this.getElement<HTMLElement>('#soa-vitals'),
      soaScan: this.getElement<HTMLElement>('#soa-scan'),
    };
  }

  private getElement<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Expected element ${selector}.`);
    }
    return element;
  }

  private renderMarkup(): string {
    return `
      <main class="shell">
        <header class="hero">
          <div class="hero__copy">
            <div class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></div>
            <div>
              <div class="hero__meta">
                <div class="eyebrow">Engine architecture / Case study 004</div>
                <span class="repo-badge">Public project</span>
              </div>
              <h1>ECS <span>Data Layout</span></h1>
              <div class="hero__subtitle">Same systems. Same state. Different memory organization.</div>
              <p>
                An interactive TypeScript study of Array of Structures versus Structure of Arrays for high-volume,
                ECS-style system updates.
              </p>
              <div class="hero__proof">
                <span><i class="language-dot"></i>TypeScript</span>
                <span><i class="language-dot language-dot--data"></i>Typed arrays</span>
                <span>Seeded parity</span>
                <span>100K entities</span>
              </div>
            </div>
          </div>
          <div class="hero__actions">
            <a class="button button--source" href="https://github.com/LilBoyWander/ecs-data-layout" target="_blank" rel="noreferrer"><span class="source-mark">&lt;/&gt;</span>View source</a>
            <button class="button button--theme" id="theme-toggle" type="button">Midnight</button>
            <button class="button" id="study-notes" type="button">Study notes</button>
          </div>
        </header>

        <section class="workspace">
          <section class="stage" aria-labelledby="demo-title">
            <div class="stage__toolbar">
              <div class="stage__meta">
                <div class="stage__index">DL</div>
                <div>
                  <div class="stage__path">demo / ecs-system-throughput</div>
                  <h2 id="demo-title">Live entity simulation</h2>
                  <div class="microcopy">Equivalent behavior over differently organized component data.</div>
                </div>
              </div>
              <div class="stage__actions">
                <button class="button button--quiet" id="reset-demo" type="button">Reset</button>
                <button class="button button--primary" id="stress-demo" type="button">Stress +10K</button>
              </div>
            </div>

            <div class="layout-switch" aria-label="Data layout">
              <button data-layout="aos" type="button">
                <span>Array of Objects</span>
                <small>Entity records / AoS</small>
              </button>
              <button data-layout="soa" class="is-active" type="button">
                <span>Structure of Arrays</span>
                <small>Component columns / SoA</small>
              </button>
            </div>
            <div class="layout-summary">
              <div><span>Active layout</span><strong id="layout-name">Structure of Arrays</strong></div>
              <p id="layout-description"></p>
            </div>

            <div class="memory-shell">
              <div class="memory-header">
                <span>Logical memory view</span>
                <em>Highlighted cells are touched by the selected workload</em>
              </div>
              <div class="memory-diagram memory-diagram--soa memory-diagram--simulation" id="memory-diagram">
                <div class="memory-view memory-view--aos">
                  <div class="record"><b>E0</b><i class="hot movement">x</i><i class="hot movement">y</i><i class="hot movement">vx</i><i class="hot movement">vy</i><i class="hot vitals">hp</i><i class="hot vitals">en</i><i class="hot vitals">age</i><i class="hot query">grp</i><i class="cold">c0</i><i class="cold">c1</i></div>
                  <div class="record"><b>E1</b><i class="hot movement">x</i><i class="hot movement">y</i><i class="hot movement">vx</i><i class="hot movement">vy</i><i class="hot vitals">hp</i><i class="hot vitals">en</i><i class="hot vitals">age</i><i class="hot query">grp</i><i class="cold">c0</i><i class="cold">c1</i></div>
                  <div class="record"><b>E2</b><i class="hot movement">x</i><i class="hot movement">y</i><i class="hot movement">vx</i><i class="hot movement">vy</i><i class="hot vitals">hp</i><i class="hot vitals">en</i><i class="hot vitals">age</i><i class="hot query">grp</i><i class="cold">c0</i><i class="cold">c1</i></div>
                </div>
                <div class="memory-view memory-view--soa">
                  <div class="column movement"><b>x[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                  <div class="column movement"><b>y[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                  <div class="column movement"><b>velocity[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                  <div class="column vitals"><b>health[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                  <div class="column query"><b>group[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                  <div class="column cold"><b>cold[]</b><i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i></div>
                </div>
              </div>
            </div>

            <div class="canvas-shell">
              <canvas id="ecs-canvas" width="${WORLD_WIDTH}" height="${WORLD_HEIGHT}" aria-label="High-volume entity simulation"></canvas>
              <div class="canvas-hud">
                <div><span>Entities</span><strong id="canvas-entities">${DEFAULT_ENTITY_COUNT.toLocaleString()}</strong></div>
                <i></i>
                <div><span>Season</span><strong id="season-name">Spring</strong></div>
                <i></i>
                <div class="canvas-hud__accent"><span>Layout</span><strong>Live</strong></div>
              </div>
            </div>
            <div class="stage-foot">
              <span><b>Important:</b> canvas rendering is measured separately from ECS system updates</span>
              <span><kbd>1</kbd> AoS <kbd>2</kbd> SoA <kbd>B</kbd> benchmark <kbd>Space</kbd> pause</span>
            </div>
          </section>

          <aside class="sidebar">
            <section class="panel">
              <div class="panel__header">
                <div><div class="panel__kicker">Live telemetry</div><h3>Frame health</h3></div>
                <output class="fps-badge" id="fps-badge">60 FPS</output>
              </div>
              <div class="metric metric--wide"><div><b>Frame interval</b><small>Actual browser frame spacing</small></div><strong><span id="frame-time">0.0</span> ms</strong></div>
              <div class="metric-grid">
                <div class="metric"><b>System update</b><strong><span id="update-time">0.00</span> ms</strong></div>
                <div class="metric"><b>Canvas render</b><strong><span id="render-time">0.00</span> ms</strong></div>
              </div>
            </section>

            <section class="panel">
              <div class="panel__header"><div><div class="panel__kicker">Workload</div><h3>Simulation shape</h3></div></div>
              <div class="control-stack">
                <label class="range-row"><span><b>Entity count</b><small>Updated every active frame</small></span><output id="entity-value">${DEFAULT_ENTITY_COUNT.toLocaleString()}</output><input id="entity-slider" type="range" min="10000" max="${MAX_ENTITIES}" step="5000" value="${DEFAULT_ENTITY_COUNT}" /></label>
                <label class="range-row"><span><b>Simulation speed</b><small>Changes state progression, not entity count</small></span><output id="speed-value">1.0x</output><input id="speed-slider" type="range" min="0.2" max="2.5" step="0.1" value="1" /></label>
                <label class="range-row"><span><b>Cold components</b><small>Equal payload, different placement</small></span><output id="cold-value">${DEFAULT_COLD_COMPONENTS}</output><input id="cold-slider" type="range" min="0" max="${MAX_COLD_COMPONENTS}" step="1" value="${DEFAULT_COLD_COMPONENTS}" /></label>
                <label class="select-row"><span><b>System workload</b><small>Changes which component columns are touched</small></span><select id="workload-select"><option value="movement">Movement only</option><option value="simulation" selected>Full simulation</option><option value="scan">Wide component scan</option></select></label>
              </div>
            </section>

            <section class="panel">
              <div class="panel__header"><div><div class="panel__kicker">System cost</div><h3>Measured hot loops</h3></div></div>
              <dl class="stats-grid">
                <dt>Movement</dt><dd><span id="movement-time">0.00</span> ms</dd>
                <dt>Vitals</dt><dd><span id="vitals-time">0.00</span> ms</dd>
                <dt>Filtered / wide scan</dt><dd><span id="scan-time">0.00</span> ms</dd>
                <dt>Logical values per entity</dt><dd id="values-per-entity">12</dd>
                <dt>Values touched by workload</dt><dd id="hot-values">8</dd>
              </dl>
            </section>

            <section class="panel">
              <div class="panel__header"><div><div class="panel__kicker">Inspect</div><h3>Simulation state</h3></div></div>
              <div class="toggle-stack">
                <label class="toggle"><span><b>Pause simulation</b><small>Freeze the live world without affecting benchmark data</small></span><span class="switch"><input id="pause-sim" type="checkbox" /><i></i></span></label>
              </div>
              <div class="panel-note">Switching layouts rebuilds the live store from the same immutable seed so both views begin from identical data.</div>
            </section>
          </aside>
        </section>

        <section class="benchmark">
          <div class="benchmark__intro">
            <div class="eyebrow">Controlled benchmark</div>
            <h2>Measure the layout, not the reset.</h2>
            <p id="benchmark-status">Run both layouts from one seeded snapshot using fixed simulation steps.</p>
            <button class="button button--primary" id="run-benchmark" type="button">Benchmark both layouts</button>
            <div class="benchmark__audit"><span>State parity</span><strong id="parity-value">-</strong></div>
          </div>
          <div class="benchmark__results">
            <div class="benchmark__verdict"><span>Result</span><strong id="benchmark-verdict">No benchmark yet</strong></div>
            <div class="result-grid">
              <article>
                <div class="result-card__head"><span>Array of Objects</span><b>AoS</b></div>
                <strong id="aos-median">-</strong>
                <small id="aos-p95">-</small>
                <em id="aos-throughput">-</em>
                <dl><dt>Movement</dt><dd id="aos-movement">-</dd><dt>Vitals</dt><dd id="aos-vitals">-</dd><dt>Scan</dt><dd id="aos-scan">-</dd></dl>
              </article>
              <article class="result-card--featured">
                <div class="result-card__head"><span>Structure of Arrays</span><b>SoA</b></div>
                <strong id="soa-median">-</strong>
                <small id="soa-p95">-</small>
                <em id="soa-throughput">-</em>
                <dl><dt>Movement</dt><dd id="soa-movement">-</dd><dt>Vitals</dt><dd id="soa-vitals">-</dd><dt>Scan</dt><dd id="soa-scan">-</dd></dl>
              </article>
            </div>
          </div>
        </section>

        <section class="explanation">
          <div class="explanation__intro">
            <div class="eyebrow">Data-oriented design</div>
            <h2>Organize around access patterns.</h2>
            <p>The useful question is not whether objects are bad. It is which data each system streams repeatedly, and what unrelated data travels alongside it.</p>
          </div>
          <ol class="principles">
            <li><span>01</span><div><b>Hot data</b><p>Position and velocity are read together by movement on every update.</p></div></li>
            <li><span>02</span><div><b>Cold data</b><p>Metadata can exist without entering a system's hot traversal.</p></div></li>
            <li><span>03</span><div><b>Queries</b><p>Packed columns make component-oriented iteration explicit and predictable.</p></div></li>
          </ol>
        </section>

        <section class="tradeoffs">
          <article><span>Array of Objects</span><h3>Local entity context</h3><p>Natural to model and inspect. It can be excellent when operations need most of one entity at a time or entity counts stay modest.</p></article>
          <article><span>Structure of Arrays</span><h3>System throughput</h3><p>Lets hot loops stream compact component columns and skip unrelated payload. It adds indexing and lifecycle complexity.</p></article>
          <article><span>JavaScript reality</span><h3>Measure your runtime</h3><p>JIT compilation, object shapes, typed-array conversions, browser load, and workload composition can all change the result.</p></article>
        </section>

        <footer class="footer"><span>Case study 004 / ECS storage, hot loops, and benchmark discipline</span><a href="https://github.com/LilBoyWander/ecs-data-layout" target="_blank" rel="noreferrer">View the source on GitHub</a></footer>

        <dialog class="dialog" id="study-dialog">
          <div class="dialog__accent"></div>
          <div class="dialog__body">
            <div class="panel__kicker">Study notes</div>
            <h3>What this demo is careful about</h3>
            <p>The layouts receive the same seeded values and run equivalent systems. The benchmark excludes construction, warms each implementation, alternates sample order, reports medians and p95, and verifies final-state parity outside timed loops.</p>
            <ul>
              <li>Live timings explain the system; benchmark timings support comparison.</li>
              <li>Cold-component payload exists in both layouts.</li>
              <li>Movement, full simulation, and wide scans exercise different access patterns.</li>
              <li>Canvas rendering is kept out of system update measurements.</li>
              <li>The result is browser-specific evidence, not a universal SoA guarantee.</li>
            </ul>
          </div>
          <div class="dialog__actions"><button class="button" id="close-dialog" type="button">Close</button></div>
        </dialog>
      </main>
    `;
  }
}
