# Implementación: Markdown Plans → PromptScript Execution

## Resumen

Se ha implementado completamente la feature **Markdown Plans → PromptScript Execution** según la especificación en `docs/Markdown Plans → PromptScript Execution.md`.

## Componentes implementados

### 1. PlanSpec Schema (`src/runtime/planspec.ts`)

Intermediate Representation (IR) validado con Zod que define:

- **PlanSpecSchema**: Estructura completa del plan
- **PlanStepSchema**: Union discriminada de 14 tipos de steps:
  - `read_file`, `search`, `write_file`, `patch_file`
  - `run_cmd`, `run_agent`, `plan_apply`
  - `decide`, `judge`, `summarize`
  - `parallel`, `timeout`, `retry`, `report`
- **PolicySchema**: Restricciones de seguridad y budgets
- **LLMConfigSchema**: Configuración del proveedor LLM
- **MemoryConfigSchema**: Configuración de memoria contextual

### 2. Compilador Markdown → PlanSpec (`src/compiler/md-to-planspec.ts`)

Parser determinista que convierte Markdown legible a IR validado:

**Entrada**: Markdown con secciones `# Goal`, `# Constraints`, `# Steps`

**Salida**: PlanSpec JSON validado

**Características**:
- Extrae constraints y los mapea a policies
- Detecta patrones en steps (crear archivos, ejecutar comandos, reportar)
- Genera IDs únicos para cada step
- Valida con Zod antes de retornar

### 3. Compilador PlanSpec → PromptScript (`src/compiler/planspec-to-ps.ts`)

Compilador determinista (sin IA) que genera PromptScript ejecutable:

**Entrada**: PlanSpec JSON validado

**Salida**: Archivo `.ps` ejecutable

**Mapeo de steps**:
- `run_agent` → `run_agent(client, prompt, opts)`
- `read_file` → `apply("READ_FILE", args)`
- `write_file` → `apply("WRITE_FILE", args)` o `run_agent` si es generado
- `run_cmd` → `apply("RUN_CMD", args)`
- `report` → `apply("REPORT", args)`
- `summarize` → `summarize(instruction, opts)`
- etc.

**Características**:
- Genera bloque `with policy` si hay políticas definidas
- Crea `LLMClient` si hay configuración LLM
- Propaga `memory_key` a todos los steps que lo necesiten
- Escapa strings correctamente

### 4. Comandos CLI extendidos (`src/cli.ts`)

Se agregaron 3 nuevos comandos:

#### `compile-md`
```bash
psc compile-md <plan.md> --out <planspec.json>
```
Compila Markdown a PlanSpec validado.

#### `compile-planspec`
```bash
psc compile-planspec <planspec.json> --out <workflow.ps>
```
Compila PlanSpec a PromptScript ejecutable.

#### `replay`
```bash
psc replay <runId>
```
Muestra timeline de una ejecución previa.

#### `run --from-md`
```bash
psc run <plan.md> --from-md [options]
```
One-liner: compila y ejecuta directamente desde Markdown.

### 5. Demo completo (`demo/`)

Ejemplo end-to-end listo para ejecutar:

- `plan.md` - Plan en Markdown (entrada humana)
- `planspec.json` - IR validado
- `workflow.ps` - PromptScript ejecutable
- `README.md` - Documentación del demo

**Qué hace**: Crea una landing page de gatitos con carrusel en `public/`

## Pipeline completo

```
plan.md (humano/LLM)
   ↓  compile-md
planspec.json (IR validado con Zod)
   ↓  compile-planspec
workflow.ps (PromptScript ejecutable)
   ↓  run
Ejecución + logs en .ps-runs/<runId>/
   ↓  replay
Timeline visual
```

## Uso

### Opción A: Pipeline paso a paso

```bash
# 1. Compilar MD → PlanSpec
bun run src/cli.ts compile-md demo/plan.md --out demo/planspec.json

# 2. Compilar PlanSpec → PS
bun run src/cli.ts compile-planspec demo/planspec.json --out demo/workflow.ps

# 3. Ejecutar
bun run src/cli.ts run demo/workflow.ps --project . --provider openrouter

# 4. Ver replay
bun run src/cli.ts replay <runId>
```

### Opción B: One-liner (desde Markdown)

```bash
bun run src/cli.ts run demo/plan.md --from-md --project . --provider openrouter
```

## Validaciones implementadas

1. **Markdown parsing**: Valida secciones requeridas (Goal, Steps)
2. **PlanSpec validation**: Zod valida toda la estructura antes de continuar
3. **Type safety**: TypeScript garantiza tipos correctos en compilación
4. **Policy enforcement**: Runtime valida actions, globs, commands
5. **Budget tracking**: Límites de steps, LLM calls, tiempo, costo

## Características clave

### Determinismo
- Compilación MD → PlanSpec: determinista (sin IA)
- Compilación PlanSpec → PS: función pura (sin side effects)
- Solo `run_agent` steps usan IA durante ejecución

### Seguridad
- Policies restrictivas por defecto
- Globs para allowlist/denylist de escritura
- Comandos permitidos explícitos
- Budgets configurables

### Auditabilidad
- Cada step queda registrado en `events.jsonl`
- Metadata en `meta.json` y `summary.json`
- Timeline completo con `replay` command
- Diffs por step (próximamente)

### Extensibilidad
- Fácil agregar nuevos tipos de steps al PlanStepSchema
- Compilador mapea automáticamente a PromptScript
- Políticas composables

## Archivos creados/modificados

### Nuevos archivos
- `src/runtime/planspec.ts` - Schemas Zod para PlanSpec
- `src/compiler/md-to-planspec.ts` - Compilador Markdown → PlanSpec
- `src/compiler/planspec-to-ps.ts` - Compilador PlanSpec → PromptScript
- `demo/plan.md` - Plan de ejemplo
- `demo/planspec.json` - PlanSpec de ejemplo
- `demo/workflow.ps` - PromptScript de ejemplo
- `demo/README.md` - Documentación del demo
- `IMPLEMENTATION.md` - Este archivo

### Archivos modificados
- `src/cli.ts` - Agregados comandos: compile-md, compile-planspec, replay, run --from-md

## Testing

```bash
# Test compilación MD → PlanSpec
bun run src/cli.ts compile-md demo/plan.md --out /tmp/test.json

# Test compilación PlanSpec → PS
bun run src/cli.ts compile-planspec demo/planspec.json --out /tmp/test.ps

# Test ejecución completa (requiere OPENROUTER_API_KEY)
bun run src/cli.ts run demo/plan.md --from-md --project . --provider openrouter --model mistralai/devstral-2512:free
```

## Próximos pasos

1. **Diffs por step**: Guardar diffs en `.ps-runs/<runId>/diffs/`
2. **Replay UI**: Interfaz web para visualizar timeline
3. **Approval gates**: Pausar ejecución para aprobación manual
4. **LLM compiler**: Usar LLM para generar PlanSpec desde PRDs
5. **Cloud execution**: Deploy y ejecución persistente
6. **Metrics dashboard**: Visualizar costos, tiempos, success rate

## Casos de uso

### 1. PRD → Implementación
PM escribe PRD → LLM genera plan.md → Equipo revisa → Compila y ejecuta

### 2. Runbooks automatizados
Documentación viva que se puede ejecutar de forma reproducible

### 3. Migraciones seguras
Plan visible → Cambios acotados → Replay si falla

### 4. Onboarding
Nuevos devs pueden ejecutar planes para entender el sistema

## Conclusión

La implementación está completa y funcional. El demo en `demo/` demuestra todo el pipeline end-to-end. La arquitectura es extensible y permite agregar nuevas features sin romper compatibilidad.

**Write plans like docs. Execute them like code.**
