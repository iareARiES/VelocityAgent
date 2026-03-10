import Groq from "groq-sdk";
import { app, BrowserWindow, desktopCapturer, ipcMain } from "electron";
import { exec } from "child_process";
import * as fs from "fs/promises";
import { getJson } from "serpapi";
import { createMeetingCoachPrompt, createSystemPrompt } from "./prompt";
import { readStore, writeToStore } from "./store";
import { resolveSystemPaths } from "./system-ipc";
import { loadSkillsForMessage } from "./skill-loader";

// <-- FEED YOUR API KEYS HERE DIRECTLY IN CODE -->
const HARDCODED_GROQ_API_KEY = "";
const HARDCODED_SERP_API_KEY = "";

const MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "llama-3.2-90b-vision-preview"; // Used when messages contain image content
const FALLBACK_MODEL = "llama-3.1-8b-instant"; // Used when primary model hits daily token limit

// ── Rate limiter (UNCHANGED) ──────────────────────────────────
const MIN_INTERVAL_MS = 2000;
let lastCallTime = 0;
let rateLimitQueue: Promise<unknown> = Promise.resolve();

function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const result = rateLimitQueue.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallTime);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallTime = Date.now();
    return fn();
  });
  // Queue tracks the FULL operation (wait + fn), so concurrent calls
  // always chain off the previous one's completion, not just the delay.
  // .catch() prevents a failed request from breaking the queue for future calls.
  rateLimitQueue = result.catch(() => { });
  return result;
}

// ── Tool definitions (OpenAI schema format) ──────────────────
const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function" as const,
    function: {
      name: "execute_terminal_command",
      description:
        "Executes a shell command on the user computer and returns the output.",
      parameters: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "take_screenshot",
      description:
        "Takes a screenshot of the user screen. Use when asked to read or analyze the screen.",
      parameters: {
        type: "object" as const,
        properties: {
          reason: {
            type: "string",
            description: "Why the screenshot is needed.",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description:
        "Performs a Google web search and returns organic results.",
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "The search query.",
          },
        },
        required: ["query"],
      },
    },
  },
];

// ── Shared tool executor ─────────────────────────────────────
type ToolResult =
  | { type: "standard"; content: string }
  | { type: "screenshot"; followupMessages: Array<{ role: string; content: any }> };

async function executeTool(
  name: string,
  args: Record<string, any>,
  serpApiKey: string
): Promise<ToolResult> {
  switch (name) {
    case "execute_terminal_command": {
      const { stdout, stderr } = await Promise.race([
        new Promise<{ stdout: string; stderr: string }>((resolve) =>
          exec(
            args.command as string,
            { cwd: app.getPath("desktop"), shell: "powershell.exe", timeout: 30000 },
            (err, stdout, stderr) =>
              resolve({ stdout, stderr: err ? stderr : "" })
          )
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Command timeout")), 30000)
        ),
      ]);
      return { type: "standard", content: JSON.stringify({ stdout, stderr }) };
    }
    case "take_screenshot": {
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1280, height: 720 },
      });
      const imageBase64 = sources[0].thumbnail.toPNG().toString("base64");
      return {
        type: "screenshot",
        followupMessages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Screen captured. ${args.reason ?? ""}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      };
    }
    case "web_search": {
      const results = await Promise.race([
        getJson({
          engine: "google",
          q: args.query as string,
          api_key: serpApiKey,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Search timeout")), 15000)
        ),
      ]);
      const organic =
        (results as any)["organic_results"]
          ?.slice(0, 3)
          .map((r: any) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet,
          })) ?? [];
      const answer_box = (results as any)["answer_box"] ?? null;
      return {
        type: "standard",
        content: JSON.stringify({ results: organic, answer_box }),
      };
    }
    default:
      return {
        type: "standard",
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
      };
  }
}

// ── History trimming ─────────────────────────────────────────
function trimHistory(
  history: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  // Only keep user/assistant messages (no tool messages)
  let h = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-6);
  // Must start with a user message
  while (h.length > 0 && h[0].role !== "user") h = h.slice(1);
  // Enforce strict alternation: user, assistant, user, assistant...
  const valid: typeof h = [];
  let expect: "user" | "assistant" = "user";
  for (const msg of h) {
    if (msg.role === expect) {
      valid.push(msg);
      expect = expect === "user" ? "assistant" : "user";
    }
  }
  return valid;
}

// ── File attachment helper ───────────────────────────────────
async function buildUserContent(
  prompt: string,
  file?: { path: string }
): Promise<any> {
  if (!file) return prompt; // simple string content

  const [fileBuffer, fileTypeModule] = await Promise.all([
    fs.readFile(file.path),
    eval("import('file-type')"),
  ]);
  const fileType = await fileTypeModule.fileTypeFromBuffer(fileBuffer);

  if (fileType?.mime.startsWith("image/")) {
    // Vision: send as image_url
    return [
      { type: "text", text: prompt },
      {
        type: "image_url",
        image_url: {
          url: `data:${fileType.mime};base64,${fileBuffer.toString("base64")}`,
        },
      },
    ];
  } else {
    // Text/code file: include as text
    const textContent = fileBuffer.toString("utf-8");
    return `${prompt}\n\n--- Attached file content ---\n${textContent}`;
  }
}

// ── Main export ──────────────────────────────────────────────
export function registerAIIpc() {
  // Resolve system paths ONCE at registration time (they don't change)
  const systemPaths = resolveSystemPaths();

  // ── Handler 1: invoke-ai (non-streaming, legacy fallback) ──
  ipcMain.handle(
    "invoke-ai",
    async (_, prompt: string, history: any[], file?: { path: string }) =>
      withRateLimit(async () => {
        const groqApiKey = HARDCODED_GROQ_API_KEY || readStore().apiKey;
        const serpApiKey = HARDCODED_SERP_API_KEY || readStore().serpApiKey;
        if (!groqApiKey) return "API Key not set.";

        const client = new Groq({ apiKey: groqApiKey });
        const skillContent = loadSkillsForMessage(prompt);
        const sysPrompt = createSystemPrompt(
          readStore().userDescription ?? "",
          systemPaths,
          skillContent
        );
        const userContent = await buildUserContent(prompt, file);
        const messages: any[] = [
          { role: "system", content: sysPrompt },
          ...trimHistory(history),
          { role: "user", content: userContent },
        ];

        let callsHandled = 0;
        const maxCalls = 3;

        while (true) {
          try {
            // Dynamic model switching: use vision model when messages contain image arrays
            const hasVisionContent = messages.some((m: any) => Array.isArray(m.content));
            const activeModel = hasVisionContent ? VISION_MODEL : MODEL;

            const completion = await client.chat.completions.create({
              model: activeModel,
              messages,
              // Vision models don't support function-calling — strip tools when processing images
              tools: hasVisionContent ? undefined : TOOLS,
              tool_choice: hasVisionContent ? undefined : "auto",
              stream: false,
            });
            const msg = completion.choices[0].message;

            if (msg.tool_calls?.length && callsHandled < maxCalls) {
              const tc = msg.tool_calls[0];
              const args = JSON.parse(tc.function.arguments);
              const res = await executeTool(tc.function.name, args, serpApiKey);
              // Groq requires content to be a string, not null
              messages.push({ ...msg, content: msg.content ?? "" });
              if (res.type === "screenshot") {
                messages.push(...res.followupMessages);
              } else {
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: res.content,
                });
              }
              callsHandled++;
              continue;
            }
            return msg.content ?? "";
          } catch (err: any) {
            // Handle Groq tool_use_failed — retry without tools
            if (err?.status === 400 && err?.error?.code === "tool_use_failed") {
              console.log("invoke-ai: tool_use_failed — retrying without tools");
              const fallback = await client.chat.completions.create({
                model: MODEL,
                messages,
                stream: false,
              });
              return fallback.choices[0].message.content ?? "";
            }
            throw err;
          }
        }
      })
  );

  // ── Handler 2: invoke-ai-stream (primary, used by ChatPage) ──
  ipcMain.handle(
    "invoke-ai-stream",
    async (
      event,
      requestId: string,
      prompt: string,
      history: any[],
      file?: { path: string }
    ) =>
      withRateLimit(async () => {
        const groqApiKey = HARDCODED_GROQ_API_KEY || readStore().apiKey;
        const serpApiKey = HARDCODED_SERP_API_KEY || readStore().serpApiKey;

        if (!groqApiKey) {
          event.sender.send("ai-stream-error", {
            requestId,
            error: "API Key not set. Please set your Groq API key in Settings.",
          });
          return;
        }

        const client = new Groq({ apiKey: groqApiKey });
        const skillContent = loadSkillsForMessage(prompt);
        const sysPrompt = createSystemPrompt(
          readStore().userDescription ?? "",
          systemPaths,
          skillContent
        );
        const userContent = await buildUserContent(prompt, file);
        const messages: any[] = [
          { role: "system", content: sysPrompt },
          ...trimHistory(history),
          { role: "user", content: userContent },
        ];

        let finalText = "";
        let callsHandled = 0;
        const maxCalls = 3;
        const maxRetries = 3;
        let attempt = 0;
        let currentModel = MODEL; // May switch to FALLBACK_MODEL on daily TPD limit

        try {
          while (true) {
            // Retry loop for transient errors
            let finishReason: string | null = null;
            const toolCallsAcc: any[] = [];

            while (true) {
              try {
                // Dynamic model switching: use vision model when messages contain image arrays
                const hasVisionContent = messages.some((m: any) => Array.isArray(m.content));
                const activeModel = hasVisionContent ? VISION_MODEL : currentModel;

                const stream = await client.chat.completions.create({
                  model: activeModel,
                  messages,
                  // Vision models don't support function-calling — strip tools when processing images
                  tools: hasVisionContent ? undefined : TOOLS,
                  tool_choice: hasVisionContent ? undefined : "auto",
                  stream: true,
                });

                for await (const chunk of stream) {
                  const choice = chunk.choices[0];
                  if (!choice) continue;

                  finishReason = choice.finish_reason ?? finishReason;

                  // Stream text content to renderer
                  const text = choice.delta?.content;
                  if (text) {
                    finalText += text;
                    event.sender.send("ai-stream-chunk", {
                      requestId,
                      text,
                    });
                  }

                  // Accumulate tool calls across chunks
                  if (choice.delta?.tool_calls) {
                    for (const tc of choice.delta.tool_calls) {
                      if (!toolCallsAcc[tc.index]) {
                        toolCallsAcc[tc.index] = {
                          id: tc.id ?? "",
                          type: "function",
                          function: {
                            name: tc.function?.name ?? "",
                            arguments: "",
                          },
                        };
                      }
                      if (tc.id) toolCallsAcc[tc.index].id = tc.id;
                      if (tc.function?.name)
                        toolCallsAcc[tc.index].function.name = tc.function.name;
                      toolCallsAcc[tc.index].function.arguments +=
                        tc.function?.arguments ?? "";
                    }
                  }
                }

                // Stream consumed successfully — exit retry loop
                break;
              } catch (err: any) {
                const status = err?.status;
                const errorCode = err?.error?.code;

                // Handle Groq tool_use_failed — model generated malformed tool call
                // Retry without tools so it responds with plain text
                if (status === 400 && errorCode === "tool_use_failed") {
                  console.log("Groq tool_use_failed — retrying without tools");
                  const fallbackStream = await client.chat.completions.create({
                    model: currentModel,
                    messages,
                    stream: true,
                    // No tools — force plain text response
                  });
                  for await (const chunk of fallbackStream) {
                    const choice = chunk.choices[0];
                    if (!choice) continue;
                    finishReason = choice.finish_reason ?? finishReason;
                    const text = choice.delta?.content;
                    if (text) {
                      finalText += text;
                      event.sender.send("ai-stream-chunk", {
                        requestId,
                        text,
                      });
                    }
                  }
                  break;
                }

                if (
                  (status === 503 || status === 429) &&
                  attempt < maxRetries
                ) {
                  // Check if this is a daily token limit (TPD) — switch model instead of retrying
                  const errMsg = err?.error?.error?.message ?? err?.message ?? "";
                  if (status === 429 && errMsg.includes("tokens per day")) {
                    console.log(
                      `Groq daily token limit hit for ${currentModel} — switching to fallback model ${FALLBACK_MODEL}`
                    );
                    currentModel = FALLBACK_MODEL;
                    attempt = 0; // Reset retries for the new model
                    continue;
                  }
                  const backoffMs = 500 * Math.pow(2, attempt);
                  console.log(
                    `Groq ${status} — retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
                  );
                  await new Promise((r) => setTimeout(r, backoffMs));
                  attempt++;
                  continue;
                }
                throw err;
              }
            }

            // Handle tool calls
            if (
              finishReason === "tool_calls" &&
              toolCallsAcc.length > 0 &&
              callsHandled < maxCalls
            ) {
              const tc = toolCallsAcc[0];
              try {
                const args = JSON.parse(tc.function.arguments);
                const res = await executeTool(tc.function.name, args, serpApiKey);

                // Push the assistant's tool_call message (Groq requires content to be a string)
                messages.push({
                  role: "assistant",
                  content: "",
                  tool_calls: toolCallsAcc.map((t: any) => ({
                    id: t.id,
                    type: "function",
                    function: {
                      name: t.function.name,
                      arguments: t.function.arguments,
                    },
                  })),
                });

                if (res.type === "screenshot") {
                  try {
                    messages.push(...res.followupMessages);
                  } catch (screenshotErr: any) {
                    // Vision may not be available — fallback to text
                    messages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      name: tc.function.name,
                      content:
                        "Screenshot was taken but vision is not available for this model configuration.",
                    });
                  }
                } else {
                  messages.push({
                    role: "tool",
                    tool_call_id: tc.id,
                    name: tc.function.name,
                    content: res.content,
                  });
                }

                callsHandled++;
                attempt = 0; // Reset retry counter for the next API call
                continue; // Loop back to make another API call with tool results
              } catch (toolErr: any) {
                console.error("Tool execution error:", toolErr);
                // Feed the error back to the model so it can still respond to the user
                // Groq requires content to be a string, not null
                messages.push({
                  role: "assistant",
                  content: "",
                  tool_calls: toolCallsAcc.map((t: any) => ({
                    id: t.id,
                    type: "function",
                    function: {
                      name: t.function.name,
                      arguments: t.function.arguments,
                    },
                  })),
                });
                messages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.function.name,
                  content: JSON.stringify({ error: toolErr.message || "Tool execution failed" }),
                });
                callsHandled++;
                attempt = 0;
                continue; // Let the model see the error and generate a text response
              }
            }

            // Finished — send final text
            event.sender.send("ai-stream-end", {
              requestId,
              finalText,
            });
            break;
          }
        } catch (err: any) {
          console.error("Error in invoke-ai-stream:", err);
          const errorMessage =
            err?.error?.message ||
            err?.message ||
            "An unexpected error occurred.";
          event.sender.send("ai-stream-error", {
            requestId,
            error: `AI Error: ${errorMessage}`,
          });
        }
      })
  );

  // ── Handler 3: invoke-coach (meeting coach) ──
  ipcMain.handle(
    "invoke-coach",
    async (_, transcript: string, meetingContext: string) => {
      const groqApiKey = HARDCODED_GROQ_API_KEY || readStore().apiKey;
      if (!groqApiKey) {
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          "coach-response-error",
          "No API key"
        );
        return;
      }
      try {
        const client = new Groq({ apiKey: groqApiKey });
        const prompt = createMeetingCoachPrompt(transcript, meetingContext);
        const res = await client.chat.completions.create({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        });
        const text = res.choices[0].message.content ?? "";
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          "coach-response",
          text
        );
      } catch (err) {
        BrowserWindow.getAllWindows()[0]?.webContents.send(
          "coach-response-error",
          (err as Error).message
        );
      }
    }
  );

  // ── Settings IPC handlers (UNCHANGED) ──
  ipcMain.handle("get-api-key", () => {
    return HARDCODED_GROQ_API_KEY || readStore().apiKey;
  });

  ipcMain.handle("set-api-key", (_, key: string) => {
    writeToStore("apiKey", key);
  });

  ipcMain.handle("get-serpapi-key", () => {
    return HARDCODED_SERP_API_KEY || readStore().serpApiKey;
  });

  ipcMain.handle("set-serpapi-key", (_, key: string) => {
    writeToStore("serpApiKey", key);
  });

  ipcMain.handle("get-user-description", () => {
    return readStore().userDescription || "";
  });

  ipcMain.handle("set-user-description", (_, desc: string) => {
    writeToStore("userDescription", desc);
  });
}
