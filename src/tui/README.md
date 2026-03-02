# TUI — PromptScript v0.5

Interfaz de terminal interactiva para PromptScript.

## Activar

```bash
psc run workflow.ps --project . --tui
```

El flag `--tui` activa: banner ASCII, spinners animados, progress bars y status line.

## Componentes

| Archivo        | Descripción                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `banner.ts`    | Banner ASCII "PromptScript" con gradiente azulado (`#3b82f6` → `#60a5fa`) |
| `colors.ts`    | Sistema de colores ANSI truecolor alineado con la landing page            |
| `spinner.ts`   | Spinner braille animado para operaciones en progreso                      |
| `panels.ts`    | Cajas y paneles con bordes unicode (rounded/double)                       |
| `progress.ts`  | Barra de progreso visual por stage del pipeline                           |
| `status.ts`    | Línea de status persistente (stage, LLM calls, cost, time)                |
| `workflows.ts` | Explorador de workflows: escanea y lista archivos `.ps`                   |
| `renderer.ts`  | Orquestador principal que coordina todos los componentes                  |
| `index.ts`     | Re-exports públicos                                                       |

## Comandos

```bash
# Ejecutar con TUI interactiva
psc run examples/v045/landing_full.ps --project . --tui

# Listar workflows disponibles
psc list --project .
```

## Paleta de Colores

Alineada con la landing page:

- **Blue** `#3b82f6` — Acciones, comandos
- **Light Blue** `#60a5fa` — Banners, headers
- **Purple** `#8b5cf6` — Keywords, stages
- **Light Purple** `#c084fc` — Highlights
- **Green** `#86efac` — Success ✓
- **Red** `#f87171` — Errores ✗

## API Programática

```typescript
import { printBanner, createRenderer, colorize, createSpinner } from "./tui";

// Banner
printBanner("0.5.0");

// Colores
console.log(colorize("Hello", "blue"));

// Spinner
const spinner = createSpinner("Loading...");
spinner.start();
spinner.succeed("Done!");

// Renderer completo
const tui = createRenderer();
tui.start({ version: "0.5.0" });
tui.onStageStart("build");
tui.onStageComplete("build", {
  steps: 10,
  llmCalls: 5,
  tokens: 1000,
  costUsd: 0.01,
  timeMs: 3000,
});
tui.stop();
```
