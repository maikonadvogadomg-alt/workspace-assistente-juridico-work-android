import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import TiptapEditor from "@/components/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CustomAction, Ementa, AiHistory, PromptTemplate, DocTemplate } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  // PARÁGRAFO PADRÃO (4cm recuo primeira linha)
  PARAGRAFO: `text-indent:4cm;text-align:justify;line-height:1.5;margin:0 0 12pt 0;font-family:'Times New Roman',serif;font-size:12pt`,

  // CABEÇALHO/ENDEREÇAMENTO (justificado, sem recuo)
  CABECALHO: `text-align:justify;line-height:1.5;margin:0 0 12pt 0;font-family:'Times New Roman',serif;font-size:12pt`,

  // TÍTULOS/TÓPICOS (CAIXA ALTA + NEGRITO + CENTRALIZADO)
  TITULO: `font-weight:bold;text-align:center;text-transform:uppercase;margin:24pt 0 12pt 0;font-family:'Times New Roman',serif;font-size:14pt`,

  // ASSINATURA (CENTRALIZADO + NEGRITO)
  ASSINATURA: `text-align:center;font-weight:bold;margin-top:36pt;font-family:'Times New Roman',serif;font-size:12pt`,

  // PEDIDOS/REQUERIMENTOS (DIREITA)
  PEDIDOS: `text-align:right;margin-top:12pt;font-family:'Times New Roman',serif;font-size:12pt`,

  // "Dra." / OAB (DIREITA)
  OAB: `text-align:right;font-family:'Times New Roman',serif;font-size:12pt`,

  // CITAÇÃO (RECUO 4cm DOS DOIS LADOS + FONTE 10pt)
  CITACAO: `margin-left:4cm;margin-right:4cm;text-align:justify;line-height:1.4;font-family:'Times New Roman',serif;font-size:10pt;font-style:italic;border-left:3px solid #ccc;padding-left:12pt`,
};
// ─────────────────────────────────────────────────────────────────────────────

export default function Jurisprudencia() {
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
  const [datajudKey, setDatajudKey] = useState(() => localStorage.getItem("datajud_api_key") || "");
  const [juriExpandedIdx, setJuriExpandedIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'assistant' | 'user', content: string }>>(() => {
    try { return JSON.parse(localStorage.getItem("legal_chat_history") || "[]"); } catch { return []; }
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
    localStorage.setItem("legal_chat_history", JSON.stringify(chatHistory));
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
      const isFlash = !usePremiumModel;
      const inputCost = isFlash ? (inputTokens / 1_000_000) * 0.15 : (inputTokens / 1_000_000) * 1.25;
      const outputCost = isFlash ? (outputTokens / 1_000_000) * 0.60 : (outputTokens / 1_000_000) * 10.00;
      setLastQueryCost({
        inputTokens,
        outputTokens,
        totalUsd: inputCost + outputCost,
        model: isFlash ? "Flash" : "Pro",
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

  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const [voiceTarget, setVoiceTarget] = useState<"main" | "chat">("main");

  const startVoice = useCallback((target: "main" | "chat") => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Navegador nao suporta", description: "Use o Chrome, Edge ou Safari para ditar por voz.", variant: "destructive" });
      return;
    }

    setVoiceTarget(target);

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalTranscript = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
          if (target === "chat") {
            setChatInput(prev => prev + transcript + " ");
          } else {
            setInputText(prev => prev + transcript + " ");
          }
        } else {
          interim = transcript;
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        toast({ title: "Microfone bloqueado", description: "Permita o acesso ao microfone nas configuracoes do navegador.", variant: "destructive" });
      } else if (event.error !== 'aborted') {
        toast({ title: "Erro no microfone", description: "Tente novamente.", variant: "destructive" });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, toast]);

  const toggleVoiceInput = useCallback(() => startVoice("main"), [startVoice]);

  useEffect(() => {
    return () => {
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
        throw new Error("Erro no servidor TTS");
      }

      const blob = await resp.blob();
      if (controller.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setIsSpeaking(false);
      toast({ title: "Erro ao gerar áudio", description: "Tente novamente", variant: "destructive" });
    }
  }, [stopAudio, toast]);

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
    setEditedHtml(null);
    setIsEditing(false);
    setIsEditingResult(false);
    setShowHistory(false);
    toast({ title: "Resultado carregado do historico" });
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
    try {
      const res = await fetch("/api/jurisprudencia/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: juriQuery.trim(),
          tribunais: juriTribunais,
          apiKey: datajudKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro na busca");
      setJuriResults(data.results || []);
    } catch (e: any) {
      toast({ title: "Erro na busca", description: e.message, variant: "destructive" });
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
        toast({ title: "Arquivo muito grande", description: `"${files[i].name}" excede 50MB.`, variant: "destructive" });
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

  const getModelRecommendation = (action: string | undefined): { recommended: 'economico' | 'premium', reason: string } => {
    return { recommended: 'economico', reason: 'Modo economia ativo - usando modelo mais barato para todas as acoes' };
  };

  const streamResponse = useCallback(async (body: Record<string, string | string[]>) => {
    // Permite processar sem texto colado se já houver resultado salvo como contexto
    const hasContext = !!(result || editedHtml || localStorage.getItem("legal_last_result"));
    if (!inputText.trim() && !hasContext) {
      toast({ title: "Cole o texto primeiro", description: "O campo de texto esta vazio e nao ha contexto salvo.", variant: "destructive" });
      return;
    }

    const action = body.action as string | undefined;
    const rec = getModelRecommendation(action);
    setUsePremiumModel(rec.recommended === 'premium');
    localStorage.setItem("legal_model_choice", rec.recommended);

    // INICIO DA CHAMADA DIRETA PARA EVITAR BLOQUEIO
    if (abortRef.current) abortRef.current.abort();

    setIsProcessing(true);
    setResult("");
    setEditedHtml(null);
    setIsEditing(false);
    setIsEditingResult(false);
    setChatHistory([]);

    const controller = new AbortController();
    abortRef.current = controller;

    // Se não houver texto colado, usa o resultado atual (ou salvo) como contexto
    const savedContext = localStorage.getItem("legal_last_result") || "";
    const contextHtml = editedHtml || result || savedContext;
    const effectiveText = inputText.trim()
      ? inputText
      : contextHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 80000);

    const payload: Record<string, unknown> = { 
      text: effectiveText, 
      model: rec.recommended, 
      effortLevel, 
      verbosity, 
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
            if (data.content) {
              fullText += data.content;
              setResult(fullText);
            }
          } catch (e) {
            // Ignorar erros de parse parciais
          }
        }
      }
      
      // Auto-save history
      await apiRequest("POST", "/api/ai-history", {
        action: action || 'custom',
        inputPreview: inputText.substring(0, 200),
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
  }, [inputText, toast, getModelRecommendation, effortLevel, verbosity, selectedEmentaIds]);

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

    const payload: Record<string, unknown> = { text: inputText, model: usePremiumModel ? "premium" : "economico", effortLevel, verbosity, ...body };
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
            if (event.status) {
              setProcessingStatus(event.status);
            }
            if (event.content) {
              fullText += event.content;
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
        setChatHistory([{ role: 'assistant', content: fullText }]);
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
    const previousResultSnapshot = result;
    setIsRefining(true);
    setChatInput("");

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const newHistory = [...chatHistory, { role: 'user' as const, content: instruction }];
    setChatHistory(newHistory);

    setResult("");

    const payload: Record<string, unknown> = {
      previousResult: previousResultSnapshot,
      instruction,
      originalText: inputText,
      model: usePremiumModel ? "premium" : "economico",
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
            if (event.content) {
              fullText += event.content;
              setResult(fullText);
            }
            if (event.error) throw new Error(event.error);
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }

      if (fullText.trim()) {
        setChatHistory(prev => [...prev, { role: 'assistant', content: fullText }]);
        try {
          await apiRequest("POST", "/api/ai-history", {
            action: "ajuste",
            inputPreview: "Pergunta: " + instruction.substring(0, 200),
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
      toast({ title: "Erro", description: "Nao foi possivel ajustar o texto. Tente novamente.", variant: "destructive" });
    } finally {
      setIsRefining(false);
      abortRef.current = null;
    }
  };

  const refineResult = useCallback(async (instruction: string) => {
    if ((!result && chatHistory.length === 0) || !instruction.trim()) return;
    doRefine(instruction);
  }, [result, chatHistory, doRefine]);

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
  const isSignatureLine = (line: string) => {
    const t = line.trim();
    // Linha de assinatura: nome centralizado/negrito ao final do documento
    return /^(Advogad[oa]|Nestes termos|Nesses termos|Termos em que|Respeitosamente|Atenciosamente|Data:|Local e data|____)/i.test(t)
      || (t.length < 120 && /,\s*\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i.test(t))
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

  // CABEÇALHO: endereçamento inicial do documento
  const isHeaderLine = (line: string) => {
    const t = line.trim();
    return /^(EXCELENT|EXC?M?[OA]\.?\s|MERITISSIM|ILUSTRISSIM|AO\s+JUIZ|AO\s+DESEMBARGADOR|SENHOR\s+JUIZ|SENHOR\s+DESEMBARGADOR|EGRE|TRIBUNAL|COMARCA|VARA\s|JUIZO|PROCESSO\s*(N|n)|AUTOS\s*(N|n)|AGRAVANTE|AGRAVAD[OA]|RECORRENTE|RECORRIDO|REQUERENTE|REQUERIDO|IMPETRANTE|IMPETRADO|EMBARGANTE|EMBARGADO|AUTOR[A]?:|RE[UÚ]:|APELANTE|APELAD[OA])/i.test(t)
      || /^(AGRAVO|RECURSO|APELA[CÇ]|MANDADO|PETI[CÇ]|EMBARGOS|RECLAMA[CÇ]|HABEAS|A[CÇ][AÃ]O)/i.test(t)
      || /^(CPF|CNPJ|RG)\s*[:\-]/i.test(t);
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const decodeHtmlEntities = (text: string): string => {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  };

  // Converte markdown inline (**negrito**, *itálico*, __sublinhado__) em HTML
  const applyInlineMarkdown = (line: string): string => {
    return line
      .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
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
      return text;
    }

    // ── PRÉ-NORMALIZAÇÃO: garante separação correta entre blocos ──────────────
    const normalized = text
      .replace(/\r\n/g, '\n')
      // Linha em branco ANTES e DEPOIS de títulos markdown (#)
      .replace(/\n(#{1,6}\s)/g, '\n\n$1')
      .replace(/(#{1,6}\s[^\n]+)\n(?!\n)/g, '$1\n\n')
      // Linha em branco ANTES de itens de lista bullet e numerados
      .replace(/([^\n])\n([-*+]\s)/g, '$1\n\n$2')
      .replace(/([^\n])\n(\d+[.)]\s)/g, '$1\n\n$2')
      // Linha em branco ANTES de linha que começa com ** (itens em negrito, ex: **a)**)
      .replace(/([^\n])\n(\*\*[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ])/g, '$1\n\n$2')
      // Linha em branco ANTES de itens letrados: a) b) c) ou I) II)
      .replace(/([^\n])\n([a-z]\)\s|[ivxlc]+\)\s)/g, '$1\n\n$2')
      // Linha que termina com . ! ? ; e próxima começa com letra maiúscula ou ** = novo parágrafo
      .replace(/([.!?;])\n([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ"«*_])/g, '$1\n\n$2')
      // Linha que termina com . ! ? seguida de qualquer linha não vazia = novo parágrafo
      .replace(/([.!?])\n(?!\n)(.)/g, '$1\n\n$2')
      // Máximo de 2 linhas em branco consecutivas
      .replace(/\n{3,}/g, '\n\n');

    // Estilos para itens de lista (como <p> para compatibilidade com export e editor)
    const listItemStyleBullet = `margin-left:1.5cm;text-indent:0;text-align:justify;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;margin-bottom:4pt`;
    const listItemStyleOrdered = `margin-left:2cm;text-indent:0;text-align:justify;font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;margin-bottom:4pt`;

    const htmlResult: string[] = [];
    const rawLines = normalized.split('\n');
    let inList = false;
    let listItems: string[] = [];
    let listIsOrdered = false;

    const flushList = () => {
      if (listItems.length === 0) return;
      // Renderiza como <p> com recuo — não como <ol>/<ul><li>
      // Assim o export e o editor processam em ordem correta
      listItems.forEach((li, idx) => {
        const prefix = listIsOrdered ? `${idx + 1}.\u00a0` : '\u2022\u00a0';
        const style = listIsOrdered ? listItemStyleOrdered : listItemStyleBullet;
        htmlResult.push(`<p style="${style}">${prefix}${li}</p>`);
      });
      listItems = [];
      inList = false;
      listIsOrdered = false;
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
      // Une linhas do buffer (parágrafos multi-linha) separadas por espaço
      const rawT = paraBuffer.join(' ').trim();
      const plainT = rawT
        .replace(/\*\*\*([^*]+)\*\*\*/g,'$1')
        .replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1')
        .replace(/\*([^*]+)\*/g,'$1').replace(/_([^_]+)_/g,'$1')
        .replace(/#+ /g,'');
      const htmlContent = paraBuffer.map(ln => applyInlineMarkdown(ln)).join(' ');

      // ── HIERARQUIA DE DETECÇÃO (ordem de prioridade) ──────────────────────────

      // 1. PEDIDOS: "Nestes termos" / "Pede deferimento" → DIREITA
      if (isPedidosLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.PEDIDOS}">${htmlContent}</p>`);
      }
      // 2. OAB: "Dra.", "OAB/" → DIREITA
      else if (isOabLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.OAB}">${htmlContent}</p>`);
      }
      // 3. CITAÇÃO: EMENTA, ACÓRDÃO, aspas → recuado + itálico
      else if (isCitationLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.CITACAO}">${htmlContent}</p>`);
      }
      // 4. ASSINATURA: identificada por padrão ou posição final do documento
      else if (
        isSignatureLine(plainT) ||
        (headerDone && bodyLineCount > 5 && plainT.length < 90 && paraIdx >= totalLines * 0.80)
      ) {
        htmlResult.push(`<p style="${ESTILOS.ASSINATURA}">${htmlContent}</p>`);
      }
      // 5. CABEÇALHO: endereçamento inicial → justificado sem recuo
      else if (!headerDone && paraIdx < 12 && isHeaderLine(plainT)) {
        htmlResult.push(`<p style="${ESTILOS.CABECALHO}">${htmlContent}</p>`);
      }
      // 6. TÍTULO/SEÇÃO: CAIXA ALTA curta ou seção conhecida → centralizado + negrito
      else if (isTituloLine(plainT)) {
        if (!headerDone) headerDone = true;
        // Garante o texto em negrito (mesmo que o markdown não tenha **)
        const boldContent = htmlContent.includes('<strong>') ? htmlContent : `<strong>${htmlContent}</strong>`;
        htmlResult.push(`<p style="${ESTILOS.TITULO}">${boldContent}</p>`);
      }
      // 7. PARÁGRAFO DE CORPO → 4cm recuo + justificado
      else {
        if (!headerDone && paraIdx > 0 && !isHeaderLine(plainT)) headerDone = true;
        if (headerDone) bodyLineCount++;
        // Linhas longas (>50 chars) ou com pontuação = corpo do texto
        const isBodyPara = plainT.length > 50 || /[.;:,]\s/.test(plainT);
        if (isBodyPara) {
          htmlResult.push(`<p style="${ESTILOS.PARAGRAFO}">${htmlContent}</p>`);
        } else {
          // Linha curta sem identificação: sem recuo
          htmlResult.push(`<p style="${ESTILOS.CABECALHO}">${htmlContent}</p>`);
        }
      }

      paraIdx++;
      paraBuffer = [];
    };

    for (const rawLine of rawLines) {
      const trimmedLine = rawLine.trim();

      // Bloco blockquote markdown >
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

      // Títulos markdown # ## ###
      const hMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        flushList();
        flushPara();
        const hText = hMatch[2].replace(/\*\*/g, '');
        htmlResult.push(`<p style="${ESTILOS.TITULO}"><strong>${hText}</strong></p>`);
        if (!headerDone) headerDone = true;
        paraIdx++;
        continue;
      }

      // Listas bullet (- * +)
      const bulletMatch = trimmedLine.match(/^[-*+]\s+(.+)$/);
      if (bulletMatch) {
        flushPara();
        inList = true;
        listIsOrdered = false;
        listItems.push(applyInlineMarkdown(bulletMatch[1]));
        continue;
      }

      // Listas numeradas (1. 1) 2. 2) etc.)
      const numMatch = trimmedLine.match(/^(\d+)[.)]\s+(.+)$/);
      if (numMatch) {
        // Se já estava em lista bullet, fecha primeiro
        if (inList && !listIsOrdered) flushList();
        flushPara();
        inList = true;
        listIsOrdered = true;
        listItems.push(applyInlineMarkdown(numMatch[2]));
        continue;
      }

      if (trimmedLine === '') {
        flushList();
        flushPara();
      } else {
        // Se estava em lista e chegou linha normal, fecha a lista
        if (inList) { flushList(); }
        // Auto-flush se a linha anterior do buffer termina com fim de sentença
        // ou se a linha atual começa de forma que claramente é um novo parágrafo
        if (paraBuffer.length > 0) {
          const prev = paraBuffer[paraBuffer.length - 1];
          const prevEndsSentence = /[.!?]\s*$/.test(prev);
          const currStartsNew = /^(\*\*[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|[a-z]\)\s|[ivxlc]+\)\s|#{1,6}\s)/.test(trimmedLine);
          if (prevEndsSentence || currStartsNew) {
            flushPara();
          }
        }
        paraBuffer.push(trimmedLine);
      }
    }

    flushList();
    flushBlockquote();
    flushPara();

    return htmlResult.join('');
  };

  const [editorInitContent, setEditorInitContent] = useState<string>("");

  const openEditor = useCallback(() => {
    const displayText = editedHtml || (manualEditText ?? result);
    const isHtml = displayText.trimStart().startsWith('<');
    let html: string;
    if (isHtml) {
      html = displayText;
    } else {
      html = formatMarkdown(displayText);
    }
    setEditorInitContent(html);
    setIsEditingResult(true);
  }, [editedHtml, manualEditText, result]);

  const saveQuillEdit = useCallback(() => {
    setIsEditingResult(false);
  }, []);

  const isSaving = createModelMutation.isPending || updateModelMutation.isPending;
  const isSavingEmenta = createEmentaMutation.isPending || updateEmentaMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background pb-16 lg:pb-0">
      <header className="px-2 py-2 border-b bg-card shrink-0">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1 min-w-0">
            <Gavel className="w-4 h-4 text-primary shrink-0" />
            <h1 className="text-sm font-semibold truncate">Assistente</h1>
            <div className="w-px h-4 bg-border mx-1" />
            <Link href="/consulta">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-consulta">
                <Search className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Consulta</span>
              </Button>
            </Link>
            <Link href="/auditoria">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-auditoria">
                <Calculator className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Auditoria</span>
              </Button>
            </Link>
            <Link href="/token">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-token">
                <Key className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Token PDPJ</span>
              </Button>
            </Link>
            <Link href="/pdpj">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-pdpj">
                <Scale className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">PDPJ</span>
              </Button>
            </Link>
            <Link href="/tramitacao">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-tramitacao">
                <Scale className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tramitação</span>
              </Button>
            </Link>
            <Link href="/playground">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-playground">
                <Code2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Códigos</span>
              </Button>
            </Link>
            <Link href="/filtrador">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-filtrador">
                <Filter className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Filtrador</span>
              </Button>
            </Link>
            <Link href="/previdenciario">
              <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-go-previdenciario">
                <Calculator className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Previdenciário</span>
              </Button>
            </Link>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs text-orange-500"
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
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
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
            <div className="flex items-center bg-muted/50 rounded-md p-0.5 border">
              <Button
                size="sm"
                variant={usePremiumModel ? "secondary" : "ghost"}
                className={`h-7 px-1.5 text-[10px] gap-1 ${usePremiumModel ? "shadow-sm" : "opacity-60"}`}
                onClick={() => { setUsePremiumModel(true); localStorage.setItem("legal_model_choice", "premium"); }}
                data-testid="button-model-premium"
                title="Gemini 2.5 Pro (Premium)"
              >
                <Sparkles className="w-3 h-3 text-primary" />
              </Button>
              <Button
                size="sm"
                variant={!usePremiumModel ? "secondary" : "ghost"}
                className={`h-7 px-1.5 text-[10px] gap-1 ${!usePremiumModel ? "shadow-sm" : "opacity-60"}`}
                onClick={() => { setUsePremiumModel(false); localStorage.setItem("legal_model_choice", "economico"); }}
                data-testid="button-model-economico"
                title="Gemini 2.5 Flash (Economico)"
              >
                <Coins className="w-3 h-3 text-yellow-500" />
              </Button>
            </div>
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

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r">
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
                {hasSpeechRecognition && (
                  <Button
                    variant={isListening ? "destructive" : "default"}
                    className={`gap-1.5 ${isListening ? "animate-pulse" : ""}`}
                    onClick={toggleVoiceInput}
                    data-testid="button-voice-dictation"
                    title={isListening ? "Parar ditado por voz" : "Ditar por voz (fale ao inves de digitar)"}
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    {isListening ? "PARAR" : "DITAR"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={usePremiumModel ? "default" : "outline"}
                  className="gap-1 text-xs"
                  onClick={() => { const next = !usePremiumModel; setUsePremiumModel(next); localStorage.setItem("legal_model_choice", next ? "premium" : "economico"); }}
                  data-testid="button-toggle-model"
                  title={usePremiumModel ? "Usando Gemini Pro (Premium) - clique para usar Flash (Economico)" : "Usando Gemini Flash (Economico) - clique para usar Pro (Premium)"}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {usePremiumModel ? "Pro" : "Flash"}
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
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={result ? "Contexto atual carregado — cole novo texto para substituir, ou deixe vazio para usar o resultado existente como base..." : "Cole aqui o texto do documento, peticao, sentenca, contrato ou qualquer outro texto juridico que deseja processar..."}
            className="flex-1 w-full resize-none bg-background p-3 text-sm font-mono outline-none min-h-[150px] lg:min-h-0"
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

        <div className={isResultFullscreen ? "fixed inset-0 z-50 flex flex-col bg-background border" : "flex-1 flex flex-col min-h-0"}>
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
                Custo estimado: <strong className="text-foreground">${lastQueryCost.totalUsd < 0.001 ? "<$0.001" : `$${lastQueryCost.totalUsd.toFixed(4)}`}</strong>
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
                      {asstMsgs[i] && (
                        <div className="flex justify-start">
                          <div className="bg-muted/40 border rounded-xl px-3 py-2 max-w-[90%]">
                            <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                              IA — versao {i + 1}{i === userMsgs.length - 1 ? " (atual)" : ""}
                            </p>
                            {i < userMsgs.length - 1 ? (
                              <button
                                className="text-xs text-blue-500 hover:underline"
                                onClick={() => {
                                  setResult(asstMsgs[i].content);
                                  setEditedHtml(null);
                                }}
                              >
                                Restaurar esta versao
                              </button>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Documento atual exibido abaixo</p>
                            )}
                          </div>
                        </div>
                      )}
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
                    const htmlContent = isHtml ? displayText : formatMarkdown(displayText);
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
                          />
                        ) : (
                          <div
                            className="max-w-none outline-none"
                            dangerouslySetInnerHTML={{ __html: htmlContent }}
                            data-testid="result-display"
                          />
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
                  className="text-[10px] cursor-pointer"
                  onClick={() => { const next = !usePremiumModel; setUsePremiumModel(next); localStorage.setItem("legal_model_choice", next ? "premium" : "economico"); }}
                  data-testid="badge-chat-model"
                >
                  {usePremiumModel ? "Premium" : "Economico"} (clique para trocar)
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
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${!usePremiumModel ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => { setUsePremiumModel(false); localStorage.setItem("legal_model_choice", "economico"); }}
                  data-testid="cost-option-economico"
                >
                  {!usePremiumModel && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                  <div className="font-bold text-sm mb-0.5">Econômico</div>
                  <div className="text-[10px] text-muted-foreground">Gemini 2.5 Flash</div>
                </div>
                <div
                  className={`relative p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${usePremiumModel ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-muted-foreground/30 hover:bg-muted/30'}`}
                  onClick={() => { setUsePremiumModel(true); localStorage.setItem("legal_model_choice", "premium"); }}
                  data-testid="cost-option-premium"
                >
                  {usePremiumModel && <CheckCircle className="absolute top-2 right-2 w-4 h-4 text-primary" />}
                  <div className="font-bold text-sm mb-0.5">Premium</div>
                  <div className="text-[10px] text-muted-foreground">Gemini 2.5 Pro</div>
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
              <div className="p-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 space-y-1.5">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5" />
                  Chave DataJud (CNJ) {datajudKey ? "— Configurada" : "— Necessária"}
                </p>
                <Input
                  type="password"
                  value={datajudKey}
                  placeholder="Cole aqui sua chave DataJud do CNJ..."
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setDatajudKey(v);
                    if (v) localStorage.setItem("datajud_api_key", v);
                    else localStorage.removeItem("datajud_api_key");
                  }}
                  className="text-xs font-mono"
                  data-testid="input-datajud-key"
                />
                {!datajudKey && (
                  <p className="text-[10px] text-muted-foreground">
                    Cadastre-se em <a href="https://datajud-wiki.cnj.jus.br" target="_blank" rel="noreferrer" className="text-blue-500 underline">datajud-wiki.cnj.jus.br</a> e cole a chave acima. Salva no navegador.
                  </p>
                )}
              </div>
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
                        <button
                          onClick={() => setJuriExpandedIdx(juriExpandedIdx === i ? null : i)}
                          className="text-xs text-primary hover:underline"
                          data-testid={`button-toggle-ementa-${i}`}
                        >
                          {juriExpandedIdx === i ? "▲ Ocultar ementa" : "▼ Ver ementa completa"}
                        </button>
                        {juriExpandedIdx === i && (
                          <div className="mt-1.5 p-2 bg-muted/50 rounded text-xs leading-relaxed whitespace-pre-wrap">{r.ementa}</div>
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
                        <p className="text-xs text-muted-foreground line-clamp-2">{entry.inputPreview}...</p>
                        <p className="text-xs mt-1 line-clamp-2">{entry.result.substring(0, 150)}...</p>
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
    </div>
  );
}
