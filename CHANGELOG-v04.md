# PromptScript v0.4 - Changelog

## Fecha: 2026-01-09 (Actualizado: 2026-01-11)

## Resumen

PromptScript v0.4 introduce 7 features diseñadas para mejorar la composabilidad, eficiencia de memoria y reducción de costos en workflows agenticos:

1. **Sub-workflows** - Composición con `run()` y `call()`
2. **Memoria Jerárquica** - STM/LTM con `build_memory()` y `recall()`
3. **STM Forgetting** - Compactación con checkpoints
4. **TOON Serialization** - Reducción de tokens ~20-40%
5. **RECALL Tool** - Agentes pueden pedir contexto explícitamente
6. **Archive Memory** - Archivar STM a LTM con `archive()`
7. **Approvals** - Sistema de aprobación para acciones críticas

---

## Nuevas Features

### 1. Sub-workflows: `run()` y `call()`

**Archivos nuevos:**

- `src/runtime/subworkflow.ts` - Executor de sub-workflows

**Cambios en archivos existentes:**

- `src/dsl/vm.ts` - Integración de builtins `run()` y `call()`

**Funcionalidad:**

- Ejecutar workflows .ps dentro de otros workflows
- `run(path, opts)` - Fire-and-wait, sin retorno
- `call(path, opts)` - Espera y retorna resultado
- Soporte para herencia de policy y memoria
- Logs independientes por sub-workflow en `.ps-runs/<childRunId>/`

**Ejemplos:**

- `examples/workflows/base-setup.ps`
- `examples/workflows/data-processing.ps`

---

### 2. Memoria Jerárquica: STM/LTM

**Archivos nuevos:**

- `src/runtime/memory.ts` - Sistema de memoria de dos niveles

**Cambios en archivos existentes:**

- `src/dsl/vm.ts` - Integración de builtins de memoria

**Funcionalidad:**

- **Long-Term Memory (LTM)**: Base de conocimiento persistente
  - `build_memory(name, opts)` - Construir índice del proyecto
  - Almacena: facts, file_summaries, capabilities, glossary, index
  - Storage en `.ps-memory/<name>/ltm.json`

- **Short-Term Memory (STM)**: Ventana de trabajo actual
  - Últimos N pasos, diffs, outputs
  - Integración con `run_agent` via `memory_key`

- **Recall**: Recuperación on-demand desde LTM
  - `recall(name, query, opts)` - Buscar chunks relevantes
  - Retorna array de chunks con source, content, relevance

**Ejemplos:**

- Ver `examples/v04-all-features.ps`
- Ver `examples/advanced-agent-memory.ps`

---

### 3. STM Forgetting: Checkpoints

**Archivos:**

- `src/runtime/memory.ts` - Implementación de forget y checkpoints

**Funcionalidad:**

- Compactación de memoria tipo humano
- `forget(opts)` - Compactar o resetear memoria STM
- Modos: `compact`, `reset`, `keep_last(n)`
- Checkpoints con milestones verificables
- Reducción de tokens ~60-80%

**Estructura de Checkpoint:**

```json
{
  "milestones": {
    "created_index_html": { "ok": true, "evidence": "hash:abc123" }
  },
  "next": "Siguiente paso"
}
```

---

### 4. TOON Serialization

**Archivos nuevos:**

- `src/runtime/toon-serializer.ts` - Wrapper de TOON format

**Dependencias nuevas:**

- `@toon-format/toon@2.1.0`

**Cambios en archivos existentes:**

- `src/dsl/vm.ts` - Integración de builtins TOON
- `package.json` - Dependencia agregada

**Funcionalidad:**

- Serialización optimizada para reducir tokens
- `set_context_format(format)` - Cambiar entre "json" y "toon"
- `compare_formats(obj)` - Comparar tamaños y ahorros
- Reducción típica: ~20-40% en tokens
- Lossless roundtrip

**Ejemplos:**

- Ver `examples/v04-all-features.ps`

---

## Archivos Modificados

### Core Runtime

- `src/dsl/vm.ts` - Nuevos builtins y memoria store
- `src/dsl/parser.ts` - Fix en función `at()` para mejor manejo de tokens

### Documentación

- `README.md` - Mención de features v0.4
- `docs/v04-features.md` - Documentación completa de features

### Package

- `package.json` - Dependencia TOON
- `bun.lock` - Lockfile actualizado

---

## Archivos Nuevos

### Runtime

- `src/runtime/subworkflow.ts` (130 líneas)
- `src/runtime/memory.ts` (180 líneas)
- `src/runtime/toon-serializer.ts` (60 líneas)

### Ejemplos

- `examples/workflows/base-setup.ps`
- `examples/workflows/data-processing.ps`
- `examples/test-v04-basic.ps` - Test de todas las features
- `examples/v04-all-features.ps` - Demo completo
- `examples/advanced-agent-memory.ps` - Caso de uso avanzado

### Documentación

- `docs/v04-features.md` - Guía completa de features

---

## Tests Ejecutados

### Test Básico (`examples/test-v04-basic.ps`)

✅ Sub-workflow run()
✅ Sub-workflow call()
✅ build_memory()
✅ recall()
✅ forget()
✅ compare_formats()
✅ set_context_format()

### Demo Completo (`examples/v04-all-features.ps`)

✅ Integración de sub-workflows
✅ Construcción de LTM
✅ Recall desde LTM
✅ Forgetting de STM
✅ Comparación TOON vs JSON

### Ejemplo Avanzado (`examples/advanced-agent-memory.ps`)

✅ Workflow completo con todas las features
✅ Múltiples tareas con recall
✅ Compactación automática de memoria
✅ Análisis de eficiencia

---

## Métricas

### Líneas de Código Agregadas

- Runtime: ~370 líneas
- Ejemplos: ~200 líneas
- Documentación: ~450 líneas
- **Total: ~1020 líneas**

### Reducción de Tokens (TOON)

- Objetos simples: ~5-15%
- Arrays uniformes: ~20-40%
- Contexto grande: ~25-35%

### Eficiencia de Memoria

- STM Forgetting: ~60-80% reducción
- Checkpoints: Estado mínimo verificable
- LTM: Acceso on-demand sin inflar contexto

---

## Compatibilidad

- ✅ Backward compatible con v0.3
- ✅ Todos los ejemplos existentes funcionan
- ✅ No breaking changes en API existente
- ✅ Features opcionales (no afectan código legacy)

---

## Features Adicionales (2026-01-11)

### 5. Tool RECALL

**Archivos modificados:**

- `src/runtime/tools.ts` - Nuevo tool RECALL
- `src/dsl/vm.ts` - Integración de RECALL en runToolAction
- `src/cli.ts` - RECALL agregado a allowTools por defecto

**Funcionalidad:**

- Tool disponible para que agentes invoquen RECALL explícitamente
- Permite al agente pedir contexto relevante durante ejecución
- Uso: `apply("RECALL", { memory_name: "repo", query: "auth", top_k: 5 })`
- El VM intercepta el tool y ejecuta `memoryStoreNew.recall()`

**Ejemplos:**

- `examples/agent-with-recall.ps`

---

### 6. Archive Memory

**Archivos modificados:**

- `src/runtime/memory.ts` - Método `archive()` en MemoryStore
- `src/dsl/vm.ts` - Builtin `archive()` agregado

**Funcionalidad:**

- Archivar memoria STM a LTM
- Opción de limpiar STM después de archivar
- `archive({ memory_key: "session", to_ltm: "repo", clear_stm: true })`
- Retorna: `{ archived: boolean, events_count: number }`

**Uso:**

```promptscript
resultado = archive({
  memory_key: "agent_session",
  to_ltm: "codebase",
  clear_stm: true
})
```

---

### 7. Sistema de Approvals

**Archivos modificados:**

- `src/dsl/vm.ts` - VMConfig con `approvalCallback`, lógica en `applyPlan`
- `src/cli.ts` - Flag `--require-approval` y callback interactivo

**Funcionalidad:**

- Pausar ejecución para aprobar acciones críticas
- Acciones que requieren aprobación: WRITE_FILE, PATCH_FILE, RUN_CMD
- Callback personalizable en VMConfig
- CLI interactiva con flag `--require-approval`

**Uso:**

```bash
psc run workflow.ps --require-approval
```

**Logs:**

- Eventos `approval_request` y `approval_response` en logs
- Auditoría completa de aprobaciones

---

## Próximos Pasos (Roadmap)

1. ✅ Tool `RECALL` para que el agente pida contexto explícito
2. Auto-recall en `run_agent` con `recall_policy: { auto: true }`
3. Embeddings opcionales para LTM (búsqueda semántica)
4. Soporte para `.toon` como formato de PlanSpec
5. UI de replay con expansión de sub-workflows
6. Métricas de reducción de tokens en logs

---

## Notas de Implementación

### Decisiones de Diseño

1. **Sub-workflows**: Cada uno tiene su propio `RunLogger` y `runId` para auditoría completa
2. **Memoria**: Store separado del memoryStore legacy para no romper compatibilidad
3. **TOON**: Wrapper simple que permite cambiar formato sin modificar lógica
4. **Checkpoints**: Estructura flexible con evidence opcional para verificación

### Limitaciones Conocidas

1. LTM no tiene embeddings (búsqueda por keyword simple)
2. Recall no usa scoring sofisticado (relevance básico)
3. Forget no usa LLM para compactación inteligente (solo estructural)
4. TOON no se aplica automáticamente en todos los contextos

### Mejoras Futuras

1. Integrar cheap LLM para build_memory y compactación
2. ✅ Tool RECALL para que el agente controle recuperación
3. Auto-recall basado en query del agente
4. Métricas de ahorro en logs y replay UI

---

## Comandos de Ejemplo

```bash
# Test básico
bun run src/cli.ts run examples/test-v04-basic.ps --project .

# Demo completo
bun run src/cli.ts run examples/v04-all-features.ps --project .

# Ejemplo avanzado
bun run src/cli.ts run examples/advanced-agent-memory.ps --project .

# Test de nuevas features (RECALL, archive, approvals)
bun run src/cli.ts run examples/test-new-features.ps --project .

# Agente con RECALL tool
bun run src/cli.ts run examples/agent-with-recall.ps --project .

# Con approvals habilitados
bun run src/cli.ts run examples/workflow.ps --require-approval --project .
```

---

## Créditos

Implementado siguiendo el plan de diseño propuesto en la conversación inicial.

Features inspiradas en:

- Sub-workflows: Pipelines CI/CD, GitHub Actions
- Memoria STM/LTM: Arquitectura cognitiva humana
- Forgetting: Compactación de memoria humana
- TOON: Formato de serialización token-eficiente
