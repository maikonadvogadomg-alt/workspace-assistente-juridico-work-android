import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import TiptapEditor from "@/components/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomAction, Ementa, AiHistory, PromptTemplate, DocTemplate } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,       
  DialogTitle,         
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText,
  CheckCircle,
  Zap,
  Target,
  AlignLeft,
  AlignJustify,
  Cpu,
  Play,
  Sparkles,
  BookOpen,
  Gavel,
  Search,
  Copy,
  Trash2,
  Loader2,
  Upload,
  Download,
  Plus,
  Pencil,
  Settings,
  Library,
  Check,
  X,
  History,
  Clock,
  Send,
  MessageCircle,
  Mic,
  MicOff,
  FolderOpen,
  Coins,
  Paperclip,
  Code2,
  Key,
  Volume2,
  VolumeX,
  AudioLines,
  Scale,
  Clipboard,
  Calculator,
  Building2,
  ExternalLink,
  RefreshCw,
  Maximize2,
  Minimize2,
  Filter,
  Wand2,
  Globe,
  DollarSign,
  BarChart3,
  MessageSquare,
} from "lucide-react";


type ActionType = "resumir" | "revisar" | "refinar" | "simplificar" | "minuta" | "analisar" | "modo-estrito" | "modo-redacao" | "modo-interativo";

interface ActionOption {
  id: ActionType;
  label: string;
  description: string;
  icon: typeof FileText;
  group?: "modos" | "acoes";
}

const ACTIONS: ActionOption[] = [
  { id: "modo-estrito", label: "Corrigir Texto", description: "So corrige portugues e estilo, sem mudar conteudo", icon: CheckCircle, group: "modos" },
  { id: "modo-redacao", label: "Redacao Juridica", description: "Reestrutura e melhora argumentacao sem inventar dados", icon: Sparkles, group: "modos" },
  { id: "modo-interativo", label: "Verificar Lacunas", description: "Aponta o que falta no documento e faz perguntas", icon: Search, group: "modos" },
  { id: "resumir", label: "Resumir", description: "Faz um resumo do documento", icon: FileText, group: "acoes" },
  { id: "revisar", label: "Revisar", description: "Encontra erros e sugere melhorias", icon: CheckCircle, group: "acoes" },
  { id: "refinar", label: "Refinar", description: "Reescreve de forma mais clara", icon: Sparkles, group: "acoes" },
  { id: "simplificar", label: "Linguagem Simples", description: "Traduz juridiques para leigo", icon: BookOpen, group: "acoes" },
  { id: "minuta", label: "Gerar Minuta", description: "Cria minuta a partir do texto", icon: Gavel, group: "acoes" },
  { id: "analisar", label: "Analisar", description: "Analisa pontos e questoes do caso", icon: Search, group: "acoes" },
];

// ─── ESTILOS JURÍDICOS CANÔNICOS ────────────────────────────────────────────
const ESTILOS = {
  PARAGRAFO: `text-indent:4cm;text-align:justify;line-height:1.5;margin:0 0 12pt 0;font-family:'Times New Roman',serif;font-size:12pt`,
  CABECALHO: `text-align:center;text-indent:0;line-height:1.5;margin:0 0 6pt 0;font-family:'Times New Roman',serif;font-size:12pt`,
  TITULO: `font-weight:bold;text-align:justify;text-indent:0;margin:24pt 0 12pt 0;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5`,
  ASSINATURA: `text-align:center;font-weight:bold;text-transform:uppercase;margin-top:36pt;text-indent:0;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5`,
  PEDIDOS: `text-align:justify;text-indent:0;margin-top:12pt;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5`,
  OAB: `text-align:center;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;text-indent:0`,
  DATA_LOCAL: `text-align:right;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;margin-top:24pt;text-indent:0`,
  CITACAO: `margin-left:4cm;margin-right:4cm;text-align:justify;text-indent:0;line-height:1.0;font-family:'Times New Roman',serif;font-size:10pt`,
};
const ESTILOS_WORD = ESTILOS;
// ─────────────────────────────────────────────────────────────────────────────

export default function LegalAssistant() {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState(() => {
    try { return localStorage.getItem("legal_last_result") || ""; } catch { return ""; }
  });
  const [processingStatus, setProcessingStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastQueryCost, setLastQueryCost] = useState<{ inputTokens: number; outputTokens: number; totalUsd: number; model: string } | null>(null);
  const [isResultFullscreen, setIsResultFullscreen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [usePremiumModel, setUsePremiumModel] = useState(() => {
    const saved = localStorage.getItem("legal_model_choice");
    return saved === null ? true : saved === "premium";
  });
  const [usePerplexity, setUsePerplexity] = useState(() => {
    return localStorage.getItem("legal_model_choice") === "perplexity";
  });
  const [useCustomModel, setUseCustomModel] = useState(() => {
    return localStorage.getItem("legal_model_choice") === "custom";
  });
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [demoKeyInfo, setDemoKeyInfo] = useState<{ hasPublicKey: boolean; model: string | null; url: string | null } | null>(null);
  const [demoKeyForm, setDemoKeyForm] = useState({ key: "", model: "", url: "" });
  const [demoKeySaving, setDemoKeySaving] = useState(false);
  const [showDemoKeyDialog, setShowDemoKeyDialog] = useState(false);
  const [showTokenCalc, setShowTokenCalc] = useState(false);
  const [tokenCalcText, setTokenCalcText] = useState("");
  const [showVoiceChat, setShowVoiceChat] = useState(false);
  const [voiceChatMessages, setVoiceChatMessages] = useState<Array<{role: "user"|"assistant"; text: string}>>([]);
  const [voiceChatListening, setVoiceChatListening] = useState(false);
  const [voiceChatProcessing, setVoiceChatProcessing] = useState(false);
  const [voiceChatInput, setVoiceChatInput] = useState("");
  const voiceChatRecRef = useRef<any>(null);
  const voiceChatScrollRef = useRef<HTMLDivElement>(null);
  const [demoKeyTesting, setDemoKeyTesting] = useState(false);
  const [demoKeyTestResult, setDemoKeyTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [editingModel, setEditingModel] = useState<CustomAction | null>(null);
  const [modelLabel, setModelLabel] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [modelPrompt, setModelPrompt] = useState("");
  const [pendingAIAction, setPendingAIAction] = useState<{ type: 'process' | 'refine', body?: any } | null>(null);

  const [effortLevel, setEffortLevel] = useState<number>(() => {
    const saved = localStorage.getItem("legal_effort_level");
    return saved ? parseInt(saved) : 2;
  });
  const [verbosity, setVerbosity] = useState<"curta" | "longa">(() => {
    const saved = localStorage.getItem("legal_verbosity");
    return saved ? (saved as "curta" | "longa") : "curta";
  });

  const [showBiblioteca, setShowBiblioteca] = useState(false);
  const [bibliotecaTab, setBibliotecaTab] = useState<"minha" | "pesquisar">("minha");
  const [showEmentaForm, setShowEmentaForm] = useState(false);
  const [editingEmenta, setEditingEmenta] = useState<Ementa | null>(null);
  const [ementaTitulo, setEmentaTitulo] = useState("");
  const [ementaCategoria, setEmentaCategoria] = useState("");
  const [ementaTexto, setEmentaTexto] = useState("");
  const [selectedEmentaIds, setSelectedEmentaIds] = useState<Set<string>>(new Set());
  const [ementaSearchTerm, setEmentaSearchTerm] = useState("");
  const [ementaFilterCat, setEmentaFilterCat] = useState<string | null>(null);
  const [juriQuery, setJuriQuery] = useState("");
  const [juriTribunais, setJuriTribunais] = useState<string[]>(["STJ", "STF", "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6"]);
  const [juriResults, setJuriResults] = useState<any[]>([]);
  const [juriLoading, setJuriLoading] = useState(false);
  const [juriExpandedIdx, setJuriExpandedIdx] = useState<number | null>(null);
  const [juriEmentaSummaries, setJuriEmentaSummaries] = useState<Record<number, string>>({});
  const [juriEmentaSummarizing, setJuriEmentaSummarizing] = useState<Set<number>>(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [perplexityCitations, setPerplexityCitations] = useState<string[]>([]);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'assistant' | 'user', content: string }>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("legal_chat_history") || "[]");
      if (!Array.isArray(raw)) return [];
      const MAX_LOAD_CHARS = 200_000;
      const total = raw.reduce((s: number, m: any) => s + ((m.content || "").length), 0);
      if (total <= MAX_LOAD_CHARS) return raw;
      const kept: any[] = [];
      let used = 0;
      for (let i = raw.length - 1; i >= 0; i--) {
        const c = (raw[i].content || "").length;
        if (used + c > MAX_LOAD_CHARS && kept.length >= 2) break;
        kept.unshift(raw[i]);
        used += c;
      }
      return kept;
    } catch { return []; }
  });
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [showPromptLib, setShowPromptLib] = useState(false);
  const [showUsageHint, setShowUsageHint] = useState(false);
  const [showPromptForm, setShowPromptForm] = useState(false);
  const [editingPromptTpl, setEditingPromptTpl] = useState<PromptTemplate | null>(null);
  const [promptTplTitulo, setPromptTplTitulo] = useState("");
  const [promptTplCategoria, setPromptTplCategoria] = useState("");
  const [promptTplTexto, setPromptTplTexto] = useState("");
  const [promptTplSearch, setPromptTplSearch] = useState("");
  const [promptTplFilterCat, setPromptTplFilterCat] = useState<string | null>(null);

  const [showDocTemplates, setShowDocTemplates] = useState(false);
  const [showEffortSettings, setShowEffortSettings] = useState(false);
  const [showDocFormatSettings, setShowDocFormatSettings] = useState(false);
  const [showDocTemplateForm, setShowDocTemplateForm] = useState(false);
  const [editingDocTemplate, setEditingDocTemplate] = useState<DocTemplate | null>(null);
  const [docTplTitulo, setDocTplTitulo] = useState("");
  const [docTplCategoria, setDocTplCategoria] = useState("");
  const [docTplConteudo, setDocTplConteudo] = useState("");
  const [selectedDocTemplateId, setSelectedDocTemplateId] = useState<string | null>(null);

  const [manualEditText, setManualEditText] = useState<string | null>(null);
  const [formatSettings, setFormatSettings] = useState(() => {
    const defaults = {
      fontFamily: "Times New Roman",
      fontSize: 12,
      lineHeight: 1.5,
      textAlign: "justify" as string,
      paragraphIndent: 4,
      citationIndent: 4,
      marginTop: 3,
      marginBottom: 3,
      marginLeft: 2,
      marginRight: 2,
    };
    const saved = localStorage.getItem("legal_format_settings_v2");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.fontFamily === "Courier New") {
          localStorage.removeItem("legal_format_settings_v2");
          return defaults;
        }
        if (!parsed.citationIndent || parsed.citationIndent < 4) parsed.citationIndent = 4;
        if (parsed.textAlign === "center" || !parsed.textAlign) parsed.textAlign = "justify";
        return { ...defaults, ...parsed };
      } catch { /* ignore */ }
    }
    return defaults;
  });
  const updateFormat = (key: string, value: any) => {
    setFormatSettings((prev: any) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem("legal_format_settings_v2", JSON.stringify(next));
      return next;
    });
    setEditedHtml(null);
  };

  // Auto-save result and chat history so they survive page reload
  useEffect(() => {
    if (result) {
      localStorage.setItem("legal_last_result", result);
      localStorage.setItem("legal_assistant_temp_editor_content", result);
    }
  }, [result]);

  useEffect(() => {
    const MAX_SAVE_CHARS = 200_000;
    const total = chatHistory.reduce((s, m) => s + (m.content || "").length, 0);
    if (total <= MAX_SAVE_CHARS) {
      try { localStorage.setItem("legal_chat_history", JSON.stringify(chatHistory)); } catch {}
    } else {
      const kept: typeof chatHistory = [];
      let used = 0;
      for (let i = chatHistory.length - 1; i >= 0; i--) {
        const c = (chatHistory[i].content || "").length;
        if (used + c > MAX_SAVE_CHARS && kept.length >= 2) break;
        kept.unshift(chatHistory[i]);
        used += c;
      }
      try { localStorage.setItem("legal_chat_history", JSON.stringify(kept)); } catch {}
    }
  }, [chatHistory]);

  // Reset manual edit when a new AI result arrives
  useEffect(() => {
    if (result) {
      setManualEditText(null);
    }
  }, [result]);

  // Fechar tela cheia com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && isResultFullscreen) setIsResultFullscreen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isResultFullscreen]);

  // Calcular custo estimado quando resultado chega
  useEffect(() => {
    if (result && !isProcessing) {
      const inputTokens = Math.ceil(inputText.length / 3.5);
      const outputTokens = Math.ceil(result.length / 3.5);
      const currentModel = localStorage.getItem("legal_model_choice") || "premium";
      let inputCost = 0;
      let outputCost = 0;
      let modelLabel = "Pro";
      if (currentModel === "custom") {
        inputCost = 0;
        outputCost = 0;
        modelLabel = localStorage.getItem("custom_api_model") || "Chave Própria";
      } else if (currentModel === "perplexity") {
        // sonar-pro: ~$3/M input, ~$15/M output (estimativa)
        inputCost = (inputTokens / 1_000_000) * 3.00;
        outputCost = (outputTokens / 1_000_000) * 15.00;
        modelLabel = "Perplexity";
      } else if (currentModel === "economico") {
        inputCost = (inputTokens / 1_000_000) * 0.15;
        outputCost = (outputTokens / 1_000_000) * 0.60;
        modelLabel = "Flash";
      } else {
        inputCost = (inputTokens / 1_000_000) * 1.25;
        outputCost = (outputTokens / 1_000_000) * 10.00;
        modelLabel = "Pro";
      }
      setLastQueryCost({
        inputTokens,
        outputTokens,
        totalUsd: inputCost + outputCost,
        model: modelLabel,
      });
    }
  }, [result, isProcessing]);

  const [showDocSelection, setShowDocSelection] = useState(false);
  const [pendingDocFiles, setPendingDocFiles] = useState<Array<{ name: string; text: string; selected: boolean }>>([]);
  const [docSelectionCallback, setDocSelectionCallback] = useState<((text: string) => void) | null>(null);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoReadAloud, setAutoReadAloud] = useState(() => {
    return localStorage.getItem("legal_auto_read") === "true";
  });
  const autoReadRef = useRef(false);

  const { toast } = useToast();
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingResult, setIsEditingResult] = useState(false);
  const [editedHtml, setEditedHtml] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const ementaFileInputRef = useRef<HTMLInputElement>(null);
  const promptTplFileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const wantsListeningRef = useRef(false);
  const voiceTargetRef = useRef<"main" | "chat">("main");

  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const [voiceTarget, setVoiceTarget] = useState<"main" | "chat">("main");

  const stopAudio = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const startVoice = useCallback((target: "main" | "chat") => {
    if (wantsListeningRef.current) {
      wantsListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Navegador não suporta voz", description: "Use Chrome ou Edge para ditar por voz.", variant: "destructive" });
      return;
    }

    setVoiceTarget(target);
    voiceTargetRef.current = target;
    wantsListeningRef.current = true;

    const iniciarDitado = () => {
      if (!wantsListeningRef.current) return;
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = false;
      let sessionHandled = false;

      recognition.onresult = (event: any) => {
        if (sessionHandled) return;
        const last = event.results[event.results.length - 1];
        if (last && last.isFinal) {
          const transcript = last[0].transcript;
          if (transcript.trim()) {
            sessionHandled = true;
            wantsListeningRef.current = false;
            try { recognition.stop(); } catch {}
            if (voiceTargetRef.current === "chat") {
              setChatInput(prev => prev + transcript + " ");
            } else {
              setInputText(prev => prev + transcript + " ");
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        recognitionRef.current = null;
        if (event.error === "not-allowed") {
          wantsListeningRef.current = false;
          setIsListening(false);
          toast({ title: "Microfone bloqueado", description: "Permita o acesso ao microfone nas configurações do navegador.", variant: "destructive" });
        } else if (event.error !== "aborted" && !sessionHandled) {
          if (wantsListeningRef.current) setTimeout(iniciarDitado, 500);
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (sessionHandled) {
          wantsListeningRef.current = false;
          setIsListening(false);
          return;
        }
        if (wantsListeningRef.current) {
          setTimeout(iniciarDitado, 500);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        setIsListening(true);
      } catch {
        recognitionRef.current = null;
        if (wantsListeningRef.current) setTimeout(iniciarDitado, 400);
        else setIsListening(false);
      }
    };

    if (isSpeaking) {
      stopAudio();
      setTimeout(iniciarDitado, 300);
    } else {
      iniciarDitado();
    }
  }, [isSpeaking, stopAudio, toast]);

  const toggleVoiceInput = useCallback(() => {
    startVoice("main");
  }, [startVoice]);

  const refreshDemoKeyStatus = () => {
    fetch("/api/demo-key-status")
      .then(r => r.json())
      .then(d => setDemoKeyInfo(d))
      .catch(() => {});
    fetch("/api/demo-key-config")
      .then(r => r.json())
      .then(d => setDemoKeyForm({ key: "", model: d.model || "", url: d.url || "" }))
      .catch(() => {});
  };

  useEffect(() => {
    refreshDemoKeyStatus();
  }, []);

  useEffect(() => {
    return () => {
      wantsListeningRef.current = false;
      recognitionRef.current?.stop();
      ttsAbortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const playTtsFallback = useCallback((text: string) => {
    if (!window.speechSynthesis) { setIsSpeaking(false); return; }
    window.speechSynthesis.cancel();
    // Chrome bug: precisa de um pequeno delay após cancel() para evitar fala dupla
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "pt-BR";
      utterance.rate = 1.15;
      utterance.pitch = 1.05;
      const voices = window.speechSynthesis.getVoices();
      const ptVoice = voices.find(v => v.lang === "pt-BR" && v.name.includes("Google"))
        || voices.find(v => v.lang.startsWith("pt-BR") || v.lang.startsWith("pt_BR"));
      if (ptVoice) utterance.voice = ptVoice;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }, 100);
  }, []);

  const playTts = useCallback(async (text: string) => {
    stopAudio();

    const controller = new AbortController();
    ttsAbortRef.current = controller;
    setIsSpeaking(true);

    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!resp.ok) {
        playTtsFallback(text);
        return;
      }

      // Verifica se a resposta é realmente áudio antes de tentar reproduzir
      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("audio")) {
        playTtsFallback(text);
        return;
      }

      const blob = await resp.blob();
      if (controller.signal.aborted) return;

      if (!blob || blob.size < 100) {
        playTtsFallback(text);
        return;
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      let audioEnded = false;

      audio.onended = () => {
        if (audioEnded) return;
        audioEnded = true;
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        if (audioEnded) return;
        audioEnded = true;
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(url);
        // Só usa fallback se o áudio não chegou a tocar nada
        playTtsFallback(text);
      };

      await audio.play();
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setIsSpeaking(false);
      playTtsFallback(text);
    }
  }, [stopAudio, playTtsFallback]);

  const toggleSpeech = useCallback((text: string) => {
    if (isSpeaking) {
      stopAudio();
    } else {
      playTts(text);
    }
  }, [isSpeaking, stopAudio, playTts]);

  useEffect(() => {
    autoReadRef.current = autoReadAloud;
    localStorage.setItem("legal_auto_read", autoReadAloud ? "true" : "false");
  }, [autoReadAloud]);

  const speakText = useCallback((text: string) => {
    playTts(text);
  }, [playTts]);

  const voiceChatSend = useCallback(async (userText: string) => {
    if (!userText.trim() || voiceChatProcessing) return;
    const msgs = [...voiceChatMessages, { role: "user" as const, text: userText.trim() }];
    setVoiceChatMessages(msgs);
    setVoiceChatProcessing(true);
    try {
      const currentModel = localStorage.getItem("legal_model_choice") || "premium";
      const vcKey = localStorage.getItem("custom_api_key") || "";
      const vcUrl = localStorage.getItem("custom_api_url") || "";
      const vcModel = localStorage.getItem("custom_api_model") || "";
      const resp = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userText.trim(),
          history: msgs,
          model: currentModel,
          customKey: vcKey,
          customUrl: vcUrl,
          customModelName: vcModel,
          perplexityKey: localStorage.getItem("perplexity_api_key") || "",
        }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({})) as any;
        const errMsg = errData?.message || `Erro ${resp.status}`;
        setVoiceChatMessages(prev => [...prev, { role: "assistant" as const, text: `❌ ${errMsg}` }]);
        return;
      }
      const data = await resp.json();
      const reply = data.reply || "Desculpe, não consegui responder.";
      const newMsgs = [...msgs, { role: "assistant" as const, text: reply }];
      setVoiceChatMessages(newMsgs);
      playTts(reply);
    } catch {
      setVoiceChatMessages(prev => [...prev, { role: "assistant" as const, text: "❌ Erro de conexão. Tente novamente." }]);
    } finally {
      setVoiceChatProcessing(false);
    }
  }, [voiceChatMessages, voiceChatProcessing, playTts]);

  useEffect(() => {
    if (voiceChatScrollRef.current) {
      voiceChatScrollRef.current.scrollTop = voiceChatScrollRef.current.scrollHeight;
    }
  }, [voiceChatMessages, voiceChatProcessing]);

  const voiceChatToggleMic = useCallback(() => {
    if (voiceChatListening) {
      voiceChatRecRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast({ title: "Navegador não suporta voz", description: "Use Chrome ou Edge para usar o microfone.", variant: "destructive" }); return; }

    const startMic = () => {
      const rec = new SR();
      rec.lang = "pt-BR";
      rec.continuous = false;
      rec.interimResults = false;
      let alreadySent = false;
      rec.onresult = (e: any) => {
        if (alreadySent) return;
        const last = e.results[e.results.length - 1];
        if (last && last.isFinal) {
          const text = last[0].transcript.trim();
          if (text) {
            alreadySent = true;
            try { rec.stop(); } catch {}
            setTimeout(() => voiceChatSend(text), 300);
          }
        }
      };
      rec.onerror = (ev: any) => {
        if (ev.error !== "aborted") {
          toast({ title: "Erro no microfone", description: "Tente novamente.", variant: "destructive" });
        }
        setVoiceChatListening(false);
      };
      rec.onend = () => {
        setVoiceChatListening(false);
      };
      voiceChatRecRef.current = rec;
      try {
        rec.start();
        setVoiceChatListening(true);
      } catch {
        setVoiceChatListening(false);
      }
    };

    if (isSpeaking) {
      stopAudio();
      setTimeout(startMic, 600);
    } else {
      startMic();
    }
  }, [voiceChatListening, voiceChatSend, toast, isSpeaking, stopAudio]);

  const { data: customActions = [] } = useQuery<CustomAction[]>({
    queryKey: ["/api/custom-actions"],
  });

  const { data: allEmentas = [] } = useQuery<Ementa[]>({
    queryKey: ["/api/ementas"],
  });

  const { data: aiHistoryData = [] } = useQuery<AiHistory[]>({
    queryKey: ["/api/ai-history"],
  });

  // Auto-restaurar ultimo documento do banco se nao houver nada salvo localmente
  useEffect(() => {
    if (aiHistoryData.length > 0 && !result) {
      const last = aiHistoryData[0];
      if (last?.result) {
        setResult(last.result);
      }
    }
  }, [aiHistoryData]);

  const { data: allPromptTemplates = [] } = useQuery<PromptTemplate[]>({
    queryKey: ["/api/prompt-templates"],
  });

  const promptTplCategories = useMemo(() => {
    const cats = new Set(allPromptTemplates.map((t) => t.categoria));
    return Array.from(cats).sort();
  }, [allPromptTemplates]);

  const filteredPromptTpls = useMemo(() => {
    let list = allPromptTemplates;
    if (promptTplFilterCat) {
      list = list.filter((t) => t.categoria === promptTplFilterCat);
    }
    if (promptTplSearch.trim()) {
      const term = promptTplSearch.toLowerCase();
      list = list.filter((t) => t.titulo.toLowerCase().includes(term) || t.texto.toLowerCase().includes(term));
    }
    return list;
  }, [allPromptTemplates, promptTplFilterCat, promptTplSearch]);

  const createPromptTplMutation = useMutation({
    mutationFn: async (data: { titulo: string; categoria: string; texto: string }) => {
      const res = await apiRequest("POST", "/api/prompt-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      toast({ title: "Prompt salvo!" });
      resetPromptTplForm();
    },
  });

  const updatePromptTplMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { titulo: string; categoria: string; texto: string } }) => {
      const res = await apiRequest("PATCH", `/api/prompt-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      toast({ title: "Prompt atualizado!" });
      resetPromptTplForm();
    },
  });

  const deletePromptTplMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/prompt-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prompt-templates"] });
      toast({ title: "Prompt excluido!" });
    },
  });

  const resetPromptTplForm = () => {
    setEditingPromptTpl(null);
    setPromptTplTitulo("");
    setPromptTplCategoria("");
    setPromptTplTexto("");
    setShowPromptForm(false);
  };

  const openNewPromptTpl = () => {
    setEditingPromptTpl(null);
    setPromptTplTitulo("");
    setPromptTplCategoria("");
    setPromptTplTexto("");
    setShowPromptForm(true);
  };

  const openEditPromptTpl = (tpl: PromptTemplate) => {
    setEditingPromptTpl(tpl);
    setPromptTplTitulo(tpl.titulo);
    setPromptTplCategoria(tpl.categoria);
    setPromptTplTexto(tpl.texto);
    setShowPromptForm(true);
  };

  const savePromptTpl = () => {
    if (!promptTplTitulo.trim() || !promptTplTexto.trim()) {
      toast({ title: "Preencha titulo e texto", variant: "destructive" });
      return;
    }
    const data = { titulo: promptTplTitulo.trim(), categoria: promptTplCategoria.trim() || "Geral", texto: promptTplTexto.trim() };
    if (editingPromptTpl) {
      updatePromptTplMutation.mutate({ id: editingPromptTpl.id, data });
    } else {
      createPromptTplMutation.mutate(data);
    }
  };

  const copyPromptTplToClipboard = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: "Prompt copiado!" });
  };

  const { data: allDocTemplates = [] } = useQuery<DocTemplate[]>({
    queryKey: ["/api/doc-templates"],
  });

  const createDocTplMutation = useMutation({
    mutationFn: async (data: { titulo: string; categoria: string; conteudo: string }) => {
      const res = await apiRequest("POST", "/api/doc-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-templates"] });
      toast({ title: "Template salvo!" });
      resetDocTplForm();
    },
  });

  const updateDocTplMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { titulo: string; categoria: string; conteudo: string } }) => {
      const res = await apiRequest("PATCH", `/api/doc-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-templates"] });
      toast({ title: "Template atualizado!" });
      resetDocTplForm();
    },
  });

  const deleteDocTplMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/doc-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/doc-templates"] });
      toast({ title: "Template excluido!" });
    },
  });

  const resetDocTplForm = () => {
    setEditingDocTemplate(null);
    setDocTplTitulo("");
    setDocTplCategoria("");
    setDocTplConteudo("");
    setShowDocTemplateForm(false);
  };

  const openNewDocTpl = () => {
    setEditingDocTemplate(null);
    setDocTplTitulo("");
    setDocTplCategoria("");
    setDocTplConteudo("{{CONTEUDO}}");
    setShowDocTemplateForm(true);
  };

  const openEditDocTpl = (tpl: DocTemplate) => {
    setEditingDocTemplate(tpl);
    setDocTplTitulo(tpl.titulo);
    setDocTplCategoria(tpl.categoria);
    setDocTplConteudo(tpl.conteudo);
    setShowDocTemplateForm(true);
  };

  const saveDocTpl = () => {
    if (!docTplTitulo.trim() || !docTplConteudo.trim()) {
      toast({ title: "Preencha titulo e conteudo", variant: "destructive" });
      return;
    }
    if (!docTplConteudo.includes("{{CONTEUDO}}")) {
      toast({ title: "O template precisa conter {{CONTEUDO}}", description: "Essa marcacao indica onde o resultado da IA sera inserido.", variant: "destructive" });
      return;
    }
    const data = { titulo: docTplTitulo.trim(), categoria: docTplCategoria.trim() || "Geral", conteudo: docTplConteudo.trim() };
    if (editingDocTemplate) {
      updateDocTplMutation.mutate({ id: editingDocTemplate.id, data });
    } else {
      createDocTplMutation.mutate(data);
    }
  };

  const [uploadingDocx, setUploadingDocx] = useState(false);
  const handleDocxTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploadingDocx(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/doc-templates/upload-docx", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Erro ao importar");
      const tpl = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/doc-templates"] });
      setSelectedDocTemplateId(tpl.id);
      toast({ title: "Template importado!", description: `"${tpl.titulo}" pronto para uso. Seu cabecalho sera usado ao exportar Word.` });
    } catch {
      toast({ title: "Erro ao importar template", variant: "destructive" });
    } finally {
      setUploadingDocx(false);
    }
  };



  const getEditedContent = useCallback(() => {
    return editedHtml;
  }, [editedHtml]);

  const exportWordWithTemplate = useCallback(async () => {
    if (!result) return;
    const actionName = selectedAction || selectedCustomId || "resultado";
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    const title = `${actionName}_${date}`;

    try {
      const textToExport = manualEditText ?? result;
      const currentHtml = editedHtml || formatMarkdown(textToExport);
      const response = await fetch("/api/export/word-with-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToExport,
          title,
          templateId: selectedDocTemplateId,
          html: currentHtml,
          formatting: formatSettings,
        }),
      });

      if (!response.ok) throw new Error("Erro ao gerar Word");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Word baixado!", description: editedHtml ? "Documento Word gerado com suas formatacoes." : selectedDocTemplateId ? "Documento gerado com template aplicado." : "Documento Word gerado com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Nao foi possivel gerar o documento Word.", variant: "destructive" });
    }
  }, [result, manualEditText, editedHtml, selectedAction, selectedCustomId, selectedDocTemplateId, formatSettings, toast]);

  const deleteHistoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-history/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-history"] });
      toast({ title: "Removido do historico" });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/ai-history");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-history"] });
      toast({ title: "Historico limpo" });
    },
  });

  const loadFromHistory = (entry: AiHistory) => {
    const raw = entry.result || "";
    const isHtml = /<[a-zA-Z][^>]*>/.test(raw);
    let decoded: string;
    if (isHtml) {
      decoded = raw;
    } else {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = raw;
      decoded = textarea.value;
    }
    setResult(decoded);
    // Restaurar também a pergunta original no campo de texto
    if (entry.inputPreview) {
      const preview = entry.inputPreview.startsWith("Pergunta: ")
        ? entry.inputPreview.replace(/^Pergunta: /, "")
        : entry.inputPreview;
      setInputText(preview);
    }
    setEditedHtml(null);
    setIsEditing(false);
    setIsEditingResult(false);
    setShowHistory(false);
    toast({ title: "Historico carregado — pergunta e resposta restauradas" });
  };

  const categories = useMemo(() => {
    const cats = new Set(allEmentas.map((e) => e.categoria));
    return Array.from(cats).sort();
  }, [allEmentas]);

  const filteredEmentas = useMemo(() => {
    let list = allEmentas;
    if (ementaFilterCat) {
      list = list.filter((e) => e.categoria === ementaFilterCat);
    }
    if (ementaSearchTerm.trim()) {
      const term = ementaSearchTerm.toLowerCase();
      list = list.filter(
        (e) => e.titulo.toLowerCase().includes(term) || e.texto.toLowerCase().includes(term) || e.categoria.toLowerCase().includes(term)
      );
    }
    return list;
  }, [allEmentas, ementaFilterCat, ementaSearchTerm]);

  const createModelMutation = useMutation({
    mutationFn: async (data: { label: string; description: string; prompt: string }) => {
      const res = await apiRequest("POST", "/api/custom-actions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-actions"] });
      toast({ title: "Modelo criado!", description: "Seu novo modelo esta disponivel." });
      resetModelForm();
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { label: string; description: string; prompt: string } }) => {
      const res = await apiRequest("PATCH", `/api/custom-actions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-actions"] });
      toast({ title: "Modelo atualizado!" });
      resetModelForm();
    },
  });

  const deleteModelMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/custom-actions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-actions"] });
      toast({ title: "Modelo excluido!" });
    },
  });

  const createEmentaMutation = useMutation({
    mutationFn: async (data: { titulo: string; categoria: string; texto: string }) => {
      const res = await apiRequest("POST", "/api/ementas", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ementas"] });
      toast({ title: "Ementa salva!", description: "Adicionada a sua biblioteca." });
      resetEmentaForm();
    },
  });

  const updateEmentaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { titulo: string; categoria: string; texto: string } }) => {
      const res = await apiRequest("PATCH", `/api/ementas/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ementas"] });
      toast({ title: "Ementa atualizada!" });
      resetEmentaForm();
    },
  });

  const deleteEmentaMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ementas/${id}`);
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ementas"] });
      setSelectedEmentaIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast({ title: "Ementa excluida!" });
    },
  });

  const resetModelForm = () => {
    setEditingModel(null);
    setModelLabel("");
    setModelDescription("");
    setModelPrompt("");
    setShowModelDialog(false);
  };

  const openNewModel = () => {
    setEditingModel(null);
    setModelLabel("");
    setModelDescription("");
    setModelPrompt("");
    setShowModelDialog(true);
  };

  const openEditModel = (model: CustomAction) => {
    setEditingModel(model);
    setModelLabel(model.label);
    setModelDescription(model.description);
    setModelPrompt(model.prompt);
    setShowModelDialog(true);
  };

  const saveModel = () => {
    if (!modelLabel.trim() || !modelPrompt.trim()) {
      toast({ title: "Preencha os campos", description: "Nome e instrucoes sao obrigatorios.", variant: "destructive" });
      return;
    }
    const data = { label: modelLabel.trim(), description: modelDescription.trim(), prompt: modelPrompt.trim() };
    if (editingModel) {
      updateModelMutation.mutate({ id: editingModel.id, data });
    } else {
      createModelMutation.mutate(data);
    }
  };

  const resetEmentaForm = () => {
    setEditingEmenta(null);
    setEmentaTitulo("");
    setEmentaCategoria("");
    setEmentaTexto("");
    setShowEmentaForm(false);
  };

  const openNewEmenta = () => {
    setEditingEmenta(null);
    setEmentaTitulo("");
    setEmentaCategoria("");
    setEmentaTexto("");
    setShowEmentaForm(true);
  };

  const pasteEmentaFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast({ title: "Area de transferencia vazia", description: "Copie o texto da ementa primeiro.", variant: "destructive" });
        return;
      }
      setEditingEmenta(null);
      setEmentaTitulo("");
      setEmentaCategoria("");
      setEmentaTexto(text.trim());
      setShowEmentaForm(true);
    } catch {
      toast({ title: "Nao foi possivel ler a area de transferencia", description: "Tente colar manualmente no campo de texto.", variant: "destructive" });
    }
  };

  const openEditEmenta = (ementa: Ementa) => {
    setEditingEmenta(ementa);
    setEmentaTitulo(ementa.titulo);
    setEmentaCategoria(ementa.categoria);
    setEmentaTexto(ementa.texto);
    setShowEmentaForm(true);
  };

  const saveEmenta = () => {
    if (!ementaTitulo.trim() || !ementaTexto.trim()) {
      toast({ title: "Preencha os campos", description: "Titulo e texto sao obrigatorios.", variant: "destructive" });
      return;
    }
    const data = { titulo: ementaTitulo.trim(), categoria: ementaCategoria.trim() || "Geral", texto: ementaTexto.trim() };
    if (editingEmenta) {
      updateEmentaMutation.mutate({ id: editingEmenta.id, data });
    } else {
      createEmentaMutation.mutate(data);
    }
  };

  const buscarJurisprudencias = async () => {
    if (!juriQuery.trim()) return;
    setJuriLoading(true);
    setJuriResults([]);
    setJuriExpandedIdx(null);
    setJuriEmentaSummaries({});
    setJuriEmentaSummarizing(new Set());
    try {
      const datajudKey = localStorage.getItem("datajud_api_key") || "";
      const res = await fetch("/api/jurisprudencia/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: juriQuery.trim(), tribunais: juriTribunais, apiKey: datajudKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro na busca");
      setJuriResults(data.results || []);
      if (data.warnings?.length) {
        toast({ title: "Aviso", description: data.warnings[0], variant: "default" });
      }
      if ((data.results || []).length === 0) {
        toast({ title: "Nenhum resultado", description: "Não foram encontrados processos para o termo pesquisado nos tribunais selecionados.", variant: "default" });
      }
    } catch (e: any) {
      toast({ title: "DataJud indisponível", description: e.message, variant: "destructive" });
    } finally {
      setJuriLoading(false);
    }
  };

  const toggleJuriTribunal = (t: string) => {
    setJuriTribunais(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };


  const insertJuriIntoEditor = (result: any) => {
    const text = `${result.tribunal} — ${result.tipo} — ${result.processo}\nRelator: ${result.relator} | ${result.data}\n\n${result.ementa}`;
    setResult(prev => prev ? prev + "\n\n" + text : text);
    toast({ title: "Jurisprudência inserida no editor" });
  };

  const saveJuriToLibrary = (result: any) => {
    const titulo = `${result.tribunal} — ${result.processo}`;
    const texto = `${result.tipo} | Relator: ${result.relator} | ${result.data}\n\n${result.ementa}`;
    createEmentaMutation.mutate({ titulo, categoria: result.tribunal, texto });
  };

  const resumirEmenta = async (r: any, i: number) => {
    if (juriEmentaSummarizing.has(i)) return;
    setJuriEmentaSummarizing(prev => new Set([...prev, i]));
    const customKey = localStorage.getItem("custom_api_key") || "";
    const customUrl = localStorage.getItem("custom_api_url") || "";
    const customModel = localStorage.getItem("custom_api_model") || "";
    const prompt = `Resuma em 3 a 5 linhas a seguinte ementa jurídica, destacando os pontos mais relevantes. Seja objetivo e direto. Ao final, mantenha o número do processo: ${r.processo}\n\nEmenta:\n${r.ementa}`;
    try {
      const resp = await fetch("/api/code-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, history: [], apiKey: customKey, apiUrl: customUrl, apiModel: customModel }),
      });
      if (!resp.ok) throw new Error("Erro na API");
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No reader");
      let summary = "";
      let carry = "";
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = carry + decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        carry = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.text) summary += d.text;
          } catch {}
        }
      }
      if (carry.startsWith("data: ")) {
        try { const d = JSON.parse(carry.slice(6)); if (d.text) summary += d.text; } catch {}
      }
      setJuriEmentaSummaries(prev => ({ ...prev, [i]: summary.trim() }));
    } catch {
      toast({ title: "Erro ao resumir", description: "Não foi possível gerar o resumo. Configure uma chave de API.", variant: "destructive" });
    } finally {
      setJuriEmentaSummarizing(prev => { const n = new Set(prev); n.delete(i); return n; });
    }
  };

  const toggleEmentaSelection = (id: string) => {
    setSelectedEmentaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [isUploading, setIsUploading] = useState(false);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [isImportingUrl, setIsImportingUrl] = useState(false);

  const handleUrlImport = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setIsImportingUrl(true);
    try {
      const res = await fetch("/api/import/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro ao buscar o link");
      setInputText((prev) => prev ? prev + "\n\n" + data.text : data.text);
      setShowUrlImport(false);
      setUrlInput("");
      toast({ title: "Conteudo importado!", description: `${data.length} caracteres extraidos do link.` });
    } catch (err: any) {
      toast({ title: "Erro ao importar link", description: err.message, variant: "destructive" });
    } finally {
      setIsImportingUrl(false);
    }
  };

  const uploadAndExtract = useCallback(async (files: FileList, onSuccess: (text: string, filename: string) => void) => {
    const maxSize = 50 * 1024 * 1024;
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > maxSize) {
        toast({ title: "Arquivo muito grande", description: `"${files[i].name}" excede 60MB.`, variant: "destructive" });
        return;
      }
      if (files[i].size === 0) {
        toast({ title: "Arquivo vazio", description: `"${files[i].name}" esta vazio.`, variant: "destructive" });
        return;
      }
      validFiles.push(files[i]);
    }
    if (validFiles.length === 0) return;

    const getExt = (f: File) => {
      const nameExt = f.name.toLowerCase().split(".").pop() || "";
      if (nameExt && nameExt !== f.name.toLowerCase()) return nameExt;
      if (f.type === "application/pdf") return "pdf";
      if (f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
      if (f.type.startsWith("text/")) return "txt";
      return nameExt;
    };

    const needsBackend = validFiles.some((f) => {
      const ext = getExt(f);
      return ["pdf", "docx"].includes(ext);
    });

    setIsUploading(true);
    try {
      if (needsBackend) {
        const formData = new FormData();
        validFiles.forEach((f) => formData.append("files", f));
        const res = await fetch("/api/upload/extract-text", { method: "POST", body: formData });
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || `Erro no servidor (${res.status})`);
        }
        const data = await res.json();
        const combinedText = data.text;
        if (combinedText) {
          const firstName = validFiles[0].name.replace(/\.[^/.]+$/, "");
          onSuccess(combinedText, firstName);
        } else {
          toast({ title: "Arquivo sem texto", description: "Nao foi possivel extrair texto deste arquivo.", variant: "destructive" });
        }
      } else {
        const allText: string[] = [];
        for (const file of validFiles) {
          try {
            const text = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => resolve((event.target?.result as string) || "");
              reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
              reader.readAsText(file);
            });
            if (text) allText.push(text);
          } catch {
            toast({ title: "Erro ao ler", description: `Nao foi possivel ler "${file.name}". Tente um formato diferente.`, variant: "destructive" });
          }
        }
        if (allText.length > 0) {
          const combinedText = allText.join("\n\n---\n\n");
          const firstName = validFiles[0].name.replace(/\.[^/.]+$/, "");
          onSuccess(combinedText, firstName);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao importar", description: `Nao foi possivel processar o arquivo. ${msg}`, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  const handleAudioImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 50 * 1024 * 1024;
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > maxSize) {
        toast({ title: "Arquivo muito grande", description: `"${files[i].name}" excede 50MB.`, variant: "destructive" });
        return;
      }
      validFiles.push(files[i]);
    }
    if (validFiles.length === 0) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/upload/transcribe", { method: "POST", body: formData });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Erro no servidor (${res.status})`);
      }
      const data = await res.json();
      const allText: string[] = [];
      const errors: string[] = [];
      for (const r of data.results) {
        if (r.error) {
          errors.push(`${r.filename}: ${r.error}`);
        } else if (r.text) {
          allText.push(`[Transcricao de: ${r.filename}]\n\n${r.text}`);
        }
      }
      if (errors.length > 0) {
        toast({ title: "Aviso", description: errors.join("\n"), variant: "destructive" });
      }
      if (allText.length > 0) {
        const combinedText = allText.join("\n\n---\n\n");
        setInputText((prev) => prev ? prev + "\n\n" + combinedText : combinedText);
        toast({ title: "Transcricao concluida!", description: `${allText.length} arquivo(s) transcrito(s) com sucesso.` });
      } else if (errors.length === 0) {
        toast({ title: "Sem conteudo", description: "Nao foi possivel transcrever o audio.", variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro na transcricao", description: `Nao foi possivel transcrever. ${msg}`, variant: "destructive" });
    } finally {
      setIsTranscribing(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  }, [toast]);

  const handleEmentaFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    uploadAndExtract(files, (text, filename) => {
      setEmentaTexto(text);
      if (!ementaTitulo) {
        setEmentaTitulo(filename);
      }
      toast({ title: "Arquivo carregado!", description: `Importado para a ementa.` });
    });
    if (ementaFileInputRef.current) ementaFileInputRef.current.value = "";
  }, [toast, ementaTitulo, uploadAndExtract]);

  const handlePromptTplFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      setPromptTplTexto(text);
      if (!promptTplTitulo) {
        setPromptTplTitulo(file.name.replace(/\.[^.]+$/, ""));
      }
      toast({ title: "Arquivo carregado!" });
    };
    reader.readAsText(file);
    if (promptTplFileInputRef.current) promptTplFileInputRef.current.value = "";
  }, [toast, promptTplTitulo]);

  const activeModel = useCustomModel ? "custom" : usePerplexity ? "perplexity" : (usePremiumModel ? "premium" : "economico");

  const selectModel = (m: "premium" | "economico" | "perplexity" | "custom") => {
    setUsePremiumModel(m === "premium");
    setUsePerplexity(m === "perplexity");
    setUseCustomModel(m === "custom");
    localStorage.setItem("legal_model_choice", m);
  };

  const streamResponse = useCallback(async (body: Record<string, string | string[]>) => {
    // Permite processar sem texto colado se já houver resultado salvo como contexto
    const hasContext = !!(result || editedHtml || localStorage.getItem("legal_last_result"));
    if (!inputText.trim() && !hasContext) {
      toast({ title: "Cole o texto primeiro", description: "O campo de texto esta vazio e nao ha contexto salvo.", variant: "destructive" });
      return;
    }

    // INICIO DA CHAMADA DIRETA PARA EVITAR BLOQUEIO
    if (abortRef.current) abortRef.current.abort();

    setIsProcessing(true);
    setResult("");
    setEditedHtml(null);
    setIsEditing(false);
    setIsEditingResult(false);
    setChatHistory([]);
    setPerplexityCitations([]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Se não houver texto colado, usa o resultado atual (ou salvo) como contexto
    const savedContext = localStorage.getItem("legal_last_result") || "";
    const contextHtml = editedHtml || result || savedContext;
    const effectiveText = inputText.trim()
      ? inputText
      : contextHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 80000);

    const recentContext = aiHistoryData.map(h => ({
      pergunta: h.inputPreview || "",
      resposta: h.result || "",
      acao: h.action,
    }));

    const currentModel = localStorage.getItem("legal_model_choice") || "premium";
    const perplexityKey = localStorage.getItem("perplexity_api_key") || "";
    const customKey = localStorage.getItem("custom_api_key") || "";
    const customUrl = localStorage.getItem("custom_api_url") || "";
    const customModel = localStorage.getItem("custom_api_model") || "";

    const payload: Record<string, unknown> = { 
      text: effectiveText, 
      model: currentModel,
      perplexityKey: perplexityKey || undefined,
      customKey: customKey || undefined,
      customUrl: customUrl || undefined,
      customModel: customModel || undefined,
      effortLevel, 
      verbosity,
      recentContext: recentContext.length > 0 ? recentContext : undefined,
      ...body 
    };
    if (selectedEmentaIds.size > 0) {
      payload.ementaIds = Array.from(selectedEmentaIds);
    }

    try {
      const response = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Erro ao processar");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

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
          try {
            const data = JSON.parse(line.slice(6));
            if (data.demoMode) setIsDemoMode(true);
            if (data.content) {
              fullText += data.content;
              setResult(fullText);
            }
            if (data.text) {
              fullText += data.text;
              setResult(fullText);
            }
            if (data.citations && Array.isArray(data.citations)) {
              setPerplexityCitations(data.citations);
            }
            if (data.error) throw new Error(data.error);
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }
      
      // Auto-save history
      await apiRequest("POST", "/api/ai-history", {
        action: (body as any).action || 'custom',
        inputPreview: inputText.substring(0, 2000),
        result: fullText
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-history"] });

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast({ title: "Erro na IA", description: "Ocorreu um problema ao gerar a resposta.", variant: "destructive" });
      }
    } finally {
      setIsProcessing(false);
      abortRef.current = null;
    }
  }, [inputText, toast, effortLevel, verbosity, selectedEmentaIds, aiHistoryData]);

  const confirmStreamResponse = async () => {
    if (!pendingAIAction || !pendingAIAction.body) return;
    const body = pendingAIAction.body;
    setShowUsageHint(false);
    setPendingAIAction(null);

    if (abortRef.current) abortRef.current.abort();

    setIsProcessing(true);
    setResult("");
    setEditedHtml(null);
    setIsEditing(false);
    setIsEditingResult(false);
    setChatHistory([]);

    const controller = new AbortController();
    abortRef.current = controller;

    const currentModel = localStorage.getItem("legal_model_choice") || "premium";
    const perplexityKey = localStorage.getItem("perplexity_api_key") || "";
    const customKey2 = localStorage.getItem("custom_api_key") || "";
    const customUrl2 = localStorage.getItem("custom_api_url") || "";
    const customModel2 = localStorage.getItem("custom_api_model") || "";
    const payload: Record<string, unknown> = { text: inputText, model: currentModel, perplexityKey: perplexityKey || undefined, customKey: customKey2 || undefined, customUrl: customUrl2 || undefined, customModel: customModel2 || undefined, effortLevel, verbosity, ...body };
    if (selectedEmentaIds.size > 0) {
      payload.ementaIds = Array.from(selectedEmentaIds);
    }

    try {
      const response = await fetch("/api/ai/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Erro ao processar");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.demoMode) setIsDemoMode(true);
            if (event.status) {
              setProcessingStatus(event.status);
            }
            if (event.content) {
              fullText += event.content;
              setResult(fullText);
            }
            if (event.text) {
              fullText += event.text;
              setResult(fullText);
            }
            if (event.error) throw new Error(event.error);
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      setProcessingStatus("");
      if (fullText.trim()) {
        const userInput = inputText || "";
        setChatHistory([
          ...(userInput.trim() ? [{ role: 'user' as const, content: userInput.trim() }] : []),
          { role: 'assistant' as const, content: fullText },
        ]);
        const actionName = (body.action as string) || (body.customActionId as string) || "resultado";
        const preview = inputText.substring(0, 200);
        try {
          await apiRequest("POST", "/api/ai-history", {
            action: actionName,
            inputPreview: preview,
            result: fullText,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/ai-history"] });
        } catch {}
        if (autoReadRef.current) {
          speakText(fullText);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast({ title: "Erro", description: "Nao foi possivel processar o texto. Tente novamente.", variant: "destructive" });
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
      abortRef.current = null;
    }
  };

  const doRefine = async (instruction: string) => {
    const previousResultSnapshot = result || editedHtml || localStorage.getItem("legal_last_result") || "";
    setIsRefining(true);
    setChatInput("");

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newHistory = [...chatHistory, { role: 'user' as const, content: instruction }];
    setChatHistory(newHistory);

    setResult("");

    const _curModel = localStorage.getItem("legal_model_choice") || "premium";
    const payload: Record<string, unknown> = {
      previousResult: previousResultSnapshot,
      instruction,
      originalText: inputText,
      model: _curModel,
      perplexityKey: localStorage.getItem("perplexity_api_key") || undefined,
      customKey: localStorage.getItem("custom_api_key") || undefined,
      customUrl: localStorage.getItem("custom_api_url") || undefined,
      customModel: localStorage.getItem("custom_api_model") || undefined,
      effortLevel,
      verbosity,
      chatHistory: newHistory,
    };
    if (selectedEmentaIds.size > 0) {
      payload.ementaIds = Array.from(selectedEmentaIds);
    }

    try {
      const response = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Erro ao processar");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      setResult("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.demoMode) setIsDemoMode(true);
            if (event.content) {
              fullText += event.content;
              setResult(fullText);
            }
            if (event.text) {
              fullText += event.text;
              setResult(fullText);
            }
            if (event.citations && Array.isArray(event.citations)) {
              setPerplexityCitations(event.citations);
            }
            if (event.error) throw new Error(event.error);
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      if (fullText.trim()) {
        localStorage.setItem("legal_last_result", fullText);
        setChatHistory(prev => [...prev, { role: 'assistant', content: fullText }]);
        try {
          await apiRequest("POST", "/api/ai-history", {
            action: "ajuste",
            inputPreview: "Pergunta: " + instruction.substring(0, 2000),
            result: fullText,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/ai-history"] });
        } catch {}
        if (autoReadRef.current) {
          speakText(fullText);
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      const errMsg = error instanceof Error ? error.message : "Erro desconhecido";
      toast({ title: "Erro no refinamento", description: errMsg.length > 200 ? errMsg.substring(0, 200) : errMsg, variant: "destructive" });
    } finally {
      setIsRefining(false);
      abortRef.current = null;
    }
  };

  const refineResult = useCallback(async (instruction: string) => {
    if (!instruction.trim()) return;
    const lastResult = result || editedHtml || localStorage.getItem("legal_last_result") || "";
    if (!lastResult && chatHistory.length === 0 && !inputText.trim()) return;
    doRefine(instruction);
  }, [result, editedHtml, inputText, chatHistory, doRefine]);

  const processBuiltIn = useCallback((action: ActionType) => {
    const hasContext = !!(result || editedHtml || localStorage.getItem("legal_last_result"));
    if (!inputText.trim() && !hasContext) {
      toast({ title: "Aviso", description: "Por favor, insira um texto para processar.", variant: "destructive" });
      return;
    }
    setSelectedAction(action);
    setSelectedCustomId(null);
    streamResponse({ action });
  }, [inputText, result, editedHtml, streamResponse, toast]);

  const processCustom = useCallback((customAction: CustomAction) => {
    const hasContext = !!(result || editedHtml || localStorage.getItem("legal_last_result"));
    if (!inputText.trim() && !hasContext) {
      toast({ title: "Aviso", description: "Por favor, insira um texto para processar.", variant: "destructive" });
      return;
    }
    setSelectedAction(null);
    setSelectedCustomId(customAction.id);
    streamResponse({ customActionId: customAction.id });
  }, [inputText, result, editedHtml, streamResponse, toast]);

  const copyResult = useCallback(() => {
    if (!result) return;
    const cleanText = result
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '');
    navigator.clipboard.writeText(cleanText);
    toast({ title: "Copiado!", description: "Texto limpo copiado, pronto para colar no Word." });
  }, [result, toast]);

  const clearAll = useCallback(() => {
    setInputText("");
    setResult("");
    setEditedHtml(null);
    setChatHistory([]);
    setPerplexityCitations([]);
    setIsEditing(false);
    setIsEditingResult(false);
    setSelectedAction(null);
    setSelectedCustomId(null);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsProcessing(false);
    localStorage.removeItem("legal_last_result");
    localStorage.removeItem("legal_chat_history");
    localStorage.removeItem("legal_assistant_temp_editor_content");
  }, []);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length === 1) {
      uploadAndExtract(files, (text) => {
        setInputText((prev) => prev.trim() ? prev + "\n\n---\n\n" + text : text);
        toast({ title: "Arquivo importado!" });
      });
    } else {
      setIsUploading(true);
      try {
        const extracted: Array<{ name: string; text: string; selected: boolean }> = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = file.name.toLowerCase().split(".").pop() || "";
          if (["pdf", "docx"].includes(ext)) {
            const formData = new FormData();
            formData.append("files", file);
            const res = await fetch("/api/upload/extract-text", { method: "POST", body: formData });
            if (res.ok) {
              const data = await res.json();
              if (data.text) extracted.push({ name: file.name, text: data.text, selected: true });
            }
          } else {
            const text = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string) || "");
              reader.onerror = () => resolve("");
              reader.readAsText(file);
            });
            if (text) extracted.push({ name: file.name, text, selected: true });
          }
        }
        if (extracted.length > 0) {
          setPendingDocFiles(extracted);
          setDocSelectionCallback(() => (combinedText: string) => {
            setInputText((prev) => prev.trim() ? prev + "\n\n---\n\n" + combinedText : combinedText);
            toast({ title: "Arquivos importados!" });
          });
          setShowDocSelection(true);
        } else {
          toast({ title: "Nenhum texto encontrado", variant: "destructive" });
        }
      } catch {
        toast({ title: "Erro ao importar arquivos", variant: "destructive" });
      } finally {
        setIsUploading(false);
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [toast, uploadAndExtract]);

  const [chatAttaching, setChatAttaching] = useState(false);

  const handleChatFileAttach = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setChatAttaching(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) formData.append("files", file);
      const res = await fetch("/api/upload/extract-text", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Erro ao extrair texto");
      const data = await res.json();
      if (data.text) {
        const instruction = chatInput.trim()
          ? chatInput + "\n\nTexto do arquivo anexado:\n" + data.text
          : "Considere o seguinte texto anexado e aplique ao resultado:\n" + data.text;
        setChatInput(instruction);
        refineResult(instruction);
      } else {
        toast({ title: "Arquivo vazio", description: "Nao foi possivel extrair texto do arquivo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Nao foi possivel importar o arquivo.", variant: "destructive" });
    } finally {
      setChatAttaching(false);
    }
    if (chatFileInputRef.current) chatFileInputRef.current.value = "";
  }, [chatInput, toast, refineResult]);

  const exportResult = useCallback(() => {
    if (!result) return;

    const actionName = selectedAction || selectedCustomId || "resultado";
    const date = new Date().toLocaleDateString("pt-BR").replace(/\//g, "-");
    const filename = `${actionName}_${date}.txt`;

    const cleanText = result
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '');
    const blob = new Blob([cleanText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({ title: "Arquivo baixado!", description: `Salvo como "${filename}".` });
  }, [result, selectedAction, selectedCustomId, toast]);


  // ── DETECÇÃO AUTOMÁTICA DE ESTILO JURÍDICO ─────────────────────────────────
  const isDateLocalLine = (line: string) => {
    const t = line.trim();
    return (t.length < 100 && /^[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ\s,]+,\s*\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i.test(t))
      || /^(Local e data|Data:)/i.test(t);
  };

  const isSignatureLine = (line: string) => {
    const t = line.trim();
    return /^(Advogad[oa]|Respeitosamente|___)/i.test(t)
      || (t.length < 120 && /^[A-Z][A-Z\s]+[-–]\s*OAB/i.test(t));
  };

  // OAB: "Dra.", "Dr." + OAB/XX → alinhado à DIREITA
  const isOabLine = (line: string) => {
    const t = line.trim();
    return /^(Dr[a]?\.\s|OAB\s*\/)/i.test(t)
      || /^OAB\s*\/?\s*[A-Z]{2}\s*[\d\.]+/i.test(t)
      || /^Advogad[oa].*OAB/i.test(t);
  };

  // TÍTULO: seções em CAIXA ALTA (ex: DOS FATOS, DO DIREITO, DOS PEDIDOS)
  const isTituloLine = (line: string) => {
    const t = line.trim();
    if (t.length === 0 || t.length > 120) return false;
    // Seções conhecidas
    if (/^(DOS?\s+FATOS|DO\s+DIREITO|DOS?\s+PEDIDOS|DAS?\s+PROVAS|DA\s+FUNDAMENTA[CÇ][ÃA]O|DA\s+PRELIMINAR|DO\s+M[EÉ]RITO|DAS?\s+RAZÕES|DO\s+CABIMENTO|DA\s+ADMISSIBILIDADE|DA\s+LEGITIMIDADE|DA\s+COMPET[EÊ]NCIA|DO\s+RECURSO|DA\s+APELA[CÇ][ÃA]O|DO\s+PEDIDO|DA\s+TUTELA|DAS?\s+CONCLUSÕES|DA\s+SÍNTESE|DO\s+REQUERIMENTO)/i.test(t)) return true;
    // Linha inteira em maiúsculas com no mínimo 4 chars e sem ser cabeçalho de endereçamento
    const isAllCaps = t === t.toUpperCase() && t.replace(/\s/g,'').length > 3 && /[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(t);
    const isNotAddress = !/^(EXCELENT|MERITISSIM|ILUSTRISSIM|AO\s|TRIBUNAL|COMARCA|VARA\s|JUIZO|PROCESSO|AUTOS|AGRAVANTE|RECORRENTE|REQUERENTE|IMPETRANTE|EMBARGANTE|AUTOR|APELANTE|CPF|CNPJ|RG|OAB)/i.test(t);
    return isAllCaps && isNotAddress;
  };

  // PEDIDOS: "Nestes termos", "Pede deferimento" → alinhado à DIREITA
  const isPedidosLine = (line: string) => {
    const t = line.trim();
    return /^(Nestes\s+termos|Nesses\s+termos|Pede\s+deferimento|Requer\s+deferimento|Pede\s+e\s+espera|Requer\s+a\s+V\.\s*Ex[aª])/i.test(t);
  };

  // CITAÇÃO: ementa, acórdão, aspas longas
  const isCitationLine = (line: string) => {
    const t = line.trim();
    return (t.startsWith('"') || t.startsWith('\u201c') || t.startsWith('\u00ab'))
      || /^(Art\.|Artigo|§|S[uú]mula|Ementa:|EMENTA:|ACÓRDÃO|ACORD[AÃ]O)/i.test(t);
  };

  // CABECALHO: enderecamento inicial do documento
  const isHeaderLine = (line: string) => {
    const t = line.trim();
    return /^(EXCELENT|EXC?M?[OA]\.?\s|MERITISSIM|ILUSTRISSIM|AO\s+JUIZ|AO\s+DESEMBARGADOR|SENHOR\s+JUIZ|SENHOR\s+DESEMBARGADOR|EGRE|TRIBUNAL|COMARCA|VARA\s|JUIZO|PROCESSO\s*(N|n)|AUTOS\s*(N|n)|AGRAVANTE|AGRAVAD[OA]|RECORRENTE|RECORRIDO|REQUERENTE|REQUERIDO|IMPETRANTE|IMPETRADO|EMBARGANTE|EMBARGADO|AUTOR[A]?:|RE[UÚ]:|APELANTE|APELAD[OA])/i.test(t)
      || /^(AGRAVO|RECURSO|APELA[CÇ]|MANDADO|PETI[CÇ]|EMBARGOS|RECLAMA[CÇ]|HABEAS|A[CÇ][AÃ]O)/i.test(t)
      || /^(CPF|CNPJ|RG)\s*[:\-]/i.test(t);
  };

  // Funcao auxiliar para processar formatacao inline (negrito, italico, etc.)
  const applyInlineMarkdown = (text: string): string => {
    if (!text) return "";
    return text
      // Negrito **texto** ou __texto__
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // Itálico *texto* ou _texto_
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      // Tachado ~~texto~~
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      // Código inline `codigo`
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links markdown [texto](url)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="legal-link">$1</a>')
      // URLs simples (http/https) — não dentro de href já convertido
      .replace(/(?<![="'])(https?:\/\/[^\s<>"')\]]+)/g, '<a href="$1" target="_blank" rel="noopener" class="legal-link">$1</a>');
  };

  // Linkifica URLs em conteúdo HTML sem duplicar links existentes
  // Usa DOMParser para processar apenas nós de texto, ignorando tags <a>
  const linkifyHtml = (html: string): string => {
    if (!html) return "";
    try {
      const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
      const doc = new DOMParser().parseFromString(html, "text/html");
      const walk = (node: Node) => {
        if (node.nodeName === "A") return;
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = node.textContent || "";
          if (!urlRegex.test(txt)) return;
          urlRegex.lastIndex = 0;
          const span = document.createElement("span");
          span.innerHTML = txt.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="legal-link">$1</a>');
          node.parentNode?.replaceChild(span, node);
          return;
        }
        Array.from(node.childNodes).forEach(walk);
      };
      walk(doc.body);
      return doc.body.innerHTML;
    } catch {
      return html;
    }
  };

  const decodeHtmlEntities = (text: string): string => {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  };

  // ── formatMarkdown: converte markdown/texto em HTML jurídico com ESTILOS canônicos ──
  const formatMarkdown = (text: string): string => {
    if (!text) return "";
    const trimmed = text.trim();
    if (
      trimmed.startsWith('<p') ||
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<h1') ||
      trimmed.startsWith('<h2') ||
      trimmed.startsWith('<h3') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<table')
    ) {
      // Converte links markdown [texto](url) que possam ter chegado misturados no HTML
      const withMdLinks = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="legal-link">$1</a>');
      // linkifyHtml: transforma URLs brutas em links clicáveis (usa DOMParser para não duplicar <a> existentes)
      return linkifyHtml(withMdLinks);
    }

    const listBase = `font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;margin:0 0 4pt 0;text-indent:0`;

    const htmlResult: string[] = [];
    const rawLines = text.split('\n');
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        htmlResult.push(`<ul style="margin:4pt 0 8pt 1.5em;padding:0">${listItems.map(li => `<li style="${listBase}">${li}</li>`).join('')}</ul>`);
        listItems = [];
        inList = false;
      }
    };

    let paraBuffer: string[] = [];
    let bqBuffer: string[] = [];
    let paraIdx = 0;
    let headerDone = false;
    let totalLines = rawLines.filter(l => l.trim()).length;
    let bodyLineCount = 0;

    const flushBlockquote = () => {
      if (bqBuffer.length === 0) return;
      const bqHtml = bqBuffer.map(ln => applyInlineMarkdown(ln)).join('<br>');
      htmlResult.push(`<blockquote style="${ESTILOS.CITACAO}">${bqHtml}</blockquote>`);
      bqBuffer = [];
    };

    const flushPara = () => {
      if (paraBuffer.length === 0) return;
      const rawT = paraBuffer.join(' ').trim();
      const plainT = rawT
        .replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1')
        .replace(/\*([^*]+)\*/g,'$1').replace(/_([^_]+)_/g,'$1');
      const htmlContent = paraBuffer.map(ln => applyInlineMarkdown(ln)).join(' ');

      if (isDateLocalLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.DATA_LOCAL}">${htmlContent}</p>`);
      }
      else if (isPedidosLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.PEDIDOS}">${htmlContent}</p>`);
      }
      else if (isOabLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.OAB}">${htmlContent}</p>`);
      }
      else if (isCitationLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.CITACAO}">${htmlContent}</p>`);
      }
      else if (isSignatureLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.ASSINATURA}">${htmlContent}</p>`);
      }
      else if (!headerDone && paraIdx < 10 && isHeaderLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.CABECALHO}">${htmlContent}</p>`);
      }
      else if (isTituloLine(plainT)) {
        if (!headerDone) headerDone = true;
        htmlResult.push(`<p style="${ESTILOS.TITULO}">${htmlContent}</p>`);
      }
      else {
        if (!headerDone && paraIdx > 0 && !isHeaderLine(plainT)) headerDone = true;
        if (headerDone) bodyLineCount++;
        htmlResult.push(`<p style="${ESTILOS.PARAGRAFO}">${htmlContent}</p>`);
      }

      paraIdx++;
      paraBuffer = [];
    };

    for (const rawLine of rawLines) {
      const trimmedLine = rawLine.trim();

      const bqMatch = trimmedLine.match(/^>\s?(.*)$/);
      if (bqMatch) {
        flushList();
        flushPara();
        bqBuffer.push(bqMatch[1]);
        continue;
      }
      if (bqBuffer.length > 0 && !trimmedLine.startsWith('>')) {
        flushBlockquote();
      }

      const hMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        flushList();
        flushPara();
        const hText = applyInlineMarkdown(hMatch[2]);
        htmlResult.push(`<p style="${ESTILOS.TITULO}">${hText}</p>`);
        paraIdx++;
        continue;
      }

      const bulletMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
      if (bulletMatch) {
        flushPara();
        inList = true;
        listItems.push(applyInlineMarkdown(bulletMatch[1]));
        continue;
      }

      const numMatch = trimmedLine.match(/^(\d+)[.)]\s+(.+)$/);
      if (numMatch && inList) {
        listItems.push(`${numMatch[1]}. ${applyInlineMarkdown(numMatch[2])}`);
        continue;
      }

      if (trimmedLine === '') {
        flushList();
        flushPara();
      } else {
        if (inList) { flushList(); }
        paraBuffer.push(rawLine);
      }
    }

    flushList();
    flushBlockquote();
    flushPara();

    return htmlResult.join('');
  };

  const [editorInitContent, setEditorInitContent] = useState<string>("");
  const tiptapEditorRef = useRef<any>(null);
  const handleTiptapReady = useCallback((ed: any) => {
    tiptapEditorRef.current = ed;
  }, []);

  // Converte HTML com inline styles em HTML semântico compatível com TipTap
  // Mapeia ESTILOS jurídicos → tags semânticas (h1, blockquote, p)
  const toTiptapHtml = (html: string): string => {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const parts: string[] = [];
      doc.body.childNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) { return; }
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const style = el.getAttribute("style") || "";
        const inner = el.innerHTML;
        // Listas e tabelas: manter como estão
        if (tag === "ul" || tag === "ol" || tag === "table") { parts.push(el.outerHTML); return; }
        // Blockquote já pronto
        if (tag === "blockquote") { parts.push(`<blockquote>${inner}</blockquote>`); return; }
        // Headings semânticos
        if (tag === "h1" || tag === "h2" || tag === "h3" || tag === "h4") { parts.push(`<${tag}>${inner}</${tag}>`); return; }
        // Parágrafos com inline styles → mapear para tags semânticas
        const isCenter = /text-align\s*:\s*center/i.test(style);
        const isRight = /text-align\s*:\s*right/i.test(style);
        const isUppercase = /text-transform\s*:\s*uppercase/i.test(style);
        const isBold = /font-weight\s*:\s*bold/i.test(style);
        const isCitacao = /margin-left\s*:\s*4cm/i.test(style);
        const hasIndent = /text-indent\s*:\s*4cm/i.test(style);
        const isJustifyBold = isBold && !isCenter && !hasIndent; // ESTILOS.TITULO (justify+bold, sem indent)
        if (isCitacao) {
          // ESTILOS.CITACAO → <blockquote>
          parts.push(`<blockquote>${inner}</blockquote>`);
        } else if (isJustifyBold) {
          // ESTILOS.TITULO → <h1> (bold, justify, sem recuo — ex: I. DOS FATOS)
          parts.push(`<h1>${inner}</h1>`);
        } else if (isCenter && (isUppercase || isBold)) {
          // ESTILOS.ASSINATURA / ESTILOS.OAB / ESTILOS.CABECALHO → <h2>
          parts.push(`<h2>${inner}</h2>`);
        } else if (isCenter) {
          parts.push(`<p style="text-align:center;text-indent:0">${inner}</p>`);
        } else if (isRight) {
          // ESTILOS.DATA_LOCAL → alinhado à direita, sem recuo
          parts.push(`<p style="text-align:right;text-indent:0">${inner}</p>`);
        } else if (hasIndent) {
          // ESTILOS.PARAGRAFO → parágrafo normal com recuo 4cm
          parts.push(`<p style="text-indent:4cm">${inner}</p>`);
        } else {
          // CABECALHO, PEDIDOS, etc. — sem recuo
          parts.push(`<p style="text-indent:0">${inner}</p>`);
        }
      });
      return parts.join("") || html;
    } catch {
      return html;
    }
  };

  const openEditor = useCallback(() => {
    const displayText = editedHtml || (manualEditText ?? result);
    const isHtml = displayText.trimStart().startsWith('<');
    let html: string;
    if (isHtml) {
      html = displayText;
    } else {
      const normalized = displayText
        .replace(/\n{3,}/g, '\n\n')
        .replace(/([.!?])\n+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '$1\n\n$2');
      html = formatMarkdown(normalized);
    }
    setEditorInitContent(toTiptapHtml(html));
    setIsEditingResult(true);
    // Auto-focar o editor após renderizar
    setTimeout(() => {
      if (tiptapEditorRef.current?.commands?.focus) {
        tiptapEditorRef.current.commands.focus("end");
      }
    }, 150);
  }, [editedHtml, manualEditText, result]);

  const saveQuillEdit = useCallback(() => {
    setIsEditingResult(false);
  }, []);

  const isSaving = createModelMutation.isPending || updateModelMutation.isPending;
  const isSavingEmenta = createEmentaMutation.isPending || updateEmentaMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20 sm:pb-16 lg:pb-0">
      <header className="px-2 py-2 border-b bg-card shrink-0 space-y-1.5">
        {/* Linha 1: Título + botões de ação */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Gavel className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold truncate">Assistente Jurídico</h1>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-end">
            <Button size="icon" variant="outline" onClick={() => setShowPromptLib(true)} data-testid="button-open-prompt-lib" title="Prompts">
              <FolderOpen className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={selectedDocTemplateId ? "default" : "outline"}
              onClick={() => setShowDocTemplates(true)}
              data-testid="button-open-doc-templates"
              title="Templates de Documento"
            >
              <FileText className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={selectedEmentaIds.size > 0 ? "default" : "outline"}
              onClick={() => setShowBiblioteca(true)}
              data-testid="button-open-biblioteca"
              title="Biblioteca"
            >
              <Library className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={aiHistoryData.length > 0 ? "outline" : "ghost"}
              onClick={() => setShowHistory(true)}
              data-testid="button-open-history"
              title="Historico"
            >
              <History className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-blue-300 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={() => setShowVoiceChat(true)}
              data-testid="button-voice-chat-open"
              title="Abrir conversa por voz com a IA"
            >
              <AudioLines className="w-4 h-4" />
              VOZ
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 font-medium border-blue-400 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
              onClick={async () => {
                try {
                  const res = await fetch("/api/git-push", { method: "POST" });
                  const data = await res.json();
                  toast({
                    title: data.success ? "Sucesso!" : "Erro",
                    description: data.message,
                    variant: data.success ? "default" : "destructive"
                  });
                } catch (err) {
                  toast({ title: "Erro", description: "Falha ao fazer push", variant: "destructive" });
                }
              }}
              data-testid="button-git-push"
              title="Enviar para GitHub"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v 3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              GitHub
            </Button>
            <Button
              size="sm"
              variant={demoKeyInfo?.hasPublicKey ? "outline" : "default"}
              className={`gap-1.5 font-medium ${demoKeyInfo?.hasPublicKey ? "border-green-400 text-green-700 dark:text-green-400" : "bg-green-600 hover:bg-green-700 text-white"}`}
              onClick={() => setShowDemoKeyDialog(true)}
              data-testid="button-demo-key-open"
              title="Configurar Chave Demo"
            >
              <Key className="w-3.5 h-3.5" />
              {demoKeyInfo?.hasPublicKey ? "Demo ✓" : "Chave Demo"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 px-2 gap-1.5 text-xs font-medium border ${useCustomModel ? "border-green-400 text-green-700 dark:text-green-400" : usePerplexity ? "border-blue-400 text-blue-700 dark:text-blue-400" : "border-primary/30"}`}
                  data-testid="button-model-selector"
                >
                  {useCustomModel ? <Key className="w-3.5 h-3.5 text-green-600" /> : usePerplexity ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : usePremiumModel ? <Sparkles className="w-3.5 h-3.5 text-primary" /> : <Coins className="w-3.5 h-3.5 text-yellow-500" />}
                  <span>{useCustomModel ? "Própria" : usePerplexity ? "Perplexity" : usePremiumModel ? "Pro" : "Flash"}</span>
                  {isDemoMode && <span className="text-[8px] bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 px-1 rounded">demo</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" data-testid="dropdown-model-selector">
                <DropdownMenuLabel className="text-[10px] text-muted-foreground font-normal pb-1">Escolha o modelo de IA</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => selectModel("premium")}
                  className={`flex items-center gap-2.5 cursor-pointer py-2 ${usePremiumModel && !usePerplexity && !useCustomModel ? "bg-muted font-medium" : ""}`}
                  data-testid="button-model-premium"
                >
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <div className="text-sm leading-tight">Gemini Pro</div>
                    <div className="text-[10px] text-muted-foreground">Premium · mais preciso</div>
                  </div>
                  {usePremiumModel && !usePerplexity && !useCustomModel && <span className="ml-auto text-[10px]">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectModel("economico")}
                  className={`flex items-center gap-2.5 cursor-pointer py-2 ${!usePremiumModel && !usePerplexity && !useCustomModel ? "bg-muted font-medium" : ""}`}
                  data-testid="button-model-economico"
                >
                  <Coins className="w-4 h-4 text-yellow-500 shrink-0" />
                  <div>
                    <div className="text-sm leading-tight">Gemini Flash</div>
                    <div className="text-[10px] text-muted-foreground">Econômico · mais rápido</div>
                  </div>
                  {!usePremiumModel && !usePerplexity && !useCustomModel && <span className="ml-auto text-[10px]">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectModel("perplexity")}
                  className={`flex items-center gap-2.5 cursor-pointer py-2 ${usePerplexity ? "bg-muted font-medium" : ""}`}
                  data-testid="button-model-perplexity"
                >
                  <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                  <div>
                    <div className="text-sm leading-tight">Perplexity</div>
                    <div className="text-[10px] text-muted-foreground">Pesquisa na internet</div>
                  </div>
                  {usePerplexity && <span className="ml-auto text-[10px]">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => selectModel("custom")}
                  className={`flex items-center gap-2.5 cursor-pointer py-2 ${useCustomModel ? "bg-green-50 dark:bg-green-950 font-medium" : ""}`}
                  data-testid="button-model-custom"
                >
                  <Key className="w-4 h-4 text-green-600 shrink-0" />
                  <div>
                    <div className="text-sm leading-tight">Chave Própria</div>
                    <div className="text-[10px] text-muted-foreground">{demoKeyInfo?.hasPublicKey ? "Demo disponível ✓" : "Configure nas ⚙"}</div>
                  </div>
                  {useCustomModel && <span className="ml-auto text-[10px]">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0.5 hidden sm:inline-flex cursor-pointer"
              data-testid="badge-effort-verbosity"
              onClick={() => setShowEffortSettings(true)}
              title="Clique para ajustar esforco e tamanho da resposta"
            >
              E{effortLevel} {verbosity === "curta" ? "Concisa" : "Longa"}
            </Badge>
            <Button size="icon" variant="ghost" onClick={clearAll} data-testid="button-clear-all" title="Limpar tudo">
              <Trash2 />
            </Button>
            <ThemeToggle />
          </div>
        </div>

        {/* Linha 2: Navegação — espaçada para uso no celular */}
        <div className="flex flex-wrap gap-2">
          <Link href="/consulta">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-consulta">
              <Search className="w-3.5 h-3.5 shrink-0" />
              Consulta
            </Button>
          </Link>
          <Link href="/auditoria">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-auditoria">
              <Calculator className="w-3.5 h-3.5 shrink-0" />
              Auditoria
            </Button>
          </Link>
          <Link href="/token">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-token">
              <Key className="w-3.5 h-3.5 shrink-0" />
              Token PDPJ
            </Button>
          </Link>
          <Link href="/pdpj">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-pdpj">
              <Scale className="w-3.5 h-3.5 shrink-0" />
              PDPJ
            </Button>
          </Link>
          <Link href="/comunicacoes">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-comunicacoes">
              <FileText className="w-3.5 h-3.5 shrink-0" />
              Comunicações
            </Button>
          </Link>
          <Link href="/tramitacao">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-tramitacao">
              <Scale className="w-3.5 h-3.5 shrink-0" />
              Tramitação
            </Button>
          </Link>
          <Link href="/playground">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-playground">
              <Code2 className="w-3.5 h-3.5 shrink-0" />
              Códigos
            </Button>
          </Link>
          <Link href="/filtrador">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-filtrador">
              <Filter className="w-3.5 h-3.5 shrink-0" />
              Filtrador
            </Button>
          </Link>
          <Link href="/previdenciario">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" data-testid="button-go-previdenciario">
              <Calculator className="w-3.5 h-3.5 shrink-0" />
              Previdenciário
            </Button>
          </Link>
          <Link href="/codigo">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 px-3" data-testid="button-go-codigo">
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              Livre
            </Button>
          </Link>
          <Link href="/configuracoes">
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-blue-500 dark:text-blue-400 px-3" data-testid="button-go-configuracoes">
              <Settings className="w-3.5 h-3.5 shrink-0" />
              Config
            </Button>
          </Link>
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs text-muted-foreground px-3" onClick={() => setShowTokenCalc(true)} data-testid="button-token-calc">
            <Coins className="w-3.5 h-3.5 shrink-0" />
            Tokens
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1.5 text-xs text-orange-500 px-3"
            data-testid="button-force-update"
            title="Limpar cache e atualizar"
            onClick={async () => {
              try {
                if ('caches' in window) {
                  const names = await caches.keys();
                  await Promise.all(names.map(n => caches.delete(n)));
                }
                if ('serviceWorker' in navigator) {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  await Promise.all(regs.map(r => r.unregister()));
                }
                localStorage.removeItem('legal_format_settings');
                localStorage.removeItem('legal_format_settings_v2');
                toast({ title: "Cache limpo! Recarregando..." });
                setTimeout(() => window.location.reload(), 500);
              } catch {
                window.location.reload();
              }
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            Atualizar
          </Button>
        </div>
      </header>

      {selectedEmentaIds.size > 0 && (
        <div className="px-3 py-1.5 border-b bg-primary/5 flex items-center gap-2 flex-wrap">
          <Library className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Ementas selecionadas:</span>
          {Array.from(selectedEmentaIds).map((id) => {
            const em = allEmentas.find((e) => e.id === id);
            if (!em) return null;
            return (
              <Badge
                key={id}
                variant="secondary"
                className="text-xs gap-1 cursor-pointer"
                onClick={() => toggleEmentaSelection(id)}
                data-testid={`badge-selected-ementa-${id}`}
              >
                {em.titulo}
                <X className="w-3 h-3" />
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden lg:overflow-hidden overflow-y-auto">
        <div className="flex-1 flex flex-col min-h-0 lg:min-h-0 border-b lg:border-b-0 lg:border-r">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt,.text,.md,.rtf,.csv,.html,.htm,.xml,.json,.pem,.key,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
            multiple
            className="hidden"
            onChange={handleFileImport}
            data-testid="input-file-import"
          />
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.oga,.opus,.ptt,.flac,.aac,.wma,.webm,.mp4,.mov,.avi,.mkv,.wmv,.3gp,.m4v,audio/*,video/*"
            multiple
            className="hidden"
            onChange={handleAudioImport}
            data-testid="input-audio-import"
          />
            <div className="px-2 py-2 border-b bg-muted/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant={useCustomModel || usePerplexity || usePremiumModel ? "default" : "outline"}
                  className={`gap-1 text-xs ${useCustomModel ? "border-green-500 text-green-700 dark:text-green-400" : usePerplexity ? "border-blue-500 text-blue-600 dark:text-blue-400" : ""}`}
                  onClick={() => {
                    const cur = localStorage.getItem("legal_model_choice") || "premium";
                    if (cur === "premium") selectModel("economico");
                    else if (cur === "economico") selectModel("perplexity");
                    else if (cur === "perplexity") selectModel("custom");
                    else selectModel("premium");
                  }}
                  data-testid="button-toggle-model"
                  title="Clique para ciclar: Pro → Flash → Perplexity → Chave Própria → Pro"
                >
                  {useCustomModel ? <Key className="w-3.5 h-3.5 text-green-600" /> : usePerplexity ? <Globe className="w-3.5 h-3.5 text-blue-500" /> : <Cpu className="w-3.5 h-3.5" />}
                  {useCustomModel ? "Própria" : usePerplexity ? "Perplexity" : usePremiumModel ? "Pro" : "Flash"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  data-testid="button-import-file"
                  title="Importar PDF, Word ou TXT"
                >
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isUploading ? "Importando..." : "Arquivo"}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isTranscribing}
                  data-testid="button-import-audio"
                  title="Transcrever audio ou video"
                >
                  {isTranscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isTranscribing ? "Transcrevendo..." : "Audio"}</span>
                </Button>
              </div>
            </div>
            <div className="px-2 py-2 border-b bg-muted/30 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground font-medium">Entrada de texto:</div>
              {hasSpeechRecognition && (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={isListening ? "destructive" : "default"}
                    className={`gap-1.5 ${isListening ? "animate-pulse" : ""}`}
                    onClick={() => startVoice("main")}
                    data-testid="button-voice-dictation"
                    title={isListening ? "Parar ditado por voz" : "Ditar por voz (fale ao inves de digitar)"}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isListening ? "PARAR" : "DITAR"}
                  </Button>
                </div>
              )}
            </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={result ? "Contexto atual carregado — cole novo texto para substituir, ou deixe vazio para usar o resultado existente como base..." : "Cole aqui o texto do documento, peticao, sentenca, contrato ou qualquer outro texto juridico que deseja processar..."}
            className="w-full resize-none bg-background p-3 text-sm font-mono outline-none min-h-[120px] max-h-[40vh] lg:flex-1 lg:min-h-0 lg:max-h-none"
            data-testid="input-legal-text"
          />

          <div className="px-2 py-2 border-t bg-muted/20">
            <p className="text-xs text-muted-foreground mb-1.5">Modos de operacao:</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ACTIONS.filter(a => a.group === "modos").map((action) => {
                const Icon = action.icon;
                const isActive = selectedAction === action.id;
                return (
                  <Button
                    key={action.id}
                    variant={isActive ? "default" : "outline"}
                    className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-1"
                    onClick={() => processBuiltIn(action.id)}
                    disabled={isProcessing}
                    data-testid={`button-action-${action.id}`}
                  >
                    {isProcessing && selectedAction === action.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                    <span className="text-[11px] font-medium">{action.label}</span>
                  </Button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mb-1.5 mt-2">Outras acoes:</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ACTIONS.filter(a => a.group === "acoes").map((action) => {
                const Icon = action.icon;
                const isActive = selectedAction === action.id;
                return (
                  <Button
                    key={action.id}
                    variant={isActive ? "default" : "outline"}
                    className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-1"
                    onClick={() => processBuiltIn(action.id)}
                    disabled={isProcessing}
                    data-testid={`button-action-${action.id}`}
                  >
                    {isProcessing && selectedAction === action.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                    <span className="text-[11px] font-medium">{action.label}</span>
                  </Button>
                );
              })}
            </div>

            {customActions.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground mb-1.5 mt-2">Seus modelos:</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {customActions.map((ca) => {
                    const isActive = selectedCustomId === ca.id;
                    return (
                      <div key={ca.id} className="flex flex-col gap-0.5">
                        <Button
                          variant={isActive ? "default" : "outline"}
                          className="flex flex-col items-center gap-0.5 h-auto py-1.5 px-1 w-full"
                          onClick={() => processCustom(ca)}
                          disabled={isProcessing}
                          data-testid={`button-custom-action-${ca.id}`}
                        >
                          {isProcessing && selectedCustomId === ca.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Settings className="w-4 h-4" />
                          )}
                          <span className="text-[11px] font-medium truncate max-w-full">{ca.label}</span>
                        </Button>
                        <div className="flex gap-0.5 justify-center">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditModel(ca)} data-testid={`button-edit-model-${ca.id}`} title="Editar">
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteModelMutation.mutate(ca.id)} data-testid={`button-delete-model-${ca.id}`} title="Excluir">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <Button
              variant="outline"
              className="w-full mt-2 gap-1 text-xs"
              onClick={openNewModel}
              data-testid="button-add-model"
            >
              <Plus className="w-4 h-4" />
              Novo Modelo
            </Button>
          </div>
        </div>

        <div className={isResultFullscreen ? "fixed inset-0 z-50 flex flex-col bg-background border" : "flex-1 flex flex-col min-h-0 lg:min-h-0"}>
          <div className="px-2 py-1.5 border-b bg-muted/30 flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {isProcessing ? (processingStatus || "Processando...") : result ? "Resultado" : "Resultado aqui"}
              </span>
              <Button
                size="sm"
                variant={autoReadAloud ? "default" : "outline"}
                onClick={() => setAutoReadAloud(!autoReadAloud)}
                data-testid="button-toggle-auto-read"
                title={autoReadAloud ? "Modo Voz LIGADO - IA le automaticamente" : "Modo Voz DESLIGADO - clique para ativar"}
                className={`toggle-elevate ${autoReadAloud ? "toggle-elevated" : ""}`}
              >
                <AudioLines className="w-3.5 h-3.5 mr-1" />
                <span className="text-xs">{autoReadAloud ? "Voz ON" : "Voz OFF"}</span>
              </Button>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <Button
                size="icon"
                variant={isSpeaking ? "destructive" : "ghost"}
                onClick={() => toggleSpeech(result)}
                disabled={!result}
                data-testid="button-read-aloud"
                title={isSpeaking ? "Parar leitura" : "Ouvir resultado em voz alta"}
                className={isSpeaking ? "animate-pulse" : ""}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={copyResult} disabled={!result} data-testid="button-copy-result" title="Copiar resultado">
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={exportResult} disabled={!result} data-testid="button-export-result" title="Baixar como .txt">
                <Download className="w-4 h-4" />
              </Button>
              <Button size="icon" variant={selectedDocTemplateId ? "default" : "ghost"} onClick={exportWordWithTemplate} disabled={!result} data-testid="button-export-word" title={selectedDocTemplateId ? "Baixar Word com template" : "Baixar como Word"}>
                <FileText className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setShowDocFormatSettings(true)} data-testid="button-doc-format-settings" title="Configurar formato do documento Word">
                <Settings className="w-4 h-4" />
              </Button>
              {result && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsResultFullscreen(f => !f)}
                  data-testid="button-fullscreen-result"
                  title={isResultFullscreen ? "Sair da tela cheia" : "Ampliar resultado (tela cheia)"}
                >
                  {isResultFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </Button>
              )}
            </div>
          </div>
          {lastQueryCost && !isProcessing && (
            <div className="px-3 py-1 border-b bg-muted/10 flex items-center gap-2 text-[10px] text-muted-foreground" data-testid="cost-display">
              <Coins className="w-3 h-3 text-yellow-500 shrink-0" />
              <span>
                {lastQueryCost.totalUsd === 0
                  ? <>Custo: <strong className="text-green-600 dark:text-green-400">GRÁTIS (sua chave)</strong></>
                  : <>Custo estimado: <strong className="text-foreground">${lastQueryCost.totalUsd < 0.001 ? "<$0.001" : `$${lastQueryCost.totalUsd.toFixed(4)}`}</strong> <span className="text-amber-500">(créditos Replit)</span></>
                }
                {" · "}{lastQueryCost.inputTokens.toLocaleString()} tokens entrada
                {" · "}{lastQueryCost.outputTokens.toLocaleString()} tokens saída
                {" · "}modelo: {lastQueryCost.model}
              </span>
            </div>
          )}
          <div
            ref={resultRef}
            className="flex-1 overflow-auto p-3 text-sm leading-relaxed"
            data-testid="result-output"
          >
            {result || chatHistory.length > 0 || isRefining ? (
              <div className="space-y-3">
                {chatHistory.length > 0 && (() => {
                  // Montar pares usuario/resposta para exibir como conversa
                  const userMsgs = chatHistory.filter(m => m.role === 'user');
                  const asstMsgs = chatHistory.filter(m => m.role === 'assistant');
                  return userMsgs.map((msg, i) => (
                    <div key={i} className="space-y-1">
                      {/* Pergunta do usuario */}
                      <div className="flex justify-end">
                        <div className="bg-primary/10 border border-primary/20 rounded-xl px-3 py-2 max-w-[90%]">
                          <p className="text-xs font-semibold text-primary mb-0.5">Voce</p>
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        </div>
                      </div>
                      {/* Resposta da IA (versao anterior ou atual) */}
                      {asstMsgs[i] && (() => {
                        const aContent = asstMsgs[i].content;
                        const aIsHtml = aContent.trimStart().startsWith('<');
                        const aHtmlContent = aIsHtml ? linkifyHtml(aContent) : formatMarkdown(aContent);
                        const previewText = aContent.replace(/<[^>]*>/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').substring(0, 200);
                        return (
                        <div className="flex justify-start">
                          <div className="bg-muted/40 border rounded-xl px-3 py-2 max-w-[90%]">
                            <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                              IA — versao {i + 1}{i === userMsgs.length - 1 ? " (atual)" : ""}
                            </p>
                            <div
                              className="chat-assistant-message text-xs text-muted-foreground max-h-24 overflow-hidden relative"
                              dangerouslySetInnerHTML={{ __html: aHtmlContent }}
                            />
                            <div className="h-4 bg-gradient-to-t from-muted/40 to-transparent -mt-4 relative" />
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <button
                                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 transition-colors"
                                onClick={() => {
                                  const clean = asstMsgs[i].content.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/^#{1,6}\s+/gm,'');
                                  navigator.clipboard.writeText(clean);
                                  toast({ title: "Copiado!", description: "Versão " + (i+1) + " copiada." });
                                }}
                              >
                                <Copy className="w-2.5 h-2.5" /> Copiar
                              </button>
                              {i < userMsgs.length - 1 ? (
                                <button
                                  className="text-[10px] text-blue-500 hover:underline"
                                  onClick={() => {
                                    setResult(asstMsgs[i].content);
                                    setEditedHtml(null);
                                  }}
                                >
                                  Restaurar esta versao
                                </button>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">Documento atual exibido abaixo</span>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  ));
                })()}
                {chatHistory.length > 0 && result && (
                  <div className="border-t pt-2 mb-1">
                    <p className="text-xs text-muted-foreground text-center">
                      Documento atual ({chatHistory.filter(m => m.role === 'user').length} ajuste{chatHistory.filter(m => m.role === 'user').length !== 1 ? 's' : ''})
                    </p>
                  </div>
                )}
                {result ? (
                  (() => {
                    const displayText = editedHtml || (manualEditText ?? result);
                    const isHtml = displayText.trimStart().startsWith('<');
                    const htmlContent = isHtml ? linkifyHtml(displayText) : formatMarkdown(displayText);
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          {!isEditingResult ? (
                            <>
                              <button
                                onClick={openEditor}
                                className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 transition-colors"
                                data-testid="button-toggle-edit"
                              >
                                <Pencil className="w-3 h-3" /> Corrigir texto
                              </button>
                              <button
                                onClick={() => refineResult("Reforme e reforumule este texto juridico com a estrutura correta: separe em paragrafos numerados, adicione cabecalho, secoes com numeracao romana, fundamentacao juridica, pedidos e assinatura. Mantenha TODO o conteudo original sem cortar nada.")}
                                disabled={isRefining}
                                className="text-xs px-2 py-0.5 rounded border border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950 flex items-center gap-1 transition-colors disabled:opacity-50"
                                data-testid="button-reformat-ai"
                                title="Usa a IA para reconstruir os parágrafos e estrutura do texto"
                              >
                                <Wand2 className="w-3 h-3" /> Reformatar com IA
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={saveQuillEdit}
                                className="text-xs px-2 py-0.5 rounded border border-green-400 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 flex items-center gap-1 transition-colors"
                                data-testid="button-save-edit"
                              >
                                <Check className="w-3 h-3" /> Salvar
                              </button>
                              <button
                                onClick={() => setIsEditingResult(false)}
                                className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1 transition-colors"
                                data-testid="button-cancel-edit"
                              >
                                <X className="w-3 h-3" /> Cancelar
                              </button>
                              <span className="text-xs text-amber-600 dark:text-amber-400">Editor ativo — faça as correções e clique em Salvar</span>
                            </>
                          )}
                        </div>
                        {isEditingResult ? (
                          <TiptapEditor
                            initialData={editorInitContent}
                            onChange={(html) => {
                              if (html && html !== "<p></p>") setEditedHtml(html);
                            }}
                            onReady={handleTiptapReady}
                          />
                        ) : (
                          <div
                            className="legal-result-display max-w-none outline-none"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                            data-testid="result-display"
                          />
                        )}
                        {perplexityCitations.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-blue-200 dark:border-blue-800">
                            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                              <Globe className="w-3 h-3" /> Fontes Perplexity ({perplexityCitations.length})
                            </p>
                            <ol className="space-y-1">
                              {perplexityCitations.map((url, idx) => (
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
                      </div>
                    );
                  })()
                ) : isRefining ? (
                  <div className="flex items-center gap-2 text-muted-foreground p-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Processando seu pedido...</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 gap-3 p-6">
                <Gavel className="w-12 h-12" />
                {(() => {
                  const hasSaved = !!localStorage.getItem("legal_last_result");
                  return hasSaved ? (
                    <p className="text-center text-sm max-w-xs text-primary/70">
                      Contexto anterior salvo — cole texto novo ou escolha uma acao para continuar
                    </p>
                  ) : (
                    <p className="text-center text-sm max-w-xs">
                      Cole o texto no campo ao lado e escolha uma acao para comecar
                    </p>
                  );
                })()}
              </div>
            )}
          </div>
          {(result || isRefining || chatHistory.length > 0) && !isProcessing && (
            <div className="px-3 py-2 border-t bg-muted/20">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] text-muted-foreground">Chat usa:</span>
                <Badge
                  variant="secondary"
                  className={`text-[10px] cursor-pointer ${useCustomModel ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : usePerplexity ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : ""}`}
                  onClick={() => {
                    const cur = localStorage.getItem("legal_model_choice") || "premium";
                    if (cur === "premium") selectModel("economico");
                    else if (cur === "economico") selectModel("perplexity");
                    else if (cur === "perplexity") selectModel("custom");
                    else selectModel("premium");
                  }}
                  data-testid="badge-chat-model"
                >
                  {useCustomModel ? "Chave Própria" : usePerplexity ? "Perplexity" : usePremiumModel ? "Premium" : "Econômico"} (clique para trocar)
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 mb-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refineResult("Elabore uma minuta/peticao COMPLETA e FORMAL com base em tudo que temos. Documento profissional completo com todas as secoes.")}
                  disabled={isRefining}
                  data-testid="button-quick-minuta"
                >
                  <Gavel className="w-3 h-3 mr-1" />
                  Construir Minuta
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refineResult("Expanda significativamente o documento. Adicione mais argumentacao juridica, mais fundamentacao legal, mais detalhes. O documento precisa ser mais longo e completo.")}
                  disabled={isRefining}
                  data-testid="button-quick-expandir"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Expandir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refineResult("Melhore a qualidade do texto: linguagem mais formal, argumentacao mais robusta, fundamentacao legal mais detalhada. Mantenha todo o conteudo.")}
                  disabled={isRefining}
                  data-testid="button-quick-melhorar"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Melhorar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refineResult("Verifique o que esta faltando neste documento. Liste os campos a preencher, secoes incompletas e sugestoes de melhoria.")}
                  disabled={isRefining}
                  data-testid="button-quick-lacunas"
                >
                  <Search className="w-3 h-3 mr-1" />
                  Lacunas
                </Button>
              </div>
              <input
                ref={chatFileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.text,.md,.rtf,.csv,.html,.htm,.xml,.json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                className="hidden"
                onChange={handleChatFileAttach}
                data-testid="input-chat-file-attach"
              />
              <div className="flex items-center gap-1">
                {hasSpeechRecognition && (
                  <Button
                    size="icon"
                    variant={isListening && voiceTarget === "chat" ? "destructive" : "ghost"}
                    className={isListening && voiceTarget === "chat" ? "animate-pulse" : ""}
                    onClick={() => startVoice("chat")}
                    title={isListening && voiceTarget === "chat" ? "Parar ditado" : "Ditar por voz no chat"}
                    data-testid="button-chat-voice"
                  >
                    {isListening && voiceTarget === "chat" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => chatFileInputRef.current?.click()}
                  disabled={isRefining || chatAttaching}
                  title="Anexar arquivo"
                  data-testid="button-chat-attach"
                >
                  {chatAttaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                </Button>
                <Input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                      e.preventDefault();
                      refineResult(chatInput);
                    }
                  }}
                  placeholder={chatHistory.length > 1 ? `Conversa (${Math.floor(chatHistory.length / 2)} ajuste${Math.floor(chatHistory.length / 2) > 1 ? 's' : ''}) - a IA lembra das mudancas anteriores...` : "Ajuste o resultado ou anexe um arquivo..."}
                  disabled={isRefining}
                  className="flex-1 min-w-0"
                  data-testid="input-chat-refine"
                />
                <Button
                  size="icon"
                  onClick={() => refineResult(chatInput)}
                  disabled={!chatInput.trim() || isRefining}
                  data-testid="button-send-refine"
                >
                  {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingModel ? "Editar Modelo" : "Novo Modelo"}</DialogTitle>
            <DialogDescription>
              {editingModel ? "Edite as informacoes do seu modelo personalizado." : "Crie um novo modelo com instrucoes personalizadas para a IA."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome do modelo</label>
              <Input
                value={modelLabel}
                onChange={(e) => setModelLabel(e.target.value)}
                placeholder="Ex: Elaborar Recurso"
                data-testid="input-model-label"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descricao (opcional)</label>
              <Input
                value={modelDescription}
                onChange={(e) => setModelDescription(e.target.value)}
                placeholder="Ex: Cria um recurso a partir do texto"
                data-testid="input-model-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Instrucoes para a IA</label>
              <Textarea
                value={modelPrompt}
                onChange={(e) => setModelPrompt(e.target.value)}
                placeholder="Escreva aqui o que a IA deve fazer com o texto. Por exemplo: 'Voce e um advogado especialista em direito tributario. Analise o texto e elabore um recurso fundamentado...'"
                className="min-h-[120px]"
                data-testid="input-model-prompt"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetModelForm} data-testid="button-cancel-model">
                Cancelar
              </Button>
              <Button onClick={saveModel} disabled={isSaving} data-testid="button-save-model">
                {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editingModel ? "Salvar" : "Criar Modelo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPromptLib} onOpenChange={setShowPromptLib}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Biblioteca de Prompts
            </DialogTitle>
            <DialogDescription>
              Guarde seus modelos de prompt para consultar e copiar quando precisar.
            </DialogDescription>
          </DialogHeader>

          {showPromptForm ? (
            <div className="flex flex-col gap-3 overflow-auto flex-1">
              <input
                ref={promptTplFileInputRef}
                type="file"
                accept=".txt,.md,.text,.rtf,.csv,.log,text/*"
                className="hidden"
                onChange={handlePromptTplFileImport}
                data-testid="input-prompt-tpl-file"
              />
              <div>
                <label className="text-sm font-medium mb-1 block">Titulo</label>
                <Input
                  value={promptTplTitulo}
                  onChange={(e) => setPromptTplTitulo(e.target.value)}
                  placeholder="Ex: Limpar texto do eproc, Analise estrategica..."
                  data-testid="input-prompt-tpl-titulo"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria</label>
                <Input
                  value={promptTplCategoria}
                  onChange={(e) => setPromptTplCategoria(e.target.value)}
                  placeholder="Ex: Limpeza, Estrategia, Peticao..."
                  list="prompt-categorias-sugestoes"
                  data-testid="input-prompt-tpl-categoria"
                />
                {promptTplCategories.length > 0 && (
                  <datalist id="prompt-categorias-sugestoes">
                    {promptTplCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Texto do prompt</label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => promptTplFileInputRef.current?.click()}
                    data-testid="button-import-prompt-tpl-file"
                  >
                    <Upload className="w-3 h-3" />
                    Importar
                  </Button>
                </div>
                <Textarea
                  value={promptTplTexto}
                  onChange={(e) => setPromptTplTexto(e.target.value)}
                  placeholder="Cole aqui o texto do prompt..."
                  className="min-h-[150px] flex-1"
                  data-testid="input-prompt-tpl-texto"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetPromptTplForm} data-testid="button-cancel-prompt-tpl">
                  Cancelar
                </Button>
                <Button onClick={savePromptTpl} disabled={createPromptTplMutation.isPending || updatePromptTplMutation.isPending} data-testid="button-save-prompt-tpl">
                  {(createPromptTplMutation.isPending || updatePromptTplMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {editingPromptTpl ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-hidden flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <Input
                    value={promptTplSearch}
                    onChange={(e) => setPromptTplSearch(e.target.value)}
                    placeholder="Buscar prompt..."
                    className="h-9"
                    data-testid="input-prompt-tpl-search"
                  />
                </div>
                <Button
                  onClick={openNewPromptTpl}
                  className="gap-1"
                  data-testid="button-add-prompt-tpl"
                >
                  <Plus className="w-4 h-4" />
                  Novo Prompt
                </Button>
              </div>

              {promptTplCategories.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  <Badge
                    variant={promptTplFilterCat === null ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setPromptTplFilterCat(null)}
                    data-testid="badge-prompt-filter-all"
                  >
                    Todos ({allPromptTemplates.length})
                  </Badge>
                  {promptTplCategories.map((cat) => {
                    const count = allPromptTemplates.filter((t) => t.categoria === cat).length;
                    return (
                      <Badge
                        key={cat}
                        variant={promptTplFilterCat === cat ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => setPromptTplFilterCat(promptTplFilterCat === cat ? null : cat)}
                        data-testid={`badge-prompt-filter-${cat}`}
                      >
                        {cat} ({count})
                      </Badge>
                    );
                  })}
                </div>
              )}

              <div className="flex-1 overflow-auto space-y-2">
                {filteredPromptTpls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50 gap-2">
                    <FolderOpen className="w-10 h-10" />
                    <p className="text-sm text-center">
                      {allPromptTemplates.length === 0
                        ? "Sua biblioteca de prompts esta vazia. Adicione prompts para consultar depois."
                        : "Nenhum prompt encontrado com esse filtro."}
                    </p>
                  </div>
                ) : (
                  filteredPromptTpls.map((tpl) => (
                    <Card
                      key={tpl.id}
                      className="p-3"
                      data-testid={`card-prompt-tpl-${tpl.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium truncate">{tpl.titulo}</span>
                            <Badge variant="outline" className="text-xs shrink-0">{tpl.categoria}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{tpl.texto}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => copyPromptTplToClipboard(tpl.texto)}
                            data-testid={`button-copy-prompt-tpl-${tpl.id}`}
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditPromptTpl(tpl)}
                            data-testid={`button-edit-prompt-tpl-${tpl.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deletePromptTplMutation.mutate(tpl.id)}
                            data-testid={`button-delete-prompt-tpl-${tpl.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showUsageHint} onOpenChange={(open) => { if (!open) { setShowUsageHint(false); setPendingAIAction(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-primary" />
              Configurar Processamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Effort Level */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  Nivel de Detalhamento
                </label>
                <Badge variant="secondary" className="font-mono text-[10px]" data-testid="text-effort-label">
                  {effortLevel === 1 ? "RAPIDO" : effortLevel === 2 ? "BASICO" : effortLevel === 3 ? "DETALHADO" : effortLevel === 4 ? "PROFUNDO" : "EXAUSTIVO"}
                </Badge>
              </div>
              <input
                type="range"
                min={1}
                max={5}
                value={effortLevel}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  setEffortLevel(v);
                  localStorage.setItem("legal_effort_level", String(v));
                }}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary bg-muted"
                data-testid="slider-effort"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                <span>Superficial</span>
                <span>Equilibrado</span>
                <span>Maximo</span>
              </div>
            </div>

            {/* Verbosity / Size */}
            <div className="space-y-3">
              <label className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Extensao da Resposta
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={verbosity === "curta" ? "default" : "outline"}
                  size="sm"
                  className="h-10 text-xs font-medium"
                  onClick={() => { setVerbosity("curta"); localStorage.setItem("legal_verbosity", "curta"); }}
                  data-testid="button-verbosity-curta"
                >
                  <AlignLeft className="w-3.5 h-3.5 mr-1.5" />
                  Objetiva
                </Button>
                <Button
                  variant={verbosity === "longa" ? "default" : "outline"}
                  size="sm"
                  className="h-10 text-xs font-medium"
                  onClick={() => { setVerbosity("longa"); localStorage.setItem("legal_verbosity", "longa"); }}
                  data-testid="button-verbosity-longa"
                >
                  <AlignJustify className="w-3.5 h-3.5 mr-1.5" />
                  Completa
                </Button>
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-3">
              <label className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                Inteligencia Artificial
              </label>
              <div className="grid grid-cols-3 gap-2">
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${!usePremiumModel && !usePerplexity ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => { setUsePremiumModel(false); setUsePerplexity(false); localStorage.setItem("legal_model_choice", "economico"); }}
                  data-testid="cost-option-economico"
                >
                  {!usePremiumModel && !usePerplexity && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                  <Coins className="w-4 h-4 text-yellow-500 mb-1" />
                  <div className="font-bold text-xs mb-0.5">Econômico</div>
                  <div className="text-[9px] text-muted-foreground">Gemini Flash</div>
                </div>
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${usePremiumModel && !usePerplexity ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => { setUsePremiumModel(true); setUsePerplexity(false); localStorage.setItem("legal_model_choice", "premium"); }}
                  data-testid="cost-option-premium"
                >
                  {usePremiumModel && !usePerplexity && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                  <Sparkles className="w-4 h-4 text-primary mb-1" />
                  <div className="font-bold text-xs mb-0.5">Premium</div>
                  <div className="text-[9px] text-muted-foreground">Gemini Pro</div>
                </div>
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${usePerplexity ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => selectModel("perplexity")}
                  data-testid="cost-option-perplexity"
                >
                  {usePerplexity && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-blue-500" />}
                  <Globe className="w-4 h-4 text-blue-500 mb-1" />
                  <div className="font-bold text-xs mb-0.5">Perplexity</div>
                  <div className="text-[9px] text-muted-foreground">sonar-pro web</div>
                </div>
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer col-span-3 ${useCustomModel ? 'border-green-500 bg-green-50 dark:bg-green-950 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => selectModel("custom")}
                  data-testid="cost-option-custom"
                >
                  {useCustomModel && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-green-500" />}
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-green-600 shrink-0" />
                    <div>
                      <div className="font-bold text-xs mb-0.5">Chave Própria — Gratuita ou de Teste</div>
                      <div className="text-[9px] text-muted-foreground">Qualquer serviço (OpenAI, Groq, Together.ai, Mistral...) — configure nas Configurações ⚙</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t">
            <Button
              size="lg"
              className="w-full font-bold shadow-lg gap-2"
              onClick={() => {
                if (pendingAIAction?.type === 'refine') {
                  doRefine(pendingAIAction.body.instruction);
                } else {
                  streamResponse(pendingAIAction?.body || {});
                }
                setShowUsageHint(false);
              }}
              data-testid="button-confirm-process"
            >
              <Play className="w-4 h-4 fill-current" />
              INICIAR PROCESSAMENTO
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => { setShowUsageHint(false); setPendingAIAction(null); }}
              data-testid="button-cancel-cost"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBiblioteca} onOpenChange={setShowBiblioteca}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Library className="w-5 h-5" />
              Biblioteca de Jurisprudencia
            </DialogTitle>
            <DialogDescription>
              Pesquise jurisprudências do STJ, STF e TRFs ou salve ementas manualmente.
            </DialogDescription>
          </DialogHeader>

          <div className="flex border-b">
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bibliotecaTab === "pesquisar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setBibliotecaTab("pesquisar")}
              data-testid="tab-pesquisar-juri"
            >
              <span className="flex items-center gap-1.5"><Search className="w-3.5 h-3.5" />Pesquisar</span>
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${bibliotecaTab === "minha" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setBibliotecaTab("minha")}
              data-testid="tab-minha-biblioteca"
            >
              <span className="flex items-center gap-1.5"><Library className="w-3.5 h-3.5" />Minha Biblioteca</span>
            </button>
          </div>

          {bibliotecaTab === "pesquisar" && (
            <div className="flex flex-col gap-3 overflow-auto flex-1 pt-1">
              <div className="flex gap-2">
                <Input
                  value={juriQuery}
                  onChange={e => setJuriQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && buscarJurisprudencias()}
                  placeholder="Ex: autismo plano de saúde, dano moral SUS, BPC LOAS..."
                  className="flex-1"
                  data-testid="input-juri-query"
                />
                <Button onClick={buscarJurisprudencias} disabled={juriLoading || !juriQuery.trim()} data-testid="button-buscar-juri">
                  {juriLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["STJ", "STF", "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6"].map(t => (
                  <button
                    key={t}
                    onClick={() => toggleJuriTribunal(t)}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${juriTribunais.includes(t) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary"}`}
                    data-testid={`toggle-tribunal-${t.toLowerCase()}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {juriLoading && (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Buscando jurisprudências...</span>
                </div>
              )}
              {!juriLoading && juriResults.length > 0 && (
                <div className="space-y-2 overflow-auto flex-1">
                  {juriResults.map((r, i) => (
                    <div key={i} className="border rounded-md p-3 space-y-1.5" data-testid={`juri-result-${i}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-primary">{r.tribunal}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{r.tipo}</span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs font-medium">{r.processo}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {r.relator} {r.data && `| ${r.data}`}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={() => insertJuriIntoEditor(r)} data-testid={`button-inserir-juri-${i}`}>
                            <Plus className="w-3 h-3" />Inserir
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={() => saveJuriToLibrary(r)} data-testid={`button-salvar-juri-${i}`}>
                            <Library className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium italic">{r.tese}</p>
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => setJuriExpandedIdx(juriExpandedIdx === i ? null : i)}
                            className="text-xs text-primary hover:underline"
                            data-testid={`button-toggle-ementa-${i}`}
                          >
                            {juriExpandedIdx === i ? "▲ Ocultar detalhes" : "▼ Ver detalhes"}
                          </button>
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1"
                              data-testid={`link-cnj-${i}`}
                            >
                              🔗 Ver no CNJ
                            </a>
                          )}
                        </div>
                        {juriExpandedIdx === i && (
                          <div className="mt-1.5 space-y-2">
                            <div
                              className="p-2 bg-muted/50 rounded text-xs leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: (() => {
                                const txt = r.ementa || "";
                                const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
                                return txt.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
                                  .replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="legal-link">$1</a>')
                                  .replace(/\n/g,"<br>");
                              })() }}
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 gap-1"
                                disabled={juriEmentaSummarizing.has(i)}
                                onClick={() => resumirEmenta(r, i)}
                                data-testid={`button-resumir-ementa-${i}`}
                              >
                                {juriEmentaSummarizing.has(i) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                {juriEmentaSummarizing.has(i) ? "Resumindo..." : "Resumir com IA"}
                              </Button>
                              {juriEmentaSummaries[i] && (
                                <button
                                  className="text-[10px] text-muted-foreground hover:text-foreground"
                                  onClick={() => setJuriEmentaSummaries(prev => { const n = { ...prev }; delete n[i]; return n; })}
                                  data-testid={`button-clear-resumo-${i}`}
                                >
                                  ✕ Limpar resumo
                                </button>
                              )}
                            </div>
                            {juriEmentaSummaries[i] && (
                              <div className="p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs leading-relaxed border border-blue-200 dark:border-blue-800">
                                <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Resumo IA:</p>
                                <p className="whitespace-pre-wrap">{juriEmentaSummaries[i]}</p>
                              </div>
                            )}
                            {r.url && (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-500 hover:underline block"
                              >
                                🔗 {r.url}
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!juriLoading && juriResults.length === 0 && juriQuery && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado. Tente outro termo ou selecione mais tribunais.</p>
              )}
              {!juriLoading && juriResults.length === 0 && !juriQuery && (
                <p className="text-sm text-muted-foreground text-center py-8">Digite um tema jurídico e clique em Pesquisar.</p>
              )}
            </div>
          )}

          {bibliotecaTab === "minha" && showEmentaForm ? (
            <div className="flex flex-col gap-3 overflow-auto flex-1">
              <input
                ref={ementaFileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.text,.md,.rtf,.csv,.pem,.key,.log,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*"
                className="hidden"
                onChange={handleEmentaFileImport}
                data-testid="input-ementa-file"
              />
              <div>
                <label className="text-sm font-medium mb-1 block">Titulo da ementa</label>
                <Input
                  value={ementaTitulo}
                  onChange={(e) => setEmentaTitulo(e.target.value)}
                  placeholder="Ex: STJ - REsp 1.234.567 - Dano moral"
                  data-testid="input-ementa-titulo"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria / Tema</label>
                <Input
                  value={ementaCategoria}
                  onChange={(e) => setEmentaCategoria(e.target.value)}
                  placeholder="Ex: Direito Civil, BPC, Trabalhista..."
                  list="categorias-sugestoes"
                  data-testid="input-ementa-categoria"
                />
                {categories.length > 0 && (
                  <datalist id="categorias-sugestoes">
                    {categories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                )}
              </div>
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">Texto da ementa</label>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => ementaFileInputRef.current?.click()}
                    data-testid="button-import-ementa-file"
                  >
                    <Upload className="w-3 h-3" />
                    Importar
                  </Button>
                </div>
                <Textarea
                  value={ementaTexto}
                  onChange={(e) => setEmentaTexto(e.target.value)}
                  placeholder="Cole aqui o texto da ementa, acordao, sumula ou jurisprudencia..."
                  className="min-h-[150px] flex-1"
                  data-testid="input-ementa-texto"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetEmentaForm} data-testid="button-cancel-ementa">
                  Cancelar
                </Button>
                <Button onClick={saveEmenta} disabled={isSavingEmenta} data-testid="button-save-ementa">
                  {isSavingEmenta && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {editingEmenta ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </div>
          ) : bibliotecaTab === "minha" ? (
            <div className="flex flex-col gap-3 overflow-hidden flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <Input
                    value={ementaSearchTerm}
                    onChange={(e) => setEmentaSearchTerm(e.target.value)}
                    placeholder="Buscar ementa..."
                    className="h-9"
                    data-testid="input-ementa-search"
                  />
                </div>
                <Button
                  onClick={pasteEmentaFromClipboard}
                  variant="outline"
                  className="gap-1"
                  data-testid="button-paste-ementa"
                  title="Colar texto copiado como nova ementa"
                >
                  <Clipboard className="w-4 h-4" />
                  Colar
                </Button>
                <Button
                  onClick={openNewEmenta}
                  className="gap-1"
                  data-testid="button-add-ementa"
                >
                  <Plus className="w-4 h-4" />
                  Nova
                </Button>
              </div>

              {categories.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  <Badge
                    variant={ementaFilterCat === null ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setEmentaFilterCat(null)}
                    data-testid="badge-filter-all"
                  >
                    Todas ({allEmentas.length})
                  </Badge>
                  {categories.map((cat) => {
                    const count = allEmentas.filter((e) => e.categoria === cat).length;
                    return (
                      <Badge
                        key={cat}
                        variant={ementaFilterCat === cat ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => setEmentaFilterCat(ementaFilterCat === cat ? null : cat)}
                        data-testid={`badge-filter-${cat}`}
                      >
                        {cat} ({count})
                      </Badge>
                    );
                  })}
                </div>
              )}

              <div className="flex-1 overflow-auto space-y-2">
                {filteredEmentas.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50 gap-2">
                    <Library className="w-10 h-10" />
                    <p className="text-sm text-center">
                      {allEmentas.length === 0
                        ? "Sua biblioteca esta vazia. Adicione ementas para usar como referencia."
                        : "Nenhuma ementa encontrada com esse filtro."}
                    </p>
                  </div>
                ) : (
                  filteredEmentas.map((ementa) => {
                    const isSelected = selectedEmentaIds.has(ementa.id);
                    return (
                      <Card
                        key={ementa.id}
                        className={`p-3 cursor-pointer transition-colors ${isSelected ? "ring-2 ring-primary bg-primary/5" : ""}`}
                        onClick={() => toggleEmentaSelection(ementa.id)}
                        data-testid={`card-ementa-${ementa.id}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-medium truncate">{ementa.titulo}</span>
                              <Badge variant="outline" className="text-xs shrink-0">{ementa.categoria}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">{ementa.texto}</p>
                          </div>
                          <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEditEmenta(ementa)}
                              data-testid={`button-edit-ementa-${ementa.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => deleteEmentaMutation.mutate(ementa.id)}
                              data-testid={`button-delete-ementa-${ementa.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>

              {selectedEmentaIds.size > 0 && (
                <div className="pt-2 border-t flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedEmentaIds.size} ementa{selectedEmentaIds.size > 1 ? "s" : ""} selecionada{selectedEmentaIds.size > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => setSelectedEmentaIds(new Set())}
                    data-testid="button-clear-ementas"
                  >
                    Limpar selecao
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Historico de Resultados
            </DialogTitle>
            <DialogDescription>
              Seus resultados anteriores ficam salvos aqui.
            </DialogDescription>
          </DialogHeader>

          {aiHistoryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Clock className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm">Nenhum resultado salvo ainda.</p>
              <p className="text-xs mt-1">Use o assistente e os resultados aparecerao aqui.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
              {aiHistoryData.map((entry) => {
                const actionLabel = ACTIONS.find(a => a.id === entry.action)?.label || entry.action;
                const date = new Date(entry.createdAt);
                const dateStr = date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                return (
                  <Card
                    key={entry.id}
                    className="p-3 cursor-pointer hover-elevate"
                    onClick={() => loadFromHistory(entry)}
                    data-testid={`history-item-${entry.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant="outline" className="text-xs shrink-0">{actionLabel}</Badge>
                          <span className="text-xs text-muted-foreground">{dateStr}</span>
                        </div>
                        {entry.inputPreview && (
                          <div className="mb-1">
                            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase">Sua pergunta:</span>
                            <p className="text-xs text-muted-foreground line-clamp-2">{entry.inputPreview}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase">Resposta da IA:</span>
                          <p className="text-xs line-clamp-2">{entry.result.substring(0, 200)}...</p>
                        </div>
                      </div>
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteHistoryMutation.mutate(entry.id)}
                          data-testid={`button-delete-history-${entry.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {aiHistoryData.length > 0 && (
            <div className="pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                className="text-xs w-full"
                onClick={() => clearHistoryMutation.mutate()}
                disabled={clearHistoryMutation.isPending}
                data-testid="button-clear-history"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Limpar todo o historico
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t bg-card shadow-lg">
        <div className="flex items-center gap-2 p-3">
          {hasSpeechRecognition ? (
            <Button
              size="lg"
              variant={isListening ? "destructive" : "default"}
              className={`flex-1 gap-2 ${isListening ? "animate-pulse" : ""}`}
              onClick={() => startVoice(result ? "chat" : "main")}
              data-testid="button-voice-dictation-mobile"
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              {isListening ? "PARAR DITADO" : result ? "DITAR NO CHAT" : "DITAR POR VOZ"}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              className="flex-1 gap-2 opacity-50"
              disabled
              data-testid="button-voice-dictation-mobile"
              title="Ditado nao disponivel neste navegador. Use Chrome."
            >
              <MicOff className="w-5 h-5" />
              Use Chrome p/ ditar
            </Button>
          )}
          <Button
            size="lg"
            variant={autoReadAloud ? "default" : "outline"}
            className={`gap-1.5 toggle-elevate ${autoReadAloud ? "toggle-elevated" : ""}`}
            onClick={() => setAutoReadAloud(!autoReadAloud)}
            data-testid="button-toggle-auto-read-mobile"
          >
            <AudioLines className="w-5 h-5" />
            {autoReadAloud ? "ON" : "OFF"}
          </Button>
          {result && (
            <Button
              size="lg"
              variant={isSpeaking ? "destructive" : "outline"}
              className={`gap-1.5 ${isSpeaking ? "animate-pulse" : ""}`}
              onClick={() => toggleSpeech(result)}
              data-testid="button-read-aloud-mobile"
            >
              {isSpeaking ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showEffortSettings} onOpenChange={setShowEffortSettings}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Configuracoes de Analise
            </DialogTitle>
            <DialogDescription>
              Ajuste o nivel de esforco e tamanho da resposta da IA. Estas configuracoes se aplicam a todas as acoes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium" data-testid="label-effort-level">Nivel de Esforco</label>
                <span className="text-xs text-muted-foreground" data-testid="text-effort-label">
                  {effortLevel === 1 ? "Rapido" : effortLevel === 2 ? "Basico" : effortLevel === 3 ? "Detalhado" : effortLevel === 4 ? "Profundo" : "Exaustivo"}
                </span>
              </div>
              <Slider
                min={1}
                max={5}
                step={1}
                value={[effortLevel]}
                onValueChange={(val) => {
                  const v = val[0];
                  setEffortLevel(v);
                  localStorage.setItem("legal_effort_level", String(v));
                }}
                data-testid="slider-effort-standalone"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
              </div>
              <div className="mt-1.5 text-[10px] text-muted-foreground leading-snug p-2 rounded bg-muted/50 border" data-testid="text-effort-description">
                {effortLevel === 1 && "Analise rapida e superficial. Vai direto ao ponto, sem aprofundar. Mais barato."}
                {effortLevel === 2 && "Cobre os pontos principais sem aprofundar demais. Bom para tarefas simples."}
                {effortLevel === 3 && "Analise completa e detalhada. Equilibrio entre qualidade e custo. (Padrao)"}
                {effortLevel === 4 && "Analise profunda com fundamentacao robusta. Explora nuances, cita legislacao e doutrina."}
                {effortLevel === 5 && "Analise exaustiva. Todos os angulos, teses, contra-argumentos, jurisprudencia divergente. Mais caro."}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block" data-testid="label-verbosity">Tamanho da Resposta</label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={verbosity === "curta" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setVerbosity("curta"); localStorage.setItem("legal_verbosity", "curta"); }}
                  data-testid="button-verbosity-curta-standalone"
                >
                  Concisa
                </Button>
                <Button
                  variant={verbosity === "longa" ? "default" : "outline"}
                  size="sm"
                  onClick={() => { setVerbosity("longa"); localStorage.setItem("legal_verbosity", "longa"); }}
                  data-testid="button-verbosity-longa-standalone"
                >
                  Completa / Longa
                </Button>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Chaves de API</p>

              <div>
                <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-blue-500" />
                  Chave DataJud (CNJ — Jurisprudência)
                </label>
                <Input
                  type="password"
                  placeholder="Cole aqui sua chave do DataJud..."
                  defaultValue={localStorage.getItem("datajud_api_key") || ""}
                  onChange={(e) => localStorage.setItem("datajud_api_key", e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-datajud-key"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Cadastre-se em{" "}
                  <a href="https://datajud-wiki.cnj.jus.br/api-publica/acesso" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    datajud-wiki.cnj.jus.br
                  </a>{" "}
                  para obter sua chave gratuita.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-blue-500" />
                  Chave Perplexity (Busca na Web + IA Jurídica)
                </label>
                <Input
                  type="password"
                  placeholder="Cole aqui sua chave Perplexity..."
                  defaultValue={localStorage.getItem("perplexity_api_key") || ""}
                  onChange={(e) => localStorage.setItem("perplexity_api_key", e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-perplexity-key"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Crie em{" "}
                  <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                    perplexity.ai/settings/api
                  </a>
                  . Modelo sonar-pro — pesquisa jurisprudência na web automaticamente.
                </p>
              </div>

              <div className="rounded-lg border-2 border-green-300 dark:border-green-700 p-3 space-y-2 bg-green-50/50 dark:bg-green-950/20">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5" />
                  Chave Própria — Qualquer Serviço (gratuito ou pago)
                </p>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Chave de API (obrigatória)</label>
                  <Input
                    type="password"
                    placeholder="Cole aqui sua chave gratuita ou paga..."
                    defaultValue={localStorage.getItem("custom_api_key") || ""}
                    onChange={(e) => {
                      const k = e.target.value.trim();
                      localStorage.setItem("custom_api_key", k);
                      const detect: Record<string, {u:string,m:string}> = {
                        "gsk_": {u:"https://api.groq.com/openai/v1",m:"llama-3.3-70b-versatile"},
                        "sk-or-": {u:"https://openrouter.ai/api/v1",m:"openai/gpt-4o-mini"},
                        "pplx-": {u:"https://api.perplexity.ai",m:"sonar-pro"},
                        "AIza": {u:"https://generativelanguage.googleapis.com/v1beta/openai",m:"gemini-2.0-flash"},
                        "xai-": {u:"https://api.x.ai/v1",m:"grok-2-latest"},
                        "sk-": {u:"https://api.openai.com/v1",m:"gpt-4o-mini"},
                      };
                      let detected = false;
                      for (const [prefix, {u,m}] of Object.entries(detect)) {
                        if (k.startsWith(prefix)) {
                          localStorage.setItem("custom_api_url", u);
                          localStorage.setItem("custom_api_model", m);
                          detected = true;
                          break;
                        }
                      }
                      if (!detected && !k) {
                        localStorage.removeItem("custom_api_url");
                        localStorage.removeItem("custom_api_model");
                      }
                    }}
                    className="text-xs font-mono"
                    data-testid="input-custom-key"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("custom_api_key");
                      localStorage.removeItem("custom_api_url");
                      localStorage.removeItem("custom_api_model");
                      const input = document.querySelector("[data-testid='input-custom-key']") as HTMLInputElement;
                      if (input) input.value = "";
                      window.location.reload();
                    }}
                    className="mt-1 text-xs text-red-500 hover:text-red-700 underline"
                    data-testid="btn-clear-custom-key"
                  >
                    Limpar chave salva
                  </button>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">URL da API (opcional)</label>
                  <Input
                    type="text"
                    placeholder="https://api.openai.com/v1  ou  https://api.together.xyz/v1  etc."
                    defaultValue={localStorage.getItem("custom_api_url") || ""}
                    onChange={(e) => localStorage.setItem("custom_api_url", e.target.value)}
                    className="text-xs font-mono"
                    data-testid="input-custom-url"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-0.5 block">Modelo (opcional)</label>
                  <Input
                    type="text"
                    placeholder="gpt-4o-mini  ou  llama-3-70b  ou  gemma-2-9b  etc."
                    defaultValue={localStorage.getItem("custom_api_model") || ""}
                    onChange={(e) => localStorage.setItem("custom_api_model", e.target.value)}
                    className="text-xs font-mono"
                    data-testid="input-custom-model"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Use qualquer chave gratuita ou de teste — Together.ai, Groq, OpenAI, Mistral, etc.<br />
                  Depois de preencher, selecione o botão 🔑 na barra de ferramentas.
                </p>
              </div>

              <div className={`rounded-lg border-2 p-3 space-y-2 ${demoKeyInfo?.hasPublicKey ? "border-green-400 bg-green-50 dark:bg-green-950/30" : "border-dashed border-muted-foreground/30"}`}>
                <p className="text-xs font-semibold flex items-center gap-1 text-muted-foreground">
                  <Key className="w-3.5 h-3.5 text-green-600" />
                  Chave Demo / Pública
                  {demoKeyInfo?.hasPublicKey
                    ? <span className="ml-auto text-[10px] bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-300 px-1.5 py-0 rounded-full">✓ Ativa — {demoKeyInfo.model}</span>
                    : <span className="ml-auto text-[10px] text-muted-foreground">Não configurada</span>}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Visitantes que clicarem em 🔑 sem chave própria usam esta automaticamente — sem gastar seus créditos do Gemini.
                </p>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Chave de API <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Textarea
                        placeholder="Cole aqui sua chave — detectamos automaticamente o provedor!"
                        value={demoKeyForm.key}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val.startsWith("gsk_")) {
                            setDemoKeyForm({ key: val, model: "llama-3.3-70b-versatile", url: "https://api.groq.com/openai/v1" });
                          } else if (val.startsWith("AIza")) {
                            setDemoKeyForm({ key: val, model: "gemini-2.5-flash", url: "" });
                          } else if (val.startsWith("pplx-")) {
                            setDemoKeyForm({ key: val, model: "sonar-pro", url: "https://api.perplexity.ai" });
                          } else if (val.startsWith("sk-or-")) {
                            setDemoKeyForm({ key: val, model: "google/gemini-2.5-flash-preview", url: "https://openrouter.ai/api/v1" });
                          } else if (val.startsWith("xai-")) {
                            setDemoKeyForm({ key: val, model: "grok-2-latest", url: "https://api.x.ai/v1" });
                          } else if (val.startsWith("sk-ant-")) {
                            setDemoKeyForm({ key: val, model: "claude-3-5-sonnet-20241022", url: "https://api.anthropic.com/v1" });
                          } else if (val.startsWith("sk-")) {
                            setDemoKeyForm({ key: val, model: "gpt-4o-mini", url: "https://api.openai.com/v1" });
                          } else {
                            setDemoKeyForm(f => ({ ...f, key: val }));
                          }
                        }}
                        className="font-mono text-sm min-h-[80px] pr-10 resize-none"
                        data-testid="input-demo-key"
                      />
                      {demoKeyForm.key && (
                        <button
                          type="button"
                          className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setDemoKeyForm(f => ({ ...f, key: "" }))}
                          title="Limpar"
                        >✕</button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Modelo (opcional)</label>
                      <Input
                        type="text"
                        placeholder="llama-3.3-70b-versatile"
                        value={demoKeyForm.model}
                        onChange={(e) => setDemoKeyForm(f => ({ ...f, model: e.target.value }))}
                        className="font-mono"
                        data-testid="input-demo-model"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">URL (opcional)</label>
                      <Input
                        type="text"
                        placeholder="https://api.groq.com/openai/v1"
                        value={demoKeyForm.url}
                        onChange={(e) => setDemoKeyForm(f => ({ ...f, url: e.target.value }))}
                        className="font-mono text-xs"
                        data-testid="input-demo-url"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1 gap-2"
                      disabled={demoKeySaving || !demoKeyForm.key.trim()}
                      onClick={async () => {
                        setDemoKeySaving(true);
                        try {
                          const isPplx = demoKeyForm.key.startsWith("pplx-");
                          await fetch("/api/demo-key-config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(isPplx
                              ? { perplexityKey: demoKeyForm.key }
                              : { key: demoKeyForm.key, model: demoKeyForm.model, url: demoKeyForm.url }),
                          });
                          if (isPplx) {
                            localStorage.setItem("perplexity_api_key", demoKeyForm.key);
                          }
                          const pName = demoKeyForm.key.startsWith("gsk_") ? "Groq" : demoKeyForm.key.startsWith("AIza") ? "Gemini" : isPplx ? "Perplexity" : demoKeyForm.key.startsWith("sk-") ? "OpenAI" : "API";
                          setDemoKeyForm(f => ({ ...f, key: "" }));
                          refreshDemoKeyStatus();
                          toast({ title: `✓ Chave ${pName} salva!`, description: isPplx ? "Selecione 'Perplexity' no modelo para usar pesquisa web." : "Todos os modelos usarão esta chave." });
                        } catch {
                          toast({ title: "Erro ao salvar", variant: "destructive" });
                        } finally {
                          setDemoKeySaving(false);
                        }
                      }}
                      data-testid="button-save-demo-key"
                    >
                      <Key className="w-4 h-4" />
                      {demoKeySaving ? "Salvando..." : "Salvar Chave Demo"}
                    </Button>
                    {demoKeyInfo?.hasPublicKey && (
                      <Button
                        variant="outline"
                        className="text-red-500 border-red-200 hover:bg-red-50"
                        onClick={async () => {
                          await fetch("/api/demo-key-config", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ key: "", model: "", url: "" }),
                          });
                          setDemoKeyForm({ key: "", model: "", url: "" });
                          refreshDemoKeyStatus();
                          toast({ title: "Chave Demo removida." });
                        }}
                        data-testid="button-remove-demo-key"
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  Controle de Custos
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1"
                  data-testid="button-show-usage"
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/ai-usage-summary");
                      const data = await r.json();
                      const providers = Object.entries(data.byProvider || {}).map(([name, v]: [string, any]) =>
                        `${name}: ${v.calls} chamadas — ~$${v.cost.toFixed(4)}`
                      ).join("\n");
                      const msg = `RESUMO DE USO\n\nTotal de chamadas: ${data.totalCalls}\nCusto estimado total: $${data.totalCost.toFixed(4)}\nCrédito configurado: $${data.credit.toFixed(2)}\nSaldo restante: $${data.remaining.toFixed(4)}\n\nPOR PROVEDOR:\n${providers || "Nenhum uso registrado ainda."}`;
                      alert(msg);
                    } catch { alert("Erro ao buscar dados de uso."); }
                  }}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Ver Tabela de Custos
                </Button>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Crédito disponível (USD)</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 5.00"
                      defaultValue={localStorage.getItem("user_credit_input") || ""}
                      onChange={(e) => localStorage.setItem("user_credit_input", e.target.value)}
                      className="text-xs h-8"
                      data-testid="input-user-credit"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    data-testid="button-save-credit"
                    onClick={async () => {
                      const val = parseFloat(localStorage.getItem("user_credit_input") || "0");
                      await fetch("/api/ai-usage-credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credit: val }) });
                      toast({ title: `Crédito de $${val.toFixed(2)} salvo` });
                    }}
                  >
                    Salvar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Valores estimados por tokens (aproximado). Acompanhe o uso real nos painéis dos provedores.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-purple-500" />
                  Chave de Voz Realista (ElevenLabs — Opcional)
                </label>
                <Input
                  type="password"
                  placeholder="Cole aqui sua chave ElevenLabs quando tiver..."
                  defaultValue={localStorage.getItem("elevenlabs_api_key") || ""}
                  onChange={(e) => localStorage.setItem("elevenlabs_api_key", e.target.value)}
                  className="text-xs font-mono"
                  data-testid="input-elevenlabs-key"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Campo reservado. Quando disponível, ativa voz realista em português.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={showDocTemplates} onOpenChange={setShowDocTemplates}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Templates de Documento
            </DialogTitle>
            <DialogDescription>
              Importe seu Word com cabecalho ou crie templates manualmente. O resultado da IA sera inserido no seu documento.
            </DialogDescription>
          </DialogHeader>

          {showDocTemplateForm ? (
            <div className="flex flex-col gap-3 overflow-auto flex-1">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome do template</label>
                <Input
                  value={docTplTitulo}
                  onChange={(e) => setDocTplTitulo(e.target.value)}
                  placeholder="Ex: Peticao Inicial - Cabecalho Padrao"
                  data-testid="input-doc-tpl-titulo"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria (opcional)</label>
                <Input
                  value={docTplCategoria}
                  onChange={(e) => setDocTplCategoria(e.target.value)}
                  placeholder="Ex: Peticoes, Contratos, Recursos"
                  data-testid="input-doc-tpl-categoria"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Conteudo do template</label>
                <p className="text-[10px] text-muted-foreground mb-1">
                  Use {"{{CONTEUDO}}"} onde o resultado da IA sera inserido. Tudo ao redor sera o cabecalho/rodape do documento.
                </p>
                <Textarea
                  value={docTplConteudo}
                  onChange={(e) => setDocTplConteudo(e.target.value)}
                  placeholder={"EXCELENTISSIMO SENHOR JUIZ DE DIREITO DA ___ VARA CIVEL DA COMARCA DE ___\n\n\n{{CONTEUDO}}\n\n\nNestes termos,\nPede deferimento.\n\n___, ___ de ___ de ___.\n\n\n___________________________\nAdvogado - OAB/XX n. ___"}
                  className="min-h-[200px] font-mono text-xs"
                  data-testid="input-doc-tpl-conteudo"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={resetDocTplForm} data-testid="button-cancel-doc-tpl">
                  Cancelar
                </Button>
                <Button onClick={saveDocTpl} disabled={createDocTplMutation.isPending || updateDocTplMutation.isPending} data-testid="button-save-doc-tpl">
                  {(createDocTplMutation.isPending || updateDocTplMutation.isPending) && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {editingDocTemplate ? "Salvar" : "Criar Template"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-auto flex-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant={selectedDocTemplateId === null ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setSelectedDocTemplateId(null)}
                  data-testid="badge-no-template"
                >
                  Sem template
                </Badge>
                {allDocTemplates.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhum template criado ainda</span>
                )}
              </div>

              {allDocTemplates.map((tpl) => (
                <Card
                  key={tpl.id}
                  className={`p-3 cursor-pointer transition-colors ${selectedDocTemplateId === tpl.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setSelectedDocTemplateId(tpl.id)}
                  data-testid={`card-doc-tpl-${tpl.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {selectedDocTemplateId === tpl.id && <Check className="w-4 h-4 text-primary shrink-0" />}
                        <span className="text-sm font-medium truncate">{tpl.titulo}</span>
                        <Badge variant="secondary" className="text-[10px] shrink-0">{tpl.categoria}</Badge>
                        {tpl.docxFilename && <Badge variant="outline" className="text-[9px] shrink-0 border-blue-400 text-blue-600">.docx</Badge>}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{tpl.docxFilename ? `Arquivo: ${tpl.docxFilename}` : tpl.conteudo.substring(0, 150) + "..."}</p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditDocTpl(tpl); }} data-testid={`button-edit-doc-tpl-${tpl.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); deleteDocTplMutation.mutate(tpl.id); if (selectedDocTemplateId === tpl.id) setSelectedDocTemplateId(null); }} data-testid={`button-delete-doc-tpl-${tpl.id}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1 text-xs" onClick={openNewDocTpl} data-testid="button-add-doc-tpl">
                  <Plus className="w-4 h-4" />
                  Novo Template
                </Button>
                <label className="flex-1">
                  <input
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleDocxTemplateUpload}
                    data-testid="input-upload-docx-template"
                  />
                  <Button variant="default" className="w-full gap-1 text-xs" disabled={uploadingDocx} asChild>
                    <span>
                      {uploadingDocx ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Importar Word
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showDocSelection} onOpenChange={(open) => { if (!open) { setShowDocSelection(false); setPendingDocFiles([]); setDocSelectionCallback(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Selecionar Documentos
            </DialogTitle>
            <DialogDescription>
              Escolha quais documentos importados deseja analisar. Desmarque os que nao precisa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 overflow-auto flex-1">
            {pendingDocFiles.map((doc, idx) => (
              <label
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${doc.selected ? 'border-primary bg-primary/5' : 'border-muted opacity-60'}`}
                data-testid={`label-doc-select-${idx}`}
              >
                <input
                  type="checkbox"
                  checked={doc.selected}
                  onChange={() => {
                    setPendingDocFiles(prev => prev.map((d, i) => i === idx ? { ...d, selected: !d.selected } : d));
                  }}
                  className="mt-1 accent-primary"
                  data-testid={`checkbox-doc-${idx}`}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium block truncate">{doc.name}</span>
                  <span className="text-[10px] text-muted-foreground">{doc.text.length.toLocaleString('pt-BR')} caracteres</span>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setPendingDocFiles(prev => prev.map(d => ({ ...d, selected: true })))} data-testid="button-select-all-docs">
                Todos
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPendingDocFiles(prev => prev.map(d => ({ ...d, selected: false })))} data-testid="button-deselect-all-docs">
                Nenhum
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowDocSelection(false); setPendingDocFiles([]); setDocSelectionCallback(null); }} data-testid="button-cancel-doc-selection">
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  const selected = pendingDocFiles.filter(d => d.selected);
                  if (selected.length === 0) {
                    toast({ title: "Selecione pelo menos um documento", variant: "destructive" });
                    return;
                  }
                  const combinedText = selected.map(d => `[${d.name}]\n\n${d.text}`).join("\n\n---\n\n");
                  if (docSelectionCallback) docSelectionCallback(combinedText);
                  setShowDocSelection(false);
                  setPendingDocFiles([]);
                  setDocSelectionCallback(null);
                }}
                disabled={pendingDocFiles.filter(d => d.selected).length === 0}
                data-testid="button-confirm-doc-selection"
              >
                Importar {pendingDocFiles.filter(d => d.selected).length} de {pendingDocFiles.length}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Chave Demo ────────────────────────────────────────────── */}
      <Dialog open={showVoiceChat} onOpenChange={(v) => { setShowVoiceChat(v); if (!v) { stopAudio(); voiceChatRecRef.current?.stop(); setVoiceChatListening(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AudioLines className="w-5 h-5 text-blue-500" />
              Conversa por Voz
            </DialogTitle>
            <DialogDescription>Fale com a IA — ela ouve, entende e responde falando.</DialogDescription>
          </DialogHeader>
          <div ref={voiceChatScrollRef} className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[400px] p-2">
            {voiceChatMessages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Clique no microfone e comece a falar.<br/>Ou digite abaixo. A IA vai ouvir e responder por voz.
              </div>
            )}
            {voiceChatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  data-testid={`voice-msg-${i}`}
                  dangerouslySetInnerHTML={{ __html: m.role === "assistant" ? applyInlineMarkdown(m.text) : m.text }}
                />
              </div>
            ))}
            {voiceChatProcessing && (
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
                value={voiceChatInput}
                onChange={(e) => setVoiceChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && voiceChatInput.trim() && !voiceChatProcessing) {
                    voiceChatSend(voiceChatInput.trim());
                    setVoiceChatInput("");
                  }
                }}
                disabled={voiceChatProcessing}
                data-testid="input-voice-chat-text"
              />
              <Button
                size="icon"
                className="h-10 w-10"
                onClick={() => { if (voiceChatInput.trim()) { voiceChatSend(voiceChatInput.trim()); setVoiceChatInput(""); } }}
                disabled={voiceChatProcessing || !voiceChatInput.trim()}
                data-testid="button-voice-chat-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={voiceChatListening ? "destructive" : "default"}
                className={`flex-1 gap-2 h-12 text-base ${voiceChatListening ? "animate-pulse" : ""}`}
                onClick={voiceChatToggleMic}
                disabled={voiceChatProcessing}
                data-testid="button-voice-chat-mic"
              >
                {voiceChatListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {voiceChatListening ? "Ouvindo..." : voiceChatProcessing ? "Aguarde..." : "Falar"}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12"
                onClick={() => { stopAudio(); }}
                title="Parar áudio"
                data-testid="button-voice-chat-stop"
              >
                <VolumeX className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12"
                onClick={() => setVoiceChatMessages([])}
                title="Limpar conversa"
                data-testid="button-voice-chat-clear"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDemoKeyDialog} onOpenChange={setShowDemoKeyDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Key className="w-5 h-5 text-green-600" />
              Chave Demo / Pública
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-6 overflow-y-auto flex-1">
            {demoKeyInfo?.hasPublicKey && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-300">
                <span className="text-green-600 text-lg">✓</span>
                <div>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">Chave Demo ativa — {demoKeyInfo.model}</p>
                  <p className="text-xs text-muted-foreground">Visitantes usam esta chave ao clicar em 🔑, sem gastar seus créditos.</p>
                </div>
              </div>
            )}
            <div>
              <label className="text-base font-semibold mb-2 block">Chave de API</label>
              <Textarea
                placeholder="Cole aqui sua chave — detectamos automaticamente o provedor!"
                value={demoKeyForm.key}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setDemoKeyTestResult(null);
                  if (val.startsWith("gsk_")) {
                    setDemoKeyForm({ key: val, model: "llama-3.3-70b-versatile", url: "https://api.groq.com/openai/v1" });
                  } else if (val.startsWith("AIza")) {
                    setDemoKeyForm({ key: val, model: "gemini-2.5-flash", url: "" });
                  } else if (val.startsWith("pplx-")) {
                    setDemoKeyForm({ key: val, model: "sonar-pro", url: "https://api.perplexity.ai" });
                  } else if (val.startsWith("sk-or-")) {
                    setDemoKeyForm({ key: val, model: "google/gemini-2.5-flash-preview", url: "https://openrouter.ai/api/v1" });
                  } else if (val.startsWith("xai-")) {
                    setDemoKeyForm({ key: val, model: "grok-2-latest", url: "https://api.x.ai/v1" });
                  } else if (val.startsWith("sk-ant-")) {
                    setDemoKeyForm({ key: val, model: "claude-3-5-sonnet-20241022", url: "https://api.anthropic.com/v1" });
                  } else if (val.startsWith("sk-")) {
                    setDemoKeyForm({ key: val, model: "gpt-4o-mini", url: "https://api.openai.com/v1" });
                  } else {
                    setDemoKeyForm(f => ({ ...f, key: val }));
                  }
                }}
                className="font-mono text-sm min-h-[110px] resize-none"
                autoFocus
                data-testid="input-demo-key-dialog"
              />
              <div className="mt-1.5 p-2.5 rounded bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 space-y-2">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Chaves suportadas (auto-detecta ao colar):</p>
                <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">🟢</span>
                    <div><strong>Groq</strong> (<code className="text-[10px]">gsk_</code>) — <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="underline font-semibold">Criar grátis</a><br/>
                    <span className="text-[10px] text-muted-foreground">Texto + Voz (whisper). Grátis, sem cartão. Ideal para testes.</span></div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">🔵</span>
                    <div><strong>Google Gemini</strong> (<code className="text-[10px]">AIza</code>) — <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="underline font-semibold">Criar grátis</a><br/>
                    <span className="text-[10px] text-muted-foreground">Texto (Pro/Flash). Grátis até certo limite. Sem transcrição de voz.</span></div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">🟣</span>
                    <div><strong>Perplexity</strong> (<code className="text-[10px]">pplx-</code>) — <a href="https://perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="underline font-semibold">Adquirir</a><br/>
                    <span className="text-[10px] text-muted-foreground">Texto + Busca Web (sonar-pro). Pago. Busca jurisprudência online.</span></div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">⚪</span>
                    <div><strong>OpenAI</strong> (<code className="text-[10px]">sk-</code>) — <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="underline font-semibold">Criar</a><br/>
                    <span className="text-[10px] text-muted-foreground">Texto (GPT-4o) + Voz (whisper-1). Pago, com cartão.</span></div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">🟠</span>
                    <div><strong>OpenRouter</strong> — <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="underline font-semibold">Explorar modelos e vozes</a><br/>
                    <span className="text-[10px] text-muted-foreground">100+ modelos (Claude, Llama, Mistral, vozes). Muitos grátis. Use a URL: <code>https://openrouter.ai/api/v1</code></span></div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground border-t border-blue-200 dark:border-blue-800 pt-1.5 space-y-0.5">
                  <p><strong>Como usar:</strong> Cole a chave acima → campos preenchem automaticamente → clique "Testar" → "Salvar".</p>
                  <p><strong>Funções ativadas:</strong> Premium, Econômico, Refinar, Playground e Previdenciário usarão sua chave automaticamente.</p>
                  <p><strong>Voz:</strong> Groq e OpenAI transcrevem áudio/vídeo automaticamente. Gemini e Perplexity não têm transcrição.</p>
                  <p><strong>OpenRouter:</strong> Cole a chave (<code>sk-or-...</code>), coloque a URL <code>https://openrouter.ai/api/v1</code> e escolha o modelo desejado.</p>
                  <p><strong>Trocar chave:</strong> Salve outra chave a qualquer momento — a anterior é substituída.</p>
                </div>
                <div className="text-[10px] border-t border-blue-200 dark:border-blue-800 pt-1.5 space-y-1">
                  <p className="font-semibold text-blue-700 dark:text-blue-400">Links úteis para explorar:</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-blue-600 dark:text-blue-400">
                    <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">OpenRouter — Todos os modelos</a>
                    <a href="https://openrouter.ai/models?q=free" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">OpenRouter — Modelos grátis</a>
                    <a href="https://openrouter.ai/models?q=tts" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">OpenRouter — Vozes (TTS)</a>
                    <a href="https://openrouter.ai/playground" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">OpenRouter — Playground</a>
                    <a href="https://console.groq.com/playground" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">Groq — Playground</a>
                    <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">Google AI Studio</a>
                    <a href="https://platform.openai.com/playground" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">OpenAI — Playground</a>
                    <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">ElevenLabs — Vozes IA</a>
                    <a href="https://huggingface.co/models" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">HuggingFace — Modelos</a>
                    <a href="https://together.ai/models" target="_blank" rel="noreferrer" className="underline hover:text-blue-800">Together AI — Modelos</a>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Modelo <span className="text-muted-foreground font-normal">(auto)</span></label>
                <Input
                  placeholder="llama-3.3-70b-versatile"
                  value={demoKeyForm.model}
                  onChange={(e) => setDemoKeyForm(f => ({ ...f, model: e.target.value }))}
                  className="font-mono"
                  data-testid="input-demo-model-dialog"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">URL <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <Input
                  placeholder="https://api.groq.com/openai/v1"
                  value={demoKeyForm.url}
                  onChange={(e) => setDemoKeyForm(f => ({ ...f, url: e.target.value }))}
                  className="font-mono text-xs"
                  data-testid="input-demo-url-dialog"
                />
              </div>
            </div>
            {demoKeyTestResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${demoKeyTestResult.ok ? "bg-green-50 dark:bg-green-950/40 border-green-300 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-950/40 border-red-300 text-red-700 dark:text-red-400"}`}>
                <span className="text-lg">{demoKeyTestResult.ok ? "✅" : "❌"}</span>
                <span>{demoKeyTestResult.msg}</span>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="h-11 gap-2 px-4"
                disabled={demoKeyTesting || !demoKeyForm.key.trim()}
                onClick={async () => {
                  setDemoKeyTesting(true);
                  setDemoKeyTestResult(null);
                  try {
                    const res = await fetch("/api/demo-key-test", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key: demoKeyForm.key, model: demoKeyForm.model, url: demoKeyForm.url }),
                    });
                    const data = await res.json();
                    setDemoKeyTestResult(data.ok
                      ? { ok: true, msg: `Funcionando! Modelo: ${data.model ?? demoKeyForm.model}` }
                      : { ok: false, msg: data.error ?? "Chave inválida ou sem acesso." }
                    );
                  } catch {
                    setDemoKeyTestResult({ ok: false, msg: "Erro ao testar. Verifique a URL." });
                  } finally {
                    setDemoKeyTesting(false);
                  }
                }}
                data-testid="button-test-demo-key"
              >
                {demoKeyTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <span>🔍</span>}
                {demoKeyTesting ? "Testando..." : "Testar"}
              </Button>
              <Button
                className="flex-1 h-11 text-base gap-2"
                disabled={demoKeySaving || !demoKeyForm.key.trim()}
                onClick={async () => {
                  setDemoKeySaving(true);
                  try {
                    const isPplx2 = demoKeyForm.key.startsWith("pplx-");
                    await fetch("/api/demo-key-config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(isPplx2
                        ? { perplexityKey: demoKeyForm.key }
                        : { key: demoKeyForm.key, model: demoKeyForm.model, url: demoKeyForm.url }),
                    });
                    if (isPplx2) {
                      localStorage.setItem("perplexity_api_key", demoKeyForm.key);
                    }
                    setDemoKeyForm(f => ({ ...f, key: "" }));
                    setDemoKeyTestResult(null);
                    refreshDemoKeyStatus();
                    setShowDemoKeyDialog(false);
                    const providerName = demoKeyForm.key.startsWith("gsk_") ? "Groq" : demoKeyForm.key.startsWith("AIza") ? "Gemini" : isPplx2 ? "Perplexity" : demoKeyForm.key.startsWith("sk-") ? "OpenAI" : "API";
                    toast({ title: `✓ Chave ${providerName} salva!`, description: isPplx2 ? "Selecione 'Perplexity' no modelo para usar pesquisa web." : `Todos os modelos usarão esta chave.` });
                  } catch {
                    toast({ title: "Erro ao salvar", variant: "destructive" });
                  } finally {
                    setDemoKeySaving(false);
                  }
                }}
                data-testid="button-save-demo-key-dialog"
              >
                <Key className="w-5 h-5" />
                {demoKeySaving ? "Salvando..." : "Salvar Chave Demo"}
              </Button>
              {demoKeyInfo?.hasPublicKey && (
                <Button
                  variant="outline"
                  className="h-11 text-red-500 border-red-200 hover:bg-red-50"
                  onClick={async () => {
                    await fetch("/api/demo-key-config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ key: "", model: "", url: "" }),
                    });
                    setDemoKeyForm({ key: "", model: "", url: "" });
                    refreshDemoKeyStatus();
                    toast({ title: "Chave Demo removida." });
                  }}
                  data-testid="button-remove-demo-key-dialog"
                >
                  Remover
                </Button>
              )}
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">Chaves individuais (salvas no navegador):</p>

              <div className="rounded-lg border p-3 space-y-2 bg-purple-50/50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800">
                <label className="text-xs font-semibold flex items-center gap-1.5 text-purple-700 dark:text-purple-400">
                  <Globe className="w-3.5 h-3.5" />
                  Chave Perplexity (Busca Web)
                </label>
                <Input
                  type="password"
                  placeholder="pplx-... (cole sua chave Perplexity)"
                  defaultValue={localStorage.getItem("perplexity_api_key") || ""}
                  onChange={(e) => {
                    localStorage.setItem("perplexity_api_key", e.target.value);
                  }}
                  className="text-xs font-mono"
                  data-testid="input-perplexity-key-dialog"
                />
                <p className="text-[10px] text-muted-foreground">
                  Crie em <a href="https://perplexity.ai/settings/api" target="_blank" rel="noreferrer" className="text-purple-500 underline">perplexity.ai/settings/api</a>. Usada automaticamente ao clicar no botão Perplexity.
                </p>
              </div>

              <div className="rounded-lg border p-3 space-y-2 bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                <label className="text-xs font-semibold flex items-center gap-1.5 text-green-700 dark:text-green-400">
                  <Key className="w-3.5 h-3.5" />
                  Chave Própria (botão 🔑)
                </label>
                <Input
                  type="password"
                  placeholder="Qualquer chave: gsk_..., sk-..., sk-or-..., etc."
                  defaultValue={localStorage.getItem("custom_api_key") || ""}
                  onChange={(e) => {
                    const k = e.target.value.trim();
                    localStorage.setItem("custom_api_key", k);
                    const detect: Record<string, {u:string,m:string}> = {
                      "gsk_": {u:"https://api.groq.com/openai/v1",m:"llama-3.3-70b-versatile"},
                      "sk-or-": {u:"https://openrouter.ai/api/v1",m:"openai/gpt-4o-mini"},
                      "pplx-": {u:"https://api.perplexity.ai",m:"sonar-pro"},
                      "AIza": {u:"https://generativelanguage.googleapis.com/v1beta/openai",m:"gemini-2.0-flash"},
                      "xai-": {u:"https://api.x.ai/v1",m:"grok-2-latest"},
                      "sk-": {u:"https://api.openai.com/v1",m:"gpt-4o-mini"},
                    };
                    for (const [prefix, {u,m}] of Object.entries(detect)) {
                      if (k.startsWith(prefix)) {
                        if (!localStorage.getItem("custom_api_url")) { localStorage.setItem("custom_api_url", u); }
                        if (!localStorage.getItem("custom_api_model")) { localStorage.setItem("custom_api_model", m); }
                        break;
                      }
                    }
                  }}
                  className="text-xs font-mono"
                  data-testid="input-custom-key-dialog"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder="URL (ex: https://api.groq.com/openai/v1)"
                    defaultValue={localStorage.getItem("custom_api_url") || ""}
                    onChange={(e) => localStorage.setItem("custom_api_url", e.target.value)}
                    className="text-[10px] font-mono"
                    data-testid="input-custom-url-dialog"
                  />
                  <Input
                    type="text"
                    placeholder="Modelo (ex: llama-3.3-70b-versatile)"
                    defaultValue={localStorage.getItem("custom_api_model") || ""}
                    onChange={(e) => localStorage.setItem("custom_api_model", e.target.value)}
                    className="text-[10px] font-mono"
                    data-testid="input-custom-model-dialog"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Preencha e selecione o botão 🔑 na barra. Funciona com Groq, OpenAI, Together, OpenRouter, etc.
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocFormatSettings} onOpenChange={setShowDocFormatSettings}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Formato do Documento Word
            </DialogTitle>
            <DialogDescription>
              Defina aqui a fonte, tamanho e espaçamento. Será aplicado em todos os documentos baixados como Word.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Fonte</label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={formatSettings.fontFamily}
                  onChange={e => updateFormat("fontFamily", e.target.value)}
                  data-testid="select-doc-font"
                >
                  <option value="Arial">Arial</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Garamond">Garamond</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Cambria">Cambria</option>
                  <option value="Book Antiqua">Book Antiqua</option>
                  <option value="Verdana">Verdana</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Tamanho (pt)</label>
                <input
                  type="number"
                  min={6} max={72} step={0.5}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={formatSettings.fontSize}
                  onChange={e => updateFormat("fontSize", Number(e.target.value))}
                  data-testid="input-doc-fontsize"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">Espaçamento entre linhas</label>
                <input
                  type="number"
                  min={0.5} max={10} step={0.05}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={formatSettings.lineHeight}
                  onChange={e => updateFormat("lineHeight", Number(e.target.value))}
                  data-testid="input-doc-linespacing"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Ex: 1 = simples · 1.5 · 2 = duplo</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Recuo parágrafo (cm)</label>
                <input
                  type="number"
                  min={0} max={10} step={0.25}
                  className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                  value={formatSettings.paragraphIndent}
                  onChange={e => updateFormat("paragraphIndent", Number(e.target.value))}
                  data-testid="input-doc-indent"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Margens (cm)</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: "marginTop", label: "Superior" },
                  { key: "marginBottom", label: "Inferior" },
                  { key: "marginLeft", label: "Esquerda" },
                  { key: "marginRight", label: "Direita" },
                ].map(m => (
                  <div key={m.key}>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">{m.label}</label>
                    <input
                      type="number"
                      min={0} max={15} step={0.25}
                      className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                      value={(formatSettings as any)[m.key] ?? 3}
                      onChange={e => updateFormat(m.key, Number(e.target.value))}
                      data-testid={`input-margin-${m.key}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Padrão ABNT: sup 3 · inf 2 · esq 3 · dir 2</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowDocFormatSettings(false)} data-testid="button-close-doc-format">
              Salvar e fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showTokenCalc} onOpenChange={setShowTokenCalc}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              Calculadora de Tokens
            </DialogTitle>
            <DialogDescription>
              Cole um texto para estimar tokens e custo por provedor
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={tokenCalcText}
            onChange={e => setTokenCalcText(e.target.value)}
            placeholder="Cole aqui o texto que você quer calcular..."
            className="min-h-[100px] text-sm"
            data-testid="input-token-calc-text"
          />

          {(() => {
            const text = tokenCalcText.trim();
            if (!text) return null;

            const chars = text.length;
            const words = text.split(/\s+/).filter(Boolean).length;
            const tokensEstimate = Math.ceil(chars / 3.5);
            const pages = Math.ceil(words / 500);

            const providers = [
              { name: "Groq (llama-3.3-70b)", inPrice: 0.59, outPrice: 0.79, free: true },
              { name: "Groq (gpt-oss-20b)", inPrice: 0.07, outPrice: 0.15, free: false },
              { name: "Gemini Flash", inPrice: 0.15, outPrice: 0.60, free: true },
              { name: "Gemini Pro", inPrice: 1.25, outPrice: 5.00, free: false },
              { name: "Perplexity (sonar-pro)", inPrice: 3.00, outPrice: 15.00, free: false },
              { name: "DeepSeek Coder", inPrice: 0.14, outPrice: 0.28, free: false },
              { name: "OpenRouter (llama-3.3)", inPrice: 0.20, outPrice: 0.20, free: false },
              { name: "Mistral (codestral)", inPrice: 0.30, outPrice: 0.90, free: false },
              { name: "Together AI", inPrice: 0.20, outPrice: 0.20, free: false },
            ];

            const outTokensEstimate = tokensEstimate * 3;

            return (
              <div className="space-y-3" data-testid="token-calc-results">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-muted rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-foreground">{tokensEstimate.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Tokens (entrada)</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-foreground">{outTokensEstimate.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Tokens (saída estimada)</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-foreground">{chars.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Caracteres</div>
                  </div>
                  <div className="bg-muted rounded-lg p-2.5 text-center">
                    <div className="text-lg font-bold text-foreground">{words.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">Palavras (~{pages} pág)</div>
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground bg-muted/50 rounded p-2">
                  <strong>Como funciona:</strong> 1 token ≈ 3-4 caracteres em português. Uma palavra pode ser 1 a 3 tokens dependendo do tamanho. A saída estimada é ~3x a entrada (a IA gera mais texto que recebe). Preços são por milhão de tokens.
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="text-left px-2 py-1.5 font-medium">Provedor</th>
                        <th className="text-right px-2 py-1.5 font-medium">Entrada</th>
                        <th className="text-right px-2 py-1.5 font-medium">Saída</th>
                        <th className="text-right px-2 py-1.5 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p, i) => {
                        const inCost = (tokensEstimate / 1_000_000) * p.inPrice;
                        const outCost = (outTokensEstimate / 1_000_000) * p.outPrice;
                        const total = inCost + outCost;
                        return (
                          <tr key={i} className={`border-t ${p.free ? "bg-green-50 dark:bg-green-950/30" : ""}`} data-testid={`token-calc-row-${i}`}>
                            <td className="px-2 py-1.5">
                              {p.name}
                              {p.free && <span className="ml-1 text-[8px] bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 px-1 rounded">GRÁTIS</span>}
                            </td>
                            <td className="text-right px-2 py-1.5 font-mono">${inCost < 0.0001 ? "<0.0001" : inCost.toFixed(4)}</td>
                            <td className="text-right px-2 py-1.5 font-mono">${outCost < 0.0001 ? "<0.0001" : outCost.toFixed(4)}</td>
                            <td className="text-right px-2 py-1.5 font-mono font-semibold">${total < 0.001 ? "<0.001" : total.toFixed(4)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="text-[10px] text-muted-foreground space-y-1">
                  <p><strong>Dicas para economizar:</strong></p>
                  <p>• Use <strong>esforço baixo</strong> (1-2) para perguntas simples</p>
                  <p>• Use <strong>verbosidade curta</strong> para respostas menores</p>
                  <p>• Use <strong>Groq gratuito</strong> ou <strong>Gemini Flash gratuito</strong> para testes</p>
                  <p>• <strong>Temperatura baixa</strong> (0.1-0.3) = respostas mais focadas, menos tokens</p>
                  <p>• Quanto mais texto você envia, mais tokens de entrada gasta</p>
                </div>

                {(() => {
                  const cheapest = providers.reduce((min, p) => {
                    const t = ((tokensEstimate / 1_000_000) * p.inPrice) + ((outTokensEstimate / 1_000_000) * p.outPrice);
                    const tMin = ((tokensEstimate / 1_000_000) * min.inPrice) + ((outTokensEstimate / 1_000_000) * min.outPrice);
                    return t < tMin && !p.free ? p : min;
                  }, providers.filter(p => !p.free)[0]);
                  const cheapCost = ((tokensEstimate / 1_000_000) * cheapest.inPrice) + ((outTokensEstimate / 1_000_000) * cheapest.outPrice);
                  const fiveUsd = cheapCost > 0 ? Math.floor(5 / cheapCost) : 9999;
                  return (
                    <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2.5 text-xs">
                      <strong className="text-emerald-700 dark:text-emerald-400">Com $5 de crédito no {cheapest.name}:</strong>
                      <span className="ml-1">dá para ~<strong>{fiveUsd.toLocaleString()}</strong> usos desse tamanho</span>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setTokenCalcText(result || inputText || "")} data-testid="button-calc-use-current" disabled={!result && !inputText}>
              Usar texto atual
            </Button>
            <Button onClick={() => setShowTokenCalc(false)} data-testid="button-close-token-calc">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        .legal-result-display {
          font-family: 'Times New Roman', Times, serif;
          font-size: 12pt;
          line-height: 1.5;
          color: #000;
        }
        .legal-result-display p {
          margin: 0 0 12pt 0;
          min-height: 1em;
        }
        .legal-result-display blockquote {
          margin: 12pt 4cm 12pt 4cm;
          padding: 0;
          font-size: 10pt;
          line-height: 1.0;
          border-left: none;
          font-style: normal;
          text-align: justify;
        }
        .legal-result-display ul, .legal-result-display ol {
          padding-left: 1.5em;
          margin: 4pt 0;
        }
        .legal-result-display li {
          margin: 2pt 0;
          line-height: 1.5;
        }
        .legal-result-display table {
          border-collapse: collapse;
          width: 100%;
          margin: 8pt 0;
        }
        .legal-result-display td, .legal-result-display th {
          border: 1px solid #999;
          padding: 4pt 6pt;
          vertical-align: top;
        }
        .legal-result-display strong { font-weight: bold; }
        .legal-result-display em { font-style: italic; }
      `}</style>
    </div>
  );
}

