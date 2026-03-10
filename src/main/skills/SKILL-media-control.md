# SKILL: Media Control
**Category ID:** `MEDIA_CONTROL`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Control media playback, volume, and audio settings on the system.

---

## VOLUME CONTROL

### Windows
```powershell
# Mute
$wshell = New-Object -com wscript.shell
$wshell.SendKeys([char]173)   # Mute toggle key

# Volume up (press media key 10 times)
1..10 | ForEach-Object { $wshell.SendKeys([char]175) }

# Volume down
1..10 | ForEach-Object { $wshell.SendKeys([char]174) }
```

### macOS
```bash
# Set volume (0-100)
osascript -e "set volume output volume 50"

# Mute
osascript -e "set volume with output muted"

# Unmute
osascript -e "set volume without output muted"

# Get current volume
osascript -e "output volume of (get volume settings)"
```

---

## MEDIA PLAYBACK (Spotify)

### macOS
```bash
# Play / Pause
osascript -e 'tell application "Spotify" to playpause'

# Next track
osascript -e 'tell application "Spotify" to next track'

# Previous track
osascript -e 'tell application "Spotify" to previous track'

# What's playing?
osascript -e 'tell application "Spotify" to name of current track'
```

### Windows (via media keys)
```powershell
$wshell = New-Object -com wscript.shell
$wshell.SendKeys([char]179)   # Play/Pause
$wshell.SendKeys([char]176)   # Next track
$wshell.SendKeys([char]177)   # Previous track
```

---

## BROWSER / YOUTUBE MEDIA PLAYBACK

Use the **media Play/Pause key** to control browser-based media (YouTube, etc.).
This is the most reliable cross-browser approach on Windows.

### Windows
```powershell
# Play / Pause any browser media (YouTube, etc.)
$wshell = New-Object -com wscript.shell
$wshell.SendKeys([char]179)   # Media Play/Pause key
```

### macOS
```bash
# Simulate media key press (Play/Pause)
osascript -e 'tell application "System Events" to key code 16 using {command down}'
```

> **NOTE:** The media Play/Pause key works for YouTube, Spotify Web Player,
> and most browser-based media. The browser tab playing media does NOT need
> to be focused — Windows routes the key to the active media session.

---

## OPEN MEDIA FILE

```powershell
# Windows — open with default media player
Invoke-Item "FULL_PATH\video.mp4"

# macOS
open "FULL_PATH/video.mp4"
```

---

## ANTI-HALLUCINATION RULES

1. **Media controls affect the currently active media application** — warn user if no media is playing
2. **Volume commands on macOS via osascript are the most reliable** — use them
3. **On Windows, SendKeys for media control is a best-effort approach** — some apps may not respond

---

## EXAMPLE INTERACTIONS

### "Turn volume down to 30%"
```
Platform: darwin
Command: osascript -e "set volume output volume 30"
Report: "Volume set to 30%."
```

### "Pause Spotify"
```
Platform: darwin
Command: osascript -e 'tell application "Spotify" to playpause'
Report: "Paused Spotify."
```
