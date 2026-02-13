# OpenClaw Integration

AgencyCore exposes a **Message Envelope** protocol that allows external orchestrators (like OpenClaw) to send tasks and receive structured results.

## Message Envelope Protocol

Every message flowing between OpenClaw and AgencyCore uses a typed envelope:

```typescript
interface MessageEnvelope {
  type: "TASK" | "RESULT" | "APPROVAL_REQUEST" | "EVENT" | "ERROR";
  runId: string;       // UUID – ties request to response
  from: string;        // Sender identifier
  to: string;          // Receiver identifier
  topic: string;       // What the message is about
  payload: unknown;    // Type-specific payload
  requiresApproval: boolean;
  timestamp: string;   // ISO 8601
}
```

### Envelope Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `TASK` | OpenClaw → AgencyCore | Request to execute the pipeline |
| `RESULT` | AgencyCore → OpenClaw | Pipeline execution result |
| `APPROVAL_REQUEST` | AgencyCore → Human | Action needs human sign-off |
| `EVENT` | Either direction | Informational notifications |
| `ERROR` | AgencyCore → OpenClaw | Pipeline or validation failure |

## API Endpoints

### `POST /integrations/openclaw/message`

Receives a TASK envelope, runs the full 11-agent pipeline, and returns a RESULT envelope.

**Headers:**
- `x-openclaw-secret` (optional) – shared secret for authentication

**Request Body:**
```json
{
  "type": "TASK",
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "from": "OpenClaw",
  "to": "AgencyCore",
  "topic": "build-login-feature",
  "payload": {
    "request": "Build a login form with email and password validation",
    "priority": "high",
    "metadata": { "project": "my-app" }
  },
  "requiresApproval": false,
  "timestamp": "2025-01-15T10:00:00.000Z"
}
```

**Response (200):**
```json
{
  "type": "RESULT",
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "from": "AgencyCore",
  "to": "OpenClaw",
  "topic": "build-login-feature",
  "payload": {
    "success": true,
    "data": {
      "totalScore": 18,
      "scorecard": { "correctness": 4, "verification": 3, "safety": 4, "clarity": 4, "autonomy": 3 },
      "actions": [...],
      "filesCreated": ["src/components/LoginForm.tsx"],
      "filesModified": [],
      "commandsRun": ["npm test"]
    },
    "summary": "Login form implemented with email validation...",
    "artifactId": "run-uuid-here"
  },
  "timestamp": "2025-01-15T10:00:05.000Z"
}
```

### `POST /integrations/openclaw/approval`

Submit an approval decision for a pending action.

**Request Body:**
```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "approved": true,
  "reason": "Looks good to deploy",
  "approvedBy": "admin@company.com",
  "timestamp": "2025-01-15T10:01:00.000Z"
}
```

### `GET /integrations/openclaw/approvals`

List all pending approval requests.

## Authentication

Set `OPENCLAW_SHARED_SECRET` as an environment variable. If set, every request must include the `x-openclaw-secret` header with a matching value. If unset, all requests are accepted (open mode).

```bash
OPENCLAW_SHARED_SECRET=my-secret-key pnpm dev
```

## Architecture

```
OpenClaw ──TASK──▶ openclawRoutes.ts ──▶ OpenClawAdapter ──▶ Orchestrator
                                                                 │
OpenClaw ◀─RESULT─ openclawRoutes.ts ◀── OpenClawAdapter ◀──────┘
```

The `OpenClawAdapter` is a stateless bridge that:
1. Validates inbound messages against `OpenClawInboundSchema`
2. Extracts the `payload.request` string
3. Passes it to the Orchestrator's 11-agent pipeline
4. Wraps the result in an `OpenClawOutbound` envelope
5. Tracks pending approvals for actions that require human sign-off
