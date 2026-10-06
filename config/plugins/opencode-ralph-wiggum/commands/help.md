---
description: "Explain Ralph Wiggum technique and available commands"
---

# Ralph Wiggum Plugin Help

## What is the Ralph Wiggum Technique?

The Ralph Wiggum technique is an iterative development methodology based on continuous AI loops, pioneered by Geoffrey Huntley.

**Core concept:**
```bash
while :; do
  cat PROMPT.md | ai-assistant --continue
done
```

The same prompt is fed to the AI repeatedly. The "self-referential" aspect comes from the AI seeing its own previous work in files and git history, not from feeding output back as input.

**Each iteration:**
1. AI receives the SAME prompt
2. Works on the task, modifying files
3. Tries to exit/complete
4. Plugin intercepts and feeds the same prompt again
5. AI sees its previous work in the files
6. Iteratively improves until completion

The technique is described as "deterministically bad in an undeterministic world" - failures are predictable, enabling systematic improvement through prompt tuning.

## Available Commands

### /ralph-loop PROMPT [MAX_ITERATIONS] [COMPLETION_PROMISE]

Start a Ralph loop in your current session.

**Usage:**
```
/ralph-loop "Refactor the cache layer" 20
/ralph-loop "Add comprehensive tests" 50 "TESTS COMPLETE"
/ralph-loop "Fix all TypeScript errors" 10 "NO ERRORS"
```

**Arguments:**
- `PROMPT` (required) - Task description to iterate on
- `MAX_ITERATIONS` (optional) - Maximum iterations before auto-stop (default: 50, use 0 for unlimited)
- `COMPLETION_PROMISE` (optional) - Promise phrase to signal completion

**How it works (manual continuation mode):**
1. Creates `.opencode/ralph-state.json` state file
2. You work on the task normally
3. Use `/ralph-continue` when ready for next iteration
4. Same prompt continues the work
5. You see your previous work in files/git
6. Continues until promise detected, max iterations reached, or manually cancelled

**Note:** Automatic session.idle handling is disabled to prevent OpenCode freezing. Use manual `/ralph-continue` instead.

---

### /ralph-continue

Manually continue to the next iteration of an active Ralph loop.

**Usage:**
```
/ralph-continue
```

**How it works:**
- Checks for active Ralph loop state
- Increments iteration counter
- Re-presents the original prompt for next iteration
- Stops if max iterations reached

**When to use:**
- After completing work on current iteration
- When ready to see your progress and continue
- To manually trigger the next iteration cycle

---

### /cancel-ralph

Cancel an active Ralph loop.

**Usage:**
```
/cancel-ralph
```

**How it works:**
- Checks for active loop state file
- Removes `.opencode/ralph-state.json`
- Reports cancellation with iteration count, duration, and original prompt

---

## Key Concepts

### Completion Promises

To signal completion, output a `<promise>` tag with your exact promise text:

```
<promise>TESTS COMPLETE</promise>
```

The plugin monitors for this specific tag. Without it (or `--max-iterations`), Ralph runs until manually cancelled.

**CRITICAL RULES:**
- Use `<promise>` XML tags EXACTLY as shown
- The statement MUST be completely and unequivocally TRUE
- Do NOT output false statements to exit the loop
- The loop continues until genuine completion

### Self-Reference Mechanism

The "loop" doesn't mean the AI talks to itself. Instead:
- Same prompt is repeated each iteration
- AI's work persists in files and git history
- Each iteration sees previous attempts
- Builds incrementally toward the goal

## Example Workflow

### Interactive Bug Fix

```
/ralph-loop "Fix the token refresh logic in auth.ts. Output <promise>ALL TESTS PASS</promise> when authentication tests are green." --completion-promise "ALL TESTS PASS" --max-iterations 10
```

Ralph will:
1. Attempt to fix the auth logic
2. Run tests to verify
3. See test failures
4. Iterate on the solution
5. Continue until tests actually pass
6. Output completion promise when genuinely complete

## When to Use Ralph

**Good for:**
- Well-defined tasks with clear success criteria
- Tasks requiring iteration and refinement
- Incremental development with self-correction
- Code refactoring and optimization
- Test-driven development

**Not good for:**
- Tasks requiring human judgment or design decisions
- One-shot operations that don't benefit from iteration
- Tasks with unclear success criteria
- Exploratory or research tasks

## State Management

Ralph uses `.opencode/ralph-state.json` to track:
- Current iteration number
- Original prompt
- Maximum iterations
- Completion promise
- Loop start time
- Session information

The plugin only runs when this state file exists, ensuring Ralph doesn't interfere when not in use.

## Learn More

- Original technique: https://ghuntley.com/ralph/
- Ralph Orchestrator: https://github.com/mikeyobrien/ralph-orchestrator
- OpenCode Documentation: https://opencode.ai/docs