import { z } from "zod";

// ── Shared types ──────────────────────────────────────────────────────
export const AgentNameSchema = z.enum([
  "Observer",
  "PatternObserver",
  "CruxFinder",
  "Retriever",
  "Guide",
  "Planner",
  "SafetyGuard",
  "Implementor",
  "ToolRunner",
  "Learner",
  "Gatekeeper",
]);
export type AgentName = z.infer<typeof AgentNameSchema>;

// ── Observer ──────────────────────────────────────────────────────────
export const ObserverOutputSchema = z.object({
  agent: z.literal("Observer"),
  summary: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  domain: z.string().min(1),
  rawInput: z.string(),
  timestamp: z.string().datetime(),
});
export type ObserverOutput = z.infer<typeof ObserverOutputSchema>;

// ── PatternObserver ───────────────────────────────────────────────────
export const PatternSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type Pattern = z.infer<typeof PatternSchema>;

export const PatternObserverOutputSchema = z.object({
  agent: z.literal("PatternObserver"),
  patterns: z.array(PatternSchema).min(1),
  similarPastTasks: z.array(z.string()),
  suggestedApproach: z.string().min(1),
  timestamp: z.string().datetime(),
});
export type PatternObserverOutput = z.infer<typeof PatternObserverOutputSchema>;

// ── CruxFinder (Understanding Agent) ─────────────────────────────────
export const CruxFinderOutputSchema = z.object({
  agent: z.literal("CruxFinder"),
  coreProblem: z.string().min(1),
  subProblems: z.array(z.string()).min(1),
  assumptions: z.array(z.string()),
  constraints: z.array(z.string()),
  requiredKnowledge: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type CruxFinderOutput = z.infer<typeof CruxFinderOutputSchema>;

// ── Retriever ─────────────────────────────────────────────────────────
export const RetrieverOutputSchema = z.object({
  agent: z.literal("Retriever"),
  lessons: z.array(z.string()),
  playbooks: z.array(z.string()),
  examples: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type RetrieverOutput = z.infer<typeof RetrieverOutputSchema>;

// ── Guide ─────────────────────────────────────────────────────────────
export const GuideStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  action: z.string().min(1),
  rationale: z.string().min(1),
  expectedOutput: z.string().min(1),
});
export type GuideStep = z.infer<typeof GuideStepSchema>;

export const GuideOutputSchema = z.object({
  agent: z.literal("Guide"),
  plan: z.array(GuideStepSchema).min(1),
  estimatedComplexity: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string()),
  bestPractices: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type GuideOutput = z.infer<typeof GuideOutputSchema>;

// ── Planner (Task Decomposer) ─────────────────────────────────────────
export const PlannerTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  owner: z.enum(["implementor", "qa", "design"]),
  steps: z.array(z.string()).min(1),
  definitionOfDone: z.array(z.string()).min(1),
  dependencies: z.array(z.string()),
});
export type PlannerTask = z.infer<typeof PlannerTaskSchema>;

export const PlannerOutputSchema = z.object({
  agent: z.literal("Planner"),
  tasks: z.array(PlannerTaskSchema).min(1),
  timestamp: z.string().datetime(),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ── SafetyGuard ───────────────────────────────────────────────────────
export const SafetyGuardOutputSchema = z.object({
  agent: z.literal("SafetyGuard"),
  safe: z.boolean(),
  risks: z.array(z.string()),
  blockedActions: z.array(z.string()),
  requiresApproval: z.boolean(),
  timestamp: z.string().datetime(),
});
export type SafetyGuardOutput = z.infer<typeof SafetyGuardOutputSchema>;

// ── Implementor ───────────────────────────────────────────────────────
export const ImplementorActionSchema = z.object({
  type: z.enum(["createFile", "editFile", "runCommand", "readFile"]),
  path: z.string().optional(),
  content: z.string().optional(),
  command: z.string().optional(),
  requiresApproval: z.boolean(),
  isDestructive: z.boolean(),
});
export type ImplementorAction = z.infer<typeof ImplementorActionSchema>;

export const ImplementorOutputSchema = z.object({
  agent: z.literal("Implementor"),
  actions: z.array(ImplementorActionSchema).min(1),
  explanation: z.string().min(1),
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  commandsRun: z.array(z.string()),
  blocked: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type ImplementorOutput = z.infer<typeof ImplementorOutputSchema>;

// ── ToolRunner ────────────────────────────────────────────────────────
export const ToolRunnerOutputSchema = z.object({
  agent: z.literal("ToolRunner"),
  executedCommands: z.array(z.object({
    command: z.string(),
    success: z.boolean(),
    output: z.string(),
    mockMode: z.boolean(),
  })),
  skippedCommands: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type ToolRunnerOutput = z.infer<typeof ToolRunnerOutputSchema>;

// ── Learner ───────────────────────────────────────────────────────────
export const CandidateLessonSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()),
  source: z.string().min(1),
});
export type CandidateLesson = z.infer<typeof CandidateLessonSchema>;

export const LearnerOutputSchema = z.object({
  agent: z.literal("Learner"),
  reflection: z.string().min(1),
  candidateLessons: z.array(CandidateLessonSchema),
  growthAreas: z.array(z.string()),
  currentLevel: z.number().int().min(0).max(3),
  questionsForNextTime: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type LearnerOutput = z.infer<typeof LearnerOutputSchema>;

// ── Gatekeeper (Evaluator) ────────────────────────────────────────────
export const ScorecardSchema = z.object({
  correctness: z.number().int().min(0).max(5),
  verification: z.number().int().min(0).max(5),
  safety: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  autonomy: z.number().int().min(0).max(5),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

export const GatekeeperDecisionSchema = z.object({
  approveLesson: z.boolean(),
  promote: z.boolean(),
  newLevel: z.number().int().min(0).max(3).optional(),
  allowClone: z.boolean(),
});
export type GatekeeperDecision = z.infer<typeof GatekeeperDecisionSchema>;

export const GatekeeperOutputSchema = z.object({
  agent: z.literal("Gatekeeper"),
  scorecard: ScorecardSchema,
  totalScore: z.number().min(0).max(25),
  decision: GatekeeperDecisionSchema,
  feedback: z.string().min(1),
  improvements: z.array(z.string()),
  approvedLessons: z.array(z.string()),
  rejectedLessons: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type GatekeeperOutput = z.infer<typeof GatekeeperOutputSchema>;

// ── Pipeline Run Artifact ─────────────────────────────────────────────
export const RunArtifactSchema = z.object({
  runId: z.string().uuid(),
  request: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  observer: ObserverOutputSchema,
  patternObserver: PatternObserverOutputSchema,
  cruxFinder: CruxFinderOutputSchema,
  retriever: RetrieverOutputSchema,
  guide: GuideOutputSchema,
  planner: PlannerOutputSchema,
  safetyGuard: SafetyGuardOutputSchema,
  implementor: ImplementorOutputSchema,
  toolRunner: ToolRunnerOutputSchema,
  gatekeeper: GatekeeperOutputSchema,
  learner: LearnerOutputSchema,
  success: z.boolean(),
  error: z.string().optional(),
});
export type RunArtifact = z.infer<typeof RunArtifactSchema>;

// ── Pipeline Context (passed between agents) ─────────────────────────
export interface PipelineContext {
  runId: string;
  request: string;
  observer?: ObserverOutput;
  patternObserver?: PatternObserverOutput;
  cruxFinder?: CruxFinderOutput;
  retriever?: RetrieverOutput;
  guide?: GuideOutput;
  planner?: PlannerOutput;
  safetyGuard?: SafetyGuardOutput;
  implementor?: ImplementorOutput;
  toolRunner?: ToolRunnerOutput;
  gatekeeper?: GatekeeperOutput;
  learner?: LearnerOutput;
  /** Feedback from previous Gatekeeper runs, used by Guide */
  previousImprovements?: string[];
}
