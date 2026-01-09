PromptScript Runtime & Builtins Spec (v0.2)

Este documento define cambios de semántica y nuevas funciones built-in para separar claramente:
	•	Generación de Plan (LLM)
	•	Ejecución de acciones (tools)
	•	Orquestación (loops agenticos)

Objetivo: apply() hace una sola cosa (ejecuta una acción). El LLM nunca se ejecuta “por accidente”.

⸻

Resumen de cambios

✅ Cambio principal
	•	apply(...) ya no ejecuta llamadas LLM.
	•	El LLM se invoca únicamente con llm(...), plan(...) o mediante un LLMClient.
	•	Los loops agenticos se ejecutan con run_agent(...) (indefinido por defecto, limitado por budgets/policy/loop-detection).

✅ Nuevas built-ins

Built-in	Propósito	Ejecuta LLM	Ejecuta tools
plan(prompt, opts?)	Generar un Plan desde el LLM (alto nivel)	✅	❌
do(prompt, opts?)	Sugar: apply(plan(prompt))	✅	✅
apply(plan) / apply(action, args)	Ejecutar una acción (tool)	❌	✅
run_agent(clientOrOpts, prompt, opts?)	Loop agentico (indefinido por defecto)	✅	✅
parallel(items, opts?)	Ejecutar varias acciones “safe” en paralelo	❌	✅


⸻

Tipos (conceptuales)

Plan

Un Plan es un JSON validado por PlanSchema:

Plan = {
  action: "READ_FILE" | "SEARCH" | "WRITE_FILE" | "PATCH_FILE" | "RUN_CMD" | "ASK_USER" | "REPORT" | "PARALLEL",
  args: object,
  done?: boolean,
  confidence?: number,
  reason?: string
}


⸻

Built-ins

1) apply(plan) / apply(action, args)

Propósito: ejecutar exactamente una acción (tool dispatch).

NO ejecuta LLM.

Sintaxis

# Forma A: ejecutar un plan ya generado
result = apply(plan)

# Forma B: ejecutar una acción directamente
result = apply("READ_FILE", { path: "README.md" })

Semántica
	•	Valida el plan contra PlanSchema (si aplica)
	•	Aplica policy (allowActions, allowTools, allowCommands, sandbox)
	•	Ejecuta una tool
	•	Registra evento en logs
	•	Retorna el output de la tool

Errores
	•	E_PLAN_SCHEMA si el plan no valida
	•	E_POLICY_DENY si la policy lo bloquea
	•	E_TOOL_FAIL si la tool falla

⸻

2) plan(prompt, opts?)

Propósito: generar un Plan (una siguiente acción) a partir de un prompt.

Solo LLM. No ejecuta tools.

Sintaxis

p = plan("Lee package.json")
apply(p)

# Con configuración
p = plan("Crea un index.html", {
  provider: "openrouter",
  model: "mistralai/devstral-2512:free",
  no_ask: true,
  maxTokens: 8192,
})

Opciones (opts)
	•	provider?: string
	•	model?: string
	•	no_ask?: boolean
	•	maxTokens?: number
	•	system?: string
	•	context?: string
	•	mock_plan?: object (solo testing)

Semántica
	•	Construye input para el LLM (system/user/context)
	•	Llama al proveedor configurado
	•	Valida salida con PlanSchema
	•	Retorna Plan

Errores
	•	E_LLM_FAIL si provider falla
	•	E_PLAN_SCHEMA si la salida no valida

⸻

3) do(prompt, opts?) (sugar)

Propósito: ejecutar un prompt en un paso.

do(prompt) es equivalente a:

apply(plan(prompt))

Sintaxis

out = do("Lee README.md y dime qué hace")
log(out)

# o directamente para escribir
out = do("Crea public/index.html con una landing page")
log(out)

Notas
	•	do() es conveniente para scripts cortos.
	•	Para flujos largos y multi-step usar run_agent().

⸻

4) run_agent(clientOrOpts, prompt, opts?)

Propósito: orquestar un loop agentico LLM → Plan → apply → contexto → …

Indefinido por defecto: no tiene max_iterations obligatorio.

Aun así, el runtime siempre puede detenerse por budgets, policy o loop-detection.

Sintaxis
A) Con cliente explícito

client = LLMClient({ provider: "openrouter", model: "mistralai/devstral-2512:free", no_ask: true })

run_agent(client,
  "Crea public/index.html y public/styles.css para una landing de gatitos. Termina con REPORT.done=true."
)

B) Con opts inline (sin crear cliente)

run_agent({ provider: "openrouter", model: "mistralai/devstral-2512:free", no_ask: true },
  "Refactoriza src/ para que pase bun test"
)

Opciones (opts)
	•	stop_on_report?: boolean (default: true)
	•	require_write?: boolean (default: false)
	•	context_files?: string[] (archivos a inyectar siempre)
	•	memory_key?: string (estado persistente)

No incluye max_iterations por defecto.

Semántica (alto nivel)
	1.	Inicializa contexto last_result = ""
	2.	Loop:
	•	llama LLM para obtener Plan
	•	si Plan.action == "REPORT":
	•	si opts.stop_on_report y Plan.done == true → termina
	•	si no, aplica report como log
	•	si no:
	•	ejecuta apply(Plan)
	•	guarda output en last_result
	3.	Repite

Reglas adicionales
	•	require_write=true fuerza que antes de terminar (REPORT.done=true) haya ocurrido al menos una acción WRITE_FILE o PATCH_FILE.
	•	El runtime puede detener el loop por:
	•	budgets (tiempo/costo/llm-calls/steps)
	•	loop detection
	•	policy deny

⸻

5) parallel(items, opts?)

Propósito: ejecutar un batch de acciones en paralelo.

Sintaxis

results = parallel([
  { action: "READ_FILE", args: { path: "README.md" } },
  { action: "READ_FILE", args: { path: "CONTRIBUTING.md" } },
  { action: "SEARCH", args: { query: "TODO" } },
], { max: 3, fail_fast: true })

log(results)

Restricciones v0 (recomendado)
	•	Solo se permiten acciones safe: READ_FILE, SEARCH
	•	WRITE_FILE / PATCH_FILE / RUN_CMD quedan fuera inicialmente

Opciones
	•	max?: number (default: 4)
	•	fail_fast?: boolean (default: true)

Retorno
Array del mismo tamaño, ordenado como entrada:
	•	{ ok: true, value: any }
	•	{ ok: false, error: string } (si fail_fast=false)

⸻

Ejemplo actualizado (tu workflow)

log("Comenzando workflow")

modelo = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "mistralai/devstral-2512:free",
  no_ask: true,
  maxTokens: 16384,
})

log("Creando landing page completa de gatitos...")

p = modelo("Crea public/index.html - una landing page COMPLETA y PROFESIONAL de gatitos.")
apply(p)  # apply SOLO ejecuta la acción, no llama LLM

log("Workflow terminado!")


⸻

Ejemplo recomendado (run_agent indefinido)

log("Comenzando workflow")

modelo = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "mistralai/devstral-2512:free",
  no_ask: true,
})

run_agent(modelo,
  "Crea public/index.html y public/styles.css para una landing profesional de gatitos. " +
  "Termina con REPORT.done=true y lista filesChanged."
)

log("Workflow terminado!")


⸻

Nota sobre backward compatibility

Si existían scripts que dependían de apply(prompt_string) o apply() ejecutando LLM, se recomienda:
	•	Deprecarlos
	•	Introducir do(prompt) como reemplazo explícito

⸻
