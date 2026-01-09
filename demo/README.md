# Demo: Markdown Plans → PromptScript Execution

Este demo muestra el pipeline completo de la feature **Markdown Plans → PromptScript Execution**.

## Pipeline

```
plan.md (humano/LLM)
   ↓  (compile-md)
planspec.json (IR validado)
   ↓  (compile-planspec)
workflow.ps (PromptScript ejecutable)
   ↓  (run)
Ejecución + logs + replay
```

## Archivos

- `plan.md` - Plan en Markdown (entrada humana)
- `planspec.json` - Intermediate Representation validado
- `workflow.ps` - PromptScript ejecutable generado

## Uso

### 1. Compilar Markdown → PlanSpec

```bash
bun run src/cli.ts compile-md demo/plan.md --out demo/planspec.json
```

### 2. Compilar PlanSpec → PromptScript

```bash
bun run src/cli.ts compile-planspec demo/planspec.json --out demo/workflow.ps
```

### 3. Ejecutar PromptScript

```bash
bun run src/cli.ts run demo/workflow.ps --project . --provider openrouter --model mistralai/devstral-2512:free
```

### 4. Ver Replay

```bash
bun run src/cli.ts replay <runId>
```

### One-liner (desde Markdown directamente)

```bash
bun run src/cli.ts run demo/plan.md --from-md --project . --provider openrouter --model mistralai/devstral-2512:free
```

## Qué hace este demo

1. Crea `public/index.html` con una landing page de gatitos (header, hero, carrusel, CTA, footer)
2. Crea `public/styles.css` con diseño moderno y responsive
3. Resume los cambios en memoria
4. Reporta archivos modificados y sugerencias

## Artifacts generados

Después de ejecutar, encontrarás en `.ps-runs/<runId>/`:

```
.ps-runs/<runId>/
  input/
    plan.md
    planspec.json
    workflow.ps
  events.jsonl
  summary.json
  meta.json
```

## Características clave

- **Validación**: PlanSpec se valida con Zod antes de ejecutar
- **Políticas**: Restricciones de escritura (`public/**` only)
- **Budgets**: Límites de pasos, LLM calls, tiempo, costo
- **Replay**: Timeline completo de la ejecución
- **Auditabilidad**: Cada acción queda registrada

## Próximos pasos

- Agregar generación de diffs por step
- UI web para replay visual
- Approval gates interactivos
- Integración con CI/CD
