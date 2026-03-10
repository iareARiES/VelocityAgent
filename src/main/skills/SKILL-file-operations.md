# SKILL: File Operations
**Category ID:** `FILE_CREATE` | `FILE_READ` | `FILE_MOVE` | `FILE_DELETE`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Handle all file and folder operations: creating, reading, moving, renaming, deleting files and directories on the user's system.

---

## MANDATORY: Before ANY File Operation

Always use the resolved system paths. NEVER guess or invent a path.

| User Says | Use This Resolved Path |
|---|---|
| "Desktop" | `${systemPaths.desktop}` |
| "Downloads" | `${systemPaths.downloads}` |
| "Documents" | `${systemPaths.documents}` |
| "home" / "my folder" | `${systemPaths.home}` |
| relative path (e.g. `myfile.txt`) | prepend `${systemPaths.home}` |

---

## FILE CREATE

### Steps
1. Determine the full target path using resolved system paths
2. Determine file content (if any was provided or implied)
3. If directory does not exist, create it first
4. Write the file
5. **Verify**: run a follow-up command to confirm file exists

### Windows Commands
```powershell
# Create empty file
New-Item -Path "FULL_PATH\filename.ext" -ItemType File

# Create file with content
Set-Content -Path "FULL_PATH\filename.ext" -Value "CONTENT"

# Create with multiline content (Python example)
@"
print("Hello World")
"@ | Set-Content -Path "FULL_PATH\hello.py"

# Verify it exists
Test-Path "FULL_PATH\filename.ext"
```

### macOS / Linux Commands
```bash
# Create empty file
touch "FULL_PATH/filename.ext"

# Create file with content
echo "CONTENT" > "FULL_PATH/filename.ext"

# Create Python file with content
cat > "FULL_PATH/hello.py" << 'EOF'
print("Hello World")
EOF

# Verify
ls -la "FULL_PATH/filename.ext"
```

### Validation
After creation command, check tool output:
- ✅ Success: output contains no error, `Test-Path` returns `True`, or `ls` shows the file
- ❌ Failure: output contains `Access denied`, `Cannot find path`, `Permission denied`, `error`

---

## FILE READ

### Steps
1. Resolve the full path
2. Check if file exists first
3. Read and return content

### Windows
```powershell
# Check exists
Test-Path "FULL_PATH\filename.ext"

# Read content
Get-Content -Path "FULL_PATH\filename.ext"

# Read large file (first 50 lines)
Get-Content -Path "FULL_PATH\filename.ext" -TotalCount 50
```

### macOS / Linux
```bash
# Check exists
ls "FULL_PATH/filename.ext"

# Read content
cat "FULL_PATH/filename.ext"

# Read large file (first 50 lines)
head -50 "FULL_PATH/filename.ext"
```

---

## FILE MOVE / RENAME / COPY

### Windows
```powershell
# Move
Move-Item -Path "SOURCE_PATH" -Destination "DEST_PATH"

# Copy
Copy-Item -Path "SOURCE_PATH" -Destination "DEST_PATH"

# Rename
Rename-Item -Path "OLD_PATH" -NewName "new_name.ext"
```

### macOS / Linux
```bash
# Move / Rename
mv "SOURCE_PATH" "DEST_PATH"

# Copy
cp "SOURCE_PATH" "DEST_PATH"

# Copy directory
cp -r "SOURCE_DIR" "DEST_DIR"
```

---

## FILE DELETE

### ⚠️ ALWAYS confirm with user before deleting

Ask: "Are you sure you want to delete `[filename]`? This cannot be undone."

### Windows
```powershell
# Delete file
Remove-Item -Path "FULL_PATH\filename.ext"

# Delete folder
Remove-Item -Path "FULL_PATH\folder" -Recurse
```

### macOS / Linux
```bash
# Delete file
rm "FULL_PATH/filename.ext"

# Delete folder
rm -rf "FULL_PATH/folder"
```

---

## DIRECTORY OPERATIONS

### Create Directory
```powershell
# Windows
New-Item -Path "FULL_PATH\new_folder" -ItemType Directory

# macOS/Linux
mkdir -p "FULL_PATH/new_folder"
```

### List Directory Contents
```powershell
# Windows
Get-ChildItem -Path "FULL_PATH"

# macOS/Linux
ls -la "FULL_PATH"
```

---

## ANTI-HALLUCINATION RULES

1. **Never say "File created!" without running the verification command first**
2. **Never construct paths manually** — always use injected `${systemPaths.*}` values
3. **If path has spaces**, always wrap in quotes: `"C:\Users\John Doe\Desktop\file.txt"`
4. **If the tool returns an error**, report the exact error to the user; do NOT claim success
5. **If the file type has a specific template** (Python, JS, HTML), use a sensible starter template — do not create a blank file unless explicitly asked

---

## EXAMPLE INTERACTIONS

### "Create a Python file on my desktop called hello.py"
```
Intent: FILE_CREATE
Target: ${systemPaths.desktop}/hello.py  (or \hello.py on Windows)
Content: Python starter template

Command (Windows):
@"
# hello.py
print("Hello, World!")
"@ | Set-Content -Path "${systemPaths.desktop}\hello.py"

Verify:
Test-Path "${systemPaths.desktop}\hello.py"
```

### "Move the file report.pdf from Downloads to Documents"
```
Intent: FILE_MOVE
Source: ${systemPaths.downloads}/report.pdf
Dest:   ${systemPaths.documents}/report.pdf

Command (Windows):
Move-Item -Path "${systemPaths.downloads}\report.pdf" -Destination "${systemPaths.documents}\report.pdf"
```
