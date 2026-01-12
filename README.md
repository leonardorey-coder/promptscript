<div align="center">

# 🚀 PromptScript

> **Deterministic Agent Workflows, Written as Code**

[![Version](https://img.shields.io/badge/version-0.45.0-blue.svg)](https://github.com/your-org/prompts-lang)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh)

**A code-first language and runtime for building long-running, auditable, and safe LLM workflows**

[Features](#-key-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Examples](#-examples)

---

</div>

## 🎯 Why PromptScript?

<div align="center">

### Modern LLM agents fail in production because of:

| ❌ **Problem**                 | ✅ **PromptScript Solution**           |
| ------------------------------ | -------------------------------------- |
| Context bloat and rising costs | Memory tiers (STM/LTM) with forgetting |
| Lack of determinism and replay | Full timeline replay with diffs        |
| Unsafe tool execution          | Policy engine with sandboxing          |
| No clear memory model          | Explicit memory architecture           |

</div>

> **💡 PromptScript solves this by treating agent workflows like software, not chats.**

---

## 🧠 Core Concepts

### <img src="https://img.shields.io/badge/Runtime-Deterministic-blue?style=flat-square" alt="Deterministic Runtime" />

- Every action is explicit (`READ_FILE`, `WRITE_FILE`, `RUN_CMD`, …)
- All side effects are logged and replayable
- Budgets and policies are enforced at runtime

### <img src="https://img.shields.io/badge/Memory-Tiered-purple?style=flat-square" alt="Memory Architecture" />

- **Short-term memory (STM)** - Working set
- **Long-term memory (LTM)** - Project knowledge
- Human-like forgetting with checkpoints
- On-demand recall instead of transcript replay

### <img src="https://img.shields.io/badge/Plans-Validated-green?style=flat-square" alt="Plans Not Prompts" />

- LLMs return **plans**, not free-form text
- Plans are validated before execution
- Markdown → PlanSpec → PromptScript

### <img src="https://img.shields.io/badge/Replay-Full%20Timeline-orange?style=flat-square" alt="Replay & Audit" />

- Full timeline of actions
- Diffs per step
- Deterministic re-runs

---

## 💻 Example

```ps
log("Build landing page")

client = LLMClient({
  provider: "openrouter",
  model: "mistralai/devstral-2512:free",
  no_ask: true,
})

run_agent(client,
  "Create a complete, responsive landing page for cats",
  { require_write: true }
)

apply("REPORT", { message: "Landing created", done: true })
```

**How PromptScript executes this:**

1. 🧠 LLM generates a **plan**
2. ✅ Runtime validates the plan
3. 🔧 Tools execute under policy
4. 📝 Results are logged and replayable

---

## ✨ Key Features

<table>
<tr>
<td width="50%">

### 🎯 Deterministic Execution

- No hidden side effects
- Explicit tool calls
- Strong safety guarantees

</td>
<td width="50%">

### 🧠 Memory Architecture

- Short-term memory (STM)
- Long-term memory (LTM)
- Checkpoints + forgetting

</td>
</tr>
<tr>
<td width="50%">

### 🔗 Composable Workflows <kbd>v0.45+</kbd>

- Sub-workflows (`run`, `call`)
- Pipelines with quality gates
- Reusable workflow modules

</td>
<td width="50%">

### 💰 Token Efficiency

- Optional TOON serialization
- 20-40% token reduction
- Reduced context size and cost

</td>
</tr>
</table>

---

## 📊 PromptScript vs Others

<div align="center">

| Feature                        |             PromptScript              |            Visual Builders             |         Iterative Loop Runners         |
| ------------------------------ | :-----------------------------------: | :------------------------------------: | :------------------------------------: |
| <b>Deterministic runtime</b>   | <span style="color: green;">✅</span> |  <span style="color: red;">❌</span>   |  <span style="color: red;">❌</span>   |
| <b>Replay & audit</b>          | <span style="color: green;">✅</span> | <span style="color: orange;">⚠️</span> |  <span style="color: red;">❌</span>   |
| <b>Memory tiers</b>            | <span style="color: green;">✅</span> | <span style="color: orange;">⚠️</span> | <span style="color: orange;">⚠️</span> |
| <b>Explicit policies</b>       | <span style="color: green;">✅</span> |  <span style="color: red;">❌</span>   |  <span style="color: red;">❌</span>   |
| <b>Controlled side-effects</b> | <span style="color: green;">✅</span> | <span style="color: orange;">⚠️</span> |  <span style="color: red;">❌</span>   |
| <b>Composable workflows</b>    | <span style="color: green;">✅</span> | <span style="color: orange;">⚠️</span> |  <span style="color: red;">❌</span>   |
| <b>Human-like forgetting</b>   | <span style="color: green;">✅</span> |  <span style="color: red;">❌</span>   |  <span style="color: red;">❌</span>   |
| <b>CLI-first UX</b>            | <span style="color: green;">✅</span> |  <span style="color: red;">❌</span>   | <span style="color: orange;">⚠️</span> |
| <b>Production suitability</b>  | <span style="color: green;">✅</span> | <span style="color: orange;">⚠️</span> |  <span style="color: red;">❌</span>   |

> **PromptScript is designed for engineers who need control, auditability, and reproducibility — not just repeated attempts.**

</div>

---

## 🔍 What is an Iterative Loop Runner?

<div align="center">

### A system that repeatedly re-invokes an LLM on the same task until a stopping condition is met

</div>

**Typical characteristics:**

- 🔄 **Implicit loop** - Retry until done
- 📈 **Growing context** - Relies on accumulating outputs
- 🧠 **No explicit memory model** - Context grows linearly
- 🔁 **No replayable execution** - Cannot reproduce runs
- 🛡️ **No policy enforcement** - Limited safety controls
- 🔍 **Limited introspection** - Hard to debug failures

**This approach can be useful for short-lived tasks, but breaks down when:**

- ⏱️ Workflows grow long
- 💰 Costs matter
- 🔒 Safety is required
- 📋 Auditing is mandatory

---

## 🧠 Why PromptScript Is Different

PromptScript replaces implicit retry loops with:

<table>
<tr>
<td width="50%">

### 🎯 Explicit Plans

Instead of "try again", PromptScript asks: **what exactly should happen next?**

- Plans are validated before execution
- Each step is explicit and auditable
- No hidden retry logic

</td>
<td width="50%">

### 🧠 Structured Memory

- **STM/LTM architecture** - Clear memory model
- **On-demand recall** - Load only what's needed
- **Human-like forgetting** - Compact checkpoints

</td>
</tr>
<tr>
<td width="50%">

### 🔧 Controlled Execution

- Policy engine enforces safety
- Sandboxing prevents escapes
- Budgets prevent cost explosions

</td>
<td width="50%">

### 🔁 Deterministic Replay

- Full timeline of actions
- Diffs per step
- Reproducible runs

</td>
</tr>
</table>

---

## ⚠️ Why Repeated Iteration Breaks at Scale

<div align="center">

### The Context Growth Problem

```
┌─────────────────────────────────────────────────────────┐
│  Iterative Loop Approach                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Loop 1: [Context: 1K tokens]                          │
│    ↓                                                     │
│  Loop 2: [Context: 1K + 2K = 3K tokens]                │
│    ↓                                                     │
│  Loop 3: [Context: 3K + 2K = 5K tokens]                │
│    ↓                                                     │
│  Loop N: [Context: N×2K tokens] → 💥 Cost explosion   │
│                                                          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PromptScript Approach                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Plan → Execute → Log                                   │
│    ↓                                                     │
│  Memory: Checkpoint (compact)                           │
│    ↓                                                     │
│  Recall: Load only needed context                       │
│    ↓                                                     │
│  Forget: Compact to checkpoint                          │
│    ↓                                                     │
│  Result: Controlled context size → ✅ Predictable cost │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

</div>

**The math:**

- **Iterative loops**: Context grows as `O(n)` where `n` = number of iterations
- **PromptScript**: Context stays bounded via checkpoints and forgetting

**Real-world impact:**

| Scenario           | Iterative Loop | PromptScript |
| ------------------ | -------------- | ------------ |
| **10 iterations**  | ~20K tokens    | ~5K tokens   |
| **50 iterations**  | ~100K tokens   | ~8K tokens   |
| **100 iterations** | ~200K tokens   | ~10K tokens  |

> **💡 PromptScript's memory architecture prevents cost explosions at scale.**

---

---

## 🚀 Quick Start

### Installation

```bash
git clone https://github.com/your-org/prompts-lang
cd prompts-lang
bun install
```

### Run Your First Workflow

```bash
# Run a PromptScript file
psc run examples/workflow.ps --project .

# Compile and run from Markdown plan
psc run plan.md --from-md --project .

# Replay a previous run
psc replay <runId> --project .
```

---

## 📖 Documentation

<div align="center">

| 📚 Documentation                            | 📝 Description                          |
| ------------------------------------------- | --------------------------------------- |
| [**v0.45 Features**](docs/v045-features.md) | Sub-workflows, quality gates, pipelines |
| [**v0.4 Features**](docs/v04-features.md)   | Memory architecture, TOON, approvals    |
| [**Quick Start**](QUICKSTART-v045.md)       | Get started in 5 minutes                |
| [**Changelog**](CHANGELOG-v045.md)          | Version history and changes             |

</div>

---

## 🎨 Features v0.45

<div align="center">

### 🆕 New Features

| Feature                          | Description                                           |
| -------------------------------- | ----------------------------------------------------- |
| <b>🔗 Enhanced Sub-workflows</b> | Budgets per stage, chained replay                     |
| <b>✅ Quality Contracts</b>      | Structured contracts for verification                 |
| <b>🧠 Memory per Stage</b>       | Clean checkpoints and forgetting per stage            |
| <b>🏗️ Pipeline Pattern</b>       | Canonical pattern for human CI (build → verify → fix) |

### 📦 v0.4 Features

| Feature                       | Description                                  |
| ----------------------------- | -------------------------------------------- |
| <b>🔗 Sub-workflows</b>       | Composition with `run()` and `call()`        |
| <b>🧠 Hierarchical Memory</b> | STM/LTM with `build_memory()` and `recall()` |
| <b>🧹 STM Forgetting</b>      | Human-like compaction with checkpoints       |
| <b>📦 TOON Serialization</b>  | 20-40% token reduction                       |
| <b>🔍 RECALL Tool</b>         | Agents can explicitly request context        |
| <b>📚 Archive Memory</b>      | Archive STM to LTM with `archive()`          |
| <b>✅ Approvals</b>           | Approval system for critical actions         |

</div>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│      PromptScript (.ps)                 │
└─────────────────┬───────────────────────┘
                  │
                  ▼
          ┌───────────────┐
          │  Parser → AST │
          └───────┬───────┘
                  │
                  ▼
    ┌─────────────────────────────┐
    │  Runtime (Deterministic)    │
    ├─ LLM Adapter (Plan)         │
    ├─ Tool Registry              │
    ├─ Policy Engine              │
    └─ Sandbox                    │
                  │
                  ▼
          ┌───────────────┐
          │ Logs + Replay │
          └───────────────┘
```

---

## 📋 Technical Specifications

### Language (DSL)

- <kbd>Python-like</kbd> syntax
- Variables and functions
- Control flow: `if`, `while`, `break`, `return`
- Controlled builtins: `llm`, `tool`, `log`

### Runtime

- <kbd>Sequential</kbd> and deterministic execution
- <kbd>Strict</kbd> validation of LLM output
- <kbd>Sandboxing</kbd> of files and commands
- <kbd>Budget</kbd> enforcement (steps, time, tools)
- <kbd>Loop detection</kbd> for pathological patterns

### Observability

- <kbd>JSONL</kbd> logs per step
- <kbd>Serializable</kbd> state
- <kbd>Exact</kbd> replay without side-effects

---

## 🔒 Security

<div align="center">

### The runtime:

| ✅ **Guarantee**                | 📝 **Description**       |
| ------------------------------- | ------------------------ |
| **No arbitrary code execution** | Only explicit tool calls |
| **Workspace isolation**         | Cannot escape workspace  |
| **Input validation**            | All inputs validated     |
| **Strict allowlists**           | Policy-based permissions |
| **Full audit trail**            | Every action logged      |

> **🔐 The LLM has no direct access to the system.**

</div>

---

## 🗺️ Roadmap

<div align="center">

| Version      | Status | Features                                                                    |
| ------------ | :----: | --------------------------------------------------------------------------- |
| <b>v0.4</b>  |   ✅   | Runtime Core - Deterministic plans, Memory (STM/LTM), Replay + forgetting   |
| <b>v0.45</b> |   ✅   | Composable Pipelines - Sub-workflows, Quality gates, Pipeline orchestration |
| <b>v0.5</b>  |   🚧   | MCP Integration - External tools via MCP, Secure tool routing               |

</div>

---

## 💼 Use Cases

<div align="center">

<table>
<tr>
<td align="center" width="33%">

### 🤖 CI/CD Automation

Agent-based CI/CD pipelines with quality gates

</td>
<td align="center" width="33%">

### 🎨 UI Generation & QA

Automated UI generation and testing

</td>
<td align="center" width="33%">

### 🔄 Refactors & Migrations

Safe, auditable code refactoring

</td>
</tr>
<tr>
<td align="center" width="33%">

### ⏱️ Long-running Agents

Agents that run for hours or days

</td>
<td align="center" width="33%">

### 🏗️ Infrastructure Workflows

Infrastructure automation with safety

</td>
<td align="center" width="33%">

### 📚 Documentation

Automated documentation generation

</td>
</tr>
</table>

</div>

---

## 📝 Complete Example

```ps
system = "Respond ONLY with valid JSON containing action/args/done."

done = false

def step():
  plan = llm({
    "system": system,
    "user": "Next action to advance the project",
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

  if plan.done:
    done = true

while not done:
  step()
```

---

## 🤝 Contributing

<div align="center">

### We welcome contributions!

1. 📖 Read the RFCs
2. 🐛 Open an issue before major changes
3. 📋 Use the RFC process for breaking changes
4. 🔍 Keep PRs small and auditable

</div>

---

## 📄 License

<div align="center">

**PromptScript is open-core.**

- **The language and runtime core** are licensed under **Apache 2.0**
- **Managed Cloud services and enterprise features** are proprietary

</div>

---

## 💭 Philosophy

<div align="center">

> ### **LLM agents should behave like software, not chats.**

PromptScript treats every agent step as code:

- <b style="color: #4CAF50;">observable</b>
- <b style="color: #2196F3;">auditable</b>
- <b style="color: #FF9800;">reproducible</b>

---

### **LLMs reason. PromptScript decides.**

</div>

---

<div align="center">

**Made with ❤️ for engineers who want production-grade LLM workflows**

[⭐ Star us on GitHub](https://github.com/your-org/prompts-lang) • [📖 Read the Docs](docs/) • [🐛 Report Issues](https://github.com/your-org/prompts-lang/issues)

</div>
