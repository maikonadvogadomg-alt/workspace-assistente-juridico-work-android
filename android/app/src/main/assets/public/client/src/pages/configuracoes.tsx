import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff, Save, Database, Cpu, Key, CheckCircle, XCircle, Loader2, ArrowLeft, Shield, RefreshCw, Smartphone, Info, FlaskConical } from "lucide-react";
import { Link } from "wouter";

function MaskedInput({ value, onChange, placeholder, id, testId }: {
  value: string; onChange: (v: string) => void; placeholder?: string; id?: string; testId?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} data-testid={testId} type={show ? "text" : "password"} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="pr-10 font-mono text-sm" autoComplete="off" />
      <button type="button" onClick={() => setShow(s => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return ok
    ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs gap-1"><CheckCircle className="h-3 w-3" />{label}</Badge>
    : <Badge variant="outline" className="text-xs text-muted-foreground gap-1"><XCircle className="h-3 w-3" />{label} não configurado</Badge>;
}

type SystemStatus = {
  dbMode: "postgres" | "memory";
  hasDbUrl: boolean;
  hasGeminiKey: boolean;
  hasOpenAiKey: boolean;
  hasPerplexityKey: boolean;
  hasDemoKey: boolean;
  hasAppPassword: boolean;
  hasSessionSecret: boolean;
};

type AiConfig = {
  gemini_api_key: string;
  openai_api_key: string;
  perplexity_api_key: string;
  demo_api_key: string;
  demo_api_url: string;
  demo_api_model: string;
  database_url: string;
};

export default function Configuracoes() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [config, setConfig] = useState<AiConfig>({
    gemini_api_key: "", openai_api_key: "", perplexity_api_key: "",
    demo_api_key: "", demo_api_url: "", demo_api_model: "", database_url: "",
  });
  const [neonUrl, setNeonUrl] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [sessionSecret, setSessionSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [connectingDb, setConnectingDb] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [cfgRes, statusRes] = await Promise.all([
        fetch("/api/settings/ai-config"),
        fetch("/api/settings/system-status"),
      ]);
      if (cfgRes.ok) { const d = await cfgRes.json(); setConfig(prev => ({ ...prev, ...d })); }
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch {}
    setLoading(false);
  }

  function set(k: keyof AiConfig, v: string) {
    setConfig(prev => ({ ...prev, [k]: v }));
  }

  async function testAiKey(field: string, provider: string) {
    const keyValue = field === "gemini" ? config.gemini_api_key : config.openai_api_key;
    setTestingKey(field);
    setTestResult(prev => ({ ...prev, [field]: { ok: false, msg: "" } }));
    try {
      const r = await fetch("/api/settings/test-ai-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: keyValue, provider }),
      });
      const data = await r.json();
      setTestResult(prev => ({ ...prev, [field]: { ok: data.ok, msg: data.message } }));
    } catch (e: any) {
      setTestResult(prev => ({ ...prev, [field]: { ok: false, msg: e.message } }));
    }
    setTestingKey(null);
  }

  async function saveAiKeys() {
    setSavingAi(true);
    try {
      const r = await fetch("/api/settings/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        toast({ title: "Chaves salvas!", description: "Salvas no arquivo local — funcionam sem banco de dados." });
        loadAll();
      } else {
        const e = await r.json().catch(() => ({ message: "Erro" }));
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSavingAi(false);
  }

  async function connectDatabase() {
    const url = neonUrl.trim();
    if (!url) {
      toast({ title: "URL obrigatória", description: "Cole a URL do banco Neon.", variant: "destructive" });
      return;
    }
    setConnectingDb(true);
    try {
      const r = await fetch("/api/settings/database-reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ database_url: url }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Banco conectado!", description: data.message });
        setNeonUrl("");
        loadAll();
      } else {
        toast({ title: "Erro ao conectar", description: data.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setConnectingDb(false);
  }

  async function saveAppPassword() {
    if (!appPassword.trim()) return;
    setSavingPwd(true);
    try {
      const r = await fetch("/api/settings/app-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: appPassword }),
      });
      if (r.ok) {
        toast({ title: "Senha salva!", description: "Próximo login já usa essa senha." });
        setAppPassword("");
        loadAll();
      } else {
        const e = await r.json().catch(() => ({ message: "Erro" }));
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
    setSavingPwd(false);
  }

  async function saveSessionSecret() {
    if (!sessionSecret.trim()) return;
    try {
      const r = await fetch("/api/settings/session-secret", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: sessionSecret }),
      });
      if (r.ok) {
        toast({ title: "Segredo salvo!" });
        setSessionSecret("");
        loadAll();
      } else {
        const e = await r.json().catch(() => ({ message: "Erro" }));
        toast({ title: "Erro", description: e.message, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  function generateSecret() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    setSessionSecret(Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(""));
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isMemory = status?.dbMode === "memory";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-20">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Configurações</h1>
            <p className="text-xs text-muted-foreground">Chaves de IA, banco de dados e acesso ao app</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto" onClick={loadAll} data-testid="button-refresh-status">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Status Geral */}
        <Card className={`mb-4 ${isMemory ? "border-yellow-300 dark:border-yellow-700" : "border-green-300 dark:border-green-700"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Status do Sistema
              {isMemory
                ? <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 text-xs">Modo Memória</Badge>
                : <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-xs">PostgreSQL</Badge>
              }
            </CardTitle>
            {isMemory && (
              <CardDescription className="text-xs text-yellow-700 dark:text-yellow-400">
                Sem banco de dados — dados ficam na memória (apagam ao reiniciar). Configure o banco Neon abaixo para salvar tudo permanentemente.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <StatusBadge ok={!isMemory} label="Banco de Dados" />
              <StatusBadge ok={!!status?.hasGeminiKey} label="Gemini" />
              <StatusBadge ok={!!status?.hasOpenAiKey} label="OpenAI" />
              <StatusBadge ok={!!status?.hasPerplexityKey} label="Perplexity" />
              <StatusBadge ok={!!status?.hasDemoKey} label="Chave Demo" />
              <StatusBadge ok={!!status?.hasAppPassword} label="Senha do App" />
            </div>
          </CardContent>
        </Card>

        {/* Banco de Dados */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-blue-500" />
              Banco de Dados Neon
            </CardTitle>
            <CardDescription className="text-xs">
              Banco gratuito em <a href="https://neon.tech" target="_blank" rel="noreferrer" className="text-blue-500 underline">neon.tech</a> → Criar projeto → Connection string → Copiar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {config.database_url && (
              <p className="text-xs font-mono bg-muted px-3 py-2 rounded text-muted-foreground break-all">
                Atual: {config.database_url}
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Nova URL do banco</Label>
              <Input
                data-testid="input-neon-url"
                type="password"
                value={neonUrl}
                onChange={e => setNeonUrl(e.target.value)}
                placeholder="postgresql://usuario:senha@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>
            <Button data-testid="button-connect-db" onClick={connectDatabase}
              disabled={connectingDb || !neonUrl.trim()} className="w-full" size="sm">
              {connectingDb
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Conectando e criando tabelas...</>
                : <><Database className="h-4 w-4 mr-2" />Conectar e Criar Tabelas</>
              }
            </Button>
          </CardContent>
        </Card>

        {/* Chaves de IA */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-purple-500" />
              Chaves de IA
            </CardTitle>
            <CardDescription className="text-xs">
              Salvas no arquivo local — funcionam mesmo sem banco de dados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Key className="h-3 w-3" /> Gemini — Econômico e Pro
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                  className="ml-auto text-blue-500 underline font-normal">Obter grátis →</a>
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <MaskedInput value={config.gemini_api_key} onChange={v => set("gemini_api_key", v)}
                    placeholder="AIzaSy..." testId="input-gemini-key" />
                </div>
                <Button size="sm" variant="outline" onClick={() => testAiKey("gemini", "gemini")}
                  disabled={testingKey === "gemini" || !config.gemini_api_key} data-testid="button-test-gemini"
                  title="Testar chave Gemini">
                  {testingKey === "gemini" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                </Button>
              </div>
              {testResult.gemini && (
                <p className={`text-xs px-2 py-1 rounded ${testResult.gemini.ok ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
                  {testResult.gemini.ok ? "✓ " : "✗ "}{testResult.gemini.msg}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Key className="h-3 w-3" /> OpenAI — GPT
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer"
                  className="ml-auto text-blue-500 underline font-normal">Obter →</a>
              </Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <MaskedInput value={config.openai_api_key} onChange={v => set("openai_api_key", v)}
                    placeholder="sk-..." testId="input-openai-key" />
                </div>
                <Button size="sm" variant="outline" onClick={() => testAiKey("openai", "openai")}
                  disabled={testingKey === "openai" || !config.openai_api_key} data-testid="button-test-openai"
                  title="Testar chave OpenAI">
                  {testingKey === "openai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                </Button>
              </div>
              {testResult.openai && (
                <p className={`text-xs px-2 py-1 rounded ${testResult.openai.ok ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
                  {testResult.openai.ok ? "✓ " : "✗ "}{testResult.openai.msg}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1">
                <Key className="h-3 w-3" /> Perplexity
                <a href="https://www.perplexity.ai/settings/api" target="_blank" rel="noreferrer"
                  className="ml-auto text-blue-500 underline font-normal">Obter →</a>
              </Label>
              <MaskedInput value={config.perplexity_api_key} onChange={v => set("perplexity_api_key", v)}
                placeholder="pplx-..." testId="input-perplexity-key" />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-xs font-semibold">Chave Demo (compartilhada com todos os usuários)</Label>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Chave API</Label>
                <MaskedInput value={config.demo_api_key} onChange={v => set("demo_api_key", v)}
                  placeholder="Qualquer chave OpenAI-compatível..." testId="input-demo-key" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">URL da API</Label>
                <Input data-testid="input-demo-url" value={config.demo_api_url}
                  onChange={e => set("demo_api_url", e.target.value)}
                  placeholder="https://api.openai.com/v1" className="font-mono text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Modelo</Label>
                <Input data-testid="input-demo-model" value={config.demo_api_model}
                  onChange={e => set("demo_api_model", e.target.value)}
                  placeholder="gpt-4o-mini" className="font-mono text-xs" />
              </div>
            </div>

            <Button data-testid="button-save-ai" onClick={saveAiKeys} disabled={savingAi} className="w-full" size="sm">
              {savingAi ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</>
                : <><Save className="h-4 w-4 mr-2" />Salvar Chaves</>}
            </Button>
          </CardContent>
        </Card>

        {/* Acesso ao App */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-orange-500" />
              Acesso ao App
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Senha de acesso (APP_PASSWORD)</Label>
              <p className="text-xs text-muted-foreground">Senha que os usuários digitam para entrar no app.</p>
              <div className="flex gap-2">
                <MaskedInput value={appPassword} onChange={setAppPassword}
                  placeholder="Nova senha..." testId="input-app-password" />
                <Button size="sm" onClick={saveAppPassword} disabled={savingPwd || !appPassword.trim()} data-testid="button-save-password">
                  {savingPwd ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Segredo de sessão (SESSION_SECRET)</Label>
              <p className="text-xs text-muted-foreground">Chave aleatória para proteger as sessões de login. Gere uma nova se quiser invalidar todos os logins.</p>
              <div className="flex gap-2">
                <MaskedInput value={sessionSecret} onChange={setSessionSecret}
                  placeholder="Segredo aleatório..." testId="input-session-secret" />
                <Button size="sm" variant="outline" onClick={generateSecret} data-testid="button-generate-secret" title="Gerar segredo aleatório">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" onClick={saveSessionSecret} disabled={!sessionSecret.trim()} data-testid="button-save-secret">
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* APK / Mobile */}
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-blue-500" />
              Usar no Celular / APK Android
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-2">
              <p className="font-semibold text-foreground text-xs">Testar agora (sem instalar nada):</p>
              <p className="text-xs">Abra este endereço no navegador do celular. Funciona direto.</p>
              <code className="text-xs bg-muted px-2 py-1 rounded block break-all">
                {typeof window !== "undefined" ? window.location.origin : "https://seu-app.replit.app"}
              </code>
            </div>

            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="font-semibold text-foreground text-xs">Criar APK nativo (sem precisar de servidor):</p>
              <ol className="text-xs space-y-1 list-decimal list-inside">
                <li>Configure sua chave Gemini acima (única necessária para funcionar)</li>
                <li>Publique o app em <strong>Vercel</strong> ou <strong>Railway</strong> (gratuito)</li>
                <li>Baixe <strong>Android Studio</strong> no seu computador</li>
                <li>Crie projeto → Empty Activity → Substitua o layout por um WebView apontando para a URL</li>
                <li>Gere o APK: Build → Build APK</li>
              </ol>
            </div>

            <div className="p-3 bg-muted rounded-lg space-y-2">
              <p className="font-semibold text-foreground text-xs">Mais rápido ainda — app WebView online:</p>
              <p className="text-xs">
                Use sites como <a href="https://gonative.io" target="_blank" rel="noreferrer" className="text-blue-500 underline">gonative.io</a> ou{" "}
                <a href="https://www.appsmakerstore.com" target="_blank" rel="noreferrer" className="text-blue-500 underline">appsmakerstore.com</a>{" "}
                — basta colar a URL e eles geram o APK automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
