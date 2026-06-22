import { useState, useCallback } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, Gavel, ArrowLeft, Calendar, Building2, FileText, Tag, Clock, ChevronDown, ChevronUp, Copy, Loader2 } from "lucide-react";

interface Movimento {
  dataHora: string;
  nome: string;
  codigo: string;
  complementos: Array<{ nome: string; valor: string; descricao?: string }>;
}

interface ProcessoData {
  numero: string;
  classe: string;
  classeCode: string;
  sistema: string;
  formato: string;
  orgaoJulgador: string;
  codigoOrgao: string;
  municipio: string;
  dataAjuizamento: string;
  dataUltimaAtualizacao: string;
  grau: string;
  nivelSigilo: number;
  assuntos: Array<{ nome: string; codigo: string }>;
  movimentos: Movimento[];
}

const TRIBUNAIS_POPULARES = [
  { sigla: "auto", label: "Detectar automaticamente" },
  { sigla: "TJMG", label: "TJMG - Minas Gerais" },
  { sigla: "TJSP", label: "TJSP - Sao Paulo" },
  { sigla: "TJRJ", label: "TJRJ - Rio de Janeiro" },
  { sigla: "TJBA", label: "TJBA - Bahia" },
  { sigla: "TJPR", label: "TJPR - Parana" },
  { sigla: "TJRS", label: "TJRS - Rio Grande do Sul" },
  { sigla: "TJSC", label: "TJSC - Santa Catarina" },
  { sigla: "TJGO", label: "TJGO - Goias" },
  { sigla: "TJDFT", label: "TJDFT - Distrito Federal" },
  { sigla: "TJCE", label: "TJCE - Ceara" },
  { sigla: "TJPE", label: "TJPE - Pernambuco" },
  { sigla: "TJMA", label: "TJMA - Maranhao" },
  { sigla: "TJPA", label: "TJPA - Para" },
  { sigla: "TJES", label: "TJES - Espirito Santo" },
  { sigla: "TJMT", label: "TJMT - Mato Grosso" },
  { sigla: "TJMS", label: "TJMS - Mato Grosso do Sul" },
  { sigla: "TJAL", label: "TJAL - Alagoas" },
  { sigla: "TJSE", label: "TJSE - Sergipe" },
  { sigla: "TJPB", label: "TJPB - Paraiba" },
  { sigla: "TJRN", label: "TJRN - Rio Grande do Norte" },
  { sigla: "TJPI", label: "TJPI - Piaui" },
  { sigla: "TJTO", label: "TJTO - Tocantins" },
  { sigla: "TJAC", label: "TJAC - Acre" },
  { sigla: "TJAM", label: "TJAM - Amazonas" },
  { sigla: "TJAP", label: "TJAP - Amapa" },
  { sigla: "TJRO", label: "TJRO - Rondonia" },
  { sigla: "TJRR", label: "TJRR - Roraima" },
  { sigla: "TRF1", label: "TRF1 - 1a Regiao" },
  { sigla: "TRF2", label: "TRF2 - 2a Regiao" },
  { sigla: "TRF3", label: "TRF3 - 3a Regiao" },
  { sigla: "TRF4", label: "TRF4 - 4a Regiao" },
  { sigla: "TRF5", label: "TRF5 - 5a Regiao" },
  { sigla: "TRF6", label: "TRF6 - 6a Regiao" },
  { sigla: "STJ", label: "STJ - Superior Tribunal de Justica" },
  { sigla: "STF", label: "STF - Supremo Tribunal Federal" },
  { sigla: "TST", label: "TST - Tribunal Superior do Trabalho" },
];

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return dateStr; }
}

function formatDateShort(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return dateStr; }
}

function formatProcessoNumber(num: string): string {
  const c = num.replace(/\D/g, "");
  if (c.length === 20) {
    return `${c.slice(0,7)}-${c.slice(7,9)}.${c.slice(9,13)}.${c.slice(13,14)}.${c.slice(14,16)}.${c.slice(16,20)}`;
  }
  return num;
}

interface ProcessoOabResult {
  numero: string;
  classe: string;
  orgaoJulgador: string;
  dataAjuizamento: string;
  dataUltimaAtualizacao: string;
  assuntos: Array<{ nome: string; codigo: string }>;
  ultimaMovimentacao: string;
  ultimaMovimentacaoData: string;
  totalMovimentos: number;
}

export default function ConsultaProcessual() {
  const [numero, setNumero] = useState("");
  const [tribunal, setTribunal] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [processo, setProcesso] = useState<ProcessoData | null>(null);
  const [tribunalDetectado, setTribunalDetectado] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [modoBusca, setModoBusca] = useState<"processo" | "oab">("processo");
  const [oab, setOab] = useState(() => localStorage.getItem("consulta_oab") || "");
  const [oabUf, setOabUf] = useState(() => localStorage.getItem("consulta_oab_uf") || "MG");
  const [resultadosOab, setResultadosOab] = useState<ProcessoOabResult[]>([]);
  const [tribunalOab, setTribunalOab] = useState(() => localStorage.getItem("consulta_tribunal_oab") || "TJMG");
  const { toast } = useToast();

  const consultar = useCallback(async () => {
    const cleanNum = numero.replace(/[.\-\s]/g, "");
    if (!cleanNum || cleanNum.length < 15) {
      toast({ title: "Numero invalido", description: "Digite o numero completo do processo (formato CNJ).", variant: "destructive" });
      return;
    }
    setLoading(true);
    setProcesso(null);
    setNotFound(false);
    setErrorMsg("");
    setShowAll(false);
    setResultadosOab([]);
    try {
      const body: any = { numeroProcesso: cleanNum };
      if (tribunal !== "auto") body.tribunal = tribunal;
      const res = await fetch("/api/datajud/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Erro ao consultar");
        return;
      }
      if (!data.found) {
        setNotFound(true);
        return;
      }
      setProcesso(data.processo);
      setTribunalDetectado(data.tribunal);
    } catch (err: any) {
      setErrorMsg("Erro de conexao: " + (err.message || "tente novamente"));
    } finally {
      setLoading(false);
    }
  }, [numero, tribunal, toast]);

  const consultarOab = useCallback(async () => {
    const cleanOab = oab.replace(/\D/g, "");
    if (!cleanOab) {
      toast({ title: "OAB invalida", description: "Digite o numero da sua OAB.", variant: "destructive" });
      return;
    }
    if (!tribunalOab || tribunalOab === "auto") {
      toast({ title: "Selecione o tribunal", description: "Para busca por OAB, selecione o tribunal.", variant: "destructive" });
      return;
    }
    localStorage.setItem("consulta_oab", oab);
    localStorage.setItem("consulta_oab_uf", oabUf);
    localStorage.setItem("consulta_tribunal_oab", tribunalOab);
    setLoading(true);
    setProcesso(null);
    setNotFound(false);
    setErrorMsg("");
    setResultadosOab([]);
    try {
      const res = await fetch("/api/datajud/consulta-oab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oab: cleanOab, uf: oabUf, tribunal: tribunalOab }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Erro ao consultar");
        return;
      }
      if (!data.found || data.processos.length === 0) {
        setNotFound(true);
        if (data.message) {
          setErrorMsg(data.message);
          setNotFound(false);
        }
        return;
      }
      setResultadosOab(data.processos);
      setTribunalDetectado(data.tribunal);
      toast({ title: `${data.total} processo(s) encontrado(s)` });
    } catch (err: any) {
      setErrorMsg("Erro de conexao: " + (err.message || "tente novamente"));
    } finally {
      setLoading(false);
    }
  }, [oab, tribunalOab, toast]);

  const verProcessoOab = useCallback(async (num: string) => {
    setModoBusca("processo");
    setNumero(num);
    setLoading(true);
    setProcesso(null);
    setNotFound(false);
    setErrorMsg("");
    setShowAll(false);
    setResultadosOab([]);
    try {
      const cleanNum = num.replace(/[.\-\s]/g, "");
      const res = await fetch("/api/datajud/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroProcesso: cleanNum, tribunal: tribunalOab }),
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.message || "Erro ao consultar"); return; }
      if (!data.found) { setNotFound(true); return; }
      setProcesso(data.processo);
      setTribunalDetectado(data.tribunal);
    } catch (err: any) {
      setErrorMsg("Erro de conexao: " + (err.message || "tente novamente"));
    } finally {
      setLoading(false);
    }
  }, [tribunalOab]);

  const copyToClipboard = useCallback(() => {
    if (!processo) return;
    let text = `PROCESSO: ${formatProcessoNumber(processo.numero)}\n`;
    text += `TRIBUNAL: ${tribunalDetectado}\n`;
    text += `CLASSE: ${processo.classe}\n`;
    text += `ORGAO JULGADOR: ${processo.orgaoJulgador}\n`;
    text += `DATA AJUIZAMENTO: ${formatDateShort(processo.dataAjuizamento)}\n`;
    if (processo.assuntos.length > 0) {
      text += `ASSUNTOS: ${processo.assuntos.map(a => a.nome).join("; ")}\n`;
    }
    text += `\nANDAMENTOS (${processo.movimentos.length}):\n`;
    text += "=".repeat(60) + "\n";
    processo.movimentos.forEach(m => {
      text += `${formatDate(m.dataHora)} - ${m.nome}\n`;
      if (m.complementos && m.complementos.length > 0) {
        m.complementos.forEach(c => {
          text += `  ${c.nome}: ${c.valor || c.descricao || ""}\n`;
        });
      }
    });
    navigator.clipboard.writeText(text);
    toast({ title: "Copiado!", description: "Dados do processo copiados." });
  }, [processo, tribunalDetectado, toast]);

  const movimentosVisiveis = showAll ? processo?.movimentos : processo?.movimentos.slice(0, 30);

  return (
    <div className="min-h-screen bg-background" data-testid="page-consulta">
      <header className="px-3 py-2 border-b bg-card">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button size="sm" variant="ghost" className="gap-1" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
          </Link>
          <Search className="w-4 h-4 text-primary" />
          <h1 className="text-sm font-semibold">Consulta Processual</h1>
          <span className="text-xs text-muted-foreground ml-auto">DataJud/CNJ</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-3 space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gavel className="w-4 h-4" />
              Buscar Processo
            </CardTitle>
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant={modoBusca === "processo" ? "default" : "outline"}
                onClick={() => { setModoBusca("processo"); setResultadosOab([]); }}
                data-testid="button-modo-processo"
              >
                Por Numero
              </Button>
              <Button
                size="sm"
                variant={modoBusca === "oab" ? "default" : "outline"}
                onClick={() => { setModoBusca("oab"); setProcesso(null); }}
                data-testid="button-modo-oab"
              >
                Por OAB
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {modoBusca === "processo" ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Numero do processo (formato CNJ)</label>
                  <Input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="0000000-00.0000.0.00.0000"
                    className="font-mono"
                    data-testid="input-numero-processo"
                    onKeyDown={(e) => { if (e.key === "Enter") consultar(); }}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tribunal</label>
                  <Select value={tribunal} onValueChange={setTribunal}>
                    <SelectTrigger data-testid="select-tribunal">
                      <SelectValue placeholder="Selecione o tribunal" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TRIBUNAIS_POPULARES.map(t => (
                        <SelectItem key={t.sigla} value={t.sigla} data-testid={`option-tribunal-${t.sigla}`}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={consultar} disabled={loading} className="w-full" data-testid="button-consultar">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  {loading ? "Consultando..." : "Consultar"}
                </Button>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground mb-1 block">Numero da OAB</label>
                    <Input
                      value={oab}
                      onChange={(e) => setOab(e.target.value)}
                      placeholder="183712"
                      className="font-mono text-lg"
                      data-testid="input-oab"
                      onKeyDown={(e) => { if (e.key === "Enter") consultarOab(); }}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
                    <select
                      value={oabUf}
                      onChange={(e) => setOabUf(e.target.value)}
                      className="w-full h-10 rounded-md border border-input bg-background px-2 text-sm font-mono"
                      data-testid="select-oab-uf"
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
                  <Select value={tribunalOab} onValueChange={setTribunalOab}>
                    <SelectTrigger data-testid="select-tribunal-oab">
                      <SelectValue placeholder="Selecione o tribunal" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {TRIBUNAIS_POPULARES.filter(t => t.sigla !== "auto").map(t => (
                        <SelectItem key={t.sigla} value={t.sigla} data-testid={`option-tribunal-oab-${t.sigla}`}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={consultarOab} disabled={loading} className="w-full" data-testid="button-consultar-oab">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                  {loading ? "Buscando processos..." : "Buscar Meus Processos"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Busca processos vinculados a OAB no tribunal selecionado (sujeito a disponibilidade dos dados no DataJud)
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {errorMsg && (
          <Card className="border-destructive">
            <CardContent className="p-4 text-destructive text-sm" data-testid="text-error">
              {errorMsg}
            </CardContent>
          </Card>
        )}

        {notFound && (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground" data-testid="text-not-found">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Processo nao encontrado no DataJud.</p>
              <p className="text-xs mt-1">Verifique o numero e o tribunal. Processos sigilosos nao aparecem.</p>
            </CardContent>
          </Card>
        )}

        {processo && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Dados do Processo
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-1" data-testid="button-copy-dados">
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Gavel className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Processo</div>
                      <div className="font-mono font-medium" data-testid="text-numero-processo">{formatProcessoNumber(processo.numero)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Tribunal</div>
                      <div data-testid="text-tribunal">{tribunalDetectado}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Classe</div>
                      <div data-testid="text-classe">{processo.classe}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Orgao Julgador</div>
                      <div data-testid="text-orgao">{processo.orgaoJulgador}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Data Ajuizamento</div>
                      <div data-testid="text-data-ajuizamento">{formatDateShort(processo.dataAjuizamento)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Ultima Atualizacao</div>
                      <div data-testid="text-ultima-atualizacao">{formatDate(processo.dataUltimaAtualizacao)}</div>
                    </div>
                  </div>
                  {processo.grau && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Grau</div>
                        <div>{processo.grau}</div>
                      </div>
                    </div>
                  )}
                  {processo.sistema && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Sistema</div>
                        <div>{processo.sistema}</div>
                      </div>
                    </div>
                  )}
                </div>
                {processo.assuntos.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-xs text-muted-foreground mb-1">Assuntos</div>
                    <div className="flex flex-wrap gap-1">
                      {processo.assuntos.map((a, i) => (
                        <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded" data-testid={`tag-assunto-${i}`}>
                          {a.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Andamentos ({processo.movimentos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {processo.movimentos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum andamento registrado.</p>
                ) : (
                  <div className="space-y-0" data-testid="list-andamentos">
                    {movimentosVisiveis?.map((m, i) => (
                      <div
                        key={i}
                        className={`flex gap-3 py-2 ${i > 0 ? "border-t" : ""}`}
                        data-testid={`andamento-${i}`}
                      >
                        <div className="shrink-0 text-xs text-muted-foreground w-[90px] pt-0.5 font-mono">
                          {formatDate(m.dataHora).split(",")[0] || formatDate(m.dataHora).substring(0, 10)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">{m.nome}</div>
                          {m.complementos && m.complementos.length > 0 && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {m.complementos.map((c, ci) => (
                                <span key={ci}>
                                  {c.nome}: {c.valor || c.descricao || ""}
                                  {ci < m.complementos.length - 1 ? " | " : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {processo.movimentos.length > 30 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => setShowAll(!showAll)}
                        data-testid="button-toggle-andamentos"
                      >
                        {showAll ? (
                          <><ChevronUp className="w-4 h-4 mr-1" /> Mostrar menos</>
                        ) : (
                          <><ChevronDown className="w-4 h-4 mr-1" /> Ver todos ({processo.movimentos.length} andamentos)</>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <p className="text-xs text-center text-muted-foreground pb-4">
              Fonte: API Publica DataJud - Conselho Nacional de Justica (CNJ). Dados de processos publicos.
            </p>
          </>
        )}

        {resultadosOab.length > 0 && (
          <div className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  {resultadosOab.length} processo(s) encontrado(s) - OAB {oab} ({tribunalDetectado})
                </CardTitle>
              </CardHeader>
            </Card>
            {resultadosOab.map((p, i) => (
              <Card key={i} className="cursor-pointer hover:border-primary/50 transition-colors" data-testid={`card-oab-processo-${i}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-primary font-medium">{formatProcessoNumber(p.numero)}</p>
                      {p.classe && <p className="text-sm text-muted-foreground">{p.classe}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => verProcessoOab(p.numero)}
                      data-testid={`button-ver-processo-${i}`}
                    >
                      <Search className="w-3.5 h-3.5 mr-1" />
                      Ver
                    </Button>
                  </div>
                  {p.orgaoJulgador && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Building2 className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{p.orgaoJulgador}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    {p.dataAjuizamento && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateShort(p.dataAjuizamento)}
                      </span>
                    )}
                    {p.totalMovimentos > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {p.totalMovimentos} movimentos
                      </span>
                    )}
                  </div>
                  {p.assuntos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.assuntos.slice(0, 3).map((a, ai) => (
                        <span key={ai} className="text-xs bg-muted px-2 py-0.5 rounded">{a.nome}</span>
                      ))}
                    </div>
                  )}
                  {p.ultimaMovimentacao && (
                    <div className="mt-1 p-2 rounded bg-muted/50 text-xs">
                      <span className="text-muted-foreground">{formatDate(p.ultimaMovimentacaoData)}: </span>
                      {p.ultimaMovimentacao}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-center text-muted-foreground">
              Clique em "Ver" para abrir os detalhes completos e andamentos de cada processo.
            </p>
          </div>
        )}

        {!processo && !notFound && !errorMsg && !loading && resultadosOab.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{modoBusca === "oab" ? "Digite sua OAB e selecione o tribunal para buscar seus processos." : "Digite o numero do processo para consultar."}</p>
            <p className="text-xs mt-1">Os dados vem da API publica do CNJ (DataJud) - gratuito e sem limite.</p>
          </div>
        )}
      </div>
    </div>
  );
}
