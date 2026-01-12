# PromptScript v0.45 - Quickstart

## Instalación

```bash
# Instalar dependencias
bun install

# Verificar instalación
psc --help
```

## Nuevas Features v0.45

### 1. Pipeline de Landing Page

```bash
# Ejecutar pipeline completo
psc run examples/v045/landing_full.ps --project .
```

**Pipeline:**

1. **Build** - Crea estructura HTML/CSS (creativo)
2. **Responsive** - Optimiza mobile/tablet (UX)
3. **Verify** - Valida calidad (determinístico)
4. **Fix** - Repara issues encontrados
5. **Re-verify** - Confirma correcciones

**Output:**

- `public/landing.html` - Landing page completa
- `public/landing.css` - Estilos responsive

### 2. Sub-workflows con Budgets

```promptscript
result = call("workflows/build.ps", {
  stage: "build",
  budget_override: {
    maxLLMCalls: 20,
    maxCostUsd: 0.5
  }
})

log("Budget usado:")
log("  LLM calls: " + result.budget.llmCalls)
log("  Cost: $" + result.budget.costUsd)
log("  Time: " + result.budget.timeMs + "ms")
```

### 3. Quality Contracts

```promptscript
verify_result = call("workflows/verify.ps", {
  return_contract: true
})

if verify_result.contract.ok:
  log("✓ Quality checks passed")
else:
  log("✗ Found issues:")
  for i in range(len(verify_result.contract.issues)):
    issue = verify_result.contract.issues[i]
    log("  [" + issue.severity + "] " + issue.message)

  # Auto-repair
  call("workflows/fix.ps")
```

## Comandos Rápidos

```bash
# Run workflow
psc run examples/v045/landing_full.ps --project .

# Replay
psc replay <runId>

# Stages individuales
psc run examples/v045/landing_build.ps --project .
psc run examples/v045/landing_verify.ps --project .
psc run examples/v045/landing_fix.ps --project .
```

## Ejemplos

### Landing Page Completa

```bash
psc run examples/v045/landing_full.ps --project .
```

Crea landing page con:

- Header con navegación
- Hero section con CTA
- Features (3 columnas)
- Footer
- 100% responsive
- Validación de calidad automática

### Pipeline Personalizado

```promptscript
# 1. Build
build_result = call("workflows/build.ps", {
  stage: "build"
})

# 2. Test
test_result = call("workflows/test.ps", {
  stage: "test",
  return_contract: true
})

# 3. Fix si falla
if not test_result.contract.ok:
  call("workflows/fix.ps")
  call("workflows/test.ps")  # Re-test

# 4. Deploy si pasa
if test_result.contract.ok:
  call("workflows/deploy.ps")
```

## Estructura de Archivos

```
examples/v045/
├── landing_build.ps       # Stage 1: Build
├── landing_responsive.ps  # Stage 2: Responsive
├── landing_verify.ps      # Stage 3: Verify
├── landing_fix.ps         # Stage 4: Fix
└── landing_full.ps        # Orquestador
```

## Documentación Completa

- [docs/v045-features.md](docs/v045-features.md) - Features detalladas
- [CHANGELOG-v045.md](CHANGELOG-v045.md) - Changelog completo
- [src/tui/README.md](src/tui/README.md) - Documentación TUI

## Migración desde v0.4

Todos los workflows v0.4 funcionan sin cambios. Las nuevas features son opcionales:

```promptscript
# v0.4 (sigue funcionando)
result = call("workflow.ps")

# v0.45 (con nuevas opciones)
result = call("workflow.ps", {
  stage: "build",           # Nuevo
  return_contract: true,    # Nuevo
  budget_override: {        # Mejorado
    maxLLMCalls: 10
  }
})
```

## Troubleshooting

### TUI no inicia

```bash
# Verificar dependencias
bun install

# Verificar versión
bun --version  # Debe ser >= 1.0
```

### Workflow falla en verify

```bash
# Ver logs detallados
psc run examples/v045/landing_verify.ps --project . --verbose

# Replay para debug
psc replay <runId>
```

### Budget excedido

```promptscript
# Aumentar límites por stage
result = call("workflow.ps", {
  budget_override: {
    maxLLMCalls: 50,
    maxCostUsd: 2.0
  }
})
```

## Próximos Pasos

1. Explorar ejemplos en `examples/v045/`
2. Crear tu propio pipeline
3. Usar TUI para observabilidad
4. Implementar quality gates
5. Leer docs completas en `docs/v045-features.md`

## Soporte

- Issues: GitHub Issues
- Docs: `docs/` folder
- Examples: `examples/v045/`
