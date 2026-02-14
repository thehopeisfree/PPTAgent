---
name: ai-team
description: Coordinate a panel of AI advisors to discuss, debate, and execute a task — each advisor brings a distinct expertise, and the workflow drives them from divergent proposals through structured critique to a unified, actionable plan.
---

# AI Team

An orchestrated multi-advisor workflow where specialized AI roles collaborate on a single task. The process ensures that proposals are challenged, refined, and merged before any code is written.

---

## Roles

| Role | Perspective | Focus |
|------|-------------|-------|
| **Architect** | System design & structure | Module boundaries, data flow, API surface, scalability trade-offs |
| **Implementer** | Hands-on coding | Concrete code changes, file edits, library choices, edge cases |
| **Critic** | Quality & risk | Failure modes, security, performance pitfalls, missing requirements |
| **User Advocate** | End-user experience | Usability, clarity, error messages, documentation gaps |

> You may add or remove roles to match the task. For small tasks, two roles (Implementer + Critic) are sufficient. For cross-cutting changes, add a **DevOps** or **Domain Expert** role as needed.

---

## Workflow

### Phase 1: Brief

1. Restate the task in one sentence.
2. Identify constraints (timeline, compatibility, performance targets).
3. List open questions that need resolution before design.

### Phase 2: Propose (Diverge)

Each advisor independently drafts a short proposal (3-5 bullet points):

```
### Architect
- ...

### Implementer
- ...

### Critic
- ...

### User Advocate
- ...
```

Proposals should differ — the goal is to surface options, not converge prematurely.

### Phase 3: Critique (Challenge)

Each advisor reviews the other proposals and raises:

- **Conflicts** — where two proposals contradict.
- **Risks** — unaddressed failure modes or edge cases.
- **Gaps** — missing steps or overlooked requirements.

Collect all concerns into a numbered list.

### Phase 4: Converge (Decide)

Synthesize proposals into a single plan:

1. For each conflict, pick the stronger option and state why.
2. For each risk, add a mitigation step or accept it explicitly.
3. For each gap, fill it or mark it as out-of-scope.

Output a final plan as a numbered checklist of concrete actions.

### Phase 5: Execute

Work through the checklist sequentially:

1. Mark each item in-progress before starting.
2. After completing each item, mark it done.
3. If an item surfaces new issues, pause and return to Phase 3 (Critique) for that issue only — do not restart the entire workflow.

### Phase 6: Review

After execution:

1. The **Critic** reviews all changes for correctness and completeness.
2. The **User Advocate** checks that the result meets the original intent.
3. List any follow-up tasks that were discovered but are out of scope.

---

## Rules

- **Stay in role.** Each advisor argues from their perspective, even if they personally agree with another view. Constructive disagreement produces better outcomes.
- **Concise proposals.** Each proposal is 3-5 bullet points, not essays. Details belong in the execution phase.
- **No premature code.** Do not write code until Phase 5. Phases 1-4 are pure discussion.
- **Timebox critiques.** Each critique round should raise at most 5 concerns. If there are more, prioritize by severity.
- **Single plan of record.** Phase 4 must produce exactly one plan. Forks are resolved, not deferred.
