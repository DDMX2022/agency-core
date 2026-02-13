# AgencyCore – Safety & Permissions

## Guiding Principle

**Secure by default.** Defence-in-depth: SafetyGuard validates the plan pre-flight, the Implementor enforces permissions at runtime, and the ToolRunner blocks dangerous commands at execution time.

## Permission Levels

| Level | Name | Capabilities |
|-------|------|-------------|
| **L0** | Read-only Planning | Can only read files. No writes, no commands. |
| **L1** | Safe File Edits | Can create/edit files within the workspace sandbox. Non-destructive commands only. No git. |
| **L2** | Git Branch + Commit | Everything in L1 plus git operations (branch, commit, push). |
| **L3** | Review + Mentor | Full capabilities. Can review and mentor other agents. |

## Default Behaviour

- New Learner agents start at **L0**
- Promotion is controlled **exclusively** by the Gatekeeper
- Promotion requires a total score of 20+ out of 25
- Cloning requires a total score of 22+ out of 25

## Three-Layer Safety Model

### Layer 1: SafetyGuard (Pre-flight)

The SafetyGuard agent validates the entire plan BEFORE any execution:

**Blocked patterns** (30+ patterns):
```
rm -rf, rm -r /, mkfs, dd if=, chmod -R 777, sudo, > /dev/sda,
format c:, del /f /s, shutdown, reboot, drop database, drop table,
truncate table, delete from, process.env, api_key, api_secret,
password, secret_key, private_key
```

**Checks performed**:
- Each Planner task step is scanned for dangerous patterns
- Out-of-workspace paths (`/etc/`, `/usr/`, `/root/`, `C:\Windows`) are blocked
- Permission level adequacy is verified (L0 cannot have implementor tasks)
- High-complexity plans are flagged for review
- Secret exposure via `console.log` is detected

### Layer 2: Implementor (Permission Gating)

The Implementor filters actions through the permissions system at runtime:

```
Action received
     │
     ├── Is destructive? ──── YES ──▶ BLOCKED (requires approval)
     │
     ├── Is L0? ──── YES ──▶ Only readFile allowed
     │
     ├── Is command blocked? ──── YES ──▶ BLOCKED
     │
     ├── Is path outside workspace? ──── YES ──▶ BLOCKED
     │
     ├── Is git command at L1? ──── YES ──▶ BLOCKED
     │
     └── Otherwise ──▶ ALLOWED
```

### Layer 3: ToolRunner (Execution Safety)

The ToolRunner provides a final safety gate at execution time:
- **Mock mode** (default): Commands are logged but never executed
- **Live mode**: Only safe commands within the workspace are executed
- Dangerous commands are blocked regardless of mode
- Commands requiring approval are skipped

## Gatekeeper's Role in Safety

The Gatekeeper evaluates safety as one of its 5 scoring dimensions:
- **Safety score 5**: No dangerous actions attempted
- **Safety score 3-4**: Minor issues, self-corrected
- **Safety score 1-2**: Dangerous actions attempted, flagged for review
- **Safety score 0**: Critical safety violation

The Gatekeeper also generates **improvements** that feed back to Guide on the next run, including safety-related recommendations like "Add explicit safety checks before destructive operations".

## Audit Trail

Every pipeline run stores a complete artifact in `/memory/logs/`, including:
- All 11 agent outputs
- SafetyGuard risk assessment
- Which actions were proposed
- Which actions were blocked (and why)
- ToolRunner execution log (what ran, what was skipped)
- The Gatekeeper's scorecard, improvements, and decisions

This provides a full audit trail for every action the system takes or attempts.
