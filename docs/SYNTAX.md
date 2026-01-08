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
| `if` | Condicional |
| `else` | Rama alternativa |
| `while` | Bucle |
| `return` | Retorna valor de funcion |
| `break` | Sale del bucle |
| `true` | Booleano verdadero |
| `false` | Booleano falso |
| `null` | Valor nulo |
| `and` | Operador logico AND |
| `or` | Operador logico OR |
| `in` | Operador de pertenencia |
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

### Break

```ps
while true:
  if should_stop:
    break
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

### `run_agent(client, prompt, opts?)`

Ejecuta un agente iterativo que continua hasta `done: true`.

```ps
cliente = LLMClient({ provider: "openai", no_ask: true })

run_agent(cliente, 
  "Crea una pagina web en public/index.html",
  { 
    max_iterations: 20,
    require_write: true,
  }
)
```

**Parametros**:

| Parametro | Tipo | Descripcion |
|-----------|------|-------------|
| `client` | LLMClient | Cliente LLM creado con `LLMClient()` |
| `prompt` | string | Prompt inicial para el agente |
| `opts.max_iterations` | number | Maximo de iteraciones (default: 20) |
| `opts.require_write` | boolean | Forzar WRITE_FILE antes de done (default: false) |

**Comportamiento**:
1. Llama al LLM con el prompt
2. Ejecuta la accion retornada
3. Pasa el resultado como contexto
4. Repite hasta `done: true` o max iteraciones

---

### `apply(plan)` / `apply(action, args)`

Ejecuta un plan o accion directamente.

```ps
# Ejecutar plan del LLM
plan = cliente("Lee el archivo config.json")
resultado = apply(plan)

# Ejecutar accion directa
contenido = apply("READ_FILE", { path: "config.json" })
```

---

### `apply_plan(plan)`

Igual que `apply(plan)`, ejecuta un plan.

```ps
plan = cliente("Escribe un archivo")
apply_plan(plan)
```

---

### `apply_plan_cfg(plan, config)`

Ejecuta un plan con configuracion adicional.

```ps
plan = cliente("Haz algo")
apply_plan_cfg(plan, {
  allowActions: ["READ_FILE", "WRITE_FILE"],
  logReport: true,
  returnReport: true,
})
```

---

### `tool(name, args)`

Ejecuta una herramienta directamente.

```ps
contenido = tool("READ_FILE", { path: "archivo.txt" })
tool("WRITE_FILE", { path: "nuevo.txt", content: "hola" })
```

---

### `llm(input)`

Llamada LLM de bajo nivel.

```ps
plan = llm({
  system: "Eres un asistente",
  user: "Crea un archivo",
})
```

---

### `llm_user(prompt)`

Llamada LLM simple con prompt de usuario.

```ps
plan = llm_user("Crea un archivo HTML")
```

---

### `llm_user_cfg(prompt, config)`

Llamada LLM con configuracion.

```ps
plan = llm_user_cfg("Crea un archivo", {
  provider: "openrouter",
  model: "anthropic/claude-sonnet-4",
  no_ask: true,
  context: "Contexto adicional aqui",
})
```

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

## Ejemplo Completo

```ps
log("Iniciando workflow de desarrollo")

# Crear cliente LLM
dev = LLMClient({
  provider: "openrouter",
  apiKey: "OPENROUTER_API_KEY",
  model: "anthropic/claude-sonnet-4",
  no_ask: true,
})

# Tarea 1: Crear landing page
log("Creando landing page...")
run_agent(dev,
  "Crea una landing page moderna en public/index.html. " +
  "Incluye CSS, contenido atractivo y responsive design.",
  { require_write: true }
)

# Tarea 2: Agregar interactividad
log("Agregando JavaScript...")
run_agent(dev,
  "Lee public/index.html y agrega JavaScript " +
  "para interactividad basica.",
  { require_write: true }
)

# Tarea 3: Optimizar
log("Optimizando...")
run_agent(dev,
  "Revisa public/index.html y optimiza el codigo. " +
  "Mejora performance y accesibilidad.",
  { require_write: true }
)

log("Workflow completado!")
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
