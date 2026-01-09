# PromptScript Language Reference

PromptScript es un DSL tipo Python con indentacion para orquestar agentes LLM.

## Sintaxis Basica

### Indentacion

PromptScript usa indentacion con espacios (no tabs) para definir bloques:

```ps
if condition:
  # bloque indentado
  log("dentro del if")
  
while running:
  # otro bloque
  do_something()
```

### Comentarios

```ps
# Esto es un comentario
log("hola")  # comentario al final de linea
```

### Variables

```ps
nombre = "valor"
numero = 42
activo = true
nulo = null
```

### Strings

```ps
# String simple con comillas dobles
mensaje = "Hola mundo"

# String con escapes
texto = "Linea 1\nLinea 2"

# String multilinea con backticks
html = `
<!DOCTYPE html>
<html>
  <body>Contenido</body>
</html>
`
```

### Objetos y Arrays

```ps
# Objeto (las claves pueden ser sin comillas)
config = {
  provider: "openai",
  model: "gpt-4",
  temperature: 0.7,
}

# Array
items = ["uno", "dos", "tres"]

# Acceso
valor = config.provider
item = items[0]
```

---

## Palabras Reservadas

| Keyword | Descripcion |
|---------|-------------|
| `def` | Define una funcion |
| `class` | Define una clase |
| `if` | Condicional |
| `else` | Rama alternativa |
| `while` | Bucle |
| `for` | Bucle for |
| `in` | Operador de pertenencia / for loops |
| `range` | Generador de secuencias numericas |
| `return` | Retorna valor de funcion |
| `break` | Sale del bucle |
| `with` | Bloque de contexto |
| `policy` | Contexto de politicas de seguridad |
| `retry` | Bloque de reintentos |
| `backoff` | Delay entre reintentos |
| `timeout` | Bloque con limite de tiempo |
| `guard` | Invariante que debe ser verdadero |
| `true` | Booleano verdadero |
| `false` | Booleano falso |
| `null` | Valor nulo |
| `and` | Operador logico AND |
| `or` | Operador logico OR |
| `not` | Operador de negacion |

---

## Operadores

| Operador | Descripcion | Ejemplo |
|----------|-------------|---------|
| `+` | Concatenacion de strings | `"a" + "b"` |
| `==` | Igualdad | `x == 5` |
| `!=` | Desigualdad | `x != 5` |
| `and` | AND logico | `a and b` |
| `or` | OR logico | `a or b` |
| `not` | Negacion | `not done` |
| `in` | Pertenencia | `"x" in lista` |

---

## Estructuras de Control

### If / Else

```ps
if condicion:
  log("verdadero")
else:
  log("falso")
```

### While

```ps
contador = 0
while contador != 5:
  log(contador)
  contador = contador + 1
```

### For

```ps
# For con range
for i in range(5):
  log(i)  # 0, 1, 2, 3, 4

# For con range personalizado
for i in range(2, 8):
  log(i)  # 2, 3, 4, 5, 6, 7

# For con step
for i in range(0, 10, 2):
  log(i)  # 0, 2, 4, 6, 8

# For con arrays
imagenes = ["a.jpg", "b.jpg", "c.jpg"]
for i in range(len(imagenes)):
  log("Imagen " + i + ": " + imagenes[i])
```

### Break

```ps
while true:
  if should_stop:
    break

# También funciona en for
for i in range(100):
  if i == 10:
    break
```

---

## Bloques de Control Avanzados

### with policy

Define un scope de permisos para reducir el "blast radius" de operaciones.

```ps
# Solo permitir lectura en este bloque
with policy { allowActions: ["READ_FILE", "SEARCH"] }:
  hits = apply("SEARCH", { query: "TODO" })
  contenido = apply("READ_FILE", { path: "README.md" })
  
# Fuera del bloque, vuelven las políticas normales
apply("WRITE_FILE", { path: "output.txt", content: "resultado" })
```

### retry ... backoff ...

Reintentos deterministas de un bloque con backoff configurable.

```ps
retry 3 backoff 500:
  p = plan("Devuelve WRITE_FILE válido")
  apply(p)

# Si falla, reintenta 3 veces con 500ms entre intentos
```

### timeout

Corta un bloque si excede la duración especificada (en ms).

```ps
timeout 60000:
  apply("RUN_CMD", { cmd: "bun", args: ["test"] })

# Si el comando toma más de 60 segundos, se cancela
```

### guard

Invariantes que deben ser verdaderos o falla la ejecución. **No es IA**, es determinista.

```ps
# Guards con variables del runtime
guard "WRITE_FILE" in allowed_actions
guard max_files_changed <= 5

# Guards con funciones
files_created = 0
for i in range(len(imagenes)):
  apply("WRITE_FILE", { path: "img_" + i + ".html", content: "<img>" })
  files_created = files_created + 1
  guard files_created <= 10  # No más de 10 archivos
```

---

## Funciones

### Definir Funciones

```ps
def saludar(nombre):
  log("Hola " + nombre)
  return "ok"

resultado = saludar("mundo")
```

### Definir Clases

Las clases son deterministas y solo pueden causar side-effects vía `apply()`.

```ps
class CarouselJob:
  def __init__(self, client, memory_key):
    self.client = client
    self.memory_key = memory_key

  def add(self, idx, path):
    run_agent(self.client,
      "Agrega " + path + " como slide #" + idx,
      { memory_key: self.memory_key }
    )

# Uso
cliente = LLMClient({ provider: "openai", no_ask: true })
job = CarouselJob(cliente, "carousel.state")
job.add("1", "imagen1.jpg")
```

---

## Funciones Built-in

### `log(mensaje)`

Imprime un mensaje a la consola.

```ps
log("Iniciando proceso...")
log("Valor: " + variable)
```

**Output**: `[ps] Iniciando proceso...`

---

### `len(x)`

Retorna la longitud de arrays o strings.

```ps
lista = ["a", "b", "c"]
log(len(lista))  # 3

texto = "hola"
log(len(texto))  # 4
```

---

### `range(n)` / `range(start, end)` / `range(start, end, step)`

Genera secuencias numericas para loops.

```ps
# range(n) - de 0 a n-1
for i in range(3):
  log(i)  # 0, 1, 2

# range(start, end) - de start a end-1  
for i in range(2, 5):
  log(i)  # 2, 3, 4

# range(start, end, step) - con incremento personalizado
for i in range(0, 10, 2):
  log(i)  # 0, 2, 4, 6, 8
```

---

### `LLMClient(config)`

Crea un cliente LLM configurable.

```ps
cliente = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "anthropic/claude-sonnet-4",
  no_ask: true,
})
```

**Parametros de configuracion**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `provider` | string | `"openai"`, `"openrouter"`, `"anthropic"`, `"custom"` |
| `apiKey` | string | API key o nombre de variable de entorno |
| `model` | string | Nombre del modelo |
| `baseUrl` | string | URL base para provider custom |
| `temperature` | number | Temperatura (0-1) |
| `maxTokens` | number | Max tokens de respuesta |
| `maxRetries` | number | Reintentos en caso de error |
| `retryDelayMs` | number | Delay entre reintentos |
| `timeoutMs` | number | Timeout de la llamada |
| `no_ask` | boolean | Evita que el modelo use ASK_USER |
| `mock_plan` | object | Plan mock para testing |

**Uso como funcion**:

```ps
cliente = LLMClient({ provider: "openai", model: "gpt-4" })

# Llamar al cliente con un prompt
plan = cliente("Crea un archivo HTML")
apply(plan)
```

---

### `run_agent(clientOrOpts, prompt, opts?)`

Ejecuta un loop agentico LLM → Plan → apply → contexto → … **Indefinido por defecto** (sin max_iterations obligatorio).

```ps
# Con cliente explícito
cliente = LLMClient({ provider: "openrouter", model: "mistralai/devstral-2512:free", no_ask: true })

run_agent(cliente,
  "Crea public/index.html y public/styles.css para una landing de gatitos. Termina con REPORT.done=true."
)

# Con opts inline (sin crear cliente)
run_agent({ provider: "openrouter", model: "mistralai/devstral-2512:free", no_ask: true },
  "Refactoriza src/ para que pase bun test"
)
```

**Parametros**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `clientOrOpts` | LLMClient/object | Cliente LLM o configuración inline |
| `prompt` | string | Prompt inicial para el agente |
| `opts.stop_on_report` | boolean | Parar en REPORT.done=true (default: true) |
| `opts.require_write` | boolean | Forzar WRITE_FILE antes de done (default: false) |
| `opts.context_files` | string[] | Archivos a inyectar siempre |
| `opts.memory_key` | string | Estado persistente |

**Comportamiento**:
1. Inicializa contexto last_result = ""
2. Loop: LLM → Plan → apply → contexto
3. Si REPORT.done=true y stop_on_report → termina
4. El runtime puede parar por budgets, policy o loop-detection

---

### `plan(prompt, opts?)`

Genera un Plan desde el LLM (solo LLM, no ejecuta tools).

```ps
# Generar un plan
p = plan("Lee package.json")
apply(p)  # Luego ejecutar el plan

# Con configuración específica
p = plan("Crea un index.html", {
  provider: "openrouter",
  model: "mistralai/devstral-2512:free",
  no_ask: true,
  maxTokens: 8192,
})
apply(p)
```

**Opciones**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `provider` | string | Proveedor LLM |
| `model` | string | Modelo específico |
| `no_ask` | boolean | Evita ASK_USER |
| `maxTokens` | number | Tokens máximos |
| `system` | string | Prompt del sistema |
| `context` | string | Contexto adicional |
| `mock_plan` | object | Plan mock para testing |

---

### `apply(plan)` / `apply(action, args)`

Ejecuta exactamente una acción (tool dispatch). **NO ejecuta LLM.**

```ps
# Ejecutar plan generado previamente
plan = plan("Lee el archivo config.json")
resultado = apply(plan)

# Ejecutar acción directamente
contenido = apply("READ_FILE", { path: "config.json" })
```

---

### `do(prompt, opts?)`

Sugar para `apply(plan(prompt))`. Ejecuta un prompt en un paso.

```ps
# Equivale a: apply(plan("Lee README.md y dime qué hace"))
out = do("Lee README.md y dime qué hace")
log(out)

# Para escribir archivos
out = do("Crea public/index.html con una landing page")
log(out)
```

**Nota**: `do()` es conveniente para scripts cortos. Para flujos largos usar `run_agent()`.

---

### `parallel(items, opts?)`

Ejecuta un batch de acciones en paralelo. Solo acciones "safe" (READ_FILE, SEARCH) en v0.

```ps
results = parallel([
  { action: "READ_FILE", args: { path: "README.md" } },
  { action: "READ_FILE", args: { path: "CONTRIBUTING.md" } },
  { action: "SEARCH", args: { query: "TODO" } },
], { max: 3, fail_fast: true })

log(results)
```

**Restricciones v0**:
- Solo acciones safe: READ_FILE, SEARCH
- WRITE_FILE / PATCH_FILE / RUN_CMD quedan fuera inicialmente

**Opciones**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `max` | number | Máximo en paralelo (default: 4) |
| `fail_fast` | boolean | Parar en primer error (default: true) |

**Retorno**: Array ordenado como entrada:
- `{ ok: true, value: any }`
- `{ ok: false, error: string }` (si fail_fast=false)

---

### `decide({question, schema, ...opts})`

LLM retorna valor estructurado (no Plan) validado por schema. Ideal para decisiones de orquestación.

```ps
choice = decide({
  question: "¿Qué sigue?",
  schema: { next: "string", file: "string" },
  memory_key: "landing.carousel"
})

log("Siguiente paso: " + choice.next)
log("Archivo: " + choice.file)
```

**Parametros**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `question` | string | Pregunta para el LLM |
| `schema` | object | Schema de validación del retorno |
| `memory_key` | string | Clave de memoria para contexto |
| `provider` | string | Proveedor LLM |
| `model` | string | Modelo específico |

---

### `judge(question, opts?) -> boolean`

LLM retorna boolean validado. Útil para checks y validaciones.

```ps
if judge("¿Se ve bien en mobile?", { memory_key: "landing.carousel" }):
  apply("REPORT", { message: "ok", done: true })
else:
  log("Necesita ajustes para mobile")

# También útil en guards
valid = judge("¿El HTML es válido?")
guard valid
```

**Parametros**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `question` | string | Pregunta que debe retornar true/false |
| `memory_key` | string | Clave de memoria para contexto |
| `provider` | string | Proveedor LLM |
| `model` | string | Modelo específico |

---

### `summarize(instruction, opts?)`

Actualiza memoria compacta (no transcript). Evita "bola de nieve" de contexto.

```ps
# Después de muchos cambios, resumir para mantener memoria compacta
summarize("Resume cambios en 5 bullets.", { memory_key: "landing.carousel" })

# La próxima vez que use memory_key, tendrá contexto resumido
run_agent(cliente, "Optimiza el carrusel", { memory_key: "landing.carousel" })
```

**Parametros**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `instruction` | string | Como resumir la memoria |
| `memory_key` | string | Clave de memoria a resumir |
| `provider` | string | Proveedor LLM |
| `model` | string | Modelo específico |

---



## Acciones del LLM

El LLM retorna planes JSON con estas acciones:

### READ_FILE

Lee un archivo del proyecto.

```json
{
  "action": "READ_FILE",
  "args": {
    "path": "src/index.ts",
    "maxBytes": 50000
  },
  "done": false,
  "reason": "leyendo archivo"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `path` | string | Si | Ruta del archivo |
| `maxBytes` | number | No | Maximo bytes a leer (default: 500000) |

---

### WRITE_FILE

Escribe o crea un archivo.

```json
{
  "action": "WRITE_FILE",
  "args": {
    "path": "public/index.html",
    "content": "<!DOCTYPE html>...",
    "mode": "overwrite"
  },
  "done": false,
  "reason": "creando archivo"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `path` | string | Si | Ruta del archivo |
| `content` | string | Si | Contenido a escribir |
| `mode` | string | No | `"overwrite"` o `"create_only"` |

---

### PATCH_FILE

Aplica un parche a un archivo.

```json
{
  "action": "PATCH_FILE",
  "args": {
    "path": "src/app.ts",
    "patch": "REPLACE:\n<nuevo contenido completo>"
  },
  "done": false,
  "reason": "aplicando cambios"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `path` | string | Si | Ruta del archivo |
| `patch` | string | Si | Parche (formato: `REPLACE:\n<contenido>`) |

---

### SEARCH

Busca en archivos del proyecto.

```json
{
  "action": "SEARCH",
  "args": {
    "query": "function handleClick",
    "globs": ["src/**/*.ts"],
    "maxResults": 100
  },
  "done": false,
  "reason": "buscando funcion"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `query` | string | No | Texto a buscar (vacio = listar archivos) |
| `globs` | string[] | No | Patrones glob para filtrar |
| `maxResults` | number | No | Maximo resultados (default: 200) |

---

### RUN_CMD

Ejecuta un comando del sistema.

```json
{
  "action": "RUN_CMD",
  "args": {
    "cmd": "npm",
    "args": ["run", "build"],
    "timeoutMs": 60000
  },
  "done": false,
  "reason": "ejecutando build"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `cmd` | string | Si | Comando a ejecutar |
| `args` | string[] | No | Argumentos del comando |
| `timeoutMs` | number | No | Timeout en ms (default: 60000) |

**Nota**: Solo comandos en allowlist pueden ejecutarse.

---

### ASK_USER

Solicita input del usuario.

```json
{
  "action": "ASK_USER",
  "args": {
    "question": "Cual framework prefieres?",
    "choices": ["React", "Vue", "Angular"]
  },
  "done": false,
  "reason": "necesito decision"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `question` | string | Si | Pregunta al usuario |
| `choices` | string[] | No | Opciones sugeridas |

**Nota**: Con `no_ask: true`, el LLM evitara usar esta accion.

---

### REPORT

Reporta resultado o mensaje final.

```json
{
  "action": "REPORT",
  "args": {
    "message": "Tarea completada exitosamente",
    "filesChanged": ["public/index.html"],
    "nextSuggestions": ["Agregar tests", "Desplegar"]
  },
  "done": true,
  "reason": "tarea completada"
}
```

| Arg | Tipo | Requerido | Descripcion |
|-----|------|-----------|-------------|
| `message` | string | Si | Mensaje de reporte |
| `filesChanged` | string[] | No | Archivos modificados |
| `nextSuggestions` | string[] | No | Sugerencias de siguientes pasos |

---

## Campos del Plan

Cada plan retornado por el LLM tiene estos campos:

| Campo | Tipo | Requerido | Descripcion |
|-------|------|-----------|-------------|
| `action` | string | Si | Accion a ejecutar |
| `args` | object | Si | Argumentos de la accion |
| `done` | boolean | Si | `true` si la tarea esta completa |
| `confidence` | number | No | Confianza 0-1 |
| `reason` | string | No | Explicacion breve (2-3 palabras) |

---

## Configuracion CLI

```bash
bun run src/cli.ts run <archivo.ps> [opciones]
```

### Opciones

| Opcion | Descripcion | Default |
|--------|-------------|---------|
| `--project <dir>` | Directorio del proyecto | cwd |
| `--provider <name>` | Proveedor LLM | auto-detect |
| `--model <model>` | Modelo a usar | provider default |
| `--max-steps <n>` | Max pasos de ejecucion | 50000 |
| `--max-time <ms>` | Max tiempo en ms | 600000 |
| `--max-llm-calls <n>` | Max llamadas LLM | 500 |
| `--max-cost <usd>` | Max costo estimado | 10.0 |
| `--halt-on-loop` | Detener en loop detectado | false |
| `--verbose` | Output detallado | false |

### Variables de Entorno

| Variable | Descripcion |
|----------|-------------|
| `OPENAI_API_KEY` | API key de OpenAI |
| `OPENROUTER_API_KEY` | API key de OpenRouter |
| `ANTHROPIC_API_KEY` | API key de Anthropic |

---

## Sistema de Memoria (memory_key)

PromptScript v0.3 incluye un sistema de memoria compacta que evita la "bola de nieve" de contexto en agentes largos.

### ¿Cómo funciona?

Cuando pasas `memory_key` a funciones como `plan()`, `run_agent()`, `decide()`, `judge()`, o `summarize()`, el runtime:

1. **Carga** `memory[memory_key]` 
2. **Inyecta al LLM**:
   - `objective` (objetivo breve)
   - `summary` (resumen en bullets)
   - `filesTouched` + hashes
   - `recentDiffSummary` (no archivos completos)
   - `openIssues` (si hay)

### Ejemplo de uso

```ps
cliente = LLMClient({ provider: "openai", no_ask: true })

# Primera iteración - establece memoria inicial
run_agent(cliente,
  "Crea public/index.html con carrusel vacío",
  { memory_key: "carousel.project" }
)

# Iteraciones subsecuentes - reutilizan memoria compacta
for i in range(len(imagenes)):
  run_agent(cliente,
    "Integra imagen " + imagenes[i] + " como slide #" + i,
    { memory_key: "carousel.project" }  # Mismo memory_key
  )

# Resumir para mantener memoria compacta
summarize("Resume cambios del carrusel en 3 bullets", { memory_key: "carousel.project" })

# Verificación final con memoria resumida
if judge("¿Carrusel funciona correctamente?", { memory_key: "carousel.project" }):
  apply("REPORT", { message: "Carrusel completado", done: true })
```

### Beneficios

- **Sin explosión de contexto**: La memoria se mantiene bajo 1-2k tokens
- **Persistencia**: El estado se mantiene entre llamadas
- **Inteligente**: Solo incluye información relevante, no transcripts completos

---

## Ejemplo Completo - Carrusel con Control de Flujo v0.3

```ps
log("Iniciando creación de carrusel con PromptScript v0.3")

# Lista de imágenes a procesar
imagenes = ["imagen1.jpg", "imagen2.jpg", "imagen3.jpg"]

# Cliente LLM configurado
cliente = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "mistralai/devstral-2512:free",
  no_ask: true
})

# Paso 1: Crear base del carrusel con memoria persistente
log("Creando estructura base...")
run_agent(cliente,
  "Crea public/index.html y public/styles.css con carrusel vacío listo para " + len(imagenes) + " imágenes.",
  { memory_key: "landing.carousel", require_write: true }
)

# Paso 2: Agregar imágenes iterativamente SIN bola de nieve
log("Agregando imágenes al carrusel...")
for i in range(len(imagenes)):
  # Guard para seguridad
  guard i < 10  # No más de 10 imágenes
  
  # Procesar con retry en caso de fallo
  retry 3 backoff 1000:
    run_agent(cliente,
      "Integra images/" + imagenes[i] + " como slide #" + i +
      ". Mantén accesibilidad (aria) y responsive.",
      { memory_key: "landing.carousel", require_write: true }
    )

# Paso 3: Verificación con IA
log("Verificando calidad del carrusel...")
if judge("¿Carrusel funciona y es responsive?", { memory_key: "landing.carousel" }):
  # Resumen final para mantener memoria compacta
  summarize("Resume el carrusel creado: estructura, imágenes, features.", 
    { memory_key: "landing.carousel" })
  
  apply("REPORT", { 
    message: "Carrusel completado exitosamente", 
    done: true, 
    filesChanged: ["public/index.html", "public/styles.css"] 
  })
else:
  log("Carrusel necesita ajustes...")
  run_agent(cliente, 
    "Arregla los problemas detectados en el carrusel.", 
    { memory_key: "landing.carousel", require_write: true }
  )

log("Workflow de carrusel terminado!")

# Ejemplo alternativo con clases para reutilización
class CarouselBuilder:
  def __init__(self, client, memory_key):
    self.client = client
    self.memory_key = memory_key
    self.images_added = 0

  def create_base(self, image_count):
    run_agent(self.client,
      "Crea base de carrusel para " + image_count + " imágenes",
      { memory_key: self.memory_key, require_write: true }
    )

  def add_image(self, idx, path):
    guard self.images_added < 10  # Límite de seguridad
    
    run_agent(self.client,
      "Agrega " + path + " como slide #" + idx,
      { memory_key: self.memory_key, require_write: true }
    )
    self.images_added = self.images_added + 1

# Uso de la clase
carousel = CarouselBuilder(cliente, "carousel.v2")
carousel.create_base(len(imagenes))

for i in range(len(imagenes)):
  carousel.add_image(i, imagenes[i])
```

---

## Glosario

| Termino | Descripcion |
|---------|-------------|
| **Plan** | Objeto JSON retornado por el LLM con accion a ejecutar |
| **Accion** | Operacion especifica (READ_FILE, WRITE_FILE, etc.) |
| **Agente** | Loop iterativo LLM -> accion -> resultado -> LLM |
| **Tool** | Implementacion de una accion en el runtime |
| **Budget** | Limites de pasos, tiempo, llamadas, costo |
| **Memory Key** | Identificador para memoria compacta persistente del agente |
| **Neural Statement** | Sentencia que invoca LLM (plan, decide, judge, summarize) |
| **Guard** | Invariante determinista que debe ser verdadero |
| **Policy Scope** | Bloque con permisos limitados (with policy) |
| **Determinismo** | Garantía de reproducibilidad (sin side-effects no controlados) |