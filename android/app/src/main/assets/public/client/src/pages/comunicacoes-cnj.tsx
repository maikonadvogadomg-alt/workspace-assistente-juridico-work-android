import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, Loader2, FileText, Scale, Calendar,
  Building2, User, ExternalLink, Download, AlertTriangle, ChevronDown, ChevronUp,
  Globe, Server, RefreshCw,
} from "lucide-react";

interface Comunicacao {
  id: number;
  dataDisponibilizacao: string;
  tribunal: string;
  tipo: string;
  orgao: string;
  processo: string;
  classe: string;
  codigoClasse: string;
  tipoDocumento: string;
  texto: string;
  link: string;
  meio: string;
  status: string;
  hash: string;
  numeroComunicacao: number;
  destinatarios: Array<{ nome: string; polo: string }>;
  advogados: Array<{ nome: string; oab: string; uf: string }>;
}

function parseItem(item: any): Comunicacao {
  return {
    id: item.id,
    dataDisponibilizacao: item.data_disponibilizacao || item.datadisponibilizacao || item.dataDisponibilizacao || "",
    tribunal: item.siglaTribunal || item.tribunal || "",
    tipo: item.tipoComunicacao || item.tipo || "",
    orgao: item.nomeOrgao || item.orgao || "",
    processo: item.numeroprocessocommascara || item.numero_processo || item.processo || "",
    classe: item.nomeClasse || item.classe || "",
    codigoClasse: item.codigoClasse || "",
    tipoDocumento: item.tipoDocumento || "",
    texto: item.texto || "",
    link: item.link || "",
    meio: item.meiocompleto || item.meio || "",
    status: item.status || "",
    hash: item.hash || "",
    numeroComunicacao: item.numeroComunicacao || 0,
    destinatarios: (item.destinatarios || []).map((d: any) => ({
      nome: d.nome || "",
      polo: d.polo === "A" ? "Ativo" : d.polo === "P" ? "Passivo" : d.polo || "",
    })),
    advogados: (item.destinatarioadvogados || item.advogados || []).map((da: any) => {
      if (da.advogado) {
        return { nome: da.advogado.nome || "", oab: da.advogado.numero_oab || "", uf: da.advogado.uf_oab || "" };
      }
      return { nome: da.nome || "", oab: da.oab || da.numero_oab || "", uf: da.uf || da.uf_oab || "" };
    }),
  };
}

export default function ComunicacoesCnj() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [fonte, setFonte] = useState("");

  const [oab, setOab] = useState("183712");
  const [uf, setUf] = useState("MG");
  const [nomeAdvogado, setNomeAdvogado] = useState("");
  const [nomeParte, setNomeParte] = useState("");
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const buscarDireto = async (): Promise<{ ok: boolean; items: Comunicacao[]; total: number }> => {
    const params = new URLSearchParams();
    if (oab) params.append("numeroOab", oab.replace(/\D/g, ""));
    if (uf) params.append("ufOab", uf.toUpperCase());
    if (nomeAdvogado) params.append("nomeAdvogado", nomeAdvogado);
    if (nomeParte) params.append("nomeParte", nomeParte);
    if (numeroProcesso) params.append("numeroProcesso", numeroProcesso.replace(/[.\-\s]/g, ""));
    if (dataInicio) params.append("dataDisponibilizacaoInicio", dataInicio);
    if (dataFim) params.append("dataDisponibilizacaoFim", dataFim);

    try {
      const res = await fetch(`https://comunicaapi.pje.jus.br/api/v1/comunicacao?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status === "success" && data.items) {
        return { ok: true, items: data.items.map(parseItem), total: data.count || data.items.length };
      }
      return { ok: false, items: [], total: 0 };
    } catch {
      return { ok: false, items: [], total: 0 };
    }
  };

  const buscarServidor = async (): Promise<{ ok: boolean; items: Comunicacao[]; total: number }> => {
    try {
      const res = await fetch("/api/cnj/comunicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroOab: oab || undefined,
          ufOab: uf || undefined,
          nomeAdvogado: nomeAdvogado || undefined,
          nomeParte: nomeParte || undefined,
          numeroProcesso: numeroProcesso || undefined,
          dataDisponibilizacaoInicio: dataInicio || undefined,
          dataDisponibilizacaoFim: dataFim || undefined,
          ambiente: "homologacao",
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, items: [], total: 0 };
      return { ok: true, items: (data.items || []).map(parseItem), total: data.total || 0 };
    } catch {
      return { ok: false, items: [], total: 0 };
    }
  };

  const buscar = async () => {
    if (!oab && !nomeAdvogado && !nomeParte && !numeroProcesso) {
      toast({ title: "Preencha pelo menos um campo de busca", variant: "destructive" });
      return;
    }
    setLoading(true);
    setSearched(true);
    setComunicacoes([]);
    setTotal(0);
    setFonte("");

    const prod = await buscarDireto();
    if (prod.ok && prod.items.length > 0) {
      setComunicacoes(prod.items);
      setTotal(prod.total);
      setFonte("Produção (comunicaapi.pje.jus.br)");
      toast({ title: `${prod.total} comunicação(ões) — API de Produção` });
      setLoading(false);
      return;
    }

    const hml = await buscarServidor();
    if (hml.ok && hml.items.length > 0) {
      setComunicacoes(hml.items);
      setTotal(hml.total);
      setFonte("Homologação (hcomunicaapi.cnj.jus.br)");
      toast({ title: `${hml.total} comunicação(ões) — API de Homologação` });
    } else {
      setFonte(prod.ok ? "Produção" : "Homologação");
      toast({ title: "Nenhuma comunicação encontrada", description: "Tente outros critérios" });
    }
    setLoading(false);
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (d: string) => {
    if (!d) return "";
    if (d.includes("/")) return d;
    const parts = d.split("-");
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const cleanTexto = (t: string) => {
    if (!t) return "";
    let text = t.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<\/p>/gi, "\n\n");
    text = text.replace(/<\/div>/gi, "\n");
    text = text.replace(/<\/tr>/gi, "\n");
    text = text.replace(/<\/td>/gi, " | ");
    text = text.replace(/<[^>]+>/g, " ");
    text = text.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&aacute;/gi, "á")
      .replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó")
      .replace(/&uacute;/gi, "ú").replace(/&atilde;/gi, "ã").replace(/&otilde;/gi, "õ")
      .replace(/&ccedil;/gi, "ç").replace(/&ordm;/gi, "º").replace(/&ordf;/gi, "ª")
      .replace(/&#\d+;/g, "");
    text = text.replace(/[ \t]{2,}/g, " ");
    text = text.replace(/\n{3,}/g, "\n\n");
    return text.trim();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold">Comunicações Processuais</h1>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4" />
              Buscar Intimações, Citações e Publicações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Número OAB</label>
                <Input value={oab} onChange={e => setOab(e.target.value)} placeholder="183712" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">UF da OAB</label>
                <Input value={uf} onChange={e => setUf(e.target.value)} placeholder="MG" maxLength={2} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Número do Processo</label>
                <Input value={numeroProcesso} onChange={e => setNumeroProcesso(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome do Advogado</label>
                <Input value={nomeAdvogado} onChange={e => setNomeAdvogado(e.target.value)} placeholder="Ex: MAIKON DA ROCHA CALDEIRA" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome da Parte</label>
                <Input value={nomeParte} onChange={e => setNomeParte(e.target.value)} placeholder="Ex: JOSE MARIO NUNES" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Data Início (yyyy-mm-dd)</label>
                <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Data Fim (yyyy-mm-dd)</label>
                <Input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={buscar} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  Buscar
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              Busca primeiro na API de produção do CNJ (seu navegador). Se não alcançar, usa homologação pelo servidor.
            </div>
          </CardContent>
        </Card>

        {searched && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">
                {total > 0 ? `${total} comunicação(ões)` : "Nenhuma comunicação encontrada"}
              </h2>
              {fonte && (
                <Badge variant="outline" className="text-xs">
                  {fonte.includes("Produção") ? <Globe className="h-3 w-3 mr-1" /> : <Server className="h-3 w-3 mr-1" />}
                  {fonte}
                </Badge>
              )}
            </div>

            {comunicacoes.map(c => (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => toggleExpand(c.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="default">{c.tipo}</Badge>
                        <Badge variant="outline">{c.tribunal}</Badge>
                        <Badge variant="secondary">{c.tipoDocumento || c.classe}</Badge>
                        {c.status === "P" && <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Publicado</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-mono mt-1">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-semibold">{c.processo}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(c.dataDisponibilizacao)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {c.orgao}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {expandedIds.has(c.id)
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>

                  {!expandedIds.has(c.id) && c.destinatarios.length > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium">Partes:</span>{" "}
                      {c.destinatarios.map(d => `${d.nome} (${d.polo})`).join(" | ")}
                    </div>
                  )}
                </div>

                {expandedIds.has(c.id) && (
                  <div className="border-t px-4 py-3 space-y-3 bg-muted/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                          <User className="h-3 w-3" /> Partes
                        </h4>
                        {c.destinatarios.map((d, i) => (
                          <div key={i} className="text-sm">
                            <span className="font-medium">{d.nome}</span>{" "}
                            <Badge variant="outline" className="text-xs">{d.polo}</Badge>
                          </div>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
                          <Scale className="h-3 w-3" /> Advogados
                        </h4>
                        {c.advogados.map((a, i) => (
                          <div key={i} className="text-sm">
                            <span className="font-medium">{a.nome}</span>{" "}
                            <span className="text-xs text-muted-foreground">OAB {a.oab}/{a.uf}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {c.meio && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Meio:</span> {c.meio}
                      </div>
                    )}

                    {c.texto && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-1">Teor da Comunicação</h4>
                        <div className="text-sm bg-background rounded p-3 border max-h-96 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
                          {cleanTexto(c.texto)}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {c.link && (
                        <a href={c.link} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ver no Tribunal
                          </Button>
                        </a>
                      )}
                      {c.hash && (
                        <a href={`https://comunicaapi.pje.jus.br/api/v1/comunicacao/${c.hash}/certidao`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm">
                            <Download className="h-3.5 w-3.5 mr-1" /> Certidão PDF
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
