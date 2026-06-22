import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft, Bot, Play, Settings, Users, FileText, Loader2,
  Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff,
  CheckCircle2, AlertCircle, Clock, Info, Search, Scale, X, Copy, Key,
} from "lucide-react";

type Tab = "publicacoes" | "clientes" | "pesquisa" | "configuracoes";

interface DjenPublicacao {
  id: string;
  numeroProcesso: string;
  texto: string;
  inicioSessao: string;
  fimSessao: string;
  prazoOral: string;
  linkDocumento: string;
  clienteNome: string;
  emailStatus: string;
  createdAt: string;
}

interface DjenCliente {
  id: string;
  nomeCompleto: string;
  email: string;
  tratamento: string;
  nomeCaso: string;
  numeroProcesso: string;
  createdAt: string;
}

interface ExecucaoResult {
  execucaoId: string;
  sucesso: boolean;
  mensagem: string;
  estatisticas: { total: number; processadas: number; comErro: number; ignoradas: number };
  log: string[];
}

const TRIBUNAIS = [
  { value: "trf1", label: "TRF 1ª Região" },
  { value: "trf2", label: "TRF 2ª Região" },
  { value: "trf3", label: "TRF 3ª Região" },
  { value: "trf4", label: "TRF 4ª Região" },
  { value: "trf5", label: "TRF 5ª Região" },
  { value: "trf6", label: "TRF 6ª Região" },
  { value: "tjmg", label: "TJMG" },
  { value: "tjsp", label: "TJSP" },
  { value: "tjrs", label: "TJRS" },
  { value: "tjpr", label: "TJPR" },
  { value: "tst", label: "TST" },
  { value: "stj", label: "STJ" },
  { value: "stf", label: "STF" },
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function RoboDjenPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("publicacoes");
  const [expandedLogs, setExpandedLogs] = useState(false);
  const [ultimaExecucao, setUltimaExecucao] = useState<ExecucaoResult | null>(null);

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [filtroPub, setFiltroPub] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");

  // ── Configurações ─────────────────────────────────────────────────────────
  const [showSenha, setShowSenha] = useState(false);
  const [showPem, setShowPem] = useState(false);
  const [cfg, setCfg] = useState({
    djenToken: "",
    pdpjPemKey: "",
    advogadoCpf: "",
    advogadoNome: "",
    jwtIssuer: "pdpj-br",
    jwtAudience: "https://comunicaapi.pje.jus.br",
    emailLogin: "",
    emailSenha: "",
    imapServer: "imap.gmail.com",
    salvarDrive: false,
    pastaDriveId: "",
    maxPaginas: 50,
  });
  const [tokenGerado, setTokenGerado] = useState("");
  const [gerandoToken, setGerandoToken] = useState(false);
  const [cfgLoaded, setCfgLoaded] = useState(false);

  useQuery({
    queryKey: ["/api/djen/config"],
    queryFn: async () => {
      const res = await fetch("/api/djen/config");
      const data = await res.json();
      setCfg((prev) => ({ ...prev, ...data }));
      setCfgLoaded(true);
      return data;
    },
  });

  const saveCfgMutation = useMutation({
    mutationFn: () => apiRequest("PUT", "/api/djen/config", cfg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/djen/config"] });
      toast({ title: "Configurações salvas!" });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" }),
  });

  const gerarToken = async () => {
    setGerandoToken(true);
    setTokenGerado("");
    try {
      // Salva primeiro para garantir que os dados estão no servidor
      await apiRequest("PUT", "/api/djen/config", cfg);
      const res = await fetch("/api/djen/gerar-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setTokenGerado(data.token);
      toast({ title: "Token gerado!", description: "Cole no campo Authorization do Swagger." });
    } catch (e: any) {
      toast({ title: "Erro ao gerar token", description: e.message, variant: "destructive" });
    } finally {
      setGerandoToken(false);
    }
  };

  const copiarToken = () => {
    navigator.clipboard.writeText(`Bearer ${tokenGerado}`);
    toast({ title: "Copiado!", description: "Cole no campo Authorization do Swagger." });
  };

  // ── Clientes ──────────────────────────────────────────────────────────────
  const { data: clientes = [], isLoading: clientesLoading } = useQuery<DjenCliente[]>({
    queryKey: ["/api/djen/clientes"],
    enabled: tab === "clientes",
  });

  const clientesFiltrados = useMemo(() => {
    const q = filtroCliente.toLowerCase();
    if (!q) return clientes;
    return clientes.filter(c =>
      c.nomeCompleto.toLowerCase().includes(q) ||
      c.numeroProcesso.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.nomeCaso.toLowerCase().includes(q)
    );
  }, [clientes, filtroCliente]);

  const [novoCliente, setNovoCliente] = useState({
    nomeCompleto: "", email: "", tratamento: "", nomeCaso: "", numeroProcesso: "",
  });
  const [showForm, setShowForm] = useState(false);

  const criarClienteMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/djen/clientes", novoCliente),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/djen/clientes"] });
      setNovoCliente({ nomeCompleto: "", email: "", tratamento: "", nomeCaso: "", numeroProcesso: "" });
      setShowForm(false);
      toast({ title: "Cliente cadastrado!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const deletarClienteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/djen/clientes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/djen/clientes"] });
      toast({ title: "Cliente removido" });
    },
  });

  // ── Publicações ────────────────────────────────────────────────────────────
  const { data: publicacoes = [], isLoading: pubsLoading, refetch: refetchPubs } = useQuery<DjenPublicacao[]>({
    queryKey: ["/api/djen/publicacoes"],
    enabled: tab === "publicacoes",
  });

  const pubsFiltradas = useMemo(() => {
    const q = filtroPub.toLowerCase();
    if (!q) return publicacoes;
    return publicacoes.filter(p =>
      p.numeroProcesso.toLowerCase().includes(q) ||
      (p.clienteNome || "").toLowerCase().includes(q) ||
      (p.texto || "").toLowerCase().includes(q)
    );
  }, [publicacoes, filtroPub]);

  const [expandedPub, setExpandedPub] = useState<string | null>(null);

  // ── Executar robô ─────────────────────────────────────────────────────────
  const executarMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/djen/executar"),
    onSuccess: (data: any) => {
      setUltimaExecucao(data);
      queryClient.invalidateQueries({ queryKey: ["/api/djen/publicacoes"] });
      if (data.sucesso) {
        toast({ title: "Robô executado!", description: data.mensagem });
      } else {
        toast({ title: "Erro na execução", description: data.mensagem, variant: "destructive" });
      }
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // ── Pesquisa OAB ──────────────────────────────────────────────────────────
  const [oabQuery, setOabQuery] = useState("");
  const [oabUF, setOabUF] = useState("MG");
  const [oabResultados, setOabResultados] = useState<any[]>([]);
  const [oabLoading, setOabLoading] = useState(false);
  const [oabErro, setOabErro] = useState("");

  const buscarOAB = async () => {
    if (!oabQuery.trim()) return;
    setOabLoading(true);
    setOabErro("");
    setOabResultados([]);
    try {
      const params = new URLSearchParams({ q: oabQuery, uf: oabUF });
      const res = await fetch(`/api/pesquisa/oab?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro na consulta");
      setOabResultados(data.items || []);
      if ((data.items || []).length === 0) setOabErro("Nenhum resultado encontrado.");
    } catch (e: any) {
      setOabErro(e.message);
    } finally {
      setOabLoading(false);
    }
  };

  // ── Pesquisa Processo (DataJud) ────────────────────────────────────────────
  const [procNumero, setProcNumero] = useState("");
  const [procTribunal, setProcTribunal] = useState("trf6");
  const [procResultados, setProcResultados] = useState<any[]>([]);
  const [procLoading, setProcLoading] = useState(false);
  const [procErro, setProcErro] = useState("");

  const buscarProcesso = async () => {
    if (!procNumero.trim()) return;
    setProcLoading(true);
    setProcErro("");
    setProcResultados([]);
    try {
      const params = new URLSearchParams({ numero: procNumero, tribunal: procTribunal });
      const res = await fetch(`/api/pesquisa/processo?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Erro na consulta");
      setProcResultados(data.items || []);
      if ((data.items || []).length === 0) setProcErro("Processo não encontrado no DataJud/CNJ.");
    } catch (e: any) {
      setProcErro(e.message);
    } finally {
      setProcLoading(false);
    }
  };

  const tabs: { id: Tab; label: string; Icon: any }[] = [
    { id: "publicacoes", label: "Publicações", Icon: FileText },
    { id: "clientes", label: "Clientes", Icon: Users },
    { id: "pesquisa", label: "Pesquisa", Icon: Search },
    { id: "configuracoes", label: "Config.", Icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background pb-16 lg:pb-0">
      {/* Header */}
      <header className="px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/tramitacao">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <Bot className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">Robô Jurídico DJEN</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Monitoramento automático · Pesquisa OAB · DataJud</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => executarMutation.mutate()}
              disabled={executarMutation.isPending}
              data-testid="button-executar-robo"
              className="gap-1.5"
            >
              {executarMutation.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {executarMutation.isPending ? "Executando..." : "Executar Robô"}
              </span>
              <span className="sm:hidden">Rodar</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Resultado da última execução */}
      {ultimaExecucao && (
        <div className={`mx-3 mt-3 rounded-lg border p-3 ${ultimaExecucao.sucesso ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {ultimaExecucao.sucesso
                ? <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
              <div>
                <p className="text-sm font-medium">{ultimaExecucao.mensagem}</p>
                <div className="flex gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  <span>Total: {ultimaExecucao.estatisticas.total}</span>
                  <span className="text-green-600">✓ {ultimaExecucao.estatisticas.processadas}</span>
                  <span className="text-yellow-600">⚠ {ultimaExecucao.estatisticas.ignoradas}</span>
                  {ultimaExecucao.estatisticas.comErro > 0 && (
                    <span className="text-red-500">✗ {ultimaExecucao.estatisticas.comErro}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="text-xs h-6 px-2" onClick={() => setExpandedLogs(!expandedLogs)}>
                {expandedLogs ? "Ocultar" : "Log"}
                {expandedLogs ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setUltimaExecucao(null)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
          {expandedLogs && (
            <pre className="mt-2 text-xs font-mono bg-black/10 dark:bg-white/5 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
              {ultimaExecucao.log.join("\n")}
            </pre>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b bg-card px-2 gap-0 shrink-0 overflow-x-auto">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${id}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-3">

        {/* ── Publicações ─────────────────────────────────────────────────── */}
        {tab === "publicacoes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Publicações encontradas</h2>
              <Button variant="ghost" size="sm" onClick={() => refetchPubs()} className="gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar
              </Button>
            </div>

            {publicacoes.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por processo, cliente ou texto..."
                  className="pl-8 h-8 text-sm"
                  value={filtroPub}
                  onChange={(e) => setFiltroPub(e.target.value)}
                  data-testid="input-filtro-publicacoes"
                />
                {filtroPub && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setFiltroPub("")}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}

            {filtroPub && (
              <p className="text-xs text-muted-foreground">
                {pubsFiltradas.length} de {publicacoes.length} publicações
              </p>
            )}

            {pubsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : publicacoes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhuma publicação encontrada ainda.</p>
                <p className="text-xs mt-1">Execute o robô para buscar publicações do DJEN.</p>
                <Button className="mt-4 gap-1.5" onClick={() => executarMutation.mutate()} disabled={executarMutation.isPending}>
                  <Play className="w-4 h-4" />
                  Executar agora
                </Button>
              </div>
            ) : pubsFiltradas.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhuma publicação corresponde ao filtro.</p>
            ) : (
              <div className="space-y-2">
                {pubsFiltradas.map((pub) => (
                  <Card key={pub.id} className="overflow-hidden" data-testid={`card-pub-${pub.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-mono font-medium truncate">{pub.numeroProcesso}</p>
                            {pub.clienteNome ? (
                              <Badge variant="secondary" className="text-xs shrink-0">{pub.clienteNome}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs shrink-0 text-yellow-600 border-yellow-300">Sem cliente</Badge>
                            )}
                          </div>
                          {pub.inicioSessao && (
                            <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Sessão: {pub.inicioSessao} → {pub.fimSessao}
                              </span>
                              {pub.prazoOral && (
                                <span className="text-amber-600 font-medium">⚠️ Prazo oral: {pub.prazoOral}</span>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(pub.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7"
                          onClick={() => setExpandedPub(expandedPub === pub.id ? null : pub.id)}
                        >
                          {expandedPub === pub.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      {expandedPub === pub.id && (
                        <div className="mt-2 pt-2 border-t">
                          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{pub.texto}</p>
                          {pub.linkDocumento && (
                            <a href={pub.linkDocumento} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline mt-1 block">
                              Ver documento original →
                            </a>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Clientes ──────────────────────────────────────────────────────── */}
        {tab === "clientes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Clientes cadastrados</h2>
              <Button size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
                <Plus className="w-3.5 h-3.5" />
                Novo cliente
              </Button>
            </div>

            {showForm && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-sm">Novo cliente / processo</CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium mb-1 block">Nome completo *</label>
                      <Input
                        value={novoCliente.nomeCompleto}
                        onChange={(e) => setNovoCliente((p) => ({ ...p, nomeCompleto: e.target.value }))}
                        placeholder="Ex: Maria da Silva"
                        data-testid="input-cliente-nome"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Número do processo *</label>
                      <Input
                        value={novoCliente.numeroProcesso}
                        onChange={(e) => setNovoCliente((p) => ({ ...p, numeroProcesso: e.target.value }))}
                        placeholder="Ex: 6002755-35.2024.4.06.3819"
                        data-testid="input-cliente-processo"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">E-mail do cliente</label>
                      <Input
                        type="email"
                        value={novoCliente.email}
                        onChange={(e) => setNovoCliente((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Ex: maria@email.com"
                        data-testid="input-cliente-email"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block">Tratamento no e-mail</label>
                      <Input
                        value={novoCliente.tratamento}
                        onChange={(e) => setNovoCliente((p) => ({ ...p, tratamento: e.target.value }))}
                        placeholder="Ex: Prezada Maria"
                        data-testid="input-cliente-tratamento"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs font-medium mb-1 block">Nome do caso (opcional)</label>
                      <Input
                        value={novoCliente.nomeCaso}
                        onChange={(e) => setNovoCliente((p) => ({ ...p, nomeCaso: e.target.value }))}
                        placeholder="Ex: Aposentadoria por Tempo de Contribuição"
                        data-testid="input-cliente-caso"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => criarClienteMutation.mutate()}
                      disabled={criarClienteMutation.isPending || !novoCliente.nomeCompleto || !novoCliente.numeroProcesso}
                      data-testid="button-salvar-cliente"
                    >
                      {criarClienteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {clientes.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por nome, processo, e-mail ou caso..."
                  className="pl-8 h-8 text-sm"
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  data-testid="input-filtro-clientes"
                />
                {filtroCliente && (
                  <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setFiltroCliente("")}>
                    <X className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}

            {filtroCliente && (
              <p className="text-xs text-muted-foreground">{clientesFiltrados.length} de {clientes.length} clientes</p>
            )}

            {clientesLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando...
              </div>
            ) : clientes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nenhum cliente cadastrado.</p>
                <p className="text-xs mt-1">Cadastre clientes para o robô identificar os processos automaticamente.</p>
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum cliente corresponde ao filtro.</p>
            ) : (
              <div className="space-y-2">
                {clientesFiltrados.map((c) => (
                  <Card key={c.id} data-testid={`card-cliente-${c.id}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.nomeCompleto}</p>
                          <p className="text-xs font-mono text-muted-foreground truncate">{c.numeroProcesso}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            {c.email && <span className="text-xs text-muted-foreground">{c.email}</span>}
                            {c.nomeCaso && <Badge variant="outline" className="text-xs">{c.nomeCaso}</Badge>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                          onClick={() => deletarClienteMutation.mutate(c.id)}
                          data-testid={`button-deletar-cliente-${c.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pesquisa ──────────────────────────────────────────────────────── */}
        {tab === "pesquisa" && (
          <div className="space-y-5 max-w-2xl">

            {/* Busca por OAB */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  Busca por OAB
                  <Badge variant="outline" className="text-xs font-normal">CNA / OAB</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Consulta o Cadastro Nacional dos Advogados. Pesquise por nome ou número de inscrição.
                </p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={oabQuery}
                      onChange={(e) => setOabQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && buscarOAB()}
                      placeholder="Nome do advogado ou nº OAB..."
                      className="pl-8"
                      data-testid="input-oab-query"
                    />
                  </div>
                  <select
                    value={oabUF}
                    onChange={(e) => setOabUF(e.target.value)}
                    className="border rounded-md px-2 text-sm bg-background h-10 shrink-0"
                    data-testid="select-oab-uf"
                  >
                    <option value="">UF</option>
                    {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                  </select>
                  <Button onClick={buscarOAB} disabled={oabLoading || !oabQuery.trim()} className="gap-1.5 shrink-0" data-testid="button-buscar-oab">
                    {oabLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Buscar</span>
                  </Button>
                </div>

                {oabErro && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    <Info className="w-4 h-4 shrink-0" />
                    {oabErro}
                  </div>
                )}

                {oabResultados.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">{oabResultados.length} resultado(s)</p>
                    {oabResultados.map((r, i) => (
                      <div key={i} className="border rounded-lg p-3 space-y-1 text-sm" data-testid={`card-oab-${i}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.Nome || r.nome || r.name || "—"}</p>
                            <div className="flex gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                              {(r.Inscricao || r.inscricao || r.NumeroInscricao) && (
                                <span className="font-mono">OAB nº {r.Inscricao || r.inscricao || r.NumeroInscricao}</span>
                              )}
                              {(r.UF || r.uf) && <span>{r.UF || r.uf}</span>}
                              {(r.SubSeccional || r.subSeccional) && <span>{r.SubSeccional || r.subSeccional}</span>}
                            </div>
                          </div>
                          {(r.Situacao || r.situacao) && (
                            <Badge variant={(r.Situacao || r.situacao) === "Regular" ? "secondary" : "outline"} className="text-xs shrink-0">
                              {r.Situacao || r.situacao}
                            </Badge>
                          )}
                        </div>
                        {(r.TipoInscricao || r.tipoInscricao) && (
                          <p className="text-xs text-muted-foreground">{r.TipoInscricao || r.tipoInscricao}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Busca por Processo (DataJud) */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Busca por Processo
                  <Badge variant="outline" className="text-xs font-normal">DataJud / CNJ</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Consulta o DataJud do CNJ. Informe o número do processo e o tribunal.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2">
                    <Input
                      value={procNumero}
                      onChange={(e) => setProcNumero(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && buscarProcesso()}
                      placeholder="Ex: 6002755-35.2024.4.06.3819"
                      className="font-mono"
                      data-testid="input-processo-numero"
                    />
                  </div>
                  <div>
                    <select
                      value={procTribunal}
                      onChange={(e) => setProcTribunal(e.target.value)}
                      className="border rounded-md px-2 text-sm bg-background h-10 w-full"
                      data-testid="select-processo-tribunal"
                    >
                      {TRIBUNAIS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                </div>
                <Button
                  onClick={buscarProcesso}
                  disabled={procLoading || !procNumero.trim()}
                  className="gap-1.5"
                  data-testid="button-buscar-processo"
                >
                  {procLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  {procLoading ? "Consultando DataJud..." : "Consultar processo"}
                </Button>

                {procErro && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground p-3 bg-muted rounded-lg">
                    <Info className="w-4 h-4 shrink-0" />
                    {procErro}
                  </div>
                )}

                {procResultados.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{procResultados.length} resultado(s)</p>
                    {procResultados.map((p, i) => (
                      <div key={i} className="border rounded-lg p-3 space-y-2 text-sm" data-testid={`card-processo-${i}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-mono font-medium text-sm">{p.numeroProcesso || "—"}</p>
                          {p.nivelSigilo === 0 && <Badge variant="secondary" className="text-xs">Público</Badge>}
                        </div>
                        {p.classe?.nome && (
                          <p className="text-xs font-medium text-primary">{p.classe.nome}</p>
                        )}
                        {p.assuntos?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {p.assuntos.slice(0, 3).map((a: any, j: number) => (
                              <Badge key={j} variant="outline" className="text-xs">{a.nome}</Badge>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {p.tribunal && <span>Tribunal: <span className="text-foreground">{p.tribunal}</span></span>}
                          {p.orgaoJulgador?.nome && <span>Órgão: <span className="text-foreground">{p.orgaoJulgador.nome}</span></span>}
                          {p.dataAjuizamento && <span>Ajuizamento: <span className="text-foreground">{new Date(p.dataAjuizamento).toLocaleDateString("pt-BR")}</span></span>}
                          {p.ultimaMovimento?.dataHora && <span>Último mov.: <span className="text-foreground">{new Date(p.ultimaMovimento.dataHora).toLocaleDateString("pt-BR")}</span></span>}
                        </div>
                        {p.ultimaMovimento?.nome && (
                          <div className="text-xs bg-muted rounded p-2">
                            <span className="text-muted-foreground">Último movimento: </span>
                            {p.ultimaMovimento.nome}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Configurações ─────────────────────────────────────────────────── */}
        {tab === "configuracoes" && (
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="w-4 h-4 text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Deixe em branco os campos que ainda não tem. Pode preencher e salvar a qualquer momento.
              </p>
            </div>

            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">API DJEN / CNJ</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Token JWT (opcional — deixe vazio para usar a chave PEM)</label>
                  <Input
                    value={cfg.djenToken}
                    onChange={(e) => setCfg((p) => ({ ...p, djenToken: e.target.value }))}
                    placeholder="eyJhbGciOiJSUzI1NiJ9..."
                    data-testid="input-djen-token"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Gere via: <code className="text-xs bg-muted px-1 rounded">node gen_pjud.js --key chave_privada.pem --sub SEU_CPF</code>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">CPF do advogado (11 dígitos)</label>
                    <Input
                      value={cfg.advogadoCpf}
                      onChange={(e) => setCfg((p) => ({ ...p, advogadoCpf: e.target.value }))}
                      placeholder="09494128648"
                      maxLength={11}
                      data-testid="input-advogado-cpf"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Nome completo do advogado</label>
                    <Input
                      value={cfg.advogadoNome}
                      onChange={(e) => setCfg((p) => ({ ...p, advogadoNome: e.target.value }))}
                      placeholder="Maikon da Rocha Caldeira"
                      data-testid="input-advogado-nome"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Issuer (iss)</label>
                    <Input
                      value={cfg.jwtIssuer}
                      onChange={(e) => setCfg((p) => ({ ...p, jwtIssuer: e.target.value }))}
                      placeholder="pdpj-br"
                      data-testid="input-jwt-issuer"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Valor registrado no PDPJ. Padrão: <code className="bg-muted px-1 rounded">pdpj-br</code></p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Audience (aud)</label>
                    <Input
                      value={cfg.jwtAudience}
                      onChange={(e) => setCfg((p) => ({ ...p, jwtAudience: e.target.value }))}
                      placeholder="https://comunicaapi.pje.jus.br"
                      data-testid="input-jwt-audience"
                    />
                    <p className="text-xs text-muted-foreground mt-1">URL da API alvo. Para DJEN use o padrão.</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Máx. páginas por consulta</label>
                    <Input
                      type="number"
                      value={cfg.maxPaginas}
                      onChange={(e) => setCfg((p) => ({ ...p, maxPaginas: parseInt(e.target.value) || 5 }))}
                      min={1} max={20}
                      data-testid="input-max-paginas"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Chave Privada PEM</label>
                  <div className="relative">
                    {showPem ? (
                      <Textarea
                        value={cfg.pdpjPemKey}
                        onChange={(e) => setCfg((p) => ({ ...p, pdpjPemKey: e.target.value }))}
                        placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...sua chave aqui...\n-----END RSA PRIVATE KEY-----"}
                        className="font-mono text-xs min-h-[100px]"
                        data-testid="input-pem-key"
                      />
                    ) : (
                      <Input
                        value={cfg.pdpjPemKey}
                        onChange={(e) => setCfg((p) => ({ ...p, pdpjPemKey: e.target.value }))}
                        type="password"
                        placeholder="Cole a chave PEM aqui..."
                        data-testid="input-pem-key-hidden"
                      />
                    )}
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowPem(!showPem)} type="button">
                      {showPem ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Arquivo <code className="bg-muted px-1 rounded text-xs">chave_privada.pem</code> registrada no PDPJ/CNJ
                  </p>
                </div>

                {/* Gerador de token para Swagger */}
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-sm font-medium">Gerar token para o Swagger</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gera um JWT válido com a chave PEM e CPF configurados. Cole no campo <strong>Authorization</strong> do Swagger para testar os endpoints.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={gerarToken}
                    disabled={gerandoToken || !cfg.pdpjPemKey || !cfg.advogadoCpf}
                    className="gap-1.5"
                    data-testid="button-gerar-token"
                  >
                    {gerandoToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    {gerandoToken ? "Gerando..." : "Gerar token JWT"}
                  </Button>
                  {tokenGerado && (
                    <div className="space-y-2">
                      <div className="relative">
                        <textarea
                          readOnly
                          value={`Bearer ${tokenGerado}`}
                          className="w-full text-xs font-mono bg-background border rounded p-2 pr-10 h-20 resize-none"
                          data-testid="textarea-token-gerado"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7"
                          onClick={copiarToken}
                          data-testid="button-copiar-token"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        ✓ Token gerado (válido por 1 hora). Copie e cole no Swagger em Authorization.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">Gmail (rascunhos automáticos)</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">E-mail da conta Gmail</label>
                    <Input
                      type="email"
                      value={cfg.emailLogin}
                      onChange={(e) => setCfg((p) => ({ ...p, emailLogin: e.target.value }))}
                      placeholder="seu_email@gmail.com"
                      data-testid="input-email-login"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Senha de app (não a senha normal)</label>
                    <div className="relative">
                      <Input
                        type={showSenha ? "text" : "password"}
                        value={cfg.emailSenha}
                        onChange={(e) => setCfg((p) => ({ ...p, emailSenha: e.target.value }))}
                        placeholder="xxxx xxxx xxxx xxxx"
                        data-testid="input-email-senha"
                      />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-0.5 h-7 w-7" onClick={() => setShowSenha(!showSenha)} type="button">
                        {showSenha ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Google → Segurança → Verificação em 2 etapas → Senhas de app
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">Servidor IMAP</label>
                    <Input
                      value={cfg.imapServer}
                      onChange={(e) => setCfg((p) => ({ ...p, imapServer: e.target.value }))}
                      placeholder="imap.gmail.com"
                      data-testid="input-imap-server"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-sm">Google Drive (opcional)</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="salvar-drive"
                    checked={cfg.salvarDrive}
                    onChange={(e) => setCfg((p) => ({ ...p, salvarDrive: e.target.checked }))}
                    className="w-4 h-4"
                    data-testid="checkbox-salvar-drive"
                  />
                  <label htmlFor="salvar-drive" className="text-sm cursor-pointer">Salvar PDFs no Google Drive</label>
                </div>
                {cfg.salvarDrive && (
                  <div>
                    <label className="text-xs font-medium mb-1 block">ID da pasta no Drive</label>
                    <Input
                      value={cfg.pastaDriveId}
                      onChange={(e) => setCfg((p) => ({ ...p, pastaDriveId: e.target.value }))}
                      placeholder="Cole o ID da pasta aqui (da URL do Google Drive)"
                      data-testid="input-pasta-drive"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Na URL do Drive: drive.google.com/drive/folders/<strong>ID_AQUI</strong>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={() => saveCfgMutation.mutate()}
              disabled={saveCfgMutation.isPending || !cfgLoaded}
              className="w-full sm:w-auto gap-2"
              data-testid="button-salvar-config"
            >
              {saveCfgMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Salvar configurações
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

