# SKILL: Code Execution
**Category ID:** `CODE_RUN`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Run scripts, execute code files, and capture their output. Handle Python, Node.js, shell scripts, and other runtimes.

---

## DETERMINE RUNTIME

| File Extension / Language | Windows Command | macOS/Linux Command |
|---|---|---|
| `.py` Python | `python "PATH"` or `python3 "PATH"` | `python3 "PATH"` |
| `.js` Node.js | `node "PATH"` | `node "PATH"` |
| `.ts` TypeScript | `npx ts-node "PATH"` | `npx ts-node "PATH"` |
| `.sh` Shell script | `bash "PATH"` (via WSL or Git Bash) | `bash "PATH"` |
| `.ps1` PowerShell | `powershell -File "PATH"` | N/A |
| Inline Python | `python -c "CODE"` | `python3 -c "CODE"` |
| Inline Node | `node -e "CODE"` | `node -e "CODE"` |

---

## RUNNING A SCRIPT FILE

### Steps
1. Confirm file exists at given path (use `Test-Path` / `ls`)
2. Identify runtime from file extension
3. Run with full resolved path (never relative path)
4. Capture and report stdout + stderr
5. If exit code is non-zero, report it as an error

### Windows
```powershell
# Run Python file and capture output
$output = python "${systemPaths.desktop}\script.py" 2>&1
$output

# Check exit code
$LASTEXITCODE
```

### macOS / Linux
```bash
# Run Python file
python3 "${systemPaths.desktop}/script.py" 2>&1
echo "Exit code: $?"
```

---

## RUNNING INLINE CODE

When user provides code snippet directly (not a file):

### Steps
1. Write the code to a temp file (for cleaner execution)
2. Run the temp file
3. Delete temp file after execution

```powershell
# Windows — write and run Python
$code = @"
# user's code here
for i in range(5):
    print(i)
"@
$tmpFile = "${systemPaths.temp}\nexus_run_$(Get-Random).py"
$code | Set-Content $tmpFile
python $tmpFile
Remove-Item $tmpFile
```

```bash
# macOS — write and run Python
tmpfile=$(mktemp /tmp/nexus_run_XXXXX.py)
cat > "$tmpfile" << 'EOF'
# user's code here
for i in range(5):
    print(i)
EOF
python3 "$tmpfile"
rm "$tmpfile"
```

---

## INSTALLING DEPENDENCIES BEFORE RUNNING

If a script imports a package that may not be installed:

```powershell
# Windows
pip install requests --quiet
python "${systemPaths.desktop}\script.py"
```

```bash
# macOS
pip3 install requests -q
python3 "${systemPaths.desktop}/script.py"
```

---

## OUTPUT HANDLING

- **Truncate long output**: if stdout > 2000 chars, show first 1500 chars + "... [truncated]"
- **Highlight errors**: if stderr is non-empty, display it prominently with label "Error:"
- **Exit codes**: 0 = success, anything else = failure

---

## ANTI-HALLUCINATION RULES

1. **Never report code output without actually running it**
2. **Never claim a script will "work" without executing it** — run it and show real output
3. **If a required runtime isn't installed** (e.g., Python not found), tell the user clearly
4. **Sanitize user-provided code**: warn if code contains `rm -rf`, `format`, `del /f` etc. and ask for confirmation before running

---

## EXAMPLE INTERACTIONS

### "Run the hello.py on my Desktop"
```
Platform: darwin
Steps:
  1. ls "${systemPaths.desktop}/hello.py"   ← verify exists
  2. python3 "${systemPaths.desktop}/hello.py" 2>&1

Output: "Hello, World!"
Report: "Ran hello.py successfully. Output: Hello, World!"
```

### "Run this code: print(2 + 2)"
```
Platform: win32
Command: python -c "print(2 + 2)"
Output: 4
Report: "The code ran successfully. Output: 4"
```
