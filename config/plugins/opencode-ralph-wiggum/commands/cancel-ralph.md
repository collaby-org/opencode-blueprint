---
description: "Cancel active Ralph Wiggum loop"
---

# Cancel Ralph

Cancel the currently active Ralph Wiggum loop.

## Usage

```
/cancel-ralph
```

## How It Works

1. Checks for active Ralph loop state file (`.opencode/ralph-state.json`)
2. If found, removes the state file and reports cancellation
3. If no active loop, reports that no loop is running

## Examples

```
/cancel-ralph
```

Sample outputs:

**With active loop:**
```
✅ **Cancelled Ralph loop**

- Was at iteration: 5
- Running for: 3m 24s
- Original prompt: "Add unit tests to this project"
```

**No active loop:**
```
ℹ️  No active Ralph loop found.
```

## When to Use

- You want to stop an active Ralph loop manually
- The loop is not progressing as expected
- You've completed the task manually and want to stop automatic iterations
- You need to change the loop parameters (cancel, then start a new one)

After canceling, you can start a new loop with different parameters using `/ralph-loop`.