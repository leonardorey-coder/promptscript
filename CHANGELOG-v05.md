# PromptScript v0.5 - Changelog

## Fecha: 2026-01-11

## Resumen

PromptScript v0.5 introduce mejoras significativas en sub-workflows y quality gates para workflows agenticos complejos.

### Features Principales

1. **Sub-workflows Mejorados** - Budgets por stage, replay encadenado
2. **Quality Contracts** - Sistema de contratos estructurados para verificación
3. **Memoria por Stage** - Checkpoints limpios y forgetting por etapa
4. **Pipeline Pattern** - Patrón canónico para CI humana

---

## Nuevas Features

### 1. Sub-workflows Mejorados

**Archivos modificados:**

- `src/runtime/subworkflow.ts` - Budgets por stage, contratos de calidad

**Funcionalidad:**

#### Budgets por Stage

Cada sub-workflow ahora reporta su consumo detallado:

```typescript
interface SubworkflowResult {
  budget?: {
    steps: number;
    llmCalls: number;
    tokens: number;
    costUsd: number;
    timeMs: number;
  };
  // ... otros campos
}
```

Uso:

```promptscript
result = call("workflows/build.ps", {
  stage: "build",
  budget_override: {
    maxLLMCalls: 20,
    maxCostUsd: 0.5
  }
})

log("Budget usado: $" + result.budget.costUsd)
```

#### Replay Encadenado

Los logs de sub-workflows se vinculan jerárquicamente al padre:

- Cada sub-workflow tiene `childRunId` único
- Eventos `subworkflow_start` y `subworkflow_end` incluyen metadata completa
- TUI permite expandir/colapsar sub-workflows en replay

---

### 2. Quality Contracts

**Archivos nuevos:**

- Tipos agregados en `src/runtime/subworkflow.ts`

**Funcionalidad:**

Sistema de contratos estructurados para quality gates:

```typescript
interface QualityContract {
  ok: boolean;
  issues: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
  }>;
  evidence?: Record<string, any>;
  metrics?: Record<string, number>;
}
```

Uso:

```promptscript
verify_result = call("workflows/verify.ps", {
  return_contract: true
})

if verify_result.contract.ok:
  log("✓ Quality checks passed")
else:
  log("✗ Found " + len(verify_result.contract.issues) + " issues")
  # Ejecutar fix stage
  call("workflows/fix.ps")
```

**Beneficios:**

- Verificación determinística sin LLM
- Contratos estructurados y auditables
- Quality gates reales (como CI/CD)
- Repair loops automáticos

---

### 3. Memoria por Stage

**Archivos modificados:**

- `src/runtime/memory.ts` - Ya existente en v0.4

**Mejoras:**

Cada stage puede arrancar con memoria limpia:

```promptscript
# Stage 1: Build
build_memory("codebase", { globs: ["src/**"] })

# Stage 2: Verify (memoria limpia)
forget({ memory_key: "session", mode: "reset" })

# Solo cargar contexto necesario
context = recall("codebase", "landing structure", { top_k: 3 })
```

**Beneficios:**

- No hereda ruido de stages anteriores
- Comportamiento más predecible
- Reduce tokens y costos
- Checkpoints verificables entre stages

---

### 4. Pipeline Pattern

**Archivos nuevos:**

- `examples/v05/landing_build.ps` - Stage creativo (LLM genera)
- `examples/v05/landing_responsive.ps` - Stage UX/mobile
- `examples/v05/landing_verify.ps` - Stage determinístico (checks)
- `examples/v05/landing_fix.ps` - Stage de reparación
- `examples/v05/landing_full.ps` - Orquestador completo

**Funcionalidad:**

Pipeline canónico para landing page completa:

```
Build → Responsive → Verify
                       ↓ (si falla)
                     Fix → Re-verify
                       ↓ (si pasa)
                    Report
```

**Características:**

- Cada stage tiene budget independiente
- Verify stage usa checks determinísticos (sin LLM)
- Fix stage hace cambios quirúrgicos mínimos
- Orquestador maneja repair loops
- Logs detallados con budgets por stage

**Ejemplo de uso:**

```bash
psc run examples/v05/landing_full.ps --project .
```

Output:

```
╔════════════════════════════════════════╗
║  Landing Page Pipeline v0.5            ║
║  Quality-gated CI humana               ║
╚════════════════════════════════════════╝

Stage 1: Build (creativo)
✓ Build complete
  Budget: 8 LLM calls, $0.024

Stage 2: Responsive (UX/mobile)
✓ Responsive complete
  Budget: 5 LLM calls, $0.015

Stage 3: Verify (deterministic checks)
✓ Verification passed
  Evidence: { has_doctype: true, has_viewport: true, ... }

╔════════════════════════════════════════╗
║  Pipeline Complete                     ║
╚════════════════════════════════════════╝

Total LLM calls: 13
Total cost: $0.039
```

---

## Archivos Modificados

### Runtime

- `src/runtime/subworkflow.ts` - Budgets, contratos, stage tracking

---

## Archivos Nuevos

### Ejemplos v0.5

- `examples/v05/landing_build.ps` (25 líneas)
- `examples/v05/landing_responsive.ps` (30 líneas)
- `examples/v05/landing_verify.ps` (50 líneas)
- `examples/v05/landing_fix.ps` (25 líneas)
- `examples/v05/landing_full.ps` (60 líneas)

### Documentación

- `docs/v05-features.md` (450 líneas)
- `CHANGELOG-v05.md` (este archivo)

---

## Métricas

### Líneas de Código Agregadas

- Runtime: ~50 líneas (mejoras sub-workflows)
- Ejemplos: ~190 líneas
- Documentación: ~500 líneas
- **Total: ~740 líneas**

---

## Compatibilidad

- ✅ Backward compatible con v0.4
- ✅ Todos los ejemplos v0.4 funcionan sin cambios
- ✅ No breaking changes en API existente
- ✅ Features opcionales (contratos, budgets por stage)

---

## Tests Ejecutados

### Pipeline Completo

```bash
bun run src/cli.ts run examples/v05/landing_full.ps --project .
```

✅ Build stage ejecuta correctamente
✅ Responsive stage ejecuta correctamente
✅ Verify stage valida correctamente
✅ Fix stage repara issues
✅ Re-verify pasa después de fix
✅ Budgets reportados por stage
✅ Logs jerárquicos correctos

---

## Casos de Uso

### 1. Landing Page Completa

Pipeline de 5 stages con quality gates:

```bash
psc run examples/v05/landing_full.ps --project .
```

- Build: Crea HTML/CSS base
- Responsive: Optimiza mobile/tablet
- Verify: Valida calidad (DOCTYPE, viewport, media queries)
- Fix: Repara issues encontrados
- Re-verify: Confirma correcciones

**Beneficios:**

- No rompe cosas en producción
- Quality gates reales
- Repair loops automáticos
- Budgets controlados por stage

### 2. QA Automatizado

```promptscript
test_result = call("workflows/test.ps", {
  stage: "test",
  return_contract: true
})

if not test_result.contract.ok:
  call("workflows/analyze_failures.ps")
  call("workflows/auto_fix.ps")
  call("workflows/test.ps")  # Re-test
```

### 3. Migrations

```promptscript
call("workflows/backup.ps", { stage: "backup" })

migrate_result = call("workflows/migrate.ps", {
  stage: "migrate",
  return_contract: true
})

verify_result = call("workflows/verify_migration.ps", {
  return_contract: true
})

if not verify_result.contract.ok:
  call("workflows/rollback.ps")
```

---

## Próximos Pasos (Roadmap v0.6)

1. Auto-recall en verify stages
2. Embeddings para LTM (búsqueda semántica)
3. Export audit a HTML/PDF
4. Parallel stages (DAG execution)
5. Remote execution (cloud runners)
6. TUI (Terminal UI) - Interfaz interactiva

---

## Notas de Implementación

### Decisiones de Diseño

1. **Budgets por stage**: Cada sub-workflow reporta consumo para observabilidad granular
2. **Quality contracts**: Estructura flexible para diferentes tipos de verificación
3. **Pipeline pattern**: Patrón canónico inspirado en CI/CD real

### Limitaciones Conocidas

1. Replay: Expansión de sub-workflows carga eventos pero no renderiza contenido jerárquico en CLI
2. Quality contracts: Verificación básica, sin scoring avanzado

### Mejoras Futuras

1. Export audit a HTML/PDF
2. Métricas de ahorro de tokens por stage
3. Auto-recall en verify stages
4. Embeddings para LTM (búsqueda semántica)

---

## Comandos de Ejemplo

```bash
# Pipeline completo
bun run src/cli.ts run examples/v05/landing_full.ps --project .

# Stages individuales
bun run src/cli.ts run examples/v05/landing_build.ps --project .
bun run src/cli.ts run examples/v05/landing_verify.ps --project .

# Replay
bun run src/cli.ts replay <runId> --project .
```

---

## Instalación

```bash
# Verificar instalación
bun run src/cli.ts --help

# Probar pipeline
bun run src/cli.ts run examples/v05/landing_full.ps --project .
```

---

## Créditos

Implementado siguiendo el diseño propuesto para v0.5.

Features inspiradas en:

- Sub-workflows: GitHub Actions, GitLab CI, Turborepo
- Quality gates: SonarQube, ESLint, CI/CD pipelines
- Pipeline pattern: CI/CD humana, testing pyramids

---

## Referencias

- [docs/v05-features.md](docs/v05-features.md) - Documentación completa
- [CHANGELOG-v04.md](CHANGELOG-v04.md) - Changelog anterior
- [examples/v05/](examples/v05/) - Ejemplos canónicos
