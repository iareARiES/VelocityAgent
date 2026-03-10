# SKILL: System Information
**Category ID:** `SYSTEM_INFO` | `NETWORK`  
**Tool Used:** `execute_terminal_command`

---

## Purpose
Query real-time system information: battery, RAM, CPU, disk space, network status, IP address, running processes, etc.

---

## BATTERY STATUS

### Windows
```powershell
powercfg /batteryreport /output "${systemPaths.temp}\battery.html" /duration 1
# Simpler one-liner:
(Get-WmiObject Win32_Battery).EstimatedChargeRemaining
```

### macOS
```bash
pmset -g batt
```

---

## RAM / MEMORY

### Windows
```powershell
# Total and available RAM
Get-WmiObject Win32_OperatingSystem | Select-Object TotalVisibleMemorySize, FreePhysicalMemory

# Human-readable
$mem = Get-WmiObject Win32_OperatingSystem
"Total RAM: $([math]::Round($mem.TotalVisibleMemorySize/1MB, 2)) GB"
"Free RAM:  $([math]::Round($mem.FreePhysicalMemory/1MB, 2)) GB"
```

### macOS
```bash
vm_stat | head -5
# Or:
top -l 1 | grep PhysMem
```

---

## CPU USAGE

### Windows
```powershell
Get-WmiObject Win32_Processor | Select-Object Name, LoadPercentage
```

### macOS
```bash
top -l 1 | grep "CPU usage"
```

---

## DISK SPACE

### Windows
```powershell
Get-PSDrive C | Select-Object Used, Free
# Or:
Get-WmiObject Win32_LogicalDisk | Select-Object DeviceID, Size, FreeSpace
```

### macOS
```bash
df -h /
```

---

## RUNNING PROCESSES

### Windows
```powershell
# All processes
Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WorkingSet

# Check if specific app is running
Get-Process -Name "chrome" -ErrorAction SilentlyContinue
```

### macOS
```bash
# Top processes by CPU
ps aux --sort=-%cpu | head -10

# Check if specific app is running
pgrep -x "Google Chrome"
```

---

## NETWORK STATUS

### Check Internet Connectivity
```powershell
# Windows
Test-Connection google.com -Count 1

# macOS/Linux
ping -c 1 google.com
```

### Get IP Address

```powershell
# Windows — local IP
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "Loopback*" }).IPAddress

# macOS
ipconfig getifaddr en0
```

### Public IP
```powershell
# Windows
Invoke-RestMethod -Uri "https://api.ipify.org"

# macOS
curl https://api.ipify.org
```

### WiFi Info
```powershell
# Windows
netsh wlan show interfaces

# macOS
networksetup -getairportnetwork en0
```

---

## SCREEN / DISPLAY INFO

### Windows
```powershell
Get-WmiObject Win32_VideoController | Select-Object Name, CurrentHorizontalResolution, CurrentVerticalResolution
```

### macOS
```bash
system_profiler SPDisplaysDataType | grep Resolution
```

---

## ANTI-HALLUCINATION RULES

1. **Always run the command** and report the actual output — never invent numbers
2. **Format output clearly** — convert bytes to GB, milliseconds to seconds where helpful
3. **If command fails** (e.g., `Win32_Battery` on desktop PC), explain why gracefully: "This device may not have a battery — it may be a desktop computer."

---

## EXAMPLE INTERACTIONS

### "How much RAM do I have?"
```
Platform: win32
Command:
  $mem = Get-WmiObject Win32_OperatingSystem
  "Total: $([math]::Round($mem.TotalVisibleMemorySize/1MB,1)) GB | Free: $([math]::Round($mem.FreePhysicalMemory/1MB,1)) GB"

Report: "You have 16 GB of RAM total, with 9.4 GB currently free."
```

### "What's my IP address?"
```
Platform: darwin
Command: ipconfig getifaddr en0
Report: "Your local IP address is 192.168.1.42."
```

### "Is my internet working?"
```
Platform: win32
Command: Test-Connection google.com -Count 1
Report: "Yes, your internet is working. Response from google.com in 24ms."
```
