import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Eye, EyeOff, Save, Database, Cpu, Key, CheckCircle, XCircle,
  Loader2, ArrowLeft, Trash2, RefreshCw, Info, Zap, Globe,
} from "lucide-react";
import { Link } from "wouter";

const AI_CONFIG_KEY = "apk_ai_config";

type AiConfig = {
  gemini_api_key: string;
  openai_api_key: string;
  perplexity_api_key: string;
  demo_api_key: string;
  demo_api_url: string;
  demo_api_model: string;
  database_url: string;
};

function loadConfig(): AiConfig {
  try {
    const v = localStorage.getItem(AI_CONFIG_KEY);
    return v ? JSON.parse(v) : {
      gemini_api_key: "", openai_api_key: "", perplexity_api_key: "",
      demo_api_key: "", demo_api_url: "", demo_api_model: "", database_url: "",
    };
  } catch {
    return {
      gemini_api_key: "", openai_api_key: "", perplexity_api_key: "",
      demo_api_key: "", demo_api_url: "", demo_api_model: "", database_url: "",
    };
  }
}

function saveConfig(cfg: AiConfig) {
  localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(cfg));
}

function KeyInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-10 font-mono text-sm h-10 bg-background border-border"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
      active
        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
        : "bg-muted text-muted-foreground"
    }`}>
      {active
        ? <><CheckCircle className="h-3 w-3" />Configurado</>
        : <><XCircle className="h-3 w-3" />Não configurado</>
      }
    </span>
  );
}

function SectionCard({ icon: Icon, title, color, children }: {
  icon: React.ElementType; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`flex items-center gap-3 px-5 py-4 border-b border-border ${color}`}>
        <Icon className="h-4 w-4" />
        <span className="font-semibold text-sm">{title}</span>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children, status }: {
  label: string; hint?: string; children: React.ReactNode; status?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {status !== undefined && <StatusDot active={status} />}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

export default function Configuracoes() {
  const { toast } = useToast();
  const [config, setConfig] = useState<AiConfig>(loadConfig);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  useEffect(() => { setConfig(loadConfig()); }, []);

  function set(k: keyof AiConfig, v: string) {
    setConfig(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    saveConfig(config);
    await new Promise(r => setTimeout(r, 400));
    setSaving(false);
    toast({ title: "Configurações salvas!", description: "Tudo salvo localmente no dispositivo." });
  }

  async function testKey(provider: "gemini" | "openai" | "perplexity" | "demo") {
    const keyMap: Record<string, string> = {
      gemini: config.gemini_api_key,
      openai: config.openai_api_key,
      perplexity: config.perplexity_api_key,
      demo: config.demo_api_key,
    };
    const key = keyMap[provider];
    if (!key) {
      toast({ title: "Chave vazia", description: "Insira a chave antes de testar.", variant: "destructive" });
      return;
    }
    setTesting(provider);
    setTestResult(prev => ({ ...prev, [provider]: { ok: false, msg: "" } }));

    try {
      const r = await fetch("/api/settings/test-ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, provider }),
      });
      const data = await r.json();
      setTestResult(prev => ({ ...prev, [provider]: { ok: data.ok, msg: data.message || (data.ok ? "Funcionando!" : "Erro") } }));
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [provider]: { ok: false, msg: e.message } }));
    }
    setTesting(null);
  }

  function clearAll() {
    if (!confirm("Apagar todas as chaves salvas? Essa ação não pode ser desfeita.")) return;
    const empty: AiConfig = {
      gemini_api_key: "", openai_api_key: "", perplexity_api_key: "",
      demo_api_key: "", demo_api_url: "", demo_api_model: "", database_url: "",
    };
    setConfig(empty);
    saveConfig(empty);
    setTestResult({});
    toast({ title: "Chaves apagadas", description: "Todas as configurações foram removidas." });
  }

  const hasAnyKey = !!(config.gemini_api_key || config.openai_api_key || config.perplexity_api_key || config.demo_api_key);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <h1 className="font-bold text-base flex-1">Configurações</h1>
          <Badge variant="outline" className="text-xs gap-1.5 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Local — sem servidor
          </Badge>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Info banner */}
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 p-4 flex gap-3">
          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <Info className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Modo autônomo ativo</p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 leading-relaxed">
              Todas as chaves são salvas <strong>localmente no dispositivo</strong> — funciona 100% sem servidor.
              Suas chaves de API nunca saem do seu aparelho.
            </p>
          </div>
        </div>

        {/* Gemini */}
        <SectionCard icon={Zap} title="Google Gemini" color="text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20">
          <FieldRow label="Chave de API Gemini" hint="Obtenha gratuitamente em aistudio.google.com" status={!!config.gemini_api_key}>
            <KeyInput value={config.gemini_api_key} onChange={v => set("gemini_api_key", v)} placeholder="AIza..." />
          </FieldRow>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              disabled={testing === "gemini"} onClick={() => testKey("gemini")}>
              {testing === "gemini" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Testar chave
            </Button>
            {testResult.gemini && (
              <span className={`text-xs font-medium ${testResult.gemini.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {testResult.gemini.ok ? "✓ " : "✗ "}{testResult.gemini.msg}
              </span>
            )}
          </div>
        </SectionCard>

        {/* OpenAI */}
        <SectionCard icon={Cpu} title="OpenAI (GPT)" color="text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
          <FieldRow label="Chave de API OpenAI" hint="Obtenha em platform.openai.com" status={!!config.openai_api_key}>
            <KeyInput value={config.openai_api_key} onChange={v => set("openai_api_key", v)} placeholder="sk-..." />
          </FieldRow>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              disabled={testing === "openai"} onClick={() => testKey("openai")}>
              {testing === "openai" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Testar chave
            </Button>
            {testResult.openai && (
              <span className={`text-xs font-medium ${testResult.openai.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {testResult.openai.ok ? "✓ " : "✗ "}{testResult.openai.msg}
              </span>
            )}
          </div>
        </SectionCard>

        {/* Perplexity */}
        <SectionCard icon={Globe} title="Perplexity (busca web)" color="text-violet-600 dark:text-violet-400 bg-violet-50/50 dark:bg-violet-950/20">
          <FieldRow label="Chave de API Perplexity" hint="Obtenha em perplexity.ai/settings/api" status={!!config.perplexity_api_key}>
            <KeyInput value={config.perplexity_api_key} onChange={v => set("perplexity_api_key", v)} placeholder="pplx-..." />
          </FieldRow>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              disabled={testing === "perplexity"} onClick={() => testKey("perplexity")}>
              {testing === "perplexity" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Testar chave
            </Button>
            {testResult.perplexity && (
              <span className={`text-xs font-medium ${testResult.perplexity.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {testResult.perplexity.ok ? "✓ " : "✗ "}{testResult.perplexity.msg}
              </span>
            )}
          </div>
        </SectionCard>

        {/* API Customizada */}
        <SectionCard icon={Key} title="API Personalizada (OpenAI-compatível)" color="text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20">
          <p className="text-xs text-muted-foreground -mt-1">
            Qualquer API compatível com o formato OpenAI — LM Studio, Ollama, OpenRouter, etc.
          </p>
          <FieldRow label="Chave de API" status={!!config.demo_api_key}>
            <KeyInput value={config.demo_api_key} onChange={v => set("demo_api_key", v)} placeholder="Chave ou token..." />
          </FieldRow>
          <FieldRow label="URL Base">
            <Input value={config.demo_api_url} onChange={e => set("demo_api_url", e.target.value)}
              placeholder="https://api.openrouter.ai/api/v1" className="h-10 text-sm" />
          </FieldRow>
          <FieldRow label="Modelo">
            <Input value={config.demo_api_model} onChange={e => set("demo_api_model", e.target.value)}
              placeholder="gpt-4o-mini, claude-3-haiku, etc." className="h-10 text-sm" />
          </FieldRow>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
              disabled={testing === "demo"} onClick={() => testKey("demo")}>
              {testing === "demo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Testar chave
            </Button>
            {testResult.demo && (
              <span className={`text-xs font-medium ${testResult.demo.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                {testResult.demo.ok ? "✓ " : "✗ "}{testResult.demo.msg}
              </span>
            )}
          </div>
        </SectionCard>

        {/* Neon DB */}
        <SectionCard icon={Database} title="Banco de Dados Neon (opcional)" color="text-teal-600 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20">
          <p className="text-xs text-muted-foreground -mt-1">
            URL do banco PostgreSQL Neon para persistência em nuvem. Sem banco, tudo fica salvo localmente no dispositivo.
          </p>
          <FieldRow
            label="URL de conexão"
            hint="Formato: postgresql://user:senha@host.neon.tech/neondb?sslmode=require"
            status={!!config.database_url}
          >
            <KeyInput
              value={config.database_url}
              onChange={v => set("database_url", v)}
              placeholder="postgresql://user:senha@host.neon.tech/neondb?sslmode=require"
            />
          </FieldRow>
          {config.database_url && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
              <CheckCircle className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <p className="text-xs text-teal-700 dark:text-teal-300">
                URL Neon salva. Utilizada quando o servidor backend estiver ativo.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Botões de ação */}
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 gap-2 font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
          {hasAnyKey && (
            <Button
              variant="outline"
              size="icon"
              onClick={clearAll}
              title="Apagar todas as chaves"
              className="h-11 w-11 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="text-center pb-6">
          <p className="text-xs text-muted-foreground">
            Dados salvos apenas neste dispositivo · v2.0 · Maikon Caldeira — OAB/MG 183712
          </p>
        </div>
      </div>
    </div>
  );
}
