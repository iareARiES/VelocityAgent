# SKILL: Schedule & Reminders
**Category ID:** `SCHEDULE`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Set reminders, open calendar apps, check scheduled tasks, and interact with system notification/alarm features.

---

## OPEN CALENDAR APP

### Windows
```powershell
start outlookcal:    # Outlook Calendar
start ms-actioncenter:  # Windows notification center
```

### macOS
```bash
open -a "Calendar"
```

---

## SET A TIMED REMINDER / NOTIFICATION

### Windows (Toast Notification via PowerShell)
```powershell
# Show a popup after a delay (e.g., 5 minutes = 300 seconds)
$delay = 300  # seconds
Start-Sleep -Seconds $delay
[System.Windows.MessageBox]::Show("Reminder: YOUR_MESSAGE", "Nexus Reminder")
```

**Background version (non-blocking):**
```powershell
$msg = "YOUR_MESSAGE"
$delay = 300
Start-Process powershell -ArgumentList "-Command Start-Sleep $delay; [System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('$msg','Nexus Reminder')" -WindowStyle Hidden
```

### macOS (via osascript + at command)
```bash
# Display notification immediately
osascript -e 'display notification "YOUR_MESSAGE" with title "Nexus Reminder"'

# Schedule for N minutes from now
echo "osascript -e 'display notification \"YOUR_MESSAGE\" with title \"Nexus Reminder\"'" | at now + 5 minutes
```

---

## CHECK SCHEDULED TASKS

### Windows
```powershell
# List all scheduled tasks
Get-ScheduledTask | Select-Object TaskName, State | Where-Object State -eq "Ready"
```

### macOS
```bash
# List launchd jobs
launchctl list | head -20
```

---

## ANTI-HALLUCINATION RULES

1. **Reminders set via `Start-Sleep` or `at` are not persistent** — if the terminal process is killed, the reminder is lost. Inform the user.
2. **For persistent reminders**, suggest the user use their OS calendar app or a dedicated reminder app
3. **Always confirm the time**: "I've set a reminder for 5 minutes from now" — specify the actual time (current time + delay)

---

## EXAMPLE INTERACTIONS

### "Remind me in 10 minutes to take a break"
```
Platform: darwin
Command:
  echo "osascript -e 'display notification \"Time to take a break!\" with title \"Nexus Reminder\"'" | at now + 10 minutes
Report: "Done! I've set a reminder for 10 minutes from now to take a break."
Note: "This reminder will only fire if your Mac stays on."
```

### "Open my calendar"
```
Platform: win32
Command: start outlookcal:
Report: "Opening your calendar now."
```
