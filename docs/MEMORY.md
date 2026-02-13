# AgencyCore – Memory System

## Overview

All memory is stored as human-readable files on the local file system. No database required. Every file is explicit – you can inspect, version-control, and audit everything.

## Directory Structure

```
memory/
├── lessons/        # Approved lessons (markdown + JSON front-matter)
├── playbooks/      # Step-by-step guides (markdown)
├── portfolio/      # Completed task records with scorecards (JSON)
├── logs/           # Full pipeline run artifacts (JSON)
└── candidates/     # Candidate lessons awaiting Gatekeeper approval (JSON)
```

## File Formats

### Lessons (`/memory/lessons/*.md`)

Approved lessons are stored as Markdown files with JSON front-matter:

```markdown
---
{
  "id": "abc-123-working-in-dev-domain",
  "title": "Working in Dev domain",
  "content": "When working in the Dev domain, plan first then implement.",
  "tags": ["dev", "planning"],
  "source": "run:abc-123",
  "approvedAt": "2026-02-13T12:00:00.000Z",
  "approvedBy": "Gatekeeper"
}
---

# Working in Dev domain

When working in the Dev domain, plan first then implement.
```

### Candidate Lessons (`/memory/candidates/*.json`)

Before approval, lessons are stored as JSON in the candidates directory:

```json
{
  "id": "abc-123-working-in-dev-domain",
  "title": "Working in Dev domain",
  "content": "When working in the Dev domain, plan first then implement.",
  "tags": ["dev", "planning"],
  "source": "run:abc-123",
  "proposedAt": "2026-02-13T12:00:00.000Z",
  "runId": "abc-123"
}
```

### Portfolio (`/memory/portfolio/*.json`)

```json
{
  "runId": "abc-123-def-456",
  "request": "Create a hello world function",
  "completedAt": "2026-02-13T12:00:00.000Z",
  "scorecard": {
    "correctness": 4,
    "verification": 3,
    "safety": 5,
    "clarity": 4,
    "autonomy": 3
  },
  "totalScore": 19,
  "artifactPath": "/path/to/memory/logs/abc-123-def-456.json"
}
```

### Run Artifacts (`/memory/logs/*.json`)

Full pipeline output including all 11 agent outputs (Observer, PatternObserver, CruxFinder, Retriever, Guide, Planner, SafetyGuard, Implementor, ToolRunner, Gatekeeper, Learner), the original request, timestamps, and success status. See `RunArtifact` schema for the complete structure.

## Retriever Integration

The **Retriever** agent queries the memory system before planning:
- **Lessons**: Searches approved lessons by keyword match (title, content, tags) against CruxFinder sub-problems, required knowledge, Observer keywords, and PatternObserver pattern names. Returns top 5.
- **Playbooks**: Searches playbook markdown files by keyword overlap. Returns top 3.
- **Portfolio**: Filters high-scoring runs (score ≥ 15). Returns top 3 as examples.

This retrieved context is passed to Guide, which incorporates it into `bestPractices`.

## Feedback Loop: Gatekeeper → Guide

After each run, the Gatekeeper generates `improvements` (e.g., "Add more thorough testing"). These are stored in the Orchestrator and injected into the next Guide run via `context.previousImprovements`, which Guide incorporates into its `bestPractices` output.

## Approval Workflow

```
Learner proposes candidate lesson
          │
          ▼
  Stored in /memory/candidates/
          │
          ▼
  Gatekeeper evaluates
          │
    ┌─────┴─────┐
    │           │
 APPROVE     REJECT
    │           │
    ▼           ▼
 Moved to    Deleted from
 /lessons/   /candidates/
```

### Rules
1. **Only the Gatekeeper** can approve or reject lessons
2. Approval requires a total pipeline score ≥ 15 out of 25
3. Rejected lessons are permanently deleted from candidates
4. Approved lessons get a `approvedBy: "Gatekeeper"` stamp and `approvedAt` timestamp
5. Approved lessons are converted to Markdown format with JSON front-matter

## Versioning

Since all memory is file-based, you can version it with git:

```bash
cd memory/
git init
git add -A
git commit -m "Memory snapshot"
```

This gives you full history of all lessons learned, tasks completed, and evaluations made.

## API Access

- `GET /memory/lessons` – List all approved lessons
- `GET /memory/portfolio` – List all portfolio entries
- `GET /runs/:id` – Load a specific run artifact
