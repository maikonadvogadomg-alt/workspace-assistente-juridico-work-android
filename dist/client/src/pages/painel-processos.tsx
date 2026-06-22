import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ProcessoMonitorado } from "@shared/schema";
import {
  ArrowLeft,
  Plus,
  Search,
  Loader2,
  Gavel,
  Calendar,
  Building2,
  Clock,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Archive,
  RotateCcw,
  FileText,
  Tag,
} from "lucide-react";

function formatProcessoNumber(num: string): string {
  const c = num.replace(/\D/g, "");
  if (c.length === 20) {
    return `${c.slice(0,7)}-${c.slice(7,9)}.${c.slice(9,13)}.${c.slice(13,14)}.${c.slice(14,16)}.${c.slice(16,20)}`;
  }
  return num;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

const TRIBUNAIS_MAP: Record<string, string> = {
  "8.13": "TJMG", "8.26": "TJSP", "8.19": "TJRJ", "8.21": "TJRS", "8.16": "TJPR",
  "8.24": "TJSC", "8.05": "TJBA", "8.17": "TJPE", "8.06": "TJCE", "8.09": "TJGO",
  "8.07": "TJDFT", "8.15": "TJPB", "8.20": "TJRN", "8.11": "TJMT",
  "8.14": "TJPA", "8.25": "TJTO", "8.01": "TJAC", "8.04": "TJAM", "8.03": "TJAP",
  "8.22": "TJRO", "8.23": "TJRR", "8.10": "TJMS", "8.02": "TJAL", "8.08": "TJES",
  "8.18": "TJPI", "8.27": "TJSE", "8.12": "TJMA",
  "5.01": "TRF1", "5.02": "TRF2", "5.03": "TRF3", "5.04": "TRF4", "5.05": "TRF5", "5.06": "TRF6",
  "9": "STJ", "1": "STF",
};

function detectTribunal(numero: string): string {
  const c = numero.replace(/\D/g, "");
  if (c.length >= 20) {
    const j = c.slice(13, 14);
    const tr = c.slice(14, 16);
    const key = `${j}.${tr}`;
    if (TRIBUNAIS_MAP[key]) return TRIBUNAIS_MAP[key];
    if (TRIBUNAIS_MAP[j]) return TRIBUNAIS_MAP[j];
  }
  return "TJMG";
}

interface MovimentoData {
  dataHora: string;
  nome: string;
  codigo: string;
  complementos: Array<{ nome: string; valor: string; descricao?: string }>;
}

export default function PainelProcessos() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [novoNumero, setNovoNumero] = useState("");
  const [novoApelido, setNovoApelido] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [addMode, setAddMode] = useState<"numero" | "oab">("numero");
  const [novoOab, setNovoOab] = useState(() => localStorage.getItem("painel_oab") || "");
  const [oabUf, setOabUf] = useState(() => localStorage.getItem("painel_oab_uf") || "MG");
  const [oabTribunal, setOabTribunal] = useState(() => localStorage.getItem("painel_oab_tribunal") || "TJMG");
  const [oabResults, setOabResults] = useState<Array<{numero: string; classe: string; orgaoJulgador: string; dataAjuizamento: string; ultimaMovimentacao: string; ultimaMovimentacaoData: string; assuntos: Array<{nome: string}>; totalMovimentos: number}>>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movimentos, setMovimentos] = useState<Record<string, MovimentoData[]>>({});
  const [loadingMovimentos, setLoadingMovimentos] = useState<string | null>(null);
  const [editingApelido, setEditingApelido] = useState<string | null>(null);
  const [editApelidoValue, setEditApelidoValue] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "ativo" | "arquivado">("ativo");

  const { data: processos = [], isLoading } = useQuery<ProcessoMonitorado[]>({
    queryKey: ["/api/processos"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/processos/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
      toast({ title: "Processo removido" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/processos/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
    },
  });

  const searchByOab = async () => {
    const cleanOab = novoOab.replace(/\D/g, "");
    if (!cleanOab) {
      toast({ title: "Digite o numero da OAB", variant: "destructive" });
      return;
    }
    localStorage.setItem("painel_oab", novoOab);
    localStorage.setItem("painel_oab_uf", oabUf);
    localStorage.setItem("painel_oab_tribunal", oabTribunal);
    setIsSearching(true);
    setOabResults([]);
    try {
      const res = await fetch("/api/datajud/consulta-oab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oab: cleanOab, uf: oabUf, tribunal: oabTribunal }),
      });
      const data = await res.json();
      if (!res.ok || !data.found || data.processos.length === 0) {
        toast({ title: "Nenhum resultado", description: data.message || "Nenhum processo encontrado para esta OAB neste tribunal.", variant: "destructive" });
        return;
      }
      setOabResults(data.processos);
      toast({ title: `${data.total} processo(s) encontrado(s)` });
    } catch (error: any) {
      toast({ title: "Erro: " + error.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const addFromOabResult = async (p: typeof oabResults[0]) => {
    try {
      const existing = processos.find(ep => ep.numero.replace(/\D/g, "") === p.numero.replace(/\D/g, ""));
      if (existing) {
        toast({ title: "Processo ja esta no painel", variant: "destructive" });
        return;
      }
      const createRes = await apiRequest("POST", "/api/processos", {
        numero: p.numero,
        tribunal: oabTribunal,
        apelido: "",
        classe: p.classe || "",
        orgaoJulgador: p.orgaoJulgador || "",
        dataAjuizamento: p.dataAjuizamento || "",
        ultimaMovimentacao: p.ultimaMovimentacao || "",
        ultimaMovimentacaoData: p.ultimaMovimentacaoData || "",
        assuntos: p.assuntos.map((a: any) => a.nome).join("; "),
      });
      if (createRes.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
        toast({ title: "Processo adicionado!" });
      }
    } catch (error: any) {
      toast({ title: "Erro: " + error.message, variant: "destructive" });
    }
  };

  const addAllFromOab = async () => {
    let added = 0;
    for (const p of oabResults) {
      const existing = processos.find(ep => ep.numero.replace(/\D/g, "") === p.numero.replace(/\D/g, ""));
      if (existing) continue;
      try {
        await apiRequest("POST", "/api/processos", {
          numero: p.numero,
          tribunal: oabTribunal,
          apelido: "",
          classe: p.classe || "",
          orgaoJulgador: p.orgaoJulgador || "",
          dataAjuizamento: p.dataAjuizamento || "",
          ultimaMovimentacao: p.ultimaMovimentacao || "",
          ultimaMovimentacaoData: p.ultimaMovimentacaoData || "",
          assuntos: p.assuntos.map((a: any) => a.nome).join("; "),
        });
        added++;
      } catch {}
    }
    queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
    toast({ title: `${added} processo(s) adicionado(s) ao painel` });
    setOabResults([]);
  };

  const addProcesso = async () => {
    const cleanNum = novoNumero.replace(/\D/g, "");
    if (cleanNum.length !== 20) {
      toast({ title: "Numero CNJ deve ter 20 digitos", variant: "destructive" });
      return;
    }

    setIsSearching(true);
    try {
      const tribunal = detectTribunal(cleanNum);
      const searchRes = await fetch("/api/datajud/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ numero: cleanNum, tribunal }),
      });
      const searchData = await searchRes.json();

      if (!searchRes.ok || !searchData.found) {
        toast({ title: searchData.message || "Processo nao encontrado no DataJud", variant: "destructive" });
        setIsSearching(false);
        return;
      }

      const p = searchData.data;
      const movs = p.movimentos || [];
      const lastMov = movs.length > 0 ? movs[0] : null;

      const createRes = await apiRequest("POST", "/api/processos", {
        numero: p.numero || cleanNum,
        tribunal,
        apelido: novoApelido.trim(),
        classe: p.classe || "",
        orgaoJulgador: p.orgaoJulgador || "",
        dataAjuizamento: p.dataAjuizamento || "",
        ultimaMovimentacao: lastMov ? lastMov.nome : "",
        ultimaMovimentacaoData: lastMov ? lastMov.dataHora : "",
        assuntos: (p.assuntos || []).map((a: any) => a.nome).join("; "),
      });

      if (createRes.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
        toast({ title: "Processo adicionado ao painel!" });
        setNovoNumero("");
        setNovoApelido("");
        setShowAddForm(false);
      }
    } catch (error: any) {
      toast({ title: "Erro ao adicionar processo: " + error.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const refreshProcesso = async (processo: ProcessoMonitorado) => {
    setLoadingMovimentos(processo.id);
    try {
      const res = await fetch("/api/datajud/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ numero: processo.numero.replace(/\D/g, ""), tribunal: processo.tribunal }),
      });
      const data = await res.json();
      if (data.found && data.data) {
        const p = data.data;
        const movs = p.movimentos || [];
        const lastMov = movs.length > 0 ? movs[0] : null;
        setMovimentos(prev => ({ ...prev, [processo.id]: movs }));

        await apiRequest("PATCH", `/api/processos/${processo.id}`, {
          ultimaMovimentacao: lastMov ? lastMov.nome : processo.ultimaMovimentacao,
          ultimaMovimentacaoData: lastMov ? lastMov.dataHora : processo.ultimaMovimentacaoData,
          classe: p.classe || processo.classe,
          orgaoJulgador: p.orgaoJulgador || processo.orgaoJulgador,
          assuntos: (p.assuntos || []).map((a: any) => a.nome).join("; ") || processo.assuntos,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/processos"] });
        toast({ title: `${movs.length} andamentos carregados` });
      }
    } catch (error: any) {
      toast({ title: "Erro ao atualizar: " + error.message, variant: "destructive" });
    } finally {
      setLoadingMovimentos(null);
    }
  };

  const toggleExpand = async (processo: ProcessoMonitorado) => {
    if (expandedId === processo.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(processo.id);
    if (!movimentos[processo.id]) {
      await refreshProcesso(processo);
    }
  };

  const saveApelido = async (id: string) => {
    await updateMutation.mutateAsync({ id, data: { apelido: editApelidoValue } });
    setEditingApelido(null);
    toast({ title: "Apelido atualizado" });
  };

  const toggleStatus = async (processo: ProcessoMonitorado) => {
    const newStatus = processo.status === "ativo" ? "arquivado" : "ativo";
    await updateMutation.mutateAsync({ id: processo.id, data: { status: newStatus } });
    toast({ title: newStatus === "arquivado" ? "Processo arquivado" : "Processo reativado" });
  };

  const copyAllData = (processo: ProcessoMonitorado) => {
    const movs = movimentos[processo.id] || [];
    let text = `PROCESSO: ${formatProcessoNumber(processo.numero)}\n`;
    text += `Tribunal: ${processo.tribunal}\n`;
    if (processo.apelido) text += `Apelido: ${processo.apelido}\n`;
    text += `Classe: ${processo.classe}\n`;
    text += `Orgao Julgador: ${processo.orgaoJulgador}\n`;
    text += `Data Ajuizamento: ${formatDate(processo.dataAjuizamento)}\n`;
    if (processo.assuntos) text += `Assuntos: ${processo.assuntos}\n`;
    if (movs.length > 0) {
      text += `\n--- ANDAMENTOS (${movs.length}) ---\n`;
      movs.forEach((m, i) => {
        text += `\n${i + 1}. [${formatDateTime(m.dataHora)}] ${m.nome}`;
        if (m.complementos?.length > 0) {
          m.complementos.forEach(c => {
            text += `\n   ${c.nome}: ${c.valor || c.descricao || ""}`;
          });
        }
      });
    }
    navigator.clipboard.writeText(text);
    toast({ title: "Dados copiados!" });
  };

  const filtered = processos.filter(p => filterStatus === "todos" || p.status === filterStatus);
  const ativos = processos.filter(p => p.status === "ativo").length;
  const arquivados = processos.filter(p => p.status === "arquivado").length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 p-3 max-w-4xl mx-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="link-back-home">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Gavel className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">Painel de Processos</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="default" data-testid="badge-ativos">{ativos} ativo{ativos !== 1 ? "s" : ""}</Badge>
            <Badge variant="secondary" data-testid="badge-arquivados">{arquivados} arquivado{arquivados !== 1 ? "s" : ""}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border">
              <Button
                variant={filterStatus === "ativo" ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
                onClick={() => setFilterStatus("ativo")}
                data-testid="filter-ativos"
              >Ativos</Button>
              <Button
                variant={filterStatus === "arquivado" ? "default" : "ghost"}
                size="sm"
                className="rounded-none border-x"
                onClick={() => setFilterStatus("arquivado")}
                data-testid="filter-arquivados"
              >Arquivados</Button>
              <Button
                variant={filterStatus === "todos" ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
                onClick={() => setFilterStatus("todos")}
                data-testid="filter-todos"
              >Todos</Button>
            </div>
            <Button
              data-testid="button-add-processo"
              onClick={() => setShowAddForm(!showAddForm)}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Adicionar
            </Button>
          </div>
        </div>

        {showAddForm && (
          <Card className="p-4 space-y-3 border-primary/30">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={addMode === "numero" ? "default" : "outline"}
                onClick={() => { setAddMode("numero"); setOabResults([]); }}
                data-testid="button-add-por-numero"
              >Por Numero</Button>
              <Button
                size="sm"
                variant={addMode === "oab" ? "default" : "outline"}
                onClick={() => setAddMode("oab")}
                data-testid="button-add-por-oab"
              >Por OAB</Button>
            </div>

            {addMode === "numero" ? (
              <>
                <Input
                  data-testid="input-novo-numero"
                  placeholder="0000000-00.0000.0.00.0000"
                  value={novoNumero}
                  onChange={(e) => setNovoNumero(e.target.value)}
                  className="font-mono"
                />
                <Input
                  data-testid="input-novo-apelido"
                  placeholder="Apelido (ex: Caso Sicoob, Divorcio Maria...)"
                  value={novoApelido}
                  onChange={(e) => setNovoApelido(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button data-testid="button-confirm-add" onClick={addProcesso} disabled={isSearching} className="flex-1">
                    {isSearching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Buscando...</> : <><Search className="w-4 h-4 mr-1" />Buscar e Adicionar</>}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddForm(false); setOabResults([]); }} data-testid="button-cancel-add">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Numero da OAB</label>
                    <Input
                      data-testid="input-oab-painel"
                      placeholder="183712"
                      value={novoOab}
                      onChange={(e) => setNovoOab(e.target.value)}
                      className="font-mono text-lg"
                    />
                  </div>
                  <div className="w-20">
                    <label className="text-xs text-muted-foreground mb-1 block">UF</label>
                    <select
                      value={oabUf}
                      onChange={(e) => setOabUf(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm font-mono"
                      data-testid="select-oab-uf-painel"
                    >
                      <option value="AC">AC</option><option value="AL">AL</option><option value="AM">AM</option>
                      <option value="AP">AP</option><option value="BA">BA</option><option value="CE">CE</option>
                      <option value="DF">DF</option><option value="ES">ES</option><option value="GO">GO</option>
                      <option value="MA">MA</option><option value="MG">MG</option><option value="MS">MS</option>
                      <option value="MT">MT</option><option value="PA">PA</option><option value="PB">PB</option>
                      <option value="PE">PE</option><option value="PI">PI</option><option value="PR">PR</option>
                      <option value="RJ">RJ</option><option value="RN">RN</option><option value="RO">RO</option>
                      <option value="RR">RR</option><option value="RS">RS</option><option value="SC">SC</option>
                      <option value="SE">SE</option><option value="SP">SP</option><option value="TO">TO</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tribunal</label>
                  <select
                    value={oabTribunal}
                    onChange={(e) => setOabTribunal(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    data-testid="select-oab-tribunal"
                  >
                    <option value="TJMG">TJMG - Minas Gerais</option>
                    <option value="TJSP">TJSP - Sao Paulo</option>
                    <option value="TJRJ">TJRJ - Rio de Janeiro</option>
                    <option value="TJRS">TJRS - Rio Grande do Sul</option>
                    <option value="TJPR">TJPR - Parana</option>
                    <option value="TJBA">TJBA - Bahia</option>
                    <option value="TJDFT">TJDFT - Distrito Federal</option>
                    <option value="TRF1">TRF1 - 1a Regiao</option>
                    <option value="TRF6">TRF6 - 6a Regiao</option>
                    <option value="STJ">STJ</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button data-testid="button-search-oab" onClick={searchByOab} disabled={isSearching} className="flex-1">
                    {isSearching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Buscando...</> : <><Search className="w-4 h-4 mr-1" />Buscar Processos pela OAB</>}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowAddForm(false); setOabResults([]); }} data-testid="button-cancel-add">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}

            {oabResults.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{oabResults.length} processo(s) encontrado(s)</p>
                  <Button size="sm" onClick={addAllFromOab} data-testid="button-add-all-oab">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Adicionar Todos
                  </Button>
                </div>
                {oabResults.map((p, i) => {
                  const alreadyAdded = processos.some(ep => ep.numero.replace(/\D/g, "") === p.numero.replace(/\D/g, ""));
                  return (
                    <div key={i} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50 text-sm" data-testid={`oab-result-${i}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs text-primary">{formatProcessoNumber(p.numero)}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.classe} - {p.orgaoJulgador}</p>
                      </div>
                      {alreadyAdded ? (
                        <Badge variant="secondary" className="text-xs flex-shrink-0">Ja adicionado</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => addFromOabResult(p)} className="flex-shrink-0" data-testid={`button-add-oab-${i}`}>
                          <Plus className="w-3 h-3 mr-1" />
                          Adicionar
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Gavel className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {processos.length === 0
                ? "Nenhum processo monitorado. Clique em 'Adicionar' para comecar."
                : `Nenhum processo ${filterStatus === "ativo" ? "ativo" : "arquivado"}.`}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((processo) => (
              <Card
                key={processo.id}
                className={`overflow-hidden transition-all ${processo.status === "arquivado" ? "opacity-60" : ""}`}
                data-testid={`card-processo-${processo.id}`}
              >
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {editingApelido === processo.id ? (
                        <div className="flex items-center gap-2 mb-1">
                          <Input
                            value={editApelidoValue}
                            onChange={(e) => setEditApelidoValue(e.target.value)}
                            className="h-7 text-sm"
                            placeholder="Apelido do processo"
                            autoFocus
                            data-testid="input-edit-apelido"
                          />
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveApelido(processo.id)} data-testid="button-save-apelido">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingApelido(null)} data-testid="button-cancel-apelido">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mb-1">
                          {processo.apelido ? (
                            <span className="font-bold text-base" data-testid={`text-apelido-${processo.id}`}>{processo.apelido}</span>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => { setEditingApelido(processo.id); setEditApelidoValue(processo.apelido || ""); }}
                            data-testid={`button-edit-apelido-${processo.id}`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                      <p className="font-mono text-sm text-primary" data-testid={`text-numero-${processo.id}`}>
                        {formatProcessoNumber(processo.numero)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Badge variant={processo.status === "ativo" ? "default" : "secondary"} className="text-xs">
                        {processo.tribunal}
                      </Badge>
                    </div>
                  </div>

                  {processo.classe && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{processo.classe}</span>
                    </div>
                  )}

                  {processo.orgaoJulgador && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{processo.orgaoJulgador}</span>
                    </div>
                  )}

                  {processo.assuntos && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Tag className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{processo.assuntos}</span>
                    </div>
                  )}

                  {processo.dataAjuizamento && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Ajuizado em {formatDate(processo.dataAjuizamento)}</span>
                    </div>
                  )}

                  {processo.ultimaMovimentacao && (
                    <div className="mt-2 p-2 rounded bg-muted/50">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Clock className="w-3 h-3" />
                        Ultima movimentacao: {formatDateTime(processo.ultimaMovimentacaoData)}
                      </div>
                      <p className="text-sm">{processo.ultimaMovimentacao}</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1 pt-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpand(processo)}
                      data-testid={`button-expand-${processo.id}`}
                    >
                      {loadingMovimentos === processo.id ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      ) : expandedId === processo.id ? (
                        <ChevronUp className="w-3.5 h-3.5 mr-1" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 mr-1" />
                      )}
                      Andamentos {movimentos[processo.id] ? `(${movimentos[processo.id].length})` : ""}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshProcesso(processo)}
                      disabled={loadingMovimentos === processo.id}
                      data-testid={`button-refresh-${processo.id}`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loadingMovimentos === processo.id ? "animate-spin" : ""}`} />
                      Atualizar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyAllData(processo)}
                      data-testid={`button-copy-${processo.id}`}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleStatus(processo)}
                      data-testid={`button-archive-${processo.id}`}
                    >
                      {processo.status === "ativo" ? (
                        <><Archive className="w-3.5 h-3.5 mr-1" /> Arquivar</>
                      ) : (
                        <><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reativar</>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Remover este processo do painel?")) {
                          deleteMutation.mutate(processo.id);
                        }
                      }}
                      data-testid={`button-delete-${processo.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {expandedId === processo.id && movimentos[processo.id] && (
                  <div className="border-t bg-muted/30 p-4 space-y-2 max-h-96 overflow-y-auto">
                    <h4 className="text-sm font-medium mb-2">
                      Andamentos ({movimentos[processo.id].length})
                    </h4>
                    {movimentos[processo.id].map((mov, idx) => (
                      <div key={idx} className="text-sm border-l-2 border-primary/30 pl-3 py-1">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatDateTime(mov.dataHora)}
                          {mov.codigo && <Badge variant="outline" className="text-xs py-0">{mov.codigo}</Badge>}
                        </div>
                        <p className="mt-0.5">{mov.nome}</p>
                        {mov.complementos?.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {mov.complementos.map((c, ci) => (
                              <p key={ci} className="text-xs text-muted-foreground pl-2">
                                {c.nome}: {c.valor || c.descricao || ""}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        <Card className="p-3">
          <p className="text-xs text-muted-foreground text-center">
            Dados fornecidos pela API publica DataJud/CNJ. Consulta gratuita e sem limite.
            Para consultar um processo avulso, use a{" "}
            <Link href="/consulta" className="text-primary underline">Consulta Processual</Link>.
          </p>
        </Card>
      </main>
    </div>
  );
}
