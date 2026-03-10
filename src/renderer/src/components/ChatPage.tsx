import React, {
  useState,
  FormEvent,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import "regenerator-runtime/runtime";
import { Page } from "../App";
import MessageBubble from "./MessageBubble";

// ── TTS helpers ──────────────────────────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~#>\[\]]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function useTTS() {
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const cleaned = stripMarkdown(text);
    if (!cleaned) return;
    const utt = new SpeechSynthesisUtterance(cleaned);
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.toLowerCase().includes("female") ||
            v.name.toLowerCase().includes("zira") ||
            v.name.toLowerCase().includes("samantha"))
      ) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0];
    if (preferred) utt.voice = preferred;
    utt.rate = 1.0;
    utt.pitch = 1.0;
    utt.volume = 1.0;
    window.speechSynthesis.speak(utt);
  };
  const stop = () => window.speechSynthesis.cancel();
  return { speak, stop };
}

// Lightweight unique ID for streaming requests
const cryptoRandomId = (): string => {
  try {
    // @ts-ignore - crypto is available in Chromium runtime
    if (typeof crypto !== "undefined" && (crypto as any).randomUUID) {
      // @ts-ignore
      return (crypto as any).randomUUID();
    }
  } catch { }
  return "req_" + Math.random().toString(36).slice(2);
};

interface ChatPageProps {
  navigate: (page: Page, chatId?: string | null) => void;
  chatId: string | null;
  setChatId: (id: string | null) => void;
  onClose?: () => void;
}

export interface Message {
  sender: "user" | "ai";
  text: string;
  file?: { name: string; path: string };
}

type ChatRole = "user" | "assistant";
interface ChatHistoryEntry {
  role: ChatRole;
  content: string;
}

const ChatPage: React.FC<ChatPageProps> = ({
  navigate,
  chatId,
  setChatId,
  onClose,
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [ttsEnabled, setTtsEnabledState] = useState(true);
  const { speak, stop: stopSpeech } = useTTS();

  // Load persisted TTS preference
  useEffect(() => {
    window.electronAPI.getTtsEnabled().then(setTtsEnabledState);
  }, []);

  // Add these refs for the microphone:
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    path: string;
  } | null>(null);
  const [streamingRequestId, setStreamingRequestId] = useState<string | null>(
    null
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingChunkRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording and send to Sarvam
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          // 1. Package the audio
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          setIsTranscribing(true);

          try {
            // 2. Prepare the form data for Sarvam
            const formData = new FormData();
            formData.append("file", audioBlob, "audio.wav");
            formData.append("model", "saaras:v3");
            formData.append("mode", "translate");

            // 3. Send to Sarvam via REST API
            const response = await fetch("https://api.sarvam.ai/speech-to-text-translate", {
              method: "POST",
              headers: {
                "api-subscription-key": "sk_t7ok8eum_YZESvEqtx6staTJ45Yze3dJP" // <-- PUT YOUR KEY HERE
              },
              body: formData,
            });

            if (!response.ok) throw new Error("Translation failed");

            const data = await response.json();

            // Sarvam usually returns the text in a 'transcript' or 'text' field
            const transcribedText = data.transcript || data.text || "";

            if (transcribedText) {
              // Put the text directly into the chat box!
              setInput((prev) => prev + (prev ? " " : "") + transcribedText);
            }
          } catch (error) {
            console.error("Sarvam API Error:", error);
            setInput("Sorry, I couldn't hear that properly.");
          } finally {
            setIsTranscribing(false);
            // Turn off the microphone hardware
            stream.getTracks().forEach(track => track.stop());
          }
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (error) {
        console.error("Microphone access denied:", error);
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      if (e) e.preventDefault();
      const finalInput = input.trim();
      if ((!finalInput && !attachedFile) || isLoading) return;

      // Stop any in-progress TTS before sending new message
      stopSpeech();

      const userMessage: Message = {
        sender: "user",
        text: finalInput,
        file: attachedFile || undefined,
      };

      // Immediate UI updates for better perceived performance
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      const currentAttachedFile = attachedFile;
      setAttachedFile(null);
      setIsLoading(true);
      setIsStreaming(true);

      try {
        // Prepare history more efficiently - limit to last 4 messages (2 exchanges)
        const currentHistory = [...messages, userMessage];
        const aiHistory: ChatHistoryEntry[] = currentHistory
          .slice(-4) // Reduced to last 4 messages for faster processing
          .map((msg) => ({
            role: msg.sender === "user" ? "user" : "assistant" as ChatRole,
            content: msg.text.slice(0, 1000), // Trim long messages
          }));

        // Streamed response handling
        const reqId = cryptoRandomId();
        setStreamingRequestId(reqId);

        // Optimistically add an empty AI message; we will append chunks into it
        setMessages((prev) => [...prev, { sender: "ai", text: "" }]);

        const flushChunks = () => {
          if (!pendingChunkRef.current) {
            rafIdRef.current = null;
            return;
          }
          const chunkText = pendingChunkRef.current;
          pendingChunkRef.current = "";
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            if (lastIndex >= 0 && updated[lastIndex].sender === "ai") {
              updated[lastIndex] = {
                ...updated[lastIndex],
                text: updated[lastIndex].text + chunkText,
              };
            }
            return updated;
          });
          rafIdRef.current = null;
        };

        const onChunk = (_: any, data: { requestId: string; text: string }) => {
          if (data.requestId !== reqId) return;
          pendingChunkRef.current += data.text;
          if (rafIdRef.current == null) {
            rafIdRef.current = requestAnimationFrame(flushChunks);
          }
        };
        const onEnd = (
          _: any,
          data: { requestId: string; finalText: string }
        ) => {
          if (data.requestId !== reqId) return;
          // Flush any pending chunks before finalizing
          if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
          if (pendingChunkRef.current) {
            const toAppend = pendingChunkRef.current;
            pendingChunkRef.current = "";
            setMessages((prev) => {
              const updated = [...prev];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].sender === "ai") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  text: updated[lastIndex].text + toAppend,
                };
              }
              return updated;
            });
          }
          cleanup();
          setIsStreaming(false);
          setIsLoading(false);
          // Persist chat after final text
          const isNewChat = !chatId;
          const finalAiMessage: Message = {
            sender: "ai",
            text: data.finalText,
          };
          setTimeout(() => {
            window.electronAPI.history
              .saveChat({
                chatId: chatId,
                messagesToAppend: [userMessage, finalAiMessage],
              })
              .then((savedChatId) => {
                if (isNewChat && savedChatId) {
                  setChatId(savedChatId);
                  const titleHistory = aiHistory.slice(-2).concat([
                    {
                      role: "assistant" as ChatRole,
                      content: data.finalText.slice(0, 200),
                    },
                  ]);
                  window.electronAPI.history.generateTitle(
                    savedChatId,
                    titleHistory as any
                  );
                }
              })
              .catch((error) => console.error("Chat saving failed:", error));
          }, 0);
          // Trigger TTS for the final response
          if (ttsEnabled && data.finalText) speak(data.finalText);
        };
        const onError = (
          _: any,
          data: { requestId: string; error: string }
        ) => {
          if (data.requestId !== reqId) return;
          cleanup();
          setIsStreaming(false);
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              sender: "ai",
              text: "Sorry, something went wrong. Please try again.",
            },
          ]);
        };

        const cleanup = () => {
          if (chunkUnsub) chunkUnsub();
          if (endUnsub) endUnsub();
          if (errUnsub) errUnsub();
        };

        const chunkUnsub = window.electronAPI.onAIStreamChunk(onChunk);
        const endUnsub = window.electronAPI.onAIStreamEnd(onEnd);
        const errUnsub = window.electronAPI.onAIStreamError(onError);

        await window.electronAPI.invokeAIStream(
          reqId,
          finalInput,
          aiHistory.slice(0, -1),
          currentAttachedFile || undefined
        );
        // History saving happens on stream end
      } catch (error) {
        console.error(error);
        const errorMessage: Message = {
          sender: "ai",
          text:
            error instanceof Error && error.message.includes("timeout")
              ? "Request timed out. Please try again with a smaller image or simpler query."
              : "Sorry, something went wrong. Please try again.",
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        // keep loading true while streaming; flags handled on end/error
      }
    },
    [
      input,
      attachedFile,
      isLoading,
      messages,
      chatId,
      setChatId,
    ]
  );

  const startNewChat = useCallback(() => {
    setChatId(null);
    setMessages([]);
    setInput("");
    setAttachedFile(null);
    setStreamingRequestId(null);
    setIsStreaming(false);
  }, [setChatId]);

  useEffect(() => {
    const handleFocusInput = () => {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
          window.focus();
        }
      }, 100);
    };

    // Register listeners and store cleanup functions
    const cleanupFocus = window.electronAPI.onFocusInput(handleFocusInput);
    const cleanupSendMessage = window.electronAPI.onSendMessage(
      handleSubmit as () => void
    );
    const cleanupNewChat = window.electronAPI.onNewChat(startNewChat);

    // Return cleanup function to remove listeners
    return () => {
      if (cleanupFocus) cleanupFocus();
      if (cleanupSendMessage) cleanupSendMessage();
      if (cleanupNewChat) cleanupNewChat();
    };
  }, [startNewChat, handleSubmit]);



  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadChat = async () => {
      if (chatId) {
        setIsLoading(true);
        const chatContent = await window.electronAPI.history.getChatContent(
          chatId
        );
        if (chatContent && chatContent.messages)
          setMessages(chatContent.messages);
        else {
          setChatId(null);
          setMessages([]);
        }
        setIsLoading(false);
      } else {
        setMessages([]);
      }
    };
    loadChat();
  }, [chatId, setChatId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) handleSubmit();
      }
    },
    [handleSubmit, isStreaming]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setAttachedFile({ name: file.name, path: (file as any).path });
      }
    },
    []
  );



  return (
    <div className="w-full h-full flex flex-col p-4">
      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Messages Container */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 px-4 py-6 rounded-2xl bg-black/20 backdrop-blur-sm border border-white/10 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-8 h-8 text-blue-400"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white/90 mb-2">
                Start a conversation
              </h3>
              <p className="text-sm text-white/60 max-w-md">
                Ask me anything! I can help with coding, writing, analysis, or
                just have a friendly chat.
              </p>
              <div className="mt-4 text-xs text-white/40">
                Press Ctrl+\ to focus, then start typing...
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <MessageBubble key={index} message={msg} />
            ))
          )}

          {isLoading && (
            <div className="mb-4 animate-fade-in-up flex items-start">
              <div className="bg-white/10 backdrop-blur-sm inline-flex items-center p-4 rounded-2xl border border-white/10">
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-pulse [animation-delay:-0.15s] mx-1"></span>
                <span className="h-2 w-2 bg-blue-400 rounded-full animate-pulse"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Enhanced Input Area */}
      <div className="flex-shrink-0 pt-2 bg-transparent">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative flex items-end p-2 bg-black/30 rounded-2xl border border-white/20 focus-within:border-blue-400/60 focus-within:shadow-lg focus-within:shadow-blue-500/20 transition-all duration-300">
            {/* TTS Toggle Button */}
            <button
              type="button"
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabledState(next);
                window.electronAPI.setTtsEnabled(next);
                stopSpeech();
              }}
              className={`p-2.5 rounded-full transition-all duration-300 self-center ${ttsEnabled
                ? "bg-white/10 hover:bg-white/20 text-white"
                : "bg-white/10 hover:bg-white/20 text-white/30"
                }`}
              title={ttsEnabled ? "Voice output on" : "Voice output off"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 24 24"
                className="w-5 h-5"
              >
                <path d="M3 9v6h4l5 5V4L7 9H3z" />
                {ttsEnabled && (
                  <path d="M16.5 12A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                )}
                {!ttsEnabled && (
                  <line
                    x1="18" y1="6" x2="6" y2="18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>

            {/* Audio Mode Button */}
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isLoading || isTranscribing}
              className={`p-2.5 rounded-full transition-all duration-300 self-center ${isRecording
                ? "bg-red-500 text-white shadow-lg shadow-red-500/30 scale-110 animate-pulse"
                : isTranscribing
                  ? "bg-yellow-500 text-white"
                  : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
                }`}
              title={isRecording ? "Click to Stop & Translate" : "Click to Speak"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            </button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept="image/*,application/pdf"
            />
            {/* File Attachment Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all duration-300 self-center ml-2"
              title="Attach a file"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81"
                />
              </svg>
            </button>

            {/* Main Input Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isRecording}
              className="flex-1 bg-transparent text-white text-base px-3 py-1.5 focus:outline-none disabled:opacity-50 resize-none min-h-[32px] max-h-28"
              placeholder={isRecording ? "Listening..." : "Ask me anything..."}
              rows={1}
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !attachedFile)}
              className={`p-2.5 rounded-full transition-all duration-300 self-center ml-2 ${(!input.trim() && !attachedFile) || isLoading
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:scale-105"
                }`}
              title="Send Message (Enter)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-5 h-5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                />
              </svg>
            </button>
          </div>

          {/* File Attachment Indicator */}
          {attachedFile && (
            <div className="absolute -top-12 left-4 text-xs text-white/80 flex items-center bg-white/10 backdrop-blur-sm px-3 py-2 rounded-xl border border-white/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-4 h-4 mr-2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.122 2.122l7.81-7.81"
                />
              </svg>
              <span>{attachedFile.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFile(null)}
                className="ml-2 text-red-400 hover:text-red-300 text-lg leading-none"
              >
                ×
              </button>
            </div>
          )}

          {/* Audio Mode Indicator */}
          {isRecording && (
            <div className="absolute -top-12 right-4 text-xs text-white/80 flex items-center bg-red-500/20 backdrop-blur-sm px-3 py-2 rounded-xl border border-red-500/30">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
              <span>Listening...</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChatPage;
