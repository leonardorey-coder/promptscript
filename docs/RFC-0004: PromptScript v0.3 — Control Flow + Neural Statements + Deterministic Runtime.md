RFC-0004: PromptScript v0.3 — Control Flow + Neural Statements + Deterministic Runtime

Status: Draft
Version: 0.3
Scope: Lenguaje + builtins + semántica runtime (determinismo, memoria, policies, concurrencia controlada)

0. Objetivos
	1.	Mantener un DSL tipo Python con ifs, loops, funciones, clases, arrays/objetos.
	2.	Introducir “neuronas” (LLM) como sentencias explícitas, no implícitas.
	3.	Garantizar determinismo operacional: toda mutación/IO ocurre vía tools apply().
	4.	Permitir agentes indefinidos (run_agent) sin “bola de nieve” de contexto.

⸻

1. Principios de determinismo

1.1 Side-effects
	•	Prohibido IO directo (FS/NET/clock/random) desde el lenguaje.
	•	Permitido IO solo mediante acciones apply(...) / tool(...) (tools allowlisted).

1.2 Orden estable
	•	Tools que retornan colecciones (ej. SEARCH) deben retornar resultados ordenados de forma estable:
path ASC, luego line ASC, luego col ASC si aplica.

1.3 Concurrencia
	•	No existe “threads” del lenguaje.
	•	Existe solo parallel([...]) con:
	•	límite de concurrencia fijo (max)
	•	salida en el mismo orden que la entrada
	•	acciones safe (v0.3: READ_FILE, SEARCH)

1.4 Memoria del agente
	•	El runtime mantiene memoria por memory_key.
	•	La memoria es compacta (resúmenes + estado estructurado), nunca transcript infinito.

⸻

2. Léxico y sintaxis base

2.1 Indentación
	•	Bloques por indentación de espacios. Tabs invalidan.

2.2 Comentarios
	•	# ... hasta fin de línea.

2.3 Literales
	•	number, string ("..." y multilinea `...`), true/false/null
	•	array: [a, b, c]
	•	object: { key: value, "key2": value }

2.4 Acceso
	•	objetos: obj.key
	•	arrays: arr[i]

⸻

3. Gramática (EBNF simplificada)

Nota: La indentación define Block.

Program      := { Stmt } EOF ;

Stmt         := SimpleStmt NEWLINE
              | CompoundStmt ;

SimpleStmt   := Assign
              | ExprStmt
              | Return
              | Break
              | GuardStmt ;

CompoundStmt := Def
              | ClassDef
              | If
              | While
              | For
              | WithPolicy
              | RetryBlock
              | TimeoutBlock ;

Assign       := IDENT "=" Expr ;
ExprStmt     := Expr ;
Return       := "return" [ Expr ] ;
Break        := "break" ;

If           := "if" Expr ":" Block [ "else" ":" Block ] ;
While        := "while" Expr ":" Block ;
For          := "for" IDENT "in" ForIter ":" Block ;
ForIter      := "range" "(" RangeArgs ")" | Expr ;
RangeArgs    := Expr [ "," Expr [ "," Expr ] ] ;

Def          := "def" IDENT "(" [ Params ] ")" ":" Block ;
Params       := IDENT { "," IDENT } ;

ClassDef     := "class" IDENT ":" Block ;

WithPolicy   := "with" "policy" ObjectLit ":" Block ;

RetryBlock   := "retry" Expr [ "backoff" Expr ] ":" Block ;
TimeoutBlock := "timeout" Expr ":" Block ;

GuardStmt    := "guard" GuardExpr ;
GuardExpr    := Expr ;  # debe evaluar a boolean

Expr         := OrExpr ;
OrExpr       := AndExpr { "or" AndExpr } ;
AndExpr      := NotExpr { "and" NotExpr } ;
NotExpr      := [ "not" ] CmpExpr ;
CmpExpr      := AddExpr { ( "==" | "!=" | "in" ) AddExpr } ;
AddExpr      := Primary { "+" Primary } ;

Primary      := Literal
              | IDENT
              | Call
              | "(" Expr ")"
              | ObjectLit
              | ArrayLit
              | MemberAccess
              | IndexAccess ;

Call         := IDENT "(" [ Args ] ")" ;
Args         := Expr { "," Expr } ;

MemberAccess := Primary "." IDENT ;
IndexAccess  := Primary "[" Expr "]" ;

ObjectLit    := "{" [ ObjPairs ] "}" ;
ObjPairs     := ObjPair { "," ObjPair } [ "," ] ;
ObjPair      := (IDENT | STRING) ":" Expr ;

ArrayLit     := "[" [ Expr { "," Expr } [ "," ] ] "]" ;


⸻

4. Semántica de tipos y operadores

4.1 +
	•	Si ambos operandos son number, realiza suma numérica.
	•	En cualquier otro caso, convierte ambos a string y concatena.

4.2 == / !=
	•	Comparación estricta por tipo y valor.

4.3 in
	•	x in "texto" → substring
	•	x in [a,b] → contains (igualdad estricta)
	•	x in {k:v} → true si x es key

4.4 Precedencia
	1.	not
	2.	== != in
	3.	and
	4.	or

⸻

5. Builtins: separación estricta de responsabilidades

5.1 apply(plan) / apply(action, args)

Efecto: ejecuta exactamente una acción/tool.
NO llama al LLM.

out = apply("READ_FILE", { path: "README.md" })

p = plan("Lee README.md")
out = apply(p)

	•	Valida con PlanSchema
	•	Enforce policy/allowlist
	•	Log event (tool)
	•	Retorna resultado

⸻

5.2 plan(prompt, opts?)

Efecto: llama al LLM y devuelve un Plan validado.
NO ejecuta tools.

p = plan("Crea public/index.html", { provider: "openrouter", model: "..." })

opts (mínimo):
	•	provider, model, apiKey, baseUrl
	•	no_ask, maxTokens, temperature
	•	memory_key? (context builder)
	•	mock_plan? (testing)

⸻

5.3 do(prompt, opts?)

Sugar explícito:

do("Crea public/index.html")
# equivalente:
apply(plan("Crea public/index.html"))


⸻

5.4 run_agent(clientOrOpts, prompt, opts?)

Efecto: loop agentico LLM→Plan→apply hasta REPORT.done=true.
Es indefinido por defecto (sin max_iterations), pero limitado por budgets/policy/loop detection del runtime.

run_agent(cliente,
  "Crea landing de gatitos con carrusel.",
  { memory_key: "landing.carousel" }
)

opts sugeridos:
	•	memory_key?: string (persistencia de contexto)
	•	require_write?: boolean (no terminar sin WRITE/PATCH)
	•	stop_on_report?: boolean (default true)
	•	tool_scopes?: object (override policy en bloque)

⸻

5.5 decide({question, schema, ...opts})

Efecto: LLM retorna valor estructurado (no Plan) validado por schema.
Ideal para decisiones de orquestación.

choice = decide({
  question: "¿Qué sigue?",
  schema: { next: "string", file: "string" },
  memory_key: "landing.carousel"
})


⸻

5.6 judge(question, opts?) -> boolean

Efecto: LLM retorna boolean (validado). Útil para checks.

if judge("¿Se ve bien en mobile?", { memory_key: "landing.carousel" }):
  apply("REPORT", { message: "ok", done: true })


⸻

5.7 summarize(instruction, opts?)

Efecto: actualiza memoria compacta (no transcript).

summarize("Resume cambios en 5 bullets.", { memory_key: "landing.carousel" })


⸻

5.8 parallel(items, opts?)

Efecto: ejecuta batch de acciones safe en paralelo, determinista.

results = parallel([
  { action: "READ_FILE", args: { path: "public/index.html" } },
  { action: "SEARCH", args: { query: "carousel" } }
], { max: 3, fail_fast: true })

Restricción v0.3:
	•	solo READ_FILE, SEARCH

Retorno:
	•	array ordenado
	•	cada entrada: { ok: true, value: any } o { ok:false, error:string } (si fail_fast=false)

⸻

5.9 with policy {...}:

Scope de permisos por bloque (reduce blast radius).

with policy { allowActions: ["READ_FILE","SEARCH"] }:
  hits = apply("SEARCH", { query: "TODO" })


⸻

5.10 retry N backoff MS:

Retry determinista de un bloque.

retry 3 backoff 500:
  p = plan("Devuelve WRITE_FILE válido")
  apply(p)


⸻

5.11 timeout MS:

Corta un bloque si excede duración.

timeout 60000:
  apply("RUN_CMD", { cmd: "bun", args: ["test"] })


⸻

5.12 guard expr

Invariantes que deben ser true o falla.

guard "WRITE_FILE" in allowed_actions
guard max_files_changed <= 5

guard no es IA; es determinista y usa variables/estado del runtime.

⸻

6. Clases (deterministas)

6.1 Reglas
	•	clases son azúcar para struct + métodos
	•	sin herencia en v0.3 (opcional)
	•	sin reflection/imports
	•	métodos solo pueden causar side-effects vía apply/tool

Ejemplo:

class CarouselJob:
  def __init__(self, client, memory_key):
    self.client = client
    self.memory_key = memory_key

  def add(self, idx, path):
    run_agent(self.client,
      "Agrega " + path + " como slide #" + idx,
      { memory_key: self.memory_key }
    )


⸻

7. “for” y helpers

Builtins requeridos:
	•	len(x)
	•	range(n) / range(start,end) / range(start,end,step)

Ejemplo:

imagenes = ["a.jpg","b.jpg","c.jpg"]

for i in range(len(imagenes)):
  log(i)


⸻

8. Memoria del agente (evitar bola de nieve)

8.1 memory_key

Cuando se pasa memory_key a plan/run_agent/decide/judge/summarize, el runtime:
	•	carga memory[memory_key]
	•	inyecta al LLM:
	•	objective (breve)
	•	summary (bullets)
	•	filesTouched + hashes
	•	recentDiffSummary (no archivos completos)
	•	openIssues (si hay)

8.2 Política anti-bloat
	•	La memoria se mantiene por debajo de un límite (ej. 1–2k tokens).
	•	Se reemplaza por resúmenes incrementales (no concat).

⸻

9. Ejemplo “neuronal” con control total

imagenes = ["imagen1.jpg","imagen2.jpg","imagen3.jpg"]

cliente = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "mistralai/devstral-2512:free",
  no_ask: true
})

# Build base landing
run_agent(cliente,
  "Crea public/index.html y public/styles.css con carrusel vacío listo para N imágenes.",
  { memory_key: "landing.carousel", require_write: true }
)

# Add images iterativamente sin bola de nieve
for i in range(len(imagenes)):
  run_agent(cliente,
    "Integra images/" + imagenes[i] + " como slide #" + i +
    ". Mantén accesibilidad (aria) y responsive.",
    { memory_key: "landing.carousel", require_write: true }
  )

# Check quality con IA
if judge("¿Carrusel funciona y es responsive?", { memory_key: "landing.carousel" }):
  apply("REPORT", { message: "Carrusel listo", done: true, filesChanged: ["public/index.html","public/styles.css"] })
else:
  run_agent(cliente, "Arregla los problemas detectados.", { memory_key: "landing.carousel", require_write: true })


⸻

10. Compatibilidad hacia atrás
	•	apply(prompt_string) o apply() que llamaba LLM queda deprecado.
	•	Reemplazo explícito:
	•	do(prompt) para 1 paso
	•	run_agent(...) para loop

⸻

11. Checklist de implementación v0.3
	•	Parser: for, class, with policy, retry, timeout, guard
	•	Runtime: apply sin LLM; plan/do; run_agent indefinido + budgets
	•	MemoryStore + context builder por memory_key
	•	parallel con pool y orden estable
	•	Políticas por scope (with policy)
	•	Logs canon + replay-friendly events
