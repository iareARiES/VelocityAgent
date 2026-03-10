# SKILL: App Control
**Category ID:** `APP_OPEN` | `APP_CLOSE`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Open, close, and manage applications on the user's system. Handle cross-platform differences in application launch commands.

---

## APP OPEN

### Detection: Common App Name → Command Mapping

The model must translate a natural name to the correct system command.

#### Windows Launch Commands
```powershell
# Browsers
start chrome          # Google Chrome
start msedge          # Microsoft Edge
start firefox         # Firefox

# Editors / IDEs
code .                # VS Code (current dir)
code "PATH"           # VS Code (specific path)
notepad "PATH"        # Notepad
notepad++             # Notepad++

# Office / Productivity
start excel           # Microsoft Excel
start word            # Microsoft Word
start outlook         # Outlook

# System apps
explorer .            # File Explorer (current dir)
explorer "${systemPaths.desktop}"  # File Explorer at Desktop
calc                  # Calculator
mspaint               # Paint
taskmgr               # Task Manager
control               # Control Panel

# Media
start spotify
start vlc "FILE_PATH"
wmplayer "FILE_PATH"  # Windows Media Player

# Terminal
wt                    # Windows Terminal
cmd                   # Command Prompt
```

#### macOS Launch Commands
```bash
open -a "Google Chrome"
open -a "Safari"
open -a "Firefox"
open -a "Visual Studio Code" "PATH"
open -a "TextEdit" "PATH"
open -a "Finder" "${systemPaths.desktop}"
open -a "Spotify"
open -a "VLC" "FILE_PATH"
open -a "Terminal"
open -a "Calculator"
open -a "Notes"
```

### Steps
1. Identify app name from user message
2. Determine platform from `${systemPaths.platform}`
3. Select correct launch command
4. If a file path is mentioned, include it in the open command
5. Execute command
6. Report what was opened

### Validation
- ✅ Success: command exits without error message
- ❌ Failure: `cannot find`, `not recognized`, `No application`, `not found`
- On failure: suggest alternative command or ask user to confirm app is installed

---

## APP CLOSE / KILL

### ⚠️ Always name the app before closing it. Confirm if user data might be lost.

#### Windows
```powershell
# Close gracefully by process name
Stop-Process -Name "chrome" -Force
Stop-Process -Name "notepad" -Force
Stop-Process -Name "WINWORD" -Force   # Word
Stop-Process -Name "EXCEL" -Force     # Excel
Stop-Process -Name "Code" -Force      # VS Code

# Find process first (if unsure of name)
Get-Process | Where-Object { $_.MainWindowTitle -like "*Chrome*" }
```

#### macOS
```bash
# Graceful quit
osascript -e 'quit app "Google Chrome"'
osascript -e 'quit app "Spotify"'

# Force kill
killall "Google Chrome"
killall "Spotify"
killall "Finder"
```

---

## OPEN FILE WITH SPECIFIC APP

### Windows
```powershell
# Open file with default app
Invoke-Item "FULL_PATH\file.pdf"

# Open with specific app
Start-Process "notepad.exe" -ArgumentList "FULL_PATH\file.txt"
Start-Process "code" -ArgumentList "FULL_PATH\file.py"
```

### macOS
```bash
# Open with default app
open "FULL_PATH/file.pdf"

# Open with specific app
open -a "TextEdit" "FULL_PATH/file.txt"
open -a "Visual Studio Code" "FULL_PATH/file.py"
```

---

## ANTI-HALLUCINATION RULES

1. **Never assume an app is installed.** If the command fails with "not found", inform the user
2. **Use platform-specific commands only** — never use a Windows command on macOS
3. **Check `${systemPaths.platform}`** before choosing command syntax
4. **Do not launch apps with admin privileges** unless explicitly requested

---

## EXAMPLE INTERACTIONS

### "Open Chrome"
```
Platform: win32
Command: start chrome
Report: "Opening Google Chrome for you."
```

### "Open my Downloads folder"
```
Platform: darwin
Command: open "${systemPaths.downloads}"
Report: "Opening your Downloads folder in Finder."
```

### "Close Spotify"
```
Platform: win32
Command: Stop-Process -Name "Spotify" -Force
Confirm first: "Closing Spotify — any unsaved data may be lost."
```
