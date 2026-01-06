Contributing to PromptScript

Gracias por tu interés en contribuir a PromptScript. Este proyecto prioriza determinismo, seguridad y claridad por encima de la velocidad. Por favor lee este documento completo antes de contribuir.

⸻

Principios de contribución

Antes de escribir código, ten en cuenta:
	1.	Las especificaciones mandan — los RFCs son la fuente de verdad
	2.	Nada implícito — toda decisión debe estar documentada
	3.	Determinismo primero — evita comportamientos no reproducibles
	4.	Cambios pequeños — PRs grandes son difíciles de auditar
	5.	Seguridad > features — no se aceptan shortcuts

⸻

Arquitectura y RFCs

PromptScript está definido por especificaciones formales ubicadas en /rfcs:
	•	RFC-0001 — Language Specification
	•	RFC-0002 — Runtime Execution Model
	•	RFC-0003 — Tool Interface & Policy

Cualquier cambio que:
	•	modifique el lenguaje
	•	cambie el modelo de ejecución
	•	altere contratos de tools

DEBE proponer un nuevo RFC o actualizar uno existente.

⸻

Tipos de contribuciones aceptadas

Aceptamos:
	•	Correcciones de bugs
	•	Tests
	•	Mejoras de documentación
	•	Implementación fiel de RFCs existentes
	•	Herramientas internas (no breaking)

No aceptamos:
	•	Cambios al comportamiento sin RFC
	•	Features que rompan determinismo
	•	Heurísticas mágicas u opacas
	•	Auto-modificación del runtime

⸻

Flujo de trabajo

1. Abre un issue primero

Antes de comenzar:
	•	Abre un Issue describiendo el problema o mejora
	•	Explica cómo se relaciona con los RFCs
	•	Espera feedback antes de implementar

Esto evita trabajo descartado.

⸻

2. Fork y branch
	•	Fork del repositorio
	•	Crea una branch descriptiva:

feat/runtime-replay
fix/parser-scope
rfc/tool-policy


⸻

3. Implementación

Durante el desarrollo:
	•	Sigue estrictamente los RFCs
	•	Evita cambios colaterales
	•	Mantén el código legible y comentado
	•	Prefiere funciones puras
	•	Evita dependencias innecesarias

⸻

4. Tests

Toda contribución DEBE incluir tests cuando aplique:
	•	Tests deterministas
	•	Casos límite
	•	Tests de regresión

Si no es posible testear, explícalo claramente en el PR.

⸻

5. Logs y observabilidad

Si tu cambio afecta la ejecución:
	•	Asegúrate de que los logs sigan siendo reproducibles
	•	No agregues logs no deterministas
	•	No dependas de timestamps fuera del runtime

⸻

6. Pull Request

Tu PR debe incluir:
	•	Descripción clara del cambio
	•	Issue relacionado (Closes #123)
	•	RFC relevante (si aplica)
	•	Justificación técnica
	•	Riesgos conocidos

Los PRs serán revisados por:
	•	corrección técnica
	•	alineación con RFCs
	•	impacto en seguridad
	•	impacto en determinismo

⸻

Convenciones de código
	•	Nombres claros y explícitos
	•	Evita abreviaciones
	•	Prefiere inmutabilidad
	•	Manejo explícito de errores
	•	Sin comportamiento implícito

⸻

Seguridad

PromptScript es un sistema de ejecución controlada.

Por lo tanto:
	•	No introduzcas ejecución arbitraria
	•	No relajes el sandbox
	•	No expongas secretos
	•	No confíes en inputs externos sin validar

Cualquier vulnerabilidad debe reportarse de forma responsable.

⸻

Licencia

Al contribuir aceptas que tu contribución:
	•	se distribuya bajo la licencia del proyecto
	•	pueda ser incluida en versiones open source y comerciales

⸻

Filosofía de revisión

Los maintainers priorizan:
	1.	Seguridad
	2.	Determinismo
	3.	Claridad
	4.	Correctitud
	5.	Performance

La velocidad de desarrollo es secundaria.

⸻

Gracias

PromptScript busca establecer un estándar serio para agentes LLM en producción.

Gracias por ayudar a construirlo bien.
