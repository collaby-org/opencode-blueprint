---
description: "Continue Ralph loop to next iteration"
---

!ralph-continue

# Ralph Continue

Manually advance an active Ralph loop to the next iteration.

## Usage

```
/ralph-continue
```

## What It Does

When you run this command, the plugin:

1. **Checks for active loop** - Verifies a Ralph loop is running
2. **Validates state** - Ensures state file is not corrupted
3. **Checks max iterations** - Stops if limit reached
4. **Increments counter** - Moves to next iteration number
5. **Re-presents prompt** - Shows the original task prompt again
6. **Updates state** - Saves new iteration count to disk

## When to Use

Use `/ralph-continue` when:

- ✅ You've completed work on the current iteration
- ✅ You want to see your progress and continue improving
- ✅ You're ready for the AI to review its previous work
- ✅ You want to trigger the next iteration cycle manually

Don't use it when:

- ❌ No Ralph loop is active (start one with `/ralph-loop` first)
- ❌ You haven't made any progress yet
- ❌ The task is complete (use completion promise or `/cancel-ralph` instead)

## Expected Output

**Success:**
```
🔄 **Ralph iteration 3**

To stop: output `<promise>DONE</promise>` when truly done

**2 iterations remaining**

**Continuing task:** Build a REST API for todos
```

**No active loop:**
```
ℹ️  No active Ralph loop found. Start one with /ralph-loop first.
```

**Max iterations reached:**
```
🛑 Ralph loop completed - reached max iterations (10)
```

**Error (disk full, permissions):**
```
❌ Failed to continue Ralph loop: Failed to save Ralph state to .opencode/ralph-state.json: ENOSPC: no space left on device.

This may be due to disk space or file permissions. Try canceling and restarting the loop.
```

## How Manual Continuation Works

The plugin uses **manual continuation** instead of automatic session.idle detection because:

- Prevents OpenCode from freezing during iterations
- Gives you control over when to continue
- Allows you to review work before proceeding
- More reliable than detecting idle sessions

## Workflow Example

```bash
# 1. Start a Ralph loop
/ralph-loop "Add unit tests" 10 "ALL TESTS PASS"

# 2. Work on adding tests...
# (You write test files, run tests, etc.)

# 3. When ready for next iteration
/ralph-continue

# 4. AI sees your test files and continues improving
# Repeat steps 2-3 until complete

# 5. When tests pass, AI outputs:
# <promise>ALL TESTS PASS</promise>

# Loop automatically stops
```

## Troubleshooting

**"Failed to continue Ralph loop"**
- Check disk space: `df -h`
- Verify permissions: `ls -la .opencode/`
- Try canceling: `/cancel-ralph`
- Start fresh: `/ralph-loop "your task" 10`

**"No active Ralph loop found"**
- Start a loop first: `/ralph-loop "your task"`
- Check if state file exists: `cat .opencode/ralph-state.json`

**Loop increments but nothing happens**
- This is expected! You need to manually continue the work
- The prompt is re-presented, but you drive the actions
- Ralph doesn't auto-execute code, it reminds you of the task