# AgencyCore – Architecture

## Overview

AgencyCore is a local-first, modular multi-agent system designed for safe, inspectable AI-assisted task execution. It draws inspiration from OpenClaw-style agent orchestration but runs fully standalone with no external dependencies.

## Pipeline Flow

```
User Request
     │
     ▼
┌──────────┐   ┌─────────────────┐   ┌────────────┐   ┌───────────┐
│ Observer  │──▶│ PatternObserver │──▶│ CruxFinder │──▶│ Retriever │
└──────────┘   └─────────────────┘   └────────────┘   └───────────┘
                                                            │
     ┌──────────────────────────────────────────────────────┘
     ▼
┌─────────┐   ┌──────────┐   ┌─────────────┐   ┌─────────────┐
│  Guide  │──▶│ Planner  │──▶│ SafetyGuard │──▶│ Implementor │
└─────────┘   └──────────┘   └─────────────┘   └─────────────┘
                                                      │
     ┌────────────────────────────────────────────────┘
     ▼
┌────────────┐   ┌────────────┐   ┌──────────┐
│ ToolRunner │──▶│ Gatekeeper │──▶│ Learner  │
└────────────┘   └────────────┘   └──────────┘
                       │
                       ▼
                 Run Artifact
              (stored in /memory)
```

## Agent Chain Order (11 agents)

1. **Observer** – Receives raw input, classifies domain, extracts keywords
2. **PatternObserver** – Matches patterns, finds similar past tasks
3. **CruxFinder** – Decomposes into core problem + sub-problems
4. **Retriever** – Fetches relevant lessons, playbooks, and examples from memory
5. **Guide** – Creates step-by-step plan, incorporates retrieved lessons + previous improvements
6. **Planner** – Decomposes Guide plan into structured tasks with ownership and dependencies
7. **SafetyGuard** – Pre-flight security validation of the plan before execution
8. **Implementor** – Generates file/command actions (gated by permissions)
9. **ToolRunner** – Optional execution layer (mock mode by default)
10. **Gatekeeper** – Scores, approves/rejects lessons, decides promotions, generates improvements
11. **Learner** – Reflects, proposes candidate lessons

## Feedback Loops

```
Gatekeeper.improvements ──▶ Guide (previousImprovements on next run)
Gatekeeper.decision     ──▶ Learner (promote permission level)
Gatekeeper              ──▶ Memory (approve/reject lessons)
```

- **Gatekeeper → Guide**: Improvements from Gatekeeper are stored and injected into Guide's `bestPractices` on the next pipeline run, enabling iterative quality improvement.
- **Gatekeeper → Learner**: When the Gatekeeper promotes the Learner (score ≥ 20), the new permission level persists across runs.
- **Gatekeeper → Memory**: Approved lessons are written to `/memory/lessons/`, rejected ones are deleted from `/memory/candidates/`.

## Data Flow

Each agent receives:
- The original `input` (request string)
- A `PipelineContext` object containing all previous agent outputs

Each agent returns a strongly-typed JSON object validated by its Zod schema.

The Orchestrator:
1. Creates a unique `runId` (UUID)
2. Calls each of the 11 agents in order
3. Validates each output against its schema
4. Passes context forward
5. Executes feedback loops
6. Stores the complete `RunArtifact` in `/memory/logs/{runId}.json`
7. Stores a `PortfolioEntry` in `/memory/portfolio/{runId}.json`

## Key Design Decisions

### Dependency Injection
The `LLMProvider` interface allows swapping between MockLLM (deterministic, no API keys) and real providers (OpenAI, Gemini, Ollama) without changing any agent code.

### Schema-First Validation
Every agent output is validated against a Zod schema immediately after generation. If validation fails, the pipeline stops with a clear error message.

### Permission Gating
The Implementor's actions are filtered through the permissions system before being reported. Destructive commands are blocked by default. Path access is restricted to the configured workspace.

### Pre-Flight Safety
The SafetyGuard validates the entire plan BEFORE execution, blocking dangerous patterns, out-of-workspace paths, and secret exposure. This provides defence-in-depth alongside the Implementor's runtime permission checks.

### Memory as Files
All state is stored as human-readable files on disk:
- **Lessons** – Markdown with JSON front-matter
- **Playbooks** – Markdown guides
- **Portfolio** – JSON entries with scorecards
- **Logs** – Full run artifacts as JSON

### Gatekeeper Control
Only the Gatekeeper can:
- Approve lessons (move from candidates to approved)
- Promote the Learner to a higher level
- Allow cloning
- Generate improvements fed back to Guide

## Module Structure

```
src/
├── core/
│   ├── agents/          # 10 agent files (Observer, PatternObserver, CruxFinder,
│   │                    #   Retriever, Guide, Planner, SafetyGuard,
│   │                    #   Implementor, Learner, Gatekeeper)
│   ├── tools/           # ToolRunner (execution scaffold)
│   ├── pipeline/        # Orchestrator
│   ├── schemas/         # Zod schemas for all 11 agent outputs
│   ├── memory/          # File-based memory manager
│   └── permissions/     # Capability + approval system
├── providers/           # LLM provider interface + MockLLM
├── server/              # Fastify REST API
├── cli/                 # CLI entry point + example run
└── tests/               # Vitest test suites
```

## Extension Points

- **New Domains**: Add domain-specific logic in Observer's `classifyDomain`
- **New LLMs**: Implement the `LLMProvider` interface
- **New Agents**: Add to the pipeline by extending the Orchestrator
- **Live Execution**: Set ToolRunner to `mockMode: false` and implement real command execution
- **External Runners**: The JSON output format is compatible with OpenClaw and other agent frameworks
