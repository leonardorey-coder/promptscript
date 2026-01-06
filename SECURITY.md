Security Policy

PromptScript es un sistema de ejecución controlada para agentes LLM. La seguridad no es una característica opcional: es un requisito fundamental del diseño.

Este documento describe cómo reportar vulnerabilidades y cuáles son las garantías y límites de seguridad del proyecto.

⸻

Versiones soportadas

Versión	Soporte de seguridad
main	✅ Soportada
v0.x	✅ Soportada
< v0.1	❌ No soportada

Solo las versiones activas reciben parches de seguridad.

⸻

Principios de seguridad

PromptScript se construye sobre los siguientes principios:
	1.	Deny by default — nada se ejecuta sin permiso explícito
	2.	Sandbox estricto — no hay escapes del workspace
	3.	Contratos formales — todo input es validado
	4.	Ejecución determinista — sin comportamiento oculto
	5.	Auditabilidad total — toda acción queda registrada

⸻

Modelo de amenazas (resumen)

PromptScript asume que:
	•	El LLM no es confiable
	•	Los prompts pueden ser maliciosos
	•	Los repositorios pueden contener entradas adversarias

El runtime está diseñado para contener estos riesgos.

⸻

Garantías de seguridad

El runtime GARANTIZA que:
	•	No se ejecuta código arbitrario
	•	No se accede fuera del workspace
	•	No se ejecutan comandos no allowlisted
	•	No se exponen variables de entorno sensibles
	•	No se ejecutan tools sin policy
	•	No se continúa ejecución tras una violación

⸻

Límites de seguridad

PromptScript NO garantiza:
	•	Que el código generado sea correcto
	•	Que el código generado esté libre de bugs
	•	Que el código generado esté libre de vulnerabilidades lógicas
	•	Que el modelo no produzca contenido incorrecto

PromptScript controla ejecución, no intención.

⸻

Superficie de ataque

Las áreas más sensibles incluyen:
	•	Ejecución de comandos (RUN_CMD)
	•	Acceso a archivos (READ_FILE, WRITE_FILE, PATCH_FILE)
	•	Manejo de entradas del LLM
	•	Persistencia y replay

Cambios en estas áreas requieren revisión estricta.

⸻

Reporte de vulnerabilidades

Si encuentras una vulnerabilidad:
	1.	NO abras un issue público
	2.	Envía un reporte privado con:
	•	descripción clara
	•	pasos para reproducir
	•	impacto potencial

Canal de reporte

📧 security@your-domain.example

(Actualiza este email antes de publicar el repositorio.)

⸻

Proceso de divulgación
	1.	Confirmación de recepción (≤ 72h)
	2.	Evaluación y mitigación
	3.	Parche y release
	4.	Divulgación responsable

No se penalizará la investigación responsable.

⸻

Reglas para contribuyentes

Al contribuir:
	•	No relajes el sandbox
	•	No agregues ejecución implícita
	•	No introduzcas dependencias inseguras
	•	No expongas secretos en logs

Cambios relacionados con seguridad deben documentarse.

⸻

Logs y datos sensibles
	•	Los logs pueden contener código
	•	Los logs no deben contener secretos
	•	El runtime debe sanitizar salidas cuando aplique

⸻

Cumplimiento

PromptScript está diseñado para facilitar:
	•	auditoría
	•	cumplimiento interno
	•	trazabilidad de ejecución

No sustituye controles organizacionales externos.

⸻

Agradecimientos

Agradecemos a quienes reportan vulnerabilidades de forma responsable.

La seguridad de PromptScript depende de una comunidad técnica rigurosa.
