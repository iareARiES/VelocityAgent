# SKILL: Clipboard
**Category ID:** `CLIPBOARD`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Read from and write to the system clipboard.

---

## READ CLIPBOARD

### Windows
```powershell
Get-Clipboard
```

### macOS
```bash
pbpaste
```

---

## WRITE TO CLIPBOARD

### Windows
```powershell
Set-Clipboard -Value "TEXT_TO_COPY"

# Pipe output to clipboard
echo "Hello World" | Set-Clipboard

# Copy file content to clipboard
Get-Content "${systemPaths.desktop}\file.txt" | Set-Clipboard
```

### macOS
```bash
echo "TEXT_TO_COPY" | pbcopy

# Copy file content to clipboard
cat "${systemPaths.desktop}/file.txt" | pbcopy
```

---

## COPY FILE PATH TO CLIPBOARD

### Windows
```powershell
Set-Clipboard -Value "${systemPaths.desktop}\filename.txt"
```

### macOS
```bash
echo "${systemPaths.desktop}/filename.txt" | pbcopy
```

---

## ANTI-HALLUCINATION RULES

1. **Read clipboard before claiming to know its contents** — never guess
2. **Confirm write**: after setting clipboard, confirm "Copied to clipboard!" only after the command succeeds
3. **Clipboard content may be private** — do not repeat clipboard content back unless the user explicitly asked to see it

---

## EXAMPLE INTERACTIONS

### "Copy 'Hello World' to my clipboard"
```
Platform: darwin
Command: echo "Hello World" | pbcopy
Report: "Copied 'Hello World' to your clipboard."
```

### "What's in my clipboard?"
```
Platform: win32
Command: Get-Clipboard
Report: Shows actual clipboard content retrieved from command output
```
