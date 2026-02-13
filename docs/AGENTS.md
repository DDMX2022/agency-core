# AgencyCore – Agents

## Pipeline Order

```
Observer → PatternObserver → CruxFinder → Retriever → Guide → Planner → SafetyGuard → Implementor → ToolRunner → Gatekeeper → Learner
```

---

## 1. Observer

**Role**: First contact. Receives raw user input and produces a structured summary.

**Input**: Raw request string  
**Output Schema**: `ObserverOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Observer"` | Literal identifier |
| summary | string | Condensed description of the request |
| keywords | string[] | Extracted keywords (min 1) |
| domain | string | Classified domain (Dev, QA, Design, DevOps) |
| rawInput | string | Original input preserved |
| timestamp | ISO datetime | When the agent ran |

---

## 2. PatternObserver

**Role**: Finds recurring patterns and suggests approaches based on domain knowledge.

**Input**: PipelineContext with Observer output  
**Output Schema**: `PatternObserverOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"PatternObserver"` | Literal identifier |
| patterns | Pattern[] | Detected patterns with confidence scores |
| similarPastTasks | string[] | IDs of similar previous runs |
| suggestedApproach | string | Recommended strategy |
| timestamp | ISO datetime | When the agent ran |

---

## 3. CruxFinder (Understanding Agent)

**Role**: Decomposes the task into its core problem, sub-problems, assumptions, and constraints.

**Input**: PipelineContext with Observer + PatternObserver output  
**Output Schema**: `CruxFinderOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"CruxFinder"` | Literal identifier |
| coreProblem | string | The essential problem to solve |
| subProblems | string[] | Breakdown into smaller parts |
| assumptions | string[] | What we assume is true |
| constraints | string[] | Limitations and rules |
| requiredKnowledge | string[] | Knowledge areas needed |
| timestamp | ISO datetime | When the agent ran |

---

## 4. Retriever (Memory Recall)

**Role**: Fetches relevant lessons, playbooks, and portfolio examples from the memory system before planning.

**Input**: PipelineContext with CruxFinder + PatternObserver output  
**Output Schema**: `RetrieverOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Retriever"` | Literal identifier |
| lessons | string[] | Relevant approved lessons (top 5 by keyword match) |
| playbooks | string[] | Matching playbook content (top 3) |
| examples | string[] | High-scoring portfolio examples (top 3, score ≥ 15) |
| timestamp | ISO datetime | When the agent ran |

**Ranking**: Simple keyword overlap scoring from CruxFinder sub-problems, required knowledge, Observer keywords, and PatternObserver pattern names. Extensible to vector search.

---

## 5. Guide

**Role**: Creates a step-by-step execution plan from the problem decomposition. Incorporates retrieved lessons and previous Gatekeeper improvements.

**Input**: PipelineContext with CruxFinder + Retriever + previousImprovements  
**Output Schema**: `GuideOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Guide"` | Literal identifier |
| plan | GuideStep[] | Ordered steps with rationale |
| estimatedComplexity | `"low" \| "medium" \| "high"` | Task complexity |
| warnings | string[] | Cautions and constraints |
| bestPractices | string[] | Practices from lessons + improvements |
| timestamp | ISO datetime | When the agent ran |

---

## 6. Planner (Task Decomposer)

**Role**: Converts Guide strategy into a structured task graph with verification criteria, ownership, and dependencies.

**Input**: PipelineContext with Guide + CruxFinder output  
**Output Schema**: `PlannerOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Planner"` | Literal identifier |
| tasks | PlannerTask[] | Structured tasks (min 1) |
| timestamp | ISO datetime | When the agent ran |

**PlannerTask fields**: `id`, `title`, `description`, `owner` (implementor/qa/design), `steps`, `definitionOfDone`, `dependencies`

---

## 7. SafetyGuard (Pre-flight Security)

**Role**: Validates the full plan BEFORE execution. Blocks destructive commands, out-of-workspace paths, and secret exposure.

**Input**: PipelineContext with Planner + Guide output  
**Output Schema**: `SafetyGuardOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"SafetyGuard"` | Literal identifier |
| safe | boolean | Overall safety verdict |
| risks | string[] | Identified risk descriptions |
| blockedActions | string[] | Actions that were blocked |
| requiresApproval | boolean | Whether manual approval is needed |
| timestamp | ISO datetime | When the agent ran |

**Blocked patterns**: 30+ dangerous patterns including `rm -rf`, `sudo`, `drop database`, `process.env`, `api_key`, `password`, etc.

---

## 8. Implementor

**Role**: Executes the plan by generating file-creation and command actions. All actions are gated through the permissions system.

**Input**: PipelineContext with Guide + Observer output  
**Output Schema**: `ImplementorOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Implementor"` | Literal identifier |
| actions | ImplementorAction[] | Proposed actions |
| explanation | string | What was done and why |
| filesCreated | string[] | Files successfully created |
| filesModified | string[] | Files modified |
| commandsRun | string[] | Commands executed |
| blocked | string[] | Actions blocked by permissions |
| timestamp | ISO datetime | When the agent ran |

**Action Types**: `createFile`, `editFile`, `runCommand`, `readFile`

---

## 9. ToolRunner (Execution Scaffold)

**Role**: Optional execution layer. In mock mode (default), all commands are logged but not executed. In live mode, only safe commands within the workspace are executed.

**Input**: PipelineContext with Implementor output  
**Output Schema**: `ToolRunnerOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"ToolRunner"` | Literal identifier |
| executedCommands | ExecutedCommand[] | Commands processed (with command, success, output, mockMode) |
| skippedCommands | string[] | Commands blocked or skipped |
| timestamp | ISO datetime | When the agent ran |

---

## 10. Gatekeeper (Evaluator)

**Role**: Scores the entire run, approves/rejects lessons, decides on promotions, and generates improvements fed back to Guide.

**Input**: PipelineContext with all previous outputs  
**Output Schema**: `GatekeeperOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Gatekeeper"` | Literal identifier |
| scorecard | Scorecard | Scores across 5 dimensions |
| totalScore | number (0-25) | Sum of all scores |
| decision | GatekeeperDecision | Promotion/approval decisions |
| feedback | string | Human-readable feedback |
| improvements | string[] | Concrete improvements for Guide feedback loop |
| approvedLessons | string[] | Lessons that were approved |
| rejectedLessons | string[] | Lessons that were rejected |
| timestamp | ISO datetime | When the agent ran |

**Scorecard Dimensions** (each 0–5):
- **Correctness** – Did the implementation match the request?
- **Verification** – Was there a plan/verification step?
- **Safety** – Were there any safety violations?
- **Clarity** – Is the output clear and well-explained?
- **Autonomy** – How independently did the system work?

---

## 11. Learner

**Role**: A child-like agent that reflects on the run, extracts lessons, and proposes candidates for Gatekeeper review.

**Input**: PipelineContext with Observer + Guide + Implementor output  
**Output Schema**: `LearnerOutput`

| Field | Type | Description |
|-------|------|-------------|
| agent | `"Learner"` | Literal identifier |
| reflection | string | What was learned |
| candidateLessons | CandidateLesson[] | Proposed lessons |
| growthAreas | string[] | Areas to improve |
| currentLevel | number (0-3) | Current permission level |
| questionsForNextTime | string[] | Questions for future runs |
| timestamp | ISO datetime | When the agent ran |
