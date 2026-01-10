# PromptScript v0.4 - Nuevas Features

## Resumen

PromptScript v0.4 introduce 4 features principales diseñadas para mejorar la composabilidad, eficiencia de memoria y reducción de costos en workflows agenticos:

1. **Sub-workflows** - Composición y reutilización de workflows
2. **Memoria Jerárquica (STM/LTM)** - Gestión inteligente de contexto
3. **STM Forgetting** - Compactación de memoria tipo humano
4. **TOON Serialization** - Reducción de tokens y costos

---

## 1. Sub-workflows: `run()` y `call()`

Permite ejecutar workflows .ps dentro de otros workflows, habilitando composición y reutilización.

### `run(path, opts?)`

Ejecuta un sub-workflow y espera a que termine. No retorna valor.

```promptscript
run("workflows/setup.ps", {
  args: { theme: "dark" },
  inherit_policy: true,
  inherit_memory: true
})
```

### `call(path, opts?)`

Ejecuta un sub-workflow y retorna el resultado.

```promptscript
resultado = call("workflows/build.ps", {
  args: { target: "production" }
})
log("Build exitoso: " + resultado.ok)
```

### Opciones

- `args`: Variables inyectadas al scope del hijo
- `inherit_policy`: Heredar permisos del padre (default: true)
- `inherit_memory`: Heredar memoria del padre (default: true)
- `timeout_ms`: Timeout máximo para ejecución
- `budget_override`: Sobrescribir límites de budget

### Logs y Replay

Cada sub-workflow genera:
- `childRunId` único
- Logs en `.ps-runs/<childRunId>/events.jsonl`
- Eventos `subworkflow_start` y `subworkflow_end` en el padre

---

## 2. Memoria Jerárquica: STM/LTM

Sistema de memoria de dos niveles para evitar "bola de nieve" de contexto.

### Long-Term Memory (LTM)

Base de conocimiento persistente del proyecto.

```promptscript
build_memory("repo", {
  globs: ["src/**", "public/**", "README.md"],
  mode: "incremental"
})
```

Estructura:
- `facts`: Decisiones y convenciones
- `file_summaries`: Resúmenes por archivo
- `capabilities`: Qué hace el repo
- `glossary`: Términos del proyecto
- `index`: Índice de búsqueda

### Short-Term Memory (STM)

Ventana de trabajo actual (últimos N pasos).

```promptscript
run_agent(client, "Integra imágenes al carrusel", {
  memory_key: "session",
  long_memory: "repo"
})
```

### `recall(name, query, opts?)`

Recupera chunks relevantes desde LTM.

```promptscript
contexto = recall("repo", "donde esta el carrusel", { top_k: 5 })
for i in range(len(contexto.chunks)):
  log(contexto.chunks[i].source)
```

### Configuración de Memoria

```promptscript
memory long "repo" {
  provider: "openrouter",
  model: "openai/gpt-oss-20b:free",
  budget_tokens: 20000
}

memory short "run" {
  window_steps: 8
}
```

---

## 3. STM Forgetting: Checkpoints

Compactación de memoria tipo humano - olvidar detalles pero mantener puntos clave.

### `forget(opts)`

```promptscript
resultado = forget({
  memory_key: "session",
  mode: "compact"
})
log("Tokens: " + resultado.before_tokens + " -> " + resultado.after_tokens)
```

### Modos

- `compact`: Guarda checkpoints + resumen, descarta detalles
- `reset`: Deja solo checkpoints + objetivo (agresivo)
- `keep_last(n)`: Mantiene solo últimos n eventos

### Checkpoints

Estructura de puntos clave verificables:

```json
{
  "milestones": {
    "created_index_html": { "ok": true, "evidence": "hash:abc123" },
    "carousel_has_aria": { "ok": true, "evidence": "search-hit: aria-label" }
  },
  "next": "Integrar imagen 3"
}
```

### Beneficios

- Reduce tokens en contexto ~60-80%
- Mantiene estado verificable
- Evita drift del agente
- Permite workflows largos sin explotar costos

---

## 4. TOON Serialization

Formato de serialización optimizado para reducir tokens al pasar contexto a LLMs.

### `set_context_format(format)`

```promptscript
set_context_format("toon")
```

### `compare_formats(obj)`

Compara tamaño JSON vs TOON:

```promptscript
datos = {
  archivos: ["file1.ts", "file2.ts"],
  resumen: "Proyecto ejemplo"
}

comparacion = compare_formats(datos)
log("Ahorro: " + comparacion.savings.percentage + "%")
```

### Uso en LLMClient

```promptscript
client = LLMClient({
  provider: "openrouter",
  model: "anthropic/claude-sonnet-4",
  context_format: "toon"
})
```

### Beneficios

- ~20-40% reducción de tokens en contexto
- Especialmente efectivo con arrays uniformes
- Lossless (roundtrip perfecto)
- Compatible con todos los providers

---

## Ejemplo Completo

Ver `examples/v04-all-features.ps` para un demo completo que integra todas las features.

```bash
bun run src/cli.ts run examples/v04-all-features.ps --project .
```

---

## Casos de Uso

### 1. Pipeline de Build Composable

```promptscript
run("workflows/lint.ps")
run("workflows/test.ps")
resultado = call("workflows/build.ps")
if resultado.ok:
  run("workflows/deploy.ps")
```

### 2. Agente con Memoria Eficiente

```promptscript
build_memory("codebase", { globs: ["src/**"] })

for tarea in tareas:
  contexto = recall("codebase", tarea.query, { top_k: 4 })
  
  run_agent(client, tarea.prompt, {
    memory_key: "session",
    long_memory: "codebase"
  })
  
  if steps % 5 == 0:
    forget({ memory_key: "session", mode: "compact" })
```

### 3. Reducción de Costos con TOON

```promptscript
set_context_format("toon")

grandes_datos = apply("SEARCH", { query: "TODO" })
comparacion = compare_formats(grandes_datos)
log("Ahorro estimado: $" + (comparacion.savings.tokens * 0.000015))
```

---

## Arquitectura

```
┌─────────────────────────────────────────┐
│         PromptScript Runtime            │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐   ┌───────────────┐  │
│  │ Sub-workflow │   │ Memory Store  │  │
│  │  Executor    │   │  (STM/LTM)    │  │
│  └──────────────┘   └───────────────┘  │
│                                         │
│  ┌──────────────┐   ┌───────────────┐  │
│  │   Forget     │   │     TOON      │  │
│  │  Compactor   │   │  Serializer   │  │
│  └──────────────┘   └───────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

---

## Roadmap

- [ ] Tool `RECALL` para que el agente pida contexto explícito
- [ ] Auto-recall en `run_agent` con `recall_policy: { auto: true }`
- [ ] Embeddings opcionales para LTM
- [ ] Soporte para `.toon` como formato de PlanSpec
- [ ] UI de replay con expansión de sub-workflows
- [ ] Métricas de reducción de tokens en logs

---

## Referencias

- [TOON Format](https://github.com/toon-format/toon)
- [RFC-0004: PromptScript v0.3](./RFC-0004:%20PromptScript%20v0.3%20—%20Control%20Flow%20+%20Neural%20Statements%20+%20Deterministic%20Runtime.md)
- [PromptScript Runtime Spec](./PromptScript%20Runtime%20&%20Builtins%20Spec%20(v0.2).md)
