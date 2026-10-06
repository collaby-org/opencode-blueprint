---
description: "Start Ralph Wiggum loop in current session"
argument-hint: "PROMPT [MAX_ITERATIONS] [COMPLETION_PROMISE]"
---

!ralph-start "$1" $2 "$3"

🔄 **Ralph loop activated!**

**Task:** $1

Work on this task. When you finish, use `/ralph-continue` to proceed to the next iteration where you can see your previous work and continue improving.

**To stop the loop:** Output `<promise>TASK COMPLETED</promise>` when the task is genuinely finished, or use `/cancel-ralph`.

**Manual continuation:** Use `/ralph-continue` when ready for the next iteration (automatic session.idle is disabled to prevent freezing).

**Usage examples:**
- `/ralph-loop "Build a todo app"`
- `/ralph-loop "Fix the login bug" 10`
- `/ralph-loop "Add user auth" 20 "AUTH SYSTEM WORKING"`

Start working on: $1