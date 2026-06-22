import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Settings, Send, Trash2, ArrowLeft, Eye, EyeOff, Loader2,
  StopCircle, RotateCcw, Check, ClipboardCopy, Save, Key, X,
  Download, Upload, Globe, Mic, MicOff, AudioLines, Volume2, VolumeX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Link } from "wouter";  


const AUTO_DETECT: [string, string, string, string][] = [
  ["gsk_", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", "Groq"],
  ["sk-or-", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini", "OpenRouter"],
  ["pplx-", "https://api.perplexity.ai", "sonar-pro", "Perplexity"],
  ["AIza", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-2.0-flash", "Google Gemini"],
  ["xai-", "https://api.x.ai/v1", "grok-2-latest", "xAI/Grok"],
  ["sk-", "https://api.openai.com/v1", "gpt-4o-mini", "OpenAI"],
];

function detectProvider(key: string): { url: string; model: string; name: string } | null {
  const k = (key || "").trim();
  for (const [prefix, url, model, name] of AUTO_DETECT) {
    if (k.startsWith(prefix)) return { url, model, name };
  }
  return null;
}

interface SavedKey {
  id: string;
  label: string;
  key: string;
  url: string;
  model: string;
  provider: string;
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border bg-zinc-950 dark:bg-zinc-900" data-testid="code-block">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 text-zinc-400 text-[10px] font-mono">
        <span>{lang || "code"}</span>
        <button onClick={doCopy} className="flex items-center gap-1 hover:text-white transition-colors" data-testid="button-copy-code-block">
          {copied ? <><Check className="w-3 h-3 text-emerald-400" /> Copiado!</> : <><ClipboardCopy className="w-3 h-3" /> Copiar código</>}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed text-zinc-100 font-mono"><code>{code}</code></pre>
    </div>
  );
}

function RenderText({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          urlRegex.lastIndex = 0;
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function RenderContent({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return (
    <div>
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (codeMatch) {
          return <CodeBlock key={i} lang={codeMatch[1]} code={codeMatch[2].trimEnd()} />;
        }
        if (part.trim()) {
          return (
            <p key={i} className="text-xs leading-relaxed whitespace-pre-wrap my-1">
              <RenderText text={part} />
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}

export default function CodeAssistant() {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("code_api_key") || "");
  const [apiUrl, setApiUrl] = useState(() => localStorage.getItem("code_api_url") || "https://api.groq.com/openai/v1");
  const [apiModel, setApiModel] = useState(() => localStorage.getItem("code_api_model") || "llama-3.3-70b-versatile");
  const [showKey, setShowKey] = useState(false);
  const [showConfig, setShowConfig] = useState(() => !localStorage.getItem("code_api_key"));
  const [showSavedKeys, setShowSavedKeys] = useState(false);
  const [savedKeys, setSavedKeys] = useState<SavedKey[]>(() => {
    try { return JSON.parse(localStorage.getItem("code_saved_keys") || "[]"); } catch { return []; }
  });
  const [keyLabel, setKeyLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [citations, setCitations] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("code_chat_history") || "[]"); } catch { return []; }
  });
  const [isListening, setIsListening] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const wantsListeningRef = useRef(false);

  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [voiceMsgs, setVoiceMsgs] = useState<Array<{role: "user"|"assistant"; text: string}>>([]);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const [voiceInput, setVoiceInput] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceRecRef = useRef<any>(null);
  const voiceScrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const playTtsFallback = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text.replace(/<[^>]*>/g, '').substring(0, 500));
    utt.lang = "pt-BR";
    utt.rate = 1.1;
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith("pt"));
    if (ptVoice) utt.voice = ptVoice;
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utt);
  }, []);

  const playTts = useCallback(async (text: string) => {
    stopAudio();
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/```[\s\S]*?```/g, '').substring(0, 1000);
    setIsSpeaking(true);
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });
      const contentType = resp.headers.get("content-type") || "";
      if (!resp.ok || !contentType.includes("audio")) {
        playTtsFallback(cleanText);
        return;
      }
      const blob = await resp.blob();
      if (!blob || blob.size < 100) {
        playTtsFallback(cleanText);
        return;
      }
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setIsSpeaking(false); audioRef.current = null; URL.revokeObjectURL(url); };
      audio.onerror = () => { setIsSpeaking(false); audioRef.current = null; URL.revokeObjectURL(url); playTtsFallback(cleanText); };
      await audio.play();
    } catch {
      setIsSpeaking(false);
      playTtsFallback(cleanText);
    }
  }, [stopAudio, playTtsFallback]);

  const voiceChatSend = useCallback(async (userText: string) => {
    if (!userText.trim() || voiceProcessing) return;
    const msgs = [...voiceMsgs, { role: "user" as const, text: userText.trim() }];
    setVoiceMsgs(msgs);
    setVoiceProcessing(true);
    try {
      const resp = await fetch("/api/code-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText.trim(),
          history: msgs.map(m => ({ role: m.role, content: m.text })),
          apiKey: apiKey.trim(),
          apiUrl: apiUrl.trim().replace(/\/$/, ""),
          apiModel: apiModel.trim(),
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({})) as any;
        setVoiceMsgs(prev => [...prev, { role: "assistant", text: `Erro: ${errData?.message || resp.status}` }]);
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Sem resposta");
      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.text || parsed.content || parsed.choices?.[0]?.delta?.content || "";
            if (delta) fullText += delta;
          } catch {}
        }
      }
      const reply = fullText.trim() || "Desculpe, nao consegui responder.";
      setVoiceMsgs(prev => [...prev, { role: "assistant", text: reply }]);
      playTts(reply);
    } catch {
      setVoiceMsgs(prev => [...prev, { role: "assistant", text: "Erro de conexao. Tente novamente." }]);
    } finally {
      setVoiceProcessing(false);
    }
  }, [voiceMsgs, voiceProcessing, apiKey, apiUrl, apiModel, playTts]);

  useEffect(() => {
    if (voiceScrollRef.current) voiceScrollRef.current.scrollTop = voiceScrollRef.current.scrollHeight;
  }, [voiceMsgs, voiceProcessing]);

  const voiceToggleMic = useCallback(() => {
    if (voiceListening) {
      voiceRecRef.current?.stop();
      setVoiceListening(false);
      return;
    }
    if (isSpeaking) stopAudio();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Use Chrome ou Edge para ditar por voz.", variant: "destructive" }); return; }
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = false;
    rec.interimResults = false;
    let captured = false;
    rec.onresult = (e: any) => {
      if (captured) return;
      const last = e.results[e.results.length - 1];
      if (last?.isFinal) {
        const text = last[0].transcript.trim();
        if (text) { captured = true; setTimeout(() => voiceChatSend(text), 300); }
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed") toast({ title: "Microfone bloqueado", variant: "destructive" });
      setVoiceListening(false);
    };
    rec.onend = () => { voiceRecRef.current = null; setVoiceListening(false); };
    voiceRecRef.current = rec;
    try { rec.start(); setVoiceListening(true); } catch { setVoiceListening(false); }
  }, [voiceListening, voiceChatSend, toast, isSpeaking, stopAudio]);

  useEffect(() => {
    if (apiKey) localStorage.setItem("code_api_key", apiKey);
    if (apiUrl) localStorage.setItem("code_api_url", apiUrl);
    if (apiModel) localStorage.setItem("code_api_model", apiModel);
  }, [apiKey, apiUrl, apiModel]);

  useEffect(() => {
    localStorage.setItem("code_saved_keys", JSON.stringify(savedKeys));
  }, [savedKeys]);

  useEffect(() => {
    if (!apiKey) return;
    const clean = apiKey.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)[0] || "";
    if (!clean) return;
    const d = detectProvider(clean);
    if (d && !apiUrl.includes(new URL(d.url).hostname)) {
      setApiUrl(d.url);
      setApiModel(d.model);
    }
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("code_chat_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => {
      wantsListeningRef.current = false;
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, result]);

  const applyKey = (k: string) => {
    setApiKey(k);
    const d = detectProvider(k);
    if (d) {
      setApiUrl(d.url);
      setApiModel(d.model);
    }
  };

  const saveCurrentKey = () => {
    if (!apiKey.trim()) return;
    const d = detectProvider(apiKey);
    const label = keyLabel.trim() || d?.name || "Chave " + (savedKeys.length + 1);
    const exists = savedKeys.some(sk => sk.key === apiKey.trim());
    if (exists) {
      toast({ title: "Chave já salva", description: "Esta chave já está na sua lista." });
      return;
    }
    const newKey: SavedKey = {
      id: Date.now().toString(),
      label,
      key: apiKey.trim(),
      url: apiUrl,
      model: apiModel,
      provider: d?.name || "Custom",
    };
    setSavedKeys(prev => [...prev, newKey]);
    setKeyLabel("");
    toast({ title: "Chave salva!", description: `"${label}" adicionada à sua lista.` });
  };

  const loadKey = (sk: SavedKey) => {
    setApiKey(sk.key);
    setApiUrl(sk.url);
    setApiModel(sk.model);
    setShowSavedKeys(false);
    toast({ title: `Chave "${sk.label}" ativada` });
  };

  const removeKey = (id: string) => {
    setSavedKeys(prev => prev.filter(k => k.id !== id));
    toast({ title: "Chave removida" });
  };

  const sendMessage = useCallback(async () => {
    if (!prompt.trim()) return;

    if (wantsListeningRef.current) {
      wantsListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const userMsg = prompt.trim();
    setPrompt("");
    const newHistory = [...history, { role: "user" as const, content: userMsg }];
    setHistory(newHistory);
    setIsProcessing(true);
    setResult("");
    setCitations([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/code-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: newHistory,
          apiKey: apiKey.trim(),
          apiUrl: apiUrl.trim().replace(/\/$/, ""),
          apiModel: apiModel.trim(),
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ message: `Erro ${resp.status}` }));
        throw new Error(errData.message || `Erro ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Sem resposta");

      const decoder = new TextDecoder();
      let fullText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.error) throw new Error(parsed.error);
            const delta = parsed.text || parsed.content || parsed.choices?.[0]?.delta?.content || "";
            if (delta) {
              fullText += delta;
              setResult(fullText);
            }
            if (parsed.citations && Array.isArray(parsed.citations)) {
              setCitations(parsed.citations);
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }

      if (fullText.trim()) {
        setHistory(prev => [...prev, { role: "assistant", content: fullText }]);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errMsg = err.message || "Erro desconhecido";
      toast({ title: "Erro", description: errMsg.substring(0, 300), variant: "destructive" });
      setHistory(prev => [...prev, { role: "assistant", content: `Erro: ${errMsg}` }]);
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  }, [prompt, apiKey, apiUrl, apiModel, history, toast]);

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  };

  const clearHistory = () => {
    setHistory([]);
    setResult("");
    setCitations([]);
    localStorage.removeItem("code_chat_history");
    toast({ title: "Conversa limpa" });
  };

  const exportConversation = () => {
    if (history.length === 0) return;
    const lines: string[] = [];
    lines.push("=== CONVERSA EXPORTADA — Assistente Livre ===");
    lines.push(`Data: ${new Date().toLocaleString("pt-BR")}`);
    lines.push(`Provedor: ${activeProvider?.name || apiModel}`);
    lines.push("");
    history.forEach((msg, i) => {
      lines.push(`[${msg.role === "user" ? "VOCÊ" : "IA"}]`);
      lines.push(msg.content);
      lines.push("");
    });
    if (citations.length > 0) {
      lines.push("=== FONTES ===");
      citations.forEach((url, i) => lines.push(`[${i + 1}] ${url}`));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversa-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exportado!", description: "Conversa salva como .txt" });
  };
const startVoice = useCallback(() => {
  if (wantsListeningRef.current) {
    wantsListeningRef.current = false;
    recognitionRef.current?.stop();
    setIsListening(false);
    return;
  }

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast({ title: "Use Chrome ou Edge para ditar por voz.", variant: "destructive" });
    return;
  }

  wantsListeningRef.current = true;

  const recognition = new SpeechRecognition();
  recognition.lang = "pt-BR";
  recognition.continuous = false;
  recognition.interimResults = false;
  let captured = false;

  recognition.onresult = (event: any) => {
    if (captured) return;
    const last = event.results[event.results.length - 1];
    if (last && last.isFinal) {
      const finalTranscript = last[0].transcript;
      if (finalTranscript.trim()) {
        captured = true;
        wantsListeningRef.current = false;
        try { recognition.stop(); } catch {}
        setPrompt(prev => {
          const base = (prev || "").trimEnd();
          return base ? base + " " + finalTranscript.trim() + " " : finalTranscript.trim() + " ";
        });
      }
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error === "not-allowed") {
      wantsListeningRef.current = false;
      setIsListening(false);
      toast({ title: "Microfone bloqueado", description: "Permita o microfone no navegador.", variant: "destructive" });
    } else if (event.error !== "aborted" && !captured) {
      setIsListening(false);
    }
  };

  recognition.onend = () => {
    wantsListeningRef.current = false;
    recognitionRef.current = null;
    setIsListening(false);
  };

  recognitionRef.current = recognition;
  try {
    recognition.start();
    setIsListening(true);
  } catch {
    wantsListeningRef.current = false;
    recognitionRef.current = null;
    setIsListening(false);
  }
}, [toast]);
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        setPrompt(prev => prev ? prev + "\n\n" + text : text);
        toast({ title: "Arquivo importado!", description: `${file.name} adicionado ao campo de mensagem.` });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copiado!" });
  };

  const copyTextOnly = (content: string) => {
    const textOnly = content.replace(/```[\s\S]*?```/g, "").replace(/\n{3,}/g, "\n\n").trim();
    navigator.clipboard.writeText(textOnly);
    toast({ title: "Texto copiado!" });
  };

  const activeProvider = detectProvider(apiKey);

  return (
    <div className="min-h-screen flex flex-col bg-background" data-testid="code-assistant-page">
      <header className="px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/">
              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-back-home" title="Voltar">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" />
            <h1 className="text-sm font-semibold truncate">Assistente Livre</h1>
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full truncate">
              {activeProvider ? activeProvider.name : "Gemini (Replit)"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              onClick={exportConversation} disabled={history.length === 0}
              data-testid="button-export-conversation" title="Exportar conversa como .txt"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => importRef.current?.click()}
              data-testid="button-import-file" title="Importar arquivo de texto"
            >
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <input ref={importRef} type="file" accept=".txt,.md,.csv,.json" className="hidden" onChange={handleImport} />
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setShowConfig(!showConfig); setShowSavedKeys(false); }} data-testid="button-toggle-config">
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => { setShowSavedKeys(!showSavedKeys); setShowConfig(false); }} data-testid="button-toggle-saved-keys" title="Chaves salvas">
              <Key className="w-3.5 h-3.5" />
              {savedKeys.length > 0 && <span className="text-[10px]">{savedKeys.length}</span>}
            </Button>
            {hasSpeechRecognition && (
              <Button
                size="sm"
                variant={showVoiceChat ? "default" : "outline"}
                className="h-7 gap-1 text-xs"
                onClick={() => setShowVoiceChat(true)}
                data-testid="button-voice-chat-open"
                title="Conversa por voz"
              >
                <AudioLines className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">VOZ</span>
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={clearHistory} data-testid="button-clear-code" title="Limpar conversa">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {showSavedKeys && (
        <div className="border-b bg-muted/30 p-3 space-y-2" data-testid="saved-keys-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chaves Salvas</h3>
            <span className="text-[10px] text-muted-foreground">{savedKeys.length} chave{savedKeys.length !== 1 ? "s" : ""}</span>
          </div>
          {savedKeys.length === 0 ? (
            <p className="text-[11px] text-muted-foreground py-2 text-center">Nenhuma chave salva. Abra Config, cole uma chave e clique em Salvar.</p>
          ) : (
            <div className="space-y-1.5">
              {savedKeys.map(sk => (
                <div key={sk.id} className={`flex items-center gap-2 p-2 rounded-md border text-xs ${sk.key === apiKey ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700" : "bg-card hover:bg-muted/50"}`} data-testid={`saved-key-${sk.id}`}>
                  <button onClick={() => loadKey(sk)} className="flex-1 text-left min-w-0">
                    <div className="font-medium truncate">{sk.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{sk.provider} · {sk.key.substring(0, 8)}...{sk.key.slice(-4)}</div>
                  </button>
                  {sk.key === apiKey && <span className="text-[9px] text-emerald-600 font-bold shrink-0">ATIVA</span>}
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 text-red-400 hover:text-red-600" onClick={() => removeKey(sk.id)} data-testid={`button-remove-key-${sk.id}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showConfig && (
        <div className="border-b bg-muted/30 p-3 space-y-3" data-testid="code-config-panel">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Configurar API</h3>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              {apiKey ? "Sua chave ativa" : "Usando Gemini (Replit)"}
            </span>
          </div>
          {!apiKey && (
            <p className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950 px-2 py-1.5 rounded border border-blue-200 dark:border-blue-800">
              Sem chave configurada — usando Gemini do Replit. Para usar sua própria chave, cole abaixo.
            </p>
          )}

          <div className="grid gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Chave de API (opcional — cole Groq, Gemini, OpenAI, etc.)</Label>
              <div className="flex gap-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => applyKey(e.target.value.trim())}
                  placeholder="Cole qualquer chave: gsk_..., pplx-..., sk-..., AIza..., xai-..., etc."
                  className="h-8 text-xs font-mono"
                  data-testid="input-code-api-key"
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>

            {apiKey && (
              <div className="flex gap-1 items-end">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground">Nome para salvar (opcional)</Label>
                  <Input value={keyLabel} onChange={e => setKeyLabel(e.target.value)} placeholder={activeProvider?.name || "Minha chave"} className="h-7 text-[11px]" data-testid="input-key-label" />
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px] px-2 shrink-0" onClick={saveCurrentKey} data-testid="button-save-key">
                  <Save className="w-3 h-3" />
                  Salvar chave
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] text-muted-foreground">URL da API (auto-detectada)</Label>
                <Input value={apiUrl} onChange={e => setApiUrl(e.target.value)} placeholder="https://api.groq.com/openai/v1" className="h-7 text-[10px] font-mono" data-testid="input-code-api-url" />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Modelo (auto-detectado)</Label>
                <Input value={apiModel} onChange={e => setApiModel(e.target.value)} placeholder="llama-3.3-70b-versatile" className="h-7 text-[10px] font-mono" data-testid="input-code-api-model" />
              </div>
            </div>
          </div>

          {apiKey && (
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              ✓ {activeProvider?.name || "API"} configurada · {apiUrl.replace(/https?:\/\//, "").split("/")[0]} · {apiModel}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 space-y-3" ref={resultRef}>
        {history.length === 0 && !result && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-12" data-testid="code-empty-state">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium mb-1">Assistente Livre</p>
            <p className="text-xs max-w-md">
              Cole sua chave e converse livremente — código, pesquisa jurídica, perguntas gerais, análise de texto ou qualquer assunto.
            </p>
            <p className="text-[10px] mt-2 text-muted-foreground/60">
              Usa apenas sua chave · Sem custo Replit · Sem limites de assunto
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-3 text-[10px] text-muted-foreground/70">
              <span className="border rounded px-2 py-0.5">Groq (gsk_...)</span>
              <span className="border rounded px-2 py-0.5">Perplexity (pplx-...)</span>
              <span className="border rounded px-2 py-0.5">Gemini (AIza...)</span>
              <span className="border rounded px-2 py-0.5">OpenAI (sk-...)</span>
              <span className="border rounded px-2 py-0.5">xAI (xai-...)</span>
              <span className="border rounded px-2 py-0.5">OpenRouter (sk-or-...)</span>
            </div>
            {savedKeys.length > 0 && (
              <Button size="sm" variant="outline" className="mt-3 text-xs gap-1" onClick={() => setShowSavedKeys(true)} data-testid="button-open-saved">
                <Key className="w-3 h-3" /> {savedKeys.length} chave{savedKeys.length !== 1 ? "s" : ""} salva{savedKeys.length !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} data-testid={`code-msg-${msg.role}-${i}`}>
            {msg.role === "user" ? (
              <div className="max-w-[85%] rounded-lg px-3 py-2 bg-emerald-600 text-white">
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{msg.content}</pre>
              </div>
            ) : (
              <div className="max-w-[95%] w-full">
                <RenderContent text={i === history.length - 1 && result ? result : msg.content} />
                {!(i === history.length - 1 && isProcessing) && (
                  <div className="flex items-center gap-2 mt-1">
                    {(() => {
                      const fullContent = i === history.length - 1 && result ? result : msg.content;
                      const hasCode = /```[\s\S]*?```/.test(fullContent);
                      return (
                        <>
                          <button
                            className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 transition-colors"
                            onClick={() => copyMessage(fullContent)}
                            data-testid={`button-copy-msg-${i}`}
                          >
                            <ClipboardCopy className="w-2.5 h-2.5" /> Copiar
                          </button>
                          {hasCode && (
                            <button
                              className="text-[10px] px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 flex items-center gap-1 transition-colors"
                              onClick={() => copyTextOnly(fullContent)}
                              data-testid={`button-copy-text-${i}`}
                            >
                              <ClipboardCopy className="w-2.5 h-2.5" /> Copiar texto
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {isProcessing && !result && (
          <div className="flex justify-start">
            <div className="bg-muted border rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Processando...
            </div>
          </div>
        )}

        {isProcessing && result && history.length > 0 && history[history.length - 1].role === "user" && (
          <div className="flex justify-start w-full">
            <div className="max-w-[95%] w-full">
              <RenderContent text={result} />
            </div>
          </div>
        )}

        {citations.length > 0 && !isProcessing && (
          <div className="mt-2 pt-3 border-t border-blue-200 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
              <Globe className="w-3 h-3" /> Fontes da pesquisa ({citations.length})
            </p>
            <ol className="space-y-1">
              {citations.map((url, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-[10px] text-blue-500 font-bold mt-0.5 shrink-0">[{idx + 1}]</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 hover:underline break-all leading-relaxed"
                    data-testid={`citation-link-${idx}`}
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div className="border-t bg-card p-2 shrink-0">
        <div className="flex gap-1.5">
          <Textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Escreva sua mensagem — código, perguntas jurídicas, pesquisa, análise, qualquer assunto..."
            className="min-h-[100px] max-h-[50vh] text-sm resize-none flex-1"
            data-testid="input-code-prompt"
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isProcessing) sendMessage();
              }
            }}
          />
          <div className="flex flex-col gap-1">
            {isProcessing ? (
              <Button size="icon" variant="destructive" className="h-8 w-8" onClick={stopGeneration} data-testid="button-stop-code">
                <StopCircle className="w-4 h-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700" onClick={sendMessage} disabled={!prompt.trim()} data-testid="button-send-code">
                <Send className="w-4 h-4" />
              </Button>
            )}
            <Button
              size="icon"
              variant={isListening ? "destructive" : "ghost"}
              className={`h-8 w-8 ${isListening ? "animate-pulse" : ""}`}
              onClick={startVoice}
              title={isListening ? "Parar ditado" : "Ditar por voz"}
              data-testid="button-voice-code"
            >
              {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setResult(""); setHistory(prev => prev.length > 2 ? prev.slice(0, -2) : []); }} data-testid="button-undo-code" title="Desfazer última">
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 px-1">
          <span className="text-[9px] text-muted-foreground">
            {apiKey ? `${activeProvider?.name || "API"} · ${apiModel}` : "Configure uma chave acima"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
              {history.filter(m => m.role === "user").length} msg
            </span>
            {history.length > 0 && (
              <button onClick={clearHistory} className="text-[9px] text-red-400 hover:text-red-600" data-testid="button-clear-inline">
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showVoiceChat} onOpenChange={(v) => { setShowVoiceChat(v); if (!v) { stopAudio(); voiceRecRef.current?.stop(); setVoiceListening(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AudioLines className="w-5 h-5 text-emerald-500" />
              Conversa por Voz — Livre
            </DialogTitle>
            <DialogDescription>Fale livremente — qualquer assunto. A IA ouve e responde por voz.</DialogDescription>
          </DialogHeader>
          <div ref={voiceScrollRef} className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px] p-2">
            {voiceMsgs.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Clique no microfone e comece a falar.<br/>Ou digite abaixo. A IA vai ouvir e responder por voz.
              </div>
            )}
            {voiceMsgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-emerald-600 text-white" : "bg-muted"}`}>
                  {m.role === "assistant" ? <RenderContent text={m.text} /> : m.text}
                </div>
              </div>
            ))}
            {voiceProcessing && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Pensando...
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                placeholder="Ou digite aqui..."
                value={voiceInput}
                onChange={(e) => setVoiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && voiceInput.trim() && !voiceProcessing) {
                    voiceChatSend(voiceInput.trim());
                    setVoiceInput("");
                  }
                }}
                disabled={voiceProcessing}
                data-testid="input-voice-chat"
              />
              <Button
                size="icon"
                variant={voiceListening ? "destructive" : "default"}
                className={`h-10 w-10 rounded-full ${voiceListening ? "animate-pulse" : ""}`}
                onClick={voiceToggleMic}
                disabled={voiceProcessing}
                data-testid="button-voice-mic"
              >
                {voiceListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              {isSpeaking && (
                <Button size="icon" variant="outline" className="h-10 w-10 rounded-full" onClick={stopAudio} data-testid="button-voice-stop">
                  <VolumeX className="w-5 h-5 text-red-500" />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
              <span>{voiceMsgs.filter(m => m.role === "user").length} mensagens</span>
              <div className="flex items-center gap-2">
                <span>{activeProvider?.name || "Gemini (Replit)"}</span>
                {voiceMsgs.length > 0 && (
                  <button onClick={() => { setVoiceMsgs([]); }} className="text-red-400 hover:text-red-600" data-testid="button-voice-clear">Limpar</button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
