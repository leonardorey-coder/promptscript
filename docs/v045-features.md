# PromptScript v0.45 - Features

## Fecha: 2026-01-11

## Resumen

PromptScript v0.45 introduce mejoras significativas en sub-workflows y quality gates:

1. **Sub-workflows mejorados** - Budgets por stage, replay encadenado, quality gates
2. **Quality Contracts** - Contratos estructurados para verificación de calidad
3. **Memoria por Stage** - Checkpoints limpios y forgetting por etapa
4. **Pipeline Pattern** - Patrón canónico para CI humana (build → verify → fix)

---

## 1. Sub-workflows Mejorados

### Budgets por Stage

Cada sub-workflow ahora reporta su consumo de recursos:

```promptscript
result = call("workflows/build.ps", {
  stage: "build",
  budget_override: {
    maxLLMCalls: 20,
    maxCostUsd: 0.5
  }
})

log("Budget usado:")
log("  Steps: " + result.budget.steps)
log("  LLM calls: " + result.budget.llmCalls)
log("  Tokens: " + result.budget.tokens)
log("  Cost: $" + result.budget.costUsd)
log("  Time: " + result.budget.timeMs + "ms")
```

### Replay Encadenado

Los logs de sub-workflows se vinculan al padre para replay jerárquico:

```bash
psc replay <parentRunId>
# Muestra timeline con sub-workflows expandibles
# Cada sub-workflow tiene su propio childRunId
```

### Opciones Nuevas

```typescript
interface SubworkflowOptions {
  stage?: string; // Nombre del stage (para logging)
  return_contract?: boolean; // Retornar contrato de calidad
  budget_override?: Partial<VMConfig>;
  // ... opciones existentes
}
```

---

## 2. Quality Contracts

Sistema de contratos estructurados para verificación de calidad.

### Estructura del Contrato

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

### Ejemplo: Verify Stage

```promptscript
issues = []

html = apply("READ_FILE", { path: "public/index.html" })

if not ("<!DOCTYPE html>" in html):
  issues = issues + [{
    severity: "error",
    message: "Missing DOCTYPE",
    file: "index.html"
  }]

if not ("<meta name=\"viewport\"" in html):
  issues = issues + [{
    severity: "error",
    message: "Missing viewport meta",
    file: "index.html"
  }]

contract = {
  ok: len(issues) == 0,
  issues: issues,
  evidence: {
    has_doctype: "<!DOCTYPE html>" in html,
    has_viewport: "<meta name=\"viewport\"" in html
  },
  metrics: {
    html_size: len(html)
  }
}
```

### Uso en Orquestador

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

  # Re-verificar
  reverify_result = call("workflows/verify.ps", {
    return_contract: true
  })
```

---

## 3. Memoria por Stage

### Checkpoints Limpios

Cada stage arranca con memoria limpia y solo importa lo necesario:

```promptscript
# Stage 1: Build
build_memory("codebase", { globs: ["src/**"] })

# Stage 2: Verify (no hereda ruido del build)
forget({ memory_key: "session", mode: "reset" })

# Solo cargar contexto necesario
context = recall("codebase", "landing structure", { top_k: 3 })
```

### Forgetting por Stage

```promptscript
# Después de cada stage, compactar memoria
resultado = forget({
  memory_key: "session",
  mode: "compact"
})

log("Memoria compactada: " + resultado.before_tokens + " → " + resultado.after_tokens + " tokens")
```

---

## 4. Pipeline Pattern

Patrón canónico para CI humana con quality gates.

### Estructura

```
landing_build.ps       → Creativo (LLM genera estructura)
landing_responsive.ps  → UX/Mobile (LLM optimiza responsive)
landing_verify.ps      → Determinístico (checks sin LLM)
landing_fix.ps         → Patch mínimo (LLM corrige issues)
landing_full.ps        → Orquestador (pipeline completo)
```

### Flujo

```
Build → Responsive → Verify
                       ↓ (si falla)
                     Fix → Re-verify
                       ↓ (si pasa)
                    Report
```

### Ejemplo Completo

Ver `examples/v045/landing_full.ps` para implementación completa.

### Características

- **Budgets por stage**: Cada stage tiene límites independientes
- **Quality gates**: Verify stage valida con checks determinísticos
- **Repair loop**: Si verify falla, ejecuta fix y re-verifica
- **Observabilidad**: Logs detallados por stage con budgets
- **Replay jerárquico**: Timeline completo con sub-workflows expandibles

---

## Casos de Uso

### 1. Landing Page Completa

```bash
psc run examples/v045/landing_full.ps --project .
```

Pipeline completo:

- Build: Crea estructura HTML/CSS
- Responsive: Optimiza para mobile/tablet
- Verify: Valida calidad (DOCTYPE, viewport, media queries, etc.)
- Fix: Repara issues encontrados
- Re-verify: Confirma que todo está correcto

### 2. QA Automatizado

```promptscript
# Ejecutar tests
test_result = call("workflows/test.ps", {
  stage: "test",
  return_contract: true
})

if not test_result.contract.ok:
  # Analizar failures
  call("workflows/analyze_failures.ps")

  # Intentar fix automático
  call("workflows/auto_fix.ps")

  # Re-test
  call("workflows/test.ps")
```

### 3. Migrations

```promptscript
# Backup
call("workflows/backup.ps", { stage: "backup" })

# Migrate
migrate_result = call("workflows/migrate.ps", {
  stage: "migrate",
  return_contract: true
})

# Verify
verify_result = call("workflows/verify_migration.ps", {
  stage: "verify",
  return_contract: true
})

if not verify_result.contract.ok:
  # Rollback
  call("workflows/rollback.ps")
```

---

## Arquitectura

```
┌─────────────────────────────────────────────────┐
│         PromptScript Runtime v0.45               │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────┐   ┌───────────────┐          │
│  │ Sub-workflow │   │ Quality Gates │          │
│  │  + Budgets   │   │  + Contracts  │          │
│  └──────────────┘   └───────────────┘          │
│                                                 │
│  ┌──────────────┐                               │
│  │   Memory     │                               │
│  │  per Stage   │                               │
│  └──────────────┘                               │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Migración desde v0.4

### Cambios No Breaking

Todas las features de v0.4 siguen funcionando. Las nuevas features son opcionales.

### Nuevas Opciones

```promptscript
# Antes (v0.4)
result = call("workflow.ps")

# Ahora (v0.45)
result = call("workflow.ps", {
  stage: "build",           # Nuevo: nombre del stage
  return_contract: true,    # Nuevo: retornar contrato
  budget_override: {        # Mejorado: budgets por stage
    maxLLMCalls: 10
  }
})

# Acceder a nuevo info
log("Budget: " + result.budget.costUsd)
log("Contract: " + result.contract.ok)
```

---

## Comandos

```bash
# Run (igual que v0.4)
psc run examples/v045/landing_full.ps --project .

# Replay (igual que v0.4)
psc replay <runId>
```

---

## Roadmap v0.5 (Futuro)

- [ ] Auto-recall en verify stages
- [ ] Embeddings para LTM (búsqueda semántica)
- [ ] Export audit a HTML/PDF
- [ ] Parallel stages (DAG execution)
- [ ] Remote execution (cloud runners)
- [ ] TUI (Terminal UI) - Interfaz interactiva

---

## Referencias

- [CHANGELOG-v045.md](../CHANGELOG-v045.md)
- [v04-features.md](./v04-features.md)
- [Ejemplos v0.45](../examples/v045/)
