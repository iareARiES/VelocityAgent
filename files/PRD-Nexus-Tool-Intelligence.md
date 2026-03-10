# PRD: Velocity Agent — Tool-Calling Intelligence & Action Execution System

**Version:** 1.0  
**Date:** 2026-02-24  
**Author:** [Your Name]  
**Target Model:** Antigravity Claude Opus 4.6  
**Status:** Ready for Implementation

---

## 1. Executive Summary

Velocity Agent currently supports three tools: `execute_terminal_command`, `take_screenshot`, and `web_search`. However, the model **hallucinates** when deciding how and when to use them — it invents file paths, fails to locate OS-specific directories like the Desktop, and mismatches tools to user intents.

This PRD defines the full upgrade to make Velocity Agent's tool-calling **reliable, precise, and contextually aware**. The solution has three pillars:

1. **Intent Classification Layer** — parse user intent into structured action types before any tool call
2. **Path Resolution System** — dynamically resolve real OS paths (Desktop, Downloads, Documents, etc.) before executing filesystem operations
3. **Skill Markdown Library** — a set of individual `.md` files that serve as behavioral prompts for each category of laptop action

---

## 2. Problem Statement

### 2.1 Current Behavior (Broken)

When a user says:
> "Create a Python file on my Desktop called `hello.py`"

The model currently:
- Guesses the Desktop path (e.g. hardcodes `C:\Users\User\Desktop` or `~/Desktop`)
- Calls `execute_terminal_command` with a potentially wrong path
- Succeeds by luck on some machines, silently fails on others
- Never confirms the file was actually created

### 2.2 Root Causes

| Problem | Root Cause |
|---|---|
| Wrong file paths | Model invents paths based on training data; no live OS path resolution |
| Wrong tool selection | No intent classification; model guesses from free-form text |
| No feedback loop | Tool result is returned to model but confirmation is weak/missing |
| No action taxonomy | The system prompt doesn't enumerate what "create file", "open app", etc. map to |
| Hallucinated confirmations | Model says "Done!" before checking tool output for errors |

---

## 3. Goals & Non-Goals

### Goals
- ✅ Resolve real OS paths (Desktop, Downloads, AppData, etc.) before any file operation
- ✅ Classify user intent into discrete, typed action categories
- ✅ Execute multi-step tasks correctly (e.g., "create a file AND open it")
- ✅ Confirm success or report failure honestly using tool output
- ✅ Support Windows & macOS with zero hardcoded paths
- ✅ Modular skill system: each action category has its own behavior markdown

### Non-Goals
- ❌ GUI automation (clicking UI elements) — out of scope for v1
- ❌ Cross-machine remote execution
- ❌ Replacing the existing Groq/llama backend

---

## 4. Solution Architecture

### 4.1 Overview

```
User Message
    │
    ▼
[INTENT CLASSIFIER]          ← New: identifies action type + parameters
    │
    ▼
[PATH RESOLVER]              ← New: resolves real paths via Node.js before tool call
    │
    ▼
[SKILL ROUTER]               ← New: loads appropriate Skill MD into context
    │
    ▼
[TOOL EXECUTOR]              ← Existing: execute_terminal_command / web_search / screenshot
    │
    ▼
[RESULT VALIDATOR]           ← New: checks tool output for errors before responding
    │
    ▼
AI Response to User
```

### 4.2 New IPC Handler: `resolve-system-paths`

A new IPC handler in `src/main/index.ts` (or a new `system-ipc.ts`) that returns real paths:

```typescript
// src/main/system-ipc.ts
import { ipcMain, app } from 'electron'
import * as os from 'os'
import * as path from 'path'

export function registerSystemIpc() {
  ipcMain.handle('resolve-system-paths', () => {
    return {
      desktop:   path.join(os.homedir(), 'Desktop'),
      downloads: path.join(os.homedir(), 'Downloads'),
      documents: path.join(os.homedir(), 'Documents'),
      home:      os.homedir(),
      appData:   app.getPath('appData'),
      temp:      os.tmpdir(),
      username:  os.userInfo().username,
      platform:  process.platform,  // 'win32' | 'darwin' | 'linux'
    }
  })
}
```

These resolved paths are injected into the **system prompt** at runtime before every AI call.

### 4.3 Updated System Prompt Injection

In `src/main/prompt.ts`, `createSystemPrompt()` must accept a `systemPaths` argument:

```typescript
export function createSystemPrompt(userDescription: string, systemPaths: SystemPaths): string {
  return `
You are Velocity Agent, an intelligent desktop assistant running on this computer.

## REAL SYSTEM PATHS (use these exactly — do not invent paths)
- Desktop:   ${systemPaths.desktop}
- Downloads: ${systemPaths.downloads}
- Documents: ${systemPaths.documents}
- Home:      ${systemPaths.home}
- Temp:      ${systemPaths.temp}
- Username:  ${systemPaths.username}
- Platform:  ${systemPaths.platform}

## TOOLS AVAILABLE
... (existing tool definitions)

## INTENT CLASSIFICATION RULES
Before calling any tool, identify the action category. See SKILL files for each.
...
  `
}
```

---

## 5. Intent Classification System

### 5.1 Action Categories

Each user request maps to exactly one primary action category:

| Category ID | Example User Phrases | Skill File |
|---|---|---|
| `FILE_CREATE` | "create a file", "make a new txt", "write a python script" | `SKILL-file-operations.md` |
| `FILE_READ` | "read the file", "show me what's in", "open and display" | `SKILL-file-operations.md` |
| `FILE_MOVE` | "move this to", "rename", "copy to desktop" | `SKILL-file-operations.md` |
| `FILE_DELETE` | "delete", "remove the file", "trash this" | `SKILL-file-operations.md` |
| `APP_OPEN` | "open chrome", "launch spotify", "start notepad" | `SKILL-app-control.md` |
| `APP_CLOSE` | "close the app", "kill process", "quit browser" | `SKILL-app-control.md` |
| `WEB_SEARCH` | "search for", "look up", "find information about" | `SKILL-web-search.md` |
| `SYSTEM_INFO` | "what's my battery", "how much RAM", "disk space" | `SKILL-system-info.md` |
| `NETWORK` | "check wifi", "ping google", "what's my IP" | `SKILL-system-info.md` |
| `MEDIA_CONTROL` | "play music", "pause", "volume up" | `SKILL-media-control.md` |
| `CLIPBOARD` | "copy this to clipboard", "what's in clipboard" | `SKILL-clipboard.md` |
| `SCHEDULE` | "set a reminder", "open calendar" | `SKILL-schedule.md` |
| `CODE_RUN` | "run this script", "execute this python", "test this" | `SKILL-code-execution.md` |
| `MULTI_STEP` | any request combining 2+ categories | decompose then execute sequentially |

### 5.2 Classification Prompt (injected before tool calls)

```
Before calling any tool, output a JSON block:
{
  "intent": "<CATEGORY_ID>",
  "target_path": "<resolved path if file operation, else null>",
  "app_name": "<application name if app action, else null>",
  "parameters": { ... }
}
Then proceed with the tool call using the resolved information.
```

---

## 6. Skill Markdown Files

Each `.md` file is a behavioral specification loaded into context for a given action type. They live in `src/main/skills/` and are read at runtime when needed.

### Files to Create

| File | Purpose |
|---|---|
| `SKILL-file-operations.md` | Create, read, move, delete files with exact path handling |
| `SKILL-app-control.md` | Open/close applications cross-platform |
| `SKILL-web-search.md` | Structured web search with result summarization |
| `SKILL-system-info.md` | Battery, RAM, CPU, disk, network queries |
| `SKILL-media-control.md` | Playback, volume, media keys |
| `SKILL-clipboard.md` | Read/write clipboard content |
| `SKILL-code-execution.md` | Run scripts, capture output, report errors |
| `SKILL-schedule.md` | Reminders, calendar, notifications |

> **See accompanying files in `/skills/` folder for full content of each skill.**

---

## 7. Anti-Hallucination Logic

### 7.1 Rules Injected into System Prompt

```
STRICT RULES — NEVER VIOLATE:
1. NEVER invent a file path. Always use the REAL SYSTEM PATHS provided above.
2. NEVER say "Done!" or "Created!" before reading the tool's stdout/stderr output.
3. If tool output contains an error keyword (error, denied, not found, failed, cannot),
   tell the user it failed and what the error was. Do NOT claim success.
4. If a path contains spaces, always wrap it in quotes in the terminal command.
5. For file creation: always verify by running a follow-up `ls` or `dir` check.
6. For multi-step tasks: complete each step fully before starting the next.
```

### 7.2 Result Validation Pattern

After every `execute_terminal_command` call, the model must:
1. Read the `stdout` and `stderr` in the tool result
2. Check for error indicators
3. Only report success if no errors are detected
4. If an error is found, retry once with a corrected command or explain the failure

### 7.3 Path Safety Rules

```
BEFORE any file operation:
- Use the resolved path from REAL SYSTEM PATHS, not guessed paths
- If the user says "Desktop" → use ${systemPaths.desktop}
- If the user says "Downloads" → use ${systemPaths.downloads}
- If the user gives a relative path → prepend the home directory
- Always check if the directory exists before writing to it
```

---

## 8. Multi-Step Task Handling

When a user request requires multiple actions (e.g., "create a file on the Desktop and open it in Notepad"):

```
MULTI_STEP execution order:
1. Decompose into ordered subtasks
2. Execute subtask 1 → validate result
3. Only if subtask 1 succeeded → execute subtask 2
4. Report each step's result to the user progressively
5. If any step fails, stop and explain — do not proceed to subsequent steps
```

---

## 9. Implementation Plan

### Phase 1 — Foundation (Week 1)

- [ ] Create `src/main/system-ipc.ts` with `resolve-system-paths` handler
- [ ] Register it in `src/main/index.ts`
- [ ] Expose via preload `contextBridge`
- [ ] Update `createSystemPrompt()` to accept and inject `systemPaths`
- [ ] Update `ai-ipc.ts` to resolve paths before every AI call

### Phase 2 — Skill Files (Week 1-2)

- [ ] Create `src/main/skills/` directory
- [ ] Write all 8 Skill markdown files (see `/skills/` folder)
- [ ] Create `skill-loader.ts` utility to read skill file by category
- [ ] Inject relevant skill content into the AI context based on detected intent

### Phase 3 — Intent Classification (Week 2)

- [ ] Add intent classification JSON block to system prompt
- [ ] Parse AI's classification output before tool execution
- [ ] Route to correct skill content dynamically

### Phase 4 — Validation & Anti-Hallucination (Week 2-3)

- [ ] Add result validation logic in `ai-ipc.ts` tool executor
- [ ] Add post-execution verification commands (ls/dir after file creation)
- [ ] Test on Windows and macOS with varied path types

### Phase 5 — Testing (Week 3)

- [ ] Test all action categories with real commands
- [ ] Test multi-step tasks
- [ ] Test error recovery (wrong permissions, missing directories)
- [ ] Regression test existing chat and meeting coach flows

---

## 10. Files to Create / Modify

### New Files
```
src/main/system-ipc.ts              — Path resolution IPC handler
src/main/skill-loader.ts            — Reads skill .md files from disk
src/main/skills/
  SKILL-file-operations.md
  SKILL-app-control.md
  SKILL-web-search.md
  SKILL-system-info.md
  SKILL-media-control.md
  SKILL-clipboard.md
  SKILL-code-execution.md
  SKILL-schedule.md
```

### Modified Files
```
src/main/index.ts                   — Register registerSystemIpc()
src/main/prompt.ts                  — Accept systemPaths in createSystemPrompt()
src/main/ai-ipc.ts                  — Resolve paths before AI call; validate tool results
src/preload/index.ts                — Expose resolveSystemPaths() to renderer
```

---

## 11. Success Metrics

| Metric | Current | Target |
|---|---|---|
| File creation success rate | ~40% (path guessing) | >95% |
| Hallucinated "Done!" responses | Frequent | 0 |
| Cross-platform path accuracy | Fails on non-standard setups | 100% |
| Multi-step task completion | Not supported | Supported |
| Tool mismatches per 10 requests | 3-4 | 0-1 |

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Skill file content bloats context window | Load only the relevant skill per request |
| Path resolution fails on Linux | Add Linux path support to `system-ipc.ts` |
| Model ignores injected paths | Make paths the first thing in the system prompt, labeled "CRITICAL" |
| Multi-step tasks timeout | Add per-step timeout; surface partial success to user |

---

*End of PRD. See accompanying `/skills/` markdown files for detailed behavioral specifications.*
