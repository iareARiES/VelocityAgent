import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

/**
 * Maps intent category IDs to their skill markdown filename.
 */
const SKILL_MAP: Record<string, string> = {
    FILE_CREATE: "SKILL-file-operations.md",
    FILE_READ: "SKILL-file-operations.md",
    FILE_MOVE: "SKILL-file-operations.md",
    FILE_DELETE: "SKILL-file-operations.md",
    APP_OPEN: "SKILL-app-control.md",
    APP_CLOSE: "SKILL-app-control.md",
    WEB_SEARCH: "SKILL-web-search.md",
    SYSTEM_INFO: "SKILL-system-info.md",
    NETWORK: "SKILL-system-info.md",
    MEDIA_CONTROL: "SKILL-media-control.md",
    CLIPBOARD: "SKILL-clipboard.md",
    CODE_RUN: "SKILL-code-execution.md",
    // Scheduling / Reminders
    SCHEDULE: "SKILL-schedule.md",

    // Focus / Neurodivergent support
    FOCUS_MODE: "SKILL-focus-mode.md",

    // Localization & Digital Literacy
    LOCALIZATION_LITERACY: "SKILL-localization-literacy.md",
};

/**
 * Keyword patterns that map user message content to intent categories.
 * Each entry: [keywords[], intentCategory]
 * Multiple keywords in an entry are OR-matched (any keyword triggers the match).
 */
const KEYWORD_ROUTES: Array<[string[], string]> = [
    // File operations
    [["create file", "make file", "new file", "write file", "save file", "create a", "make a folder", "mkdir", "create folder", "new folder", "touch "], "FILE_CREATE"],
    [["read file", "show file", "open file", "cat ", "display file", "what's in the file", "show me the file"], "FILE_READ"],
    [["move file", "rename", "copy file", "move the", "copy the", "move to", "copy to"], "FILE_MOVE"],
    [["delete file", "remove file", "trash", "delete the", "remove the", "rm "], "FILE_DELETE"],

    // App control
    [["open chrome", "open browser", "launch", "start app", "open app", "open notepad", "open vscode", "open code", "open spotify", "open edge", "open firefox", "open excel", "open word", "calculator", "open explorer", "file manager", "open terminal"], "APP_OPEN"],
    [["close app", "kill", "quit", "close chrome", "close browser", "stop app", "close spotify", "force close", "end task"], "APP_CLOSE"],

    // Web search
    [["search for", "look up", "find info", "google", "what is", "who is", "how to", "latest news", "weather", "price of", "search the web", "find out"], "WEB_SEARCH"],

    // System info
    [["battery", "ram", "memory", "cpu", "disk space", "storage", "how much space", "system info", "process", "running apps"], "SYSTEM_INFO"],
    [["wifi", "internet", "ip address", "network", "ping", "connected", "my ip", "check connection"], "NETWORK"],

    // Media
    [["volume", "mute", "unmute", "play music", "pause music", "next track", "previous track", "play ", "pause ", "media", "play video", "play youtube", "resume", "stop playing"], "MEDIA_CONTROL"],

    // Clipboard
    [["clipboard", "copy to clipboard", "paste", "what's copied", "copy this"], "CLIPBOARD"],

    // Code execution
    [["run script", "run code", "execute script", "run python", "run this", "run the", "execute this", "python ", "node ", "npm "], "CODE_RUN"],

    // Schedule
    [["remind me", "reminder", "set alarm", "calendar", "schedule", "timer", "notification in"], "SCHEDULE"],

    // Focus mode / Neurodivergent support
    [["overwhelmed", "sensory overload", "help me focus", "too loud", "distracted", "focus mode", "clear my screen", "too much noise", "adhd", "cant focus", "can't focus", "i'm overwhelmed", "calm down", "quiet", "exit focus mode", "restore"], "FOCUS_MODE"],

    // Localization & Digital Literacy
    [["translate", "in hindi", "in tamil", "in spanish", "in telugu", "in marathi", "in bengali", "in kannada", "in malayalam", "in gujarati", "local language", "explain this form", "what does this document mean", "government scheme", "too complicated", "hard to understand", "what does this word mean", "fill this form", "explain in", "samjhao", "samajh nahi"], "LOCALIZATION_LITERACY"],
];

/**
 * Resolve the skills directory at runtime.
 */
function getSkillsDir(): string {
    const appRoot = app.getAppPath();
    const srcPath = path.join(appRoot, "src", "main", "skills");
    if (fs.existsSync(srcPath)) return srcPath;
    const resourcesPath = path.join(process.resourcesPath, "skills");
    if (fs.existsSync(resourcesPath)) return resourcesPath;
    return path.join(__dirname, "skills");
}

/**
 * Load the markdown content for a single skill file.
 */
function readSkillFile(skillsDir: string, filename: string): string {
    try {
        return fs.readFileSync(path.join(skillsDir, filename), "utf-8");
    } catch {
        console.error(`[skill-loader] Could not read skill file: ${filename}`);
        return "";
    }
}

/**
 * Returns the list of unique skill filenames.
 */
function uniqueSkillFiles(): string[] {
    return [...new Set(Object.values(SKILL_MAP))];
}

/**
 * Detect which intents match the user's message using keyword routing.
 * Returns the set of unique skill filenames to load.
 */
export function detectSkillsForMessage(userMessage: string): string[] {
    const lower = userMessage.toLowerCase();
    const matchedFiles = new Set<string>();

    for (const [keywords, intent] of KEYWORD_ROUTES) {
        for (const kw of keywords) {
            if (lower.includes(kw)) {
                const file = SKILL_MAP[intent];
                if (file) matchedFiles.add(file);
                break; // One keyword match is enough for this intent
            }
        }
    }

    return [...matchedFiles];
}

/**
 * Load only the skill files relevant to the user's message.
 * Falls back to file-operations skill if no keywords match
 * (since file ops are the most common source of hallucination).
 */
export function loadSkillsForMessage(userMessage: string): string {
    const skillsDir = getSkillsDir();
    const files = detectSkillsForMessage(userMessage);

    // If no specific skill matched, return empty (pure conversation)
    if (files.length === 0) {
        return "";
    }

    // Cap at 2 skills max to keep tokens reasonable
    const toLoad = files.slice(0, 2);
    const sections: string[] = [];
    for (const file of toLoad) {
        const content = readSkillFile(skillsDir, file);
        if (content) sections.push(content);
    }

    console.log(`[skill-loader] Loaded ${sections.length} skill(s) for message: ${toLoad.join(", ")}`);
    return sections.join("\n\n---\n\n");
}

/**
 * Load ALL skill files (for reference — NOT recommended for every request).
 */
export function loadAllSkills(): string {
    const skillsDir = getSkillsDir();
    console.log(`[skill-loader] Loading ALL skills from: ${skillsDir}`);
    const files = uniqueSkillFiles();
    const sections: string[] = [];
    for (const file of files) {
        const content = readSkillFile(skillsDir, file);
        if (content) sections.push(content);
    }
    console.log(`[skill-loader] Loaded ${sections.length}/${files.length} skill files`);
    return sections.join("\n\n---\n\n");
}
