# Plan: Extensión VS Code para PromptScript (.ps)

## Objetivo

Crear una extensión de VS Code de código abierto que proporcione soporte completo para el lenguaje DSL PromptScript, incluyendo resaltado de sintaxis, autocompletado, validación, snippets y herramientas de desarrollo.

## Alcance

### Fase 1: Funcionalidades Core (MVP)

- Resaltado de sintaxis (TextMate grammar)
- Iconos para archivos `.ps`
- Snippets básicos
- Integración básica con CLI

### Fase 2: Language Server (LSP)

- Autocompletado de funciones built-in
- Validación de sintaxis en tiempo real
- Hover documentation
- Go to definition (para funciones y variables)
- Diagnostic errors

### Fase 3: Herramientas de Desarrollo

- Ejecutar archivos `.ps` desde VS Code
- Panel de salida para logs del runtime
- Integración con el CLI (`psc run`, `psc replay`)
- Tree view para proyectos PromptScript

### Fase 4: Características Avanzadas

- Debugging (breakpoints, step-through)
- Formateo automático
- Refactoring básico
- Integración con terminal integrado

---

## Estructura del Proyecto

```
promptscript-vscode/
├── .vscode/
│   └── launch.json
├── src/
│   ├── extension.ts              # Punto de entrada principal
│   ├── syntax/
│   │   └── promptscript.tmLanguage.json  # TextMate grammar
│   ├── language/
│   │   ├── server.ts             # Language Server (LSP)
│   │   ├── completion.ts         # Autocompletado
│   │   ├── diagnostics.ts        # Validación
│   │   ├── hover.ts              # Documentación hover
│   │   └── symbols.ts            # Símbolos y definiciones
│   ├── commands/
│   │   ├── run.ts                # Ejecutar archivo .ps
│   │   ├── replay.ts             # Replay de ejecución
│   │   └── validate.ts           # Validar sintaxis
│   ├── views/
│   │   └── projectTree.ts        # Tree view de proyecto
│   └── utils/
│       ├── cli.ts                # Integración con CLI
│       └── config.ts             # Configuración
├── snippets/
│   └── promptscript.json         # Snippets de código
├── icons/
│   └── promptscript.svg          # Icono de la extensión
├── package.json                   # Manifest de extensión
├── tsconfig.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

---

## Fase 1: Funcionalidades Core

### 1.1 Resaltado de Sintaxis (TextMate Grammar)

**Archivo**: `src/syntax/promptscript.tmLanguage.json`

**Tokens a reconocer**:

- Palabras reservadas: `def`, `class`, `if`, `else`, `while`, `for`, `return`, `break`, `with`, `policy`, `retry`, `backoff`, `timeout`, `guard`, `true`, `false`, `null`, `and`, `or`, `in`, `not`
- Funciones built-in: `log`, `len`, `range`, `LLMClient`, `plan`, `apply`, `run_agent`, `do`, `parallel`, `decide`, `judge`, `summarize`
- Acciones LLM: `READ_FILE`, `WRITE_FILE`, `PATCH_FILE`, `SEARCH`, `RUN_CMD`, `ASK_USER`, `REPORT`
- Tipos: strings (simples y multilinea con backticks), números, booleanos
- Operadores: `+`, `==`, `!=`, `and`, `or`, `not`, `in`
- Comentarios: `# ...`
- Objetos y arrays: `{ ... }`, `[ ... ]`

**Colores sugeridos**:

- Keywords: azul
- Built-ins: morado/cyan
- Strings: verde
- Numbers: naranja
- Comments: gris
- Actions: amarillo/verde claro

### 1.2 Iconos

**Archivo**: `icons/promptscript.svg`

- Icono personalizado para archivos `.ps`
- Configurar en `package.json` con `icon` y `fileAssociations`

### 1.3 Snippets Básicos

**Archivo**: `snippets/promptscript.json`

**Snippets a incluir**:

- `log` → `log("$1")`
- `llmclient` → Crear cliente LLM
- `run_agent` → Estructura básica de `run_agent`
- `plan` → Generar y aplicar plan
- `if` → Estructura condicional
- `while` → Bucle while
- `for` → Bucle for con range
- `def` → Definir función
- `class` → Definir clase
- `with policy` → Bloque de política
- `retry` → Bloque de reintentos
- `guard` → Invariante

### 1.4 Integración Básica con CLI

**Comandos**:

- `promptscript.run` - Ejecutar archivo actual
- `promptscript.validate` - Validar sintaxis

**Implementación**:

- Detectar si `psc` está instalado
- Ejecutar comandos en terminal integrado
- Mostrar errores en panel de problemas

---

## Fase 2: Language Server (LSP)

### 2.1 Arquitectura LSP

**Tecnología**: `vscode-languageclient` y servidor LSP personalizado

**Servidor LSP** (`src/language/server.ts`):

- Inicializar conexión con cliente
- Registrar providers: completion, hover, diagnostics, documentSymbol
- Parsear archivos `.ps` usando el parser existente del proyecto

### 2.2 Autocompletado

**Archivo**: `src/language/completion.ts`

**Contextos de autocompletado**:

1. **Funciones built-in**: Después de cualquier token
   - `log(`, `len(`, `range(`, `LLMClient(`, `plan(`, `apply(`, etc.
2. **Acciones LLM**: En objetos de plan
   - `action: "READ_FILE"`, `action: "WRITE_FILE"`, etc.
3. **Propiedades de objetos**: Para configuraciones comunes
   - `LLMClient({ provider: "`, `model: "`, etc.
4. **Variables locales**: Basado en scope del parser
5. **Palabras reservadas**: En contextos apropiados

**Información a mostrar**:

- Nombre de función/acción
- Signatura (parámetros)
- Descripción breve
- Link a documentación

### 2.3 Validación (Diagnostics)

**Archivo**: `src/language/diagnostics.ts`

**Validaciones a implementar**:

1. **Sintaxis**: Errores de parsing
   - Indentación incorrecta
   - Tokens inválidos
   - Estructuras mal formadas
2. **Semántica básica**:
   - Variables no definidas
   - Tipos incorrectos en operaciones
   - Argumentos faltantes en funciones
3. **Lint específico**:
   - Uso de `apply()` sin `plan()` previo (warning)
   - `run_agent()` sin `memory_key` en loops largos (sugerencia)
   - `guard` sin condición (error)

**Integración**:

- Usar el parser del proyecto (`src/dsl/parser.ts`)
- Mostrar errores en tiempo real
- Panel de problemas de VS Code

### 2.4 Hover Documentation

**Archivo**: `src/language/hover.ts`

**Información a mostrar al hover**:

- **Funciones built-in**: Descripción completa, parámetros, ejemplos
- **Acciones LLM**: Descripción, argumentos requeridos, ejemplos JSON
- **Keywords**: Descripción breve
- **Variables**: Tipo inferido, valor (si es constante)

**Fuente de datos**:

- Extraer de `docs/SYNTAX.md`
- Generar tipos TypeScript desde documentación
- Cachear para rendimiento

### 2.5 Go to Definition

**Archivo**: `src/language/symbols.ts`

**Símbolos a soportar**:

- Definiciones de funciones (`def`)
- Definiciones de clases (`class`)
- Variables (scope-aware)
- Funciones built-in (link a documentación)

**Implementación**:

- Indexar símbolos durante parsing
- Mapear posiciones en archivo
- Navegación cross-file (futuro)

---

## Fase 3: Herramientas de Desarrollo

### 3.1 Ejecutar Archivos .ps

**Comando**: `promptscript.run`

**Funcionalidad**:

- Detectar archivo actual o seleccionado
- Ejecutar `psc run <archivo> --project <workspace>`
- Mostrar output en terminal integrado
- Capturar errores y mostrarlos en problemas

**Configuración**:

- Variables de entorno (API keys)
- Opciones de CLI (provider, model, budgets)
- Workspace settings

### 3.2 Panel de Salida

**Funcionalidad**:

- Canal dedicado "PromptScript" en Output panel
- Logs estructurados del runtime
- Filtros por nivel (info, warn, error)
- Links a archivos/lineas mencionadas en logs

### 3.3 Integración con CLI

**Comandos adicionales**:

- `promptscript.replay <runId>` - Replay de ejecución
- `promptscript.compile` - Compilar Markdown a PromptScript
- `promptscript.validate.workspace` - Validar todos los `.ps` del workspace

**Status Bar**:

- Indicador de versión de `psc` instalada
- Estado de ejecución (running/stopped)

### 3.4 Tree View de Proyecto

**Archivo**: `src/views/projectTree.ts`

**Vista**:

- Archivos `.ps` del workspace
- Ejecuciones recientes (desde logs)
- Memoria keys activas (si aplica)
- Estado de cada archivo (valid/invalid)

**Acciones**:

- Click para abrir archivo
- Context menu: Run, Validate, Replay

---

## Fase 4: Características Avanzadas

### 4.1 Debugging

**Funcionalidad**:

- Breakpoints en archivos `.ps`
- Step-through execution
- Inspección de variables
- Call stack del runtime

**Implementación**:

- Protocolo de debugging personalizado
- Integración con runtime de PromptScript
- Adapter de debugging para VS Code

### 4.2 Formateo Automático

**Funcionalidad**:

- Formatear documento con `Shift+Alt+F`
- Formatear selección
- Auto-format on save

**Reglas**:

- Indentación consistente (2 espacios)
- Espacios alrededor de operadores
- Líneas en blanco entre bloques lógicos
- Alineación de objetos/arrays

### 4.3 Refactoring Básico

**Operaciones**:

- Rename variable/function (scope-aware)
- Extract function
- Inline variable
- Organize imports (si aplica)

### 4.4 Terminal Integrado

**Funcionalidad**:

- Terminal dedicado para PromptScript
- Auto-activación al ejecutar
- Syntax highlighting en output
- Click para navegar a archivos

---

## Dependencias Técnicas

### Dependencias NPM

```json
{
  "dependencies": {
    "vscode-languageclient": "^9.0.0",
    "vscode-languageserver": "^9.0.0",
    "vscode-languageserver-textdocument": "^1.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.85.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### Integración con Proyecto Principal

**Opciones**:

1. **Monorepo**: Incluir extensión en mismo repo
2. **Repo separado**: Repo independiente, importar parser como dependencia
3. **Package publicado**: Publicar parser como npm package, extensión lo consume

**Recomendación**: Repo separado con parser como dependencia npm (cuando esté listo)

---

## Configuración de la Extensión

### package.json (Manifest)

**Campos clave**:

- `name`: `promptscript-vscode`
- `displayName`: `PromptScript`
- `description`: `Language support for PromptScript DSL`
- `version`: `0.1.0`
- `engines.vscode`: `^1.85.0`
- `categories`: `["Programming Languages", "Linters"]`
- `activationEvents`: `["onLanguage:promptscript"]`
- `contributes`:
  - `languages`: Definir lenguaje `.ps`
  - `grammars`: TextMate grammar
  - `snippets`: Snippets
  - `commands`: Comandos de la extensión
  - `configuration`: Settings de la extensión

### Configuración de Usuario

**Settings**:

- `promptscript.cli.path`: Ruta al ejecutable `psc`
- `promptscript.cli.defaultProvider`: Proveedor LLM por defecto
- `promptscript.cli.defaultModel`: Modelo por defecto
- `promptscript.validation.enable`: Habilitar validación
- `promptscript.formatting.enable`: Habilitar formateo
- `promptscript.debug.enable`: Habilitar debugging

---

## Testing

### Estrategia de Testing

1. **Unit Tests**:
   - Parsing de sintaxis
   - Autocompletado
   - Validación
   - Snippets

2. **Integration Tests**:
   - Comandos de CLI
   - Language Server
   - Tree view

3. **E2E Tests**:
   - Flujo completo: abrir archivo → autocompletar → ejecutar
   - Validación de errores
   - Hover documentation

### Herramientas

- `@vscode/test-electron` para tests de extensión
- `mocha` o `jest` para unit tests
- Test fixtures con archivos `.ps` de ejemplo

---

## Documentación

### README.md

**Secciones**:

- Instalación
- Características
- Configuración
- Uso básico
- Troubleshooting
- Contribuir

### Guía de Contribución

- Setup del entorno de desarrollo
- Estructura del código
- Cómo agregar nuevas características
- Proceso de PR

---

## Roadmap de Implementación

### Sprint 1 (2 semanas): Fase 1 - Core

- [ ] Setup del proyecto
- [ ] TextMate grammar básico
- [ ] Iconos y file associations
- [ ] Snippets esenciales
- [ ] Comando básico de ejecución

### Sprint 2 (2 semanas): Fase 2 - LSP Básico

- [ ] Setup de Language Server
- [ ] Autocompletado de built-ins
- [ ] Validación básica de sintaxis
- [ ] Hover documentation básico

### Sprint 3 (2 semanas): Fase 2 - LSP Avanzado

- [ ] Go to definition
- [ ] Diagnostics avanzados
- [ ] Autocompletado contextual
- [ ] Documentación completa

### Sprint 4 (2 semanas): Fase 3 - Herramientas

- [ ] Panel de salida
- [ ] Integración completa con CLI
- [ ] Tree view básico
- [ ] Comandos adicionales

### Sprint 5 (2 semanas): Fase 4 - Avanzado

- [ ] Formateo automático
- [ ] Refactoring básico
- [ ] Mejoras de UX
- [ ] Documentación y ejemplos

### Sprint 6 (1 semana): Polish y Release

- [ ] Testing completo
- [ ] Optimización de rendimiento
- [ ] Preparación para marketplace
- [ ] Release v0.1.0

**Total estimado**: 11 semanas (~3 meses)

---

## Consideraciones de Open Source

### Licencia

- Usar misma licencia que proyecto principal (Apache 2.0)
- Incluir LICENSE en repo

### Repositorio

- GitHub público
- Issues y PRs abiertos
- Contributing guidelines
- Code of conduct

### Marketplace

- Publicar en VS Code Marketplace
- Badges de calidad (CI/CD, tests)
- Screenshots y demo GIF
- Documentación completa

### Mantenimiento

- Roadmap público
- Versionado semántico
- Changelog detallado
- Comunicación con comunidad

---

## Recursos y Referencias

### Documentación VS Code Extension API

- https://code.visualstudio.com/api
- https://code.visualstudio.com/api/language-extensions/overview

### Language Server Protocol

- https://microsoft.github.io/language-server-protocol/

### Ejemplos de Extensiones Similares

- Python extension
- JavaScript/TypeScript extension
- Go extension

### TextMate Grammar

- https://macromates.com/manual/en/language_grammars

---

## Notas de Implementación

### Parser del Proyecto Principal

**Ubicación**: `src/dsl/parser.ts`, `src/dsl/tokenizer.ts`

**Uso en extensión**:

- Importar como dependencia npm (cuando esté publicado)
- O copiar lógica de parsing (mantener sincronizado)
- Preferir dependencia para evitar duplicación

### Sincronización con Proyecto Principal

- Seguir versiones del lenguaje
- Actualizar grammar cuando cambie sintaxis
- Mantener documentación alineada
- Tests de compatibilidad con diferentes versiones

### Rendimiento

- Lazy loading de Language Server
- Cachear resultados de parsing
- Debounce en validación
- Optimizar autocompletado (limitar resultados)

---

## Métricas de Éxito

### Técnicas

- Tiempo de activación < 500ms
- Autocompletado < 100ms
- Validación < 200ms
- 0 memory leaks

### Usuario

- Instalaciones en marketplace
- Rating > 4.5 estrellas
- Issues resueltos rápidamente
- Contribuciones de comunidad

---

## Conclusión

Este plan proporciona una hoja de ruta completa para crear una extensión de VS Code profesional y de código abierto para PromptScript. La implementación por fases permite iterar rápidamente y obtener feedback temprano, mientras se construyen las bases para características avanzadas.

**Próximos pasos**:

1. Revisar y aprobar plan
2. Setup inicial del proyecto
3. Comenzar Sprint 1 (Fase 1 - Core)
