PromptScript

Deterministic orchestration language for LLM agents

PromptScript es un lenguaje (DSL) y runtime para orquestar agentes basados en LLM de forma determinista, auditable y segura.

A diferencia de frameworks agenticos basados en conversaciones implícitas, PromptScript separa claramente el razonamiento del control de ejecución:

El LLM propone acciones.
El runtime decide qué se ejecuta, cuándo y bajo qué reglas.

⸻

El problema

Los agentes LLM actuales suelen ser:
• impredecibles
• difíciles de auditar
• propensos a loops infinitos
• peligrosos en producción
• imposibles de reproducir

Esto los vuelve frágiles para repositorios reales, equipos grandes y entornos productivos.

⸻

La solución

PromptScript introduce:
• Control de flujo explícito
• Contratos formales (Plan / IR)
• Ejecución paso a paso
• Sandbox estricto
• Replay determinista
• Políticas duras (budgets, allowlists, approvals)

Todo lo necesario para usar agentes LLM sin perder control.

⸻

Principios de diseño 1. El DSL controla el flujo 2. El LLM no controla la ejecución 3. Toda salida es validada 4. Toda acción es auditada 5. Toda ejecución es reproducible

⸻

Características v0.45

**Nuevas Features:**

- **Sub-workflows Mejorados** - Budgets por stage, replay encadenado
- **Quality Contracts** - Sistema de contratos estructurados para verificación
- **Memoria por Stage** - Checkpoints limpios y forgetting por etapa
- **Pipeline Pattern** - Patrón canónico para CI humana (build → verify → fix)

**Features v0.4:**

- **Sub-workflows** - Composición con `run()` y `call()`
- **Memoria Jerárquica** - STM/LTM con `build_memory()` y `recall()`
- **STM Forgetting** - Compactación tipo humano con checkpoints
- **TOON Serialization** - Reducción de tokens ~20-40%
- **RECALL Tool** - Agentes pueden pedir contexto explícitamente
- **Archive Memory** - Archivar STM a LTM con `archive()`
- **Approvals** - Sistema de aprobación para acciones críticas

Ver [docs/v045-features.md](docs/v045-features.md) y [docs/v04-features.md](docs/v04-features.md) para detalles completos.

Características

Lenguaje (DSL)
• Sintaxis simple, tipo Python
• Variables y funciones
• if, while, break, return
• Builtins controlados (llm, tool, log)

Runtime
• Ejecución secuencial y determinista
• Validación estricta del output del LLM
• Sandboxing de archivos y comandos
• Presupuestos de ejecución (steps, tiempo, tools)
• Detección de loops patológicos

Observabilidad
• Logs por step (JSONL)
• Estado serializable
• Replay exacto sin side-effects

⸻

Ejemplo

system = "Responde SOLO JSON válido con action/args/done."
done = false

def step():
plan = llm({
"system": system,
"user": "Siguiente acción para avanzar el proyecto",
"json_schema": {
"type": "object",
"properties": {
"action": { "type": "string" },
"args": { "type": "object" },
"done": { "type": "boolean" }
},
"required": ["action", "args", "done"]
}
})

if plan.action == "PATCH_FILE":
tool("PATCH_FILE", plan.args)

if plan.action == "RUN_CMD":
tool("RUN_CMD", plan.args)

while not done:
step()

⸻

Arquitectura

PromptScript (.ps)
↓
Parser → AST
↓
Runtime (determinista)
├─ LLM Adapter (Plan)
├─ Tool Registry
├─ Policy Engine
└─ Sandbox
↓
Logs + Replay

⸻

Especificaciones (RFCs)

PromptScript se define mediante especificaciones formales:
• RFC-0001 — Language Specification
• RFC-0002 — Runtime Execution Model
• RFC-0003 — Tool Interface & Policy

La implementación debe seguir estrictamente los RFCs. Cualquier cambio incompatible requiere un nuevo RFC.

⸻

Seguridad

El runtime:
• nunca ejecuta código arbitrario
• no permite escapar del workspace
• valida todas las entradas
• aplica allowlists estrictas
• registra cada acción

El LLM no tiene acceso directo al sistema.

⸻

Estado del proyecto

Status: Active development (v0.x)
• DSL y RFCs estables
• Runtime core en desarrollo
• CLI local en progreso

⸻

Casos de uso
• Generación de código iterativa
• Refactors largos
• Agentes de testing
• Migraciones
• Documentación automática
• Mantenimiento de repositorios

⸻

Open Source y Comercial

PromptScript sigue un modelo open-core:

Open Source
• Lenguaje (DSL)
• Parser y AST
• Runtime core
• RFCs

Comercial
• Runtime avanzado
• Observabilidad premium
• Approval gates
• Ejecución en la nube
• Integraciones enterprise

⸻

Instalación (temporal)

La CLI aún está en desarrollo.

git clone https://github.com/your-org/prompts-lang
cd prompts-lang
bun install

⸻

Contribuir 1. Lee los RFCs 2. Abre un issue antes de cambios grandes 3. Usa el proceso de RFC para breaking changes 4. PRs pequeños y auditables

⸻

Licencia
• DSL y runtime core: MIT / Apache 2.0
• Componentes comerciales: licencia propietaria

⸻

Filosofía

Los LLMs razonan.
PromptScript decide.
