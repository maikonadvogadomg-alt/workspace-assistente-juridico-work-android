import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  FileUp, Loader2, ChevronLeft, CheckCircle2, XCircle,
  User, Briefcase, Banknote, FileText, Hash, Trash2, Download,
  Scale, AlertCircle
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

declare global { interface Window { pdfjsLib: any } }

type NaturezaVinculo = "EMPREGADO" | "CONTRIBUINTE_INDIVIDUAL" | "BENEFICIO_INCAPACIDADE" | "NAO_INFORMADO" | string;

interface PeriodoContribuicao {
  dataInicial: string; dataFinal: string; descricao: string;
  naturezaVinculo: NaturezaVinculo; contarCarencia: boolean;
}

interface Salario { competencia: string; valor: number }

interface CnisData {
  dadosSegurado: { nit: string; cpf: string; nome: string; nascimento: string; mae: string };
  periodosContribuicao: PeriodoContribuicao[];
  salarios: Salario[];
}

interface CartaData {
  numeroBeneficio: string; especie: string; codigoEspecie: string;
  dib: string; dip: string; rmi: number; salarioBeneficio: number;
  coeficiente: string; segurado: { nome: string; cpf: string; nit: string };
  tempoContribuicao: string; dataDespacho: string;
}

interface DtcCtcData {
  nome?: string; cpf?: string; orgao?: string;
  periodos: { seq: string; inicio: string; fim: string; cargo: string; categoria: string }[];
  salarios: Salario[];
}

type DocStatus = "idle" | "loading" | "done" | "error";

const MESES_PT = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

function naturezaLabel(n: NaturezaVinculo) {
  const m: Record<string,string> = {
    EMPREGADO:"Empregado", CONTRIBUINTE_INDIVIDUAL:"Contrib. Individual",
    BENEFICIO_INCAPACIDADE:"Benefício Incapacidade", NAO_INFORMADO:"Não informado",
  };
  return m[n] || n;
}

function naturezaBadge(n: NaturezaVinculo) {
  if (n === "EMPREGADO") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
  if (n === "CONTRIBUINTE_INDIVIDUAL") return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  if (n === "BENEFICIO_INCAPACIDADE") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}

function parseValorBR(str: string): number | null {
  if (!str) return null;
  const s = str.replace(/\s/g,"").replace(/\./g,"").replace(",",".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function fmtBR(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function extrairTextoPdf(file: File): Promise<string> {
  if (!(window as any).pdfjsLib) throw new Error("PDF.js não carregado");
  const buffer = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return text;
}

// Extração ordenada por coordenadas Y→X (resolve o problema de colunas misturadas)
async function extrairTextoOrdenado(file: File): Promise<string> {
  if (!(window as any).pdfjsLib) throw new Error("PDF.js não carregado");
  const buf = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
  let out = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = [...(content.items as any[])];

    items.sort((a, b) => {
      const ay = a.transform?.[5] ?? 0, by = b.transform?.[5] ?? 0;
      if (Math.abs(ay - by) > 3) return by - ay;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });

    const linhas: { y: number; items: { x: number; text: string }[] }[] = [];
    for (const it of items) {
      const y = it.transform?.[5] ?? 0, x = it.transform?.[4] ?? 0;
      const text = it.str || "";
      if (!text.trim()) continue;
      let idx = -1, best = 999;
      for (let i = 0; i < linhas.length; i++) {
        const d = Math.abs(linhas[i].y - y);
        if (d <= 3 && d < best) { best = d; idx = i; }
      }
      if (idx >= 0) {
        linhas[idx].items.push({ x, text });
        const n = linhas[idx].items.length;
        linhas[idx].y = (linhas[idx].y * (n - 1) + y) / n;
      } else {
        linhas.push({ y, items: [{ x, text }] });
      }
    }

    const xs: number[] = [];
    linhas.forEach(l => l.items.forEach(it => xs.push(it.x)));
    const cols: number[] = [];
    [...xs].sort((a, b) => a - b).forEach(x => {
      if (!cols.some(c => Math.abs(c - x) <= 10)) cols.push(x);
    });
    cols.sort((a, b) => a - b);

    for (const l of linhas) {
      const buckets: string[][] = cols.map(() => []);
      for (const it of l.items) {
        let idx = 0, best = Math.abs(it.x - cols[0]);
        for (let i = 1; i < cols.length; i++) {
          const d = Math.abs(it.x - cols[i]);
          if (d < best) { best = d; idx = i; }
        }
        buckets[idx].push(it.text);
      }
      const joined = buckets.map(b => b.join(" ").trim()).filter(s => s.length > 0).join(" | ");
      out += joined + "\n";
    }
    out += "\n";
  }
  return out;
}

function parsearDtcCtc(texto: string): DtcCtcData {
  const linhas = texto.split(/\r?\n/);
  const salarios: Salario[] = [];
  const periodos: DtcCtcData["periodos"] = [];
  let capturandoRem = false, capturandoPer = false;
  let anosHeader: (number | null)[] = [];
  let nome = "", cpf = "", orgao = "";

  const extrairAnos = (ln: string): (number | null)[] => {
    const m = ln.match(/Ano:\s*[-–]|\bAno:\s*(\d{4})/gi) || [];
    return m.map(tok => { const mm = tok.match(/(\d{4})/); return mm ? parseInt(mm[1], 10) : null; });
  };

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].replace(/\s{2,}/g, " ").trim();
    if (!l) continue;

    // Captura dados básicos
    if (!nome && /NOME DO SERVIDOR|NOME:/i.test(l)) {
      const m = l.match(/(?:NOME DO SERVIDOR|NOME)[\s:]*([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ\s]+)/i);
      if (m) nome = m[1].trim();
    }
    if (!cpf && /CPF/i.test(l)) {
      const m = l.match(/(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/);
      if (m) cpf = m[1];
    }
    if (!orgao && /ÓRGÃO EXPEDIDOR|PREFEITURA|SECRETARIA/i.test(l)) {
      const m = l.match(/(?:ÓRGÃO EXPEDIDOR|PREFEITURA MUNICIPAL DE)[:\s]*([^\n|]+)/i);
      if (m && m[1].trim().length > 3) orgao = m[1].trim();
    }

    // Períodos (Anexo IV / Período de Contribuição)
    if (/PERÍODO.*TEMPO DE CONTRIBUIÇÃO|QUADRO I/i.test(l)) { capturandoPer = true; continue; }
    if (capturandoPer && (/DADOS DE REMUNERAÇÕES|RELAÇÃO DAS REMUNERAÇÕES|ANEXO V|QUADRO II/i.test(l))) {
      capturandoPer = false;
    }
    if (capturandoPer) {
      const parts = l.split(" | ").map(s => s.trim());
      if (parts.length >= 3) {
        const datas = parts.filter(p => /\d{2}\/\d{2}\/\d{4}/.test(p));
        if (datas.length >= 2 && /^\d+$/.test(parts[0])) {
          const resto = parts.filter(p => !/^\d+$/.test(p) && !/\d{2}\/\d{2}\/\d{4}/.test(p));
          periodos.push({ seq: parts[0], inicio: datas[0], fim: datas[1], cargo: resto[0] || "", categoria: resto[1] || "" });
        }
      }
    }

    // Remunerações (Anexo V / Relação de Remunerações)
    if (/DADOS DE REMUNERAÇÕES.*ANEXO V|RELAÇÃO DAS REMUNERAÇÕES/i.test(l)) {
      capturandoRem = true; anosHeader = []; continue;
    }
    if (capturandoRem && /^ASSINATURA|^UNIDADE GESTORA|^OBSERVAÇÕES|^HOMOLOGO|Lavrei/i.test(l)) {
      capturandoRem = false; continue;
    }
    if (!capturandoRem) continue;

    if (/Ano:\s*/i.test(l) && anosHeader.length === 0) {
      anosHeader = extrairAnos(l); continue;
    }

    // Linha de mês/valores — suporta tanto formato com | quanto formato de colunas direto
    const parts = l.split(" | ").map(s => s.trim());
    if (parts.length >= 2) {
      const mesStr = parts[0].toUpperCase().replace(/[^A-ZÁÉÊÍÓÚÂÔÃ]/g, "");
      const mesIdx = MESES_PT.findIndex(m => mesStr.startsWith(m.slice(0, 3)));
      if (mesIdx >= 0) {
        parts.slice(1).forEach((v, idx) => {
          const ano = anosHeader[idx];
          if (!ano) return;
          if (/^[-–—\.]+$/.test(v.trim()) || v.trim() === "") return;
          const valor = parseValorBR(v);
          if (valor !== null && valor > 0) {
            const mm = String(mesIdx + 1).padStart(2, "0");
            salarios.push({ competencia: `${mm}/${ano}`, valor });
          }
        });
      }
    }
  }

  return { nome, cpf, orgao, periodos, salarios };
}

function UploadZone({
  label, sublabel, icon: Icon, status, fileName, onFile, onClear, accent = "blue"
}: {
  label: string; sublabel: string; icon: any; status: DocStatus;
  fileName?: string; onFile: (f: File) => void; onClear: () => void; accent?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const colors = {
    blue: { ring: "hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20", icon: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300" },
    purple: { ring: "hover:border-purple-400 hover:bg-purple-50/30 dark:hover:bg-purple-950/20", icon: "bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300" },
  }[accent] || { ring: "hover:border-blue-400 hover:bg-blue-50/30", icon: "bg-blue-100 text-blue-600" };

  return (
    <div className="relative">
      {status === "done" && (
        <button onClick={onClear} className="absolute top-2 right-2 z-10 p-1 rounded-full bg-white dark:bg-gray-800 shadow hover:bg-red-50 dark:hover:bg-red-900 transition-colors" title="Remover">
          <Trash2 size={14} className="text-red-500" />
        </button>
      )}
      <div
        onClick={() => (status === "idle" || status === "error") && ref.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all
          ${status === "idle" ? `cursor-pointer ${colors.ring} border-gray-300 dark:border-gray-600` : ""}
          ${status === "loading" ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20" : ""}
          ${status === "done" ? "border-green-400 bg-green-50/30 dark:bg-green-950/20 cursor-default" : ""}
          ${status === "error" ? `border-red-400 bg-red-50/30 dark:bg-red-950/20 cursor-pointer` : ""}`}
      >
        <input ref={ref} type="file" accept=".pdf" className="hidden" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
        {status === "loading" ? <Loader2 size={28} className="animate-spin text-amber-500" />
          : status === "done" ? <CheckCircle2 size={28} className="text-green-500" />
          : status === "error" ? <XCircle size={28} className="text-red-500" />
          : <div className={`w-12 h-12 rounded-full flex items-center justify-center ${colors.icon}`}><Icon size={22} /></div>}
        <div>
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">
            {status === "loading" ? "Processando..." : status === "done" ? fileName : status === "error" ? "Erro — tente novamente" : label}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: any; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        <Icon size={16} className="text-blue-600 dark:text-blue-400" />
        <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-40 shrink-0">{label}</span>
      <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</span>
    </div>
  );
}

export default function PrevidenciarioPage() {
  const { toast } = useToast();
  const [cnisStatus, setCnisStatus] = useState<DocStatus>("idle");
  const [cartaStatus, setCartaStatus] = useState<DocStatus>("idle");
  const [dtcCtcStatus, setDtcCtcStatus] = useState<DocStatus>("idle");
  const [cnisFileName, setCnisFileName] = useState<string>();
  const [cartaFileName, setCartaFileName] = useState<string>();
  const [dtcCtcFileName, setDtcCtcFileName] = useState<string>();
  const [cnisData, setCnisData] = useState<CnisData | null>(null);
  const [cartaData, setCartaData] = useState<CartaData | null>(null);
  const [dtcCtcData, setDtcCtcData] = useState<DtcCtcData | null>(null);
  const [pdfjsReady, setPdfjsReady] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<"documentos" | "comparativo">("documentos");

  const loadPdfJs = useCallback(() => {
    if ((window as any).pdfjsLib) { setPdfjsReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
    s.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
      setPdfjsReady(true);
    };
    document.head.appendChild(s);
  }, []);

  useEffect(() => { loadPdfJs(); }, [loadPdfJs]);

  const processarCnisOuCarta = async (file: File, tipo: "cnis" | "carta") => {
    if (!pdfjsReady && !(window as any).pdfjsLib) {
      toast({ title: "PDF.js ainda carregando", description: "Aguarde 2 segundos e tente novamente.", variant: "destructive" });
      return;
    }
    if (tipo === "cnis") { setCnisStatus("loading"); setCnisFileName(file.name); }
    else { setCartaStatus("loading"); setCartaFileName(file.name); }
    try {
      const texto = await extrairTextoPdf(file);
      const res = await apiRequest("POST", "/api/previdenciario/extrair", { texto, tipo });
      const json = await res.json();
      if (tipo === "cnis") { setCnisData(json.data); setCnisStatus("done"); }
      else { setCartaData(json.data); setCartaStatus("done"); }
      toast({ title: `${tipo === "cnis" ? "CNIS" : "Carta"} importado com sucesso` });
    } catch (e: any) {
      if (tipo === "cnis") setCnisStatus("error"); else setCartaStatus("error");
      toast({ title: "Erro na extração", description: e.message, variant: "destructive" });
    }
  };

  const processarDtcCtc = async (file: File) => {
    if (!pdfjsReady && !(window as any).pdfjsLib) {
      toast({ title: "PDF.js ainda carregando", description: "Aguarde 2 segundos e tente novamente.", variant: "destructive" });
      return;
    }
    setDtcCtcStatus("loading"); setDtcCtcFileName(file.name);
    try {
      const texto = await extrairTextoOrdenado(file);
      const dados = parsearDtcCtc(texto);
      if (dados.salarios.length === 0) {
        toast({ title: "Nenhuma remuneração encontrada", description: "O documento pode ter formato diferente. Verifique se é um CTC/DTC com Anexo V.", variant: "destructive" });
        setDtcCtcStatus("error"); return;
      }
      setDtcCtcData(dados); setDtcCtcStatus("done");
      toast({ title: `CTC/DTC extraído: ${dados.salarios.length} competências`, description: dados.nome || file.name });
    } catch (e: any) {
      setDtcCtcStatus("error");
      toast({ title: "Erro na extração CTC/DTC", description: e.message, variant: "destructive" });
    }
  };

  // Constrói tabela comparativa unificada
  const comparativo = useMemo(() => {
    const mapa = new Map<string, { cnis?: number; dtcCtc?: number }>();
    const set = (comp: string, key: "cnis" | "dtcCtc", val: number) => {
      const r = mapa.get(comp) || {};
      r[key] = (r[key] || 0) + val;
      mapa.set(comp, r);
    };
    cnisData?.salarios?.forEach(s => set(s.competencia, "cnis", s.valor));
    dtcCtcData?.salarios?.forEach(s => set(s.competencia, "dtcCtc", s.valor));
    return Array.from(mapa.entries())
      .sort((a, b) => {
        const [ma, ya] = a[0].split("/").map(Number);
        const [mb, yb] = b[0].split("/").map(Number);
        return (yb - ya) || (mb - ma);
      })
      .map(([comp, v]) => ({ comp, ...v }));
  }, [cnisData, dtcCtcData]);

  const exportarCsv = () => {
    const hasCnis = !!(cnisData && cnisData.salarios.length > 0);
    const hasDtc = !!(dtcCtcData && dtcCtcData.salarios.length > 0);
    let header = "Competência";
    if (hasCnis) header += ";CNIS";
    if (hasDtc) header += ";CTC/DTC";
    if (hasCnis && hasDtc) header += ";Diferença";
    const rows = comparativo.map(r => {
      let line = r.comp;
      if (hasCnis) line += `;${r.cnis != null ? fmtBR(r.cnis) : ""}`;
      if (hasDtc) line += `;${r.dtcCtc != null ? fmtBR(r.dtcCtc) : ""}`;
      if (hasCnis && hasDtc) {
        line += r.cnis != null && r.dtcCtc != null ? `;${fmtBR(r.cnis - r.dtcCtc)}` : ";";
      }
      return line;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const nome = cnisData?.dadosSegurado?.nome?.split(" ")[0] || dtcCtcData?.nome?.split(" ")[0] || "dados";
    const a = document.createElement("a"); a.href = url;
    a.download = `comparativo_previdenciario_${nome}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportarJson = () => {
    const data = { cnis: cnisData, carta: cartaData, dtcCtc: dtcCtcData, exportadoEm: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `previdenciario_${cnisData?.dadosSegurado?.nome?.split(" ")[0] || "dados"}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  const temDados = cnisData || cartaData || dtcCtcData;
  const temComparativo = comparativo.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ChevronLeft size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
          </Link>
          <div>
            <h1 className="font-bold text-gray-900 dark:text-white text-base">Importador Previdenciário</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">CNIS · Carta · CTC/DTC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {temComparativo && (
            <Button variant="outline" size="sm" onClick={exportarCsv} className="gap-2 text-xs" data-testid="btn-exportar-csv">
              <Download size={14} /> CSV
            </Button>
          )}
          {temDados && (
            <Button variant="outline" size="sm" onClick={exportarJson} className="gap-2 text-xs" data-testid="btn-exportar-json">
              <Download size={14} /> JSON
            </Button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Abas */}
      <div className="sticky top-14 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4">
        <div className="flex gap-0 max-w-6xl mx-auto">
          {(["documentos", "comparativo"] as const).map(aba => (
            <button key={aba} onClick={() => setAbaAtiva(aba)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${abaAtiva === aba ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
              data-testid={`tab-${aba}`}>
              {aba === "documentos" ? "Documentos" : `Comparativo${temComparativo ? ` (${comparativo.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ABA DOCUMENTOS */}
        {abaAtiva === "documentos" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UploadZone label="Importar CNIS" sublabel="PDF do Extrato Previdenciário (Meu INSS)" icon={FileText}
                status={cnisStatus} fileName={cnisFileName} onFile={f => processarCnisOuCarta(f, "cnis")} accent="blue"
                onClear={() => { setCnisStatus("idle"); setCnisData(null); setCnisFileName(undefined); }} />
              <UploadZone label="Importar Carta de Concessão" sublabel="PDF da Carta de Benefício do INSS" icon={FileUp}
                status={cartaStatus} fileName={cartaFileName} onFile={f => processarCnisOuCarta(f, "carta")} accent="blue"
                onClear={() => { setCartaStatus("idle"); setCartaData(null); setCartaFileName(undefined); }} />
              <UploadZone label="Importar CTC / DTC" sublabel="Certidão ou Declaração de Tempo de Contribuição" icon={Scale}
                status={dtcCtcStatus} fileName={dtcCtcFileName} onFile={processarDtcCtc} accent="purple"
                onClear={() => { setDtcCtcStatus("idle"); setDtcCtcData(null); setDtcCtcFileName(undefined); }} />
            </div>

            {!temDados && (
              <div className="text-center py-16 text-gray-400 dark:text-gray-600">
                <FileText size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">Faça o upload dos documentos acima para extrair os dados</p>
                <p className="text-xs mt-1">CNIS e Carta usam Gemini AI · CTC/DTC usam extração local por coordenadas</p>
              </div>
            )}

            {cnisData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600 text-white text-xs px-3 py-1">CNIS</Badge>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {cnisData.periodosContribuicao?.length || 0} períodos · {cnisData.salarios?.length || 0} competências
                  </span>
                </div>
                <SectionCard title="Dados do Segurado" icon={User}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                    <InfoRow label="Nome" value={cnisData.dadosSegurado?.nome} />
                    <InfoRow label="CPF" value={cnisData.dadosSegurado?.cpf} />
                    <InfoRow label="NIT / PIS" value={cnisData.dadosSegurado?.nit} />
                    <InfoRow label="Nascimento" value={cnisData.dadosSegurado?.nascimento} />
                    <InfoRow label="Nome da Mãe" value={cnisData.dadosSegurado?.mae} />
                  </div>
                </SectionCard>
                <SectionCard title="Períodos de Contribuição" icon={Briefcase}>
                  {cnisData.periodosContribuicao?.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {["#","Início","Fim","Empresa / Descrição","Natureza","Carência"].map(h => (
                              <th key={h} className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cnisData.periodosContribuicao.map((p, i) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                              <td className="py-2 pr-4 text-gray-400 font-mono">{i + 1}</td>
                              <td className="py-2 pr-4 font-mono text-gray-800 dark:text-gray-200">{p.dataInicial}</td>
                              <td className="py-2 pr-4 font-mono text-gray-800 dark:text-gray-200">{p.dataFinal}</td>
                              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 max-w-xs truncate">{p.descricao}</td>
                              <td className="py-2 pr-4">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${naturezaBadge(p.naturezaVinculo)}`}>
                                  {naturezaLabel(p.naturezaVinculo)}
                                </span>
                              </td>
                              <td className="py-2">{p.contarCarencia ? <CheckCircle2 size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-400" />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-gray-500">Nenhum período encontrado.</p>}
                </SectionCard>
                {cnisData.salarios?.length > 0 && (
                  <SectionCard title={`Salários de Contribuição (${cnisData.salarios.length} competências)`} icon={Banknote}>
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white dark:bg-gray-900">
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2 pr-8 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Competência</th>
                            <th className="text-right py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor (R$)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cnisData.salarios.map((s, i) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="py-1.5 pr-8 font-mono text-gray-700 dark:text-gray-300">{s.competencia}</td>
                              <td className="py-1.5 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">{fmtBR(s.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )}
              </div>
            )}

            {cartaData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600 text-white text-xs px-3 py-1">CARTA DE CONCESSÃO</Badge>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cartaData.especie}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SectionCard title="Dados do Benefício" icon={Hash}>
                    <InfoRow label="Número" value={cartaData.numeroBeneficio} />
                    <InfoRow label="Espécie" value={cartaData.especie} />
                    <InfoRow label="DIB" value={cartaData.dib} />
                    <InfoRow label="DIP" value={cartaData.dip} />
                    <InfoRow label="Despacho" value={cartaData.dataDespacho} />
                  </SectionCard>
                  <SectionCard title="Valores" icon={Banknote}>
                    <InfoRow label="RMI" value={cartaData.rmi ? `R$ ${fmtBR(cartaData.rmi)}` : undefined} />
                    <InfoRow label="Salário de Benefício" value={cartaData.salarioBeneficio ? `R$ ${fmtBR(cartaData.salarioBeneficio)}` : undefined} />
                    <InfoRow label="Coeficiente" value={cartaData.coeficiente} />
                    <InfoRow label="Tempo de Contribuição" value={cartaData.tempoContribuicao} />
                  </SectionCard>
                </div>
              </div>
            )}

            {dtcCtcData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-600 text-white text-xs px-3 py-1">CTC / DTC</Badge>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {dtcCtcData.salarios.length} competências extraídas
                  </span>
                </div>
                {(dtcCtcData.nome || dtcCtcData.cpf || dtcCtcData.orgao) && (
                  <SectionCard title="Dados do Servidor" icon={User}>
                    <InfoRow label="Nome" value={dtcCtcData.nome} />
                    <InfoRow label="CPF" value={dtcCtcData.cpf} />
                    <InfoRow label="Órgão" value={dtcCtcData.orgao} />
                  </SectionCard>
                )}
                {dtcCtcData.periodos.length > 0 && (
                  <SectionCard title="Períodos de Contribuição" icon={Briefcase}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700">
                            {["#","Início","Fim","Cargo","Categoria"].map(h => (
                              <th key={h} className="text-left py-2 pr-4 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dtcCtcData.periodos.map((p, i) => (
                            <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                              <td className="py-2 pr-4 text-gray-400 font-mono">{p.seq}</td>
                              <td className="py-2 pr-4 font-mono text-gray-800 dark:text-gray-200">{p.inicio}</td>
                              <td className="py-2 pr-4 font-mono text-gray-800 dark:text-gray-200">{p.fim}</td>
                              <td className="py-2 pr-4 text-gray-700 dark:text-gray-300">{p.cargo || "—"}</td>
                              <td className="py-2 text-gray-700 dark:text-gray-300">{p.categoria || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                )}
                <SectionCard title={`Remunerações (${dtcCtcData.salarios.length} competências)`} icon={Banknote}>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white dark:bg-gray-900">
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 pr-8 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Competência</th>
                          <th className="text-right py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dtcCtcData.salarios.map((s, i) => (
                          <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="py-1.5 pr-8 font-mono text-gray-700 dark:text-gray-300">{s.competencia}</td>
                            <td className="py-1.5 text-right font-mono font-semibold text-purple-700 dark:text-purple-300">{fmtBR(s.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SectionCard>
              </div>
            )}
          </>
        )}

        {/* ABA COMPARATIVO */}
        {abaAtiva === "comparativo" && (
          <>
            {!temComparativo ? (
              <div className="text-center py-16 text-gray-400 dark:text-gray-600">
                <Scale size={48} className="mx-auto mb-4 opacity-30" />
                <p className="text-sm">Importe pelo menos dois documentos para ver o comparativo</p>
                <p className="text-xs mt-1">CNIS + CTC/DTC · Identifica divergências competência a competência</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setAbaAtiva("documentos")}>
                  Ir para Documentos
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-200">Comparativo por Competência</h2>
                    <span className="text-xs text-gray-500">{comparativo.length} registros</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={exportarCsv} className="gap-2 text-xs" data-testid="btn-exportar-csv-comp">
                    <Download size={14} /> Exportar CSV
                  </Button>
                </div>

                {/* Legenda */}
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/50 border border-red-300" /> CNIS maior que CTC/DTC</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100 dark:bg-amber-900/50 border border-amber-300" /> CTC/DTC maior que CNIS</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800 border border-gray-300" /> Somente em um documento</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">Competência</th>
                        {cnisData && <th className="text-right px-4 py-3 font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">CNIS</th>}
                        {dtcCtcData && <th className="text-right px-4 py-3 font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">CTC / DTC</th>}
                        {cnisData && dtcCtcData && <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Diferença</th>}
                        <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparativo.map((r, i) => {
                        const diff = r.cnis != null && r.dtcCtc != null ? r.cnis - r.dtcCtc : null;
                        const rowClass =
                          diff != null && Math.abs(diff) > 0.01
                            ? diff > 0 ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"
                            : r.cnis == null || r.dtcCtc == null
                            ? "bg-gray-50/50 dark:bg-gray-800/20"
                            : "";
                        let status = "—";
                        let statusClass = "text-gray-400";
                        if (diff != null) {
                          if (Math.abs(diff) < 0.01) { status = "Iguais"; statusClass = "text-green-600 dark:text-green-400 font-medium"; }
                          else if (diff > 0) { status = "CNIS maior"; statusClass = "text-red-600 dark:text-red-400 font-medium"; }
                          else { status = "CTC/DTC maior"; statusClass = "text-amber-600 dark:text-amber-400 font-medium"; }
                        } else if (r.cnis == null) { status = "Só CTC/DTC"; statusClass = "text-purple-500"; }
                        else if (r.dtcCtc == null) { status = "Só CNIS"; statusClass = "text-blue-500"; }

                        return (
                          <tr key={i} className={`border-b border-gray-100 dark:border-gray-800 ${rowClass}`}>
                            <td className="px-4 py-2 font-mono font-semibold text-gray-800 dark:text-gray-200">{r.comp}</td>
                            {cnisData && <td className="px-4 py-2 text-right font-mono text-blue-700 dark:text-blue-300">{r.cnis != null ? fmtBR(r.cnis) : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>}
                            {dtcCtcData && <td className="px-4 py-2 text-right font-mono text-purple-700 dark:text-purple-300">{r.dtcCtc != null ? fmtBR(r.dtcCtc) : <span className="text-gray-300 dark:text-gray-600">—</span>}</td>}
                            {cnisData && dtcCtcData && (
                              <td className={`px-4 py-2 text-right font-mono font-semibold ${diff != null && Math.abs(diff) > 0.01 ? (diff > 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400") : "text-gray-400"}`}>
                                {diff != null ? (diff >= 0 ? "+" : "") + fmtBR(diff) : "—"}
                              </td>
                            )}
                            <td className={`px-4 py-2 ${statusClass}`}>{status}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Resumo */}
                {cnisData && dtcCtcData && (() => {
                  const comDiff = comparativo.filter(r => r.cnis != null && r.dtcCtc != null && Math.abs(r.cnis - r.dtcCtc) > 0.01);
                  const iguais = comparativo.filter(r => r.cnis != null && r.dtcCtc != null && Math.abs(r.cnis - r.dtcCtc) <= 0.01);
                  const soCnis = comparativo.filter(r => r.cnis != null && r.dtcCtc == null);
                  const soDtc = comparativo.filter(r => r.cnis == null && r.dtcCtc != null);
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Com divergência", val: comDiff.length, color: "text-red-600 dark:text-red-400" },
                        { label: "Valores iguais", val: iguais.length, color: "text-green-600 dark:text-green-400" },
                        { label: "Só no CNIS", val: soCnis.length, color: "text-blue-600 dark:text-blue-400" },
                        { label: "Só no CTC/DTC", val: soDtc.length, color: "text-purple-600 dark:text-purple-400" },
                      ].map(({ label, val, color }) => (
                        <div key={label} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-center">
                          <p className={`text-2xl font-bold ${color}`}>{val}</p>
                          <p className="text-xs text-gray-500 mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {cnisData && dtcCtcData && comparativo.filter(r => r.cnis != null && r.dtcCtc != null && Math.abs(r.cnis - r.dtcCtc) > 0.01).length > 0 && (
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700">
                    <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Foram encontradas divergências entre os documentos. Exporte o CSV para análise detalhada ou encaminhe para comparação no seu sistema de cálculo.
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
