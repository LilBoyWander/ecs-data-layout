<div align="center">

<img src="./public/favicon.svg" width="72" alt="ECS Data Layout mark" />

# ECS Data Layout

**An interactive data-oriented design case study**

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-237b5d?style=flat-square)](./LICENSE)

Compare Array of Structures and Structure of Arrays while equivalent ECS-style systems update the same seeded entity data.

</div>

## Why This Exists

An Entity Component System separates identity, data, and behavior. That architectural split creates an important implementation question:

> How should component data be arranged for the systems that process it?

An object-oriented layout keeps one entity's values together. A data-oriented layout keeps one component's values together. Neither representation wins every workload, but they produce very different access patterns at scale.

This case study makes those patterns visible and benchmarks them without changing system behavior.

The live page now teaches the decision in three layers:

- **Workload experiments** configure a narrow hot loop, mixed systems, or a full-record scan.
- **Live layout race** advances both layouts with the same fixed step and continuously audits state parity.
- **Controlled benchmark** warms both implementations, alternates execution order, and reports median/p95 results.

## Layouts

### Array of Structures

```ts
entities[index] = {
  x,
  y,
  velocityX,
  velocityY,
  health,
  energy,
  age,
  group,
  cold0,
  cold1,
};
```

Each object contains the complete entity record. This is natural to model, inspect, and pass between object-oriented systems.

### Structure of Arrays

```ts
positionX[index]
positionY[index]
velocityX[index]
velocityY[index]
health[index]
energy[index]
```

Each component column is stored in a contiguous typed array. A system can iterate only the columns it needs.

## What The Demo Measures

| Workload | Components touched | Question |
| --- | --- | --- |
| Movement only | Position and velocity | How does a narrow hot loop behave? |
| Full simulation | Movement, vitals, age, group query | What happens across several ECS-style systems? |
| Wide component scan | Every hot field and all cold payload | Does the advantage change when all data is needed? |

Cold-component payload is present in both layouts. In AoS it widens each entity record; in SoA it creates additional component columns.

## Benchmark Discipline

The animated view is useful for explanation, but it is not treated as the controlled comparison. **Benchmark both layouts** runs a separate benchmark that:

1. Creates both stores from one deterministic seed.
2. Excludes allocation and construction from measured system updates.
3. Uses a fixed `1 / 60` timestep.
4. Warms both implementations before collecting samples.
5. Alternates execution order between samples.
6. Reports median, p95, and entity throughput.
7. Compares final-state checksums outside the timed loops.

The benchmark result belongs to that browser, JavaScript engine, machine, entity count, component width, and workload. It is evidence, not a universal guarantee that SoA is always faster.

## Run Locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

Type-check without emitting files:

```bash
npm run check
```

## Controls

- Switch between AoS and SoA with the UI or keys `1` and `2`.
- Scale the simulation from 10,000 to 100,000 entities.
- Add zero to eight cold component values per entity.
- Choose movement, full simulation, or wide-scan workloads.
- Use the experiment presets to move between intentionally different access patterns.
- Press `B` to benchmark both layouts.
- Press `Space` to pause the live simulation.

Switching layouts rebuilds the live store from the same immutable seed so each representation starts from identical state.

## Implementation Notes

- Both layouts run equivalent movement, vitals, and query logic.
- Seed values use typed arrays as an immutable interchange format.
- SoA storage uses `Float32Array` and `Uint8Array` component columns.
- Canvas rendering samples at most 6,000 entities and is timed separately.
- Live telemetry uses smoothing; benchmark results use raw sample medians.
- The live race is throttled, alternates first-runner order, and is presented as a rolling signal rather than a benchmark.
- Cold components are untouched by narrow hot systems and read by the wide-scan workload.

## Verification

```bash
npm test
npm run check
npm run build
```

The test suite verifies deterministic seeds, AoS/SoA state parity across every workload, configurable benchmark sampling, and the educational experiment wiring.

## Project Structure

```text
src/
|-- data/
|   |-- aos.ts
|   |-- benchmark.ts
|   |-- seed.ts
|   |-- soa.ts
|   |-- systems.ts
|   `-- types.ts
|-- app.ts
|-- main.ts
`-- style.css
prototype/
`-- ecs-data-layout-v3.html
```

## Tradeoffs

### AoS strengths

- Direct entity-level access
- Familiar object-oriented modeling
- Convenient debugging and serialization
- Often sufficient for modest entity counts

### SoA strengths

- Explicit hot and cold data separation
- Compact typed component storage
- System loops can skip unrelated columns
- Predictable indexing for batch processing

### SoA costs

- More lifecycle and index-management complexity
- Entity removal and component migration need deliberate design
- Cross-component operations coordinate several arrays
- Typed-array precision and conversion behavior must be understood

Production ECS implementations often add archetypes, sparse sets, chunks, generation counters, deferred structural changes, and component query caches. This demo intentionally isolates data layout before introducing those additional mechanisms.

## Deployment

This is a static Vite application. For Coolify or another static host:

| Setting | Value |
| --- | --- |
| Build pack | Nixpacks |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Publish directory | `dist` |
| Static site | Enabled |

No backend service or production start command is required.

## License

[MIT](./LICENSE)
