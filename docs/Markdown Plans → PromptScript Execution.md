Markdown Plans → PromptScript Execution

Feature: Planes de implementación en Markdown compilados a PromptScript y ejecutados de forma determinista.

Esta feature permite escribir (o generar con LLM) planes de implementación en Markdown, compilarlos a un IR validado (PlanSpec), transformarlos a PromptScript (.ps), y ejecutarlos con el runtime local o cloud, manteniendo control, auditabilidad y replay.

⸻

1. ¿Qué problema resuelve?
	•	Traducir PRDs / tickets / runbooks a ejecución real sin perder control.
	•	Evitar que un LLM “ejecute” directamente (riesgo, no determinismo).
	•	Tener preview, approvals y replay antes de tocar el repo.

Idea clave: la IA compila; el runtime ejecuta.

⸻

2. Pipeline completo

plan.md (humano / LLM)
   ↓  (LLM: planner/compiler)
PlanSpec.json (IR validado)
   ↓  (compiler determinista)
workflow.ps
   ↓  (runtime)
Ejecución + métricas + replay

Cada fase es validable y auditable.

⸻

3. ¿Qué es PlanSpec?

PlanSpec es un Intermediate Representation (IR) en JSON que describe qué debe hacerse, con qué límites, y en qué orden, sin ejecutar nada por sí mismo.

Propiedades clave:
	•	Es determinista
	•	Se valida con Zod / JSON Schema
	•	No permite side-effects implícitos

Ver: PlanSpecSchema (Zod)

⸻

4. Formato del plan en Markdown (plan.md)

4.1 Estructura recomendada

# Goal
Crear una landing page con carrusel de imágenes.

# Constraints
- Escribir solo en public/**
- No ejecutar comandos fuera de: bun, git
- El workflow termina cuando los tests pasan

# Steps
1. Crear public/index.html con header, hero, carrusel y footer.
2. Crear public/styles.css con diseño responsive.
3. Ejecutar `bun test`.
4. Si los tests fallan, arreglar hasta pasar.
5. Reportar archivos modificados.

4.2 Reglas
	•	Markdown legible por humanos
	•	Listas numeradas → orden de pasos
	•	Constraints → policies
	•	Steps → PlanSpec.steps

⸻

5. Compilación: Markdown → PlanSpec

5.1 Rol del LLM (Compiler)

El LLM NO ejecuta. Solo traduce plan.md a PlanSpec.json siguiendo:
	•	PlanSpecSchema
	•	políticas explícitas
	•	pasos claros

5.2 Validaciones obligatorias

Antes de continuar:
	•	PlanSpecSchema.parse() debe pasar
	•	Paths deben cumplir allow/deny globs
	•	Commands deben estar allowlisted
	•	IDs de steps deben ser únicos

Si falla, el plan no se ejecuta.

⸻

6. Compilación determinista: PlanSpec → PromptScript

6.1 Principio

La conversión a .ps no usa IA.

Es una función pura:

compilePlanSpecToPS(spec) -> string

6.2 Mapeo de steps

PlanSpec.kind	PromptScript generado
read_file	apply("READ_FILE", ...)
search	apply("SEARCH", ...)
write_file (generated)	run_agent(...)
patch_file (generated)	run_agent(...)
run_cmd	apply("RUN_CMD", ...)
run_agent	run_agent(...)
plan_apply	apply(plan(...))
decide	decide(...)
judge	judge(...)
summarize	summarize(...)
parallel	parallel([...])
timeout	timeout MS: { ... }
retry	retry N backoff MS: { ... }


⸻

7. Políticas y seguridad

7.1 Policies globales

{
  "allowActions": ["READ_FILE","WRITE_FILE","PATCH_FILE","RUN_CMD","REPORT"],
  "allowWriteGlobs": ["public/**"],
  "allowCommands": ["bun","git"],
  "budgets": { "maxSteps": 5000 }
}

Se traducen a:

with policy { ... }:
  ...

7.2 Approval gates
	•	requireApproval: true en un step
	•	El runtime pausa y solicita aprobación

⸻

8. Ejecución

8.1 Local

promptscript run plan.md --from-md

Internamente:
	1.	MD → PlanSpec
	2.	PlanSpec → PS
	3.	Ejecutar PS

Artifacts guardados:
	•	plan.md
	•	planspec.json
	•	workflow.ps
	•	logs / replay

8.2 Cloud

promptscript deploy plan.md

	•	Ejecución persistente
	•	Métricas por proyecto
	•	Replay visual
	•	Approvals web

⸻

9. Replay y auditabilidad

Cada ejecución guarda:
	•	pasos
	•	decisiones IA
	•	tools ejecutadas
	•	diffs por step
	•	tiempos y costos

Permite:
	•	reproducir desde step N
	•	comparar ejecuciones
	•	exportar auditoría

⸻

10. Casos de uso

10.1 PRD → Implementación
	•	PM escribe PRD
	•	LLM genera plan.md
	•	Equipo revisa
	•	Compila y ejecuta

10.2 Runbooks automatizados
	•	Documentación viva
	•	Ejecución reproducible

10.3 Migraciones seguras
	•	Plan visible
	•	Cambios acotados
	•	Replay si falla

⸻

11. Buenas prácticas
	•	Mantener planes pequeños y claros
	•	Usar policies restrictivas
	•	Separar steps generativos y deterministas
	•	Usar run_agent solo donde se requiere creatividad

⸻

12. FAQ

¿Por qué no ejecutar directamente desde Markdown?
Porque Markdown no es un formato ejecutable seguro ni validable.

¿Puede un LLM escribir el plan?
Sí, pero siempre se valida antes de ejecutar.

¿Se puede aprobar paso a paso?
Sí, con requireApproval.

¿Esto reemplaza PromptScript?
No. Markdown es la capa humana; PromptScript es la capa ejecutable.

⸻

13. Resumen
	•	Markdown = intención
	•	PlanSpec = contrato
	•	PromptScript = ejecución
	•	Runtime = control

Write plans like docs. Execute them like code.