import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Filter, Trash2, Download, Copy, FileText, Upload,
  ChevronLeft, Settings, Shield, Target, AlertCircle,
  CheckCircle2, Loader2, BookOpen, Eraser
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RemovedItem { motivo: string; texto: string }
interface FilterStats { total: number; kept: number; removed: number }
interface FilterResult { outText: string; outPars: string[]; removed: RemovedItem[]; stats: FilterStats }
interface FilterCfg {
  cleanSymbols: boolean; cleanAsterisk1: boolean; cleanAsterisk2: boolean; cleanAsterisk3: boolean;
  cleanHash1: boolean; cleanHash2: boolean; cleanHash3: boolean;
  dedupeExact: boolean; dedupeNear: boolean; keepOrder: boolean; splitLarge: boolean;
  minChars: number; sim: number; shingleSize: number; windowN: number;
  banWords: string[]; banRegexList: RegExp[];
  keepWords: string[]; keepRegexList: RegExp[];
  captureWords: string[]; captureRegexList: RegExp[];
}

// ── Storage key ────────────────────────────────────────────────────────────────
const LS_KEY = "filtrador_juridico_state_v1";

function saveLS(partial: Record<string, unknown>) {
  try {
    const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    localStorage.setItem(LS_KEY, JSON.stringify({ ...prev, ...partial }));
  } catch {}
}
function loadLS(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}

// ── Pure logic helpers ─────────────────────────────────────────────────────────
function cleanMarkdownNoise(t: string, cfg: Pick<FilterCfg,
  "cleanSymbols"|"cleanAsterisk1"|"cleanAsterisk2"|"cleanAsterisk3"|
  "cleanHash1"|"cleanHash2"|"cleanHash3">): string {
  let s = t || "";
  if (cfg.cleanAsterisk3) s = s.replace(/\*\*\*/g, "");
  if (cfg.cleanAsterisk2) s = s.replace(/\*\*/g, "");
  if (cfg.cleanAsterisk1) s = s.replace(/\*/g, "");
  if (cfg.cleanHash3) s = s.replace(/###/g, "");
  if (cfg.cleanHash2) s = s.replace(/##/g, "");
  if (cfg.cleanHash1) s = s.replace(/#/g, "");
  if (cfg.cleanSymbols) {
    s = s.replace(/^\s{0,6}(?:[•\-–—]+|#{1,6}|>+)\s+/gm, "");
    s = s.replace(/[#~]{2,}/g, " ");
  }
  s = s.replace(/[""]/g, '"').replace(/[']/g, "'");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

function splitParagraphs(t: string, splitLarge: boolean): string[] {
  const paragraphs = (t || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|\n(?=\s*[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{3,}[\s:])/g)
    .map(p => p.trim())
    .filter(Boolean);
  if (!splitLarge) return paragraphs;
  const result: string[] = [];
  const splitSize = 500;
  for (const p of paragraphs) {
    if (p.length > splitSize) {
      for (let s = 0; s < p.length; s += splitSize) result.push(p.slice(s, s + splitSize));
    } else {
      result.push(p);
    }
  }
  return result;
}

function normalizeForCompare(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function makeShingles(words: string[], size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + size <= words.length; i++) out.push(words.slice(i, i + size).join(" "));
  return out;
}

function signature(norm: string, shingleSize: number): Set<string> {
  const words = norm.split(" ").filter(Boolean);
  const sh = makeShingles(words, shingleSize);
  const limited = sh.length > 250 ? sh.slice(0, 250) : sh;
  return new Set(limited);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const small = a.size < b.size ? a : b;
  const big = a.size < b.size ? b : a;
  small.forEach(x => { if (big.has(x)) inter++; });
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

function parseLines(text: string): string[] {
  return (text || "").split("\n").map(s => s.trim()).filter(Boolean);
}

function buildRegexList(lines: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const l of lines) { try { out.push(new RegExp(l, "i")); } catch {} }
  return out;
}

function applyBanRules(par: string, cfg: FilterCfg): { drop: boolean; reason?: string } {
  const low = par.toLowerCase();
  for (const w of cfg.keepWords) if (w && low.includes(w.toLowerCase())) return { drop: false };
  for (const rx of cfg.keepRegexList) if (rx.test(par)) return { drop: false };
  for (const w of cfg.banWords) if (w && low.includes(w.toLowerCase())) return { drop: true, reason: `palavra: "${w}"` };
  for (const rx of cfg.banRegexList) if (rx.test(par)) return { drop: true, reason: `regex: /${rx.source}/i` };
  return { drop: false };
}

function applyCaptureRules(par: string, cfg: FilterCfg): { highlight: boolean; reason?: string } {
  const low = par.toLowerCase();
  for (const w of cfg.captureWords) if (w && low.includes(w.toLowerCase())) return { highlight: true, reason: `palavra: "${w}"` };
  for (const rx of cfg.captureRegexList) if (rx.test(par)) return { highlight: true, reason: `regex: /${rx.source}/i` };
  return { highlight: false };
}

function filterText(rawText: string, cfg: FilterCfg): FilterResult {
  const removed: RemovedItem[] = [];
  let text = rawText || "";
  if (cfg.cleanSymbols || cfg.cleanAsterisk1 || cfg.cleanAsterisk2 || cfg.cleanAsterisk3
    || cfg.cleanHash1 || cfg.cleanHash2 || cfg.cleanHash3) {
    text = cleanMarkdownNoise(text, cfg);
  }
  const pars = splitParagraphs(text, cfg.splitLarge)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(p => p.length >= cfg.minChars);

  const exactSet = new Set<string>();
  const kept: Array<{ raw: string; norm: string; sig: Set<string> }> = [];
  const out: string[] = [];

  for (const p of pars) {
    const rule = applyBanRules(p, cfg);
    if (rule.drop) { removed.push({ motivo: `Exclusão por ${rule.reason}`, texto: p }); continue; }
    const capture = applyCaptureRules(p, cfg);
    const norm = normalizeForCompare(p);

    if (cfg.dedupeExact) {
      if (exactSet.has(norm)) { removed.push({ motivo: "Duplicata exata", texto: p }); continue; }
      exactSet.add(norm);
    }
    if (cfg.dedupeNear) {
      const sig2 = signature(norm, cfg.shingleSize);
      let dup = false;
      const start = Math.max(0, kept.length - cfg.windowN);
      for (let i = start; i < kept.length; i++) {
        if (jaccard(sig2, kept[i].sig) >= cfg.sim) { dup = true; break; }
      }
      if (dup) { removed.push({ motivo: "Duplicata aproximada", texto: p }); continue; }
      kept.push({ raw: p, norm, sig: sig2 });
    }
    out.push(capture.highlight ? `[DESTAQUE: ${capture.reason}]\n${p}` : p);
  }

  return { outText: out.join("\n\n"), outPars: out, removed, stats: { total: pars.length, kept: out.length, removed: removed.length } };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function download(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function FiltradorJuridico() {
  const { toast } = useToast();
  const saved = loadLS();

  const [raw, setRaw] = useState<string>((saved.raw as string) || "");
  const [outText, setOutText] = useState<string>((saved.lastOut as string) || "");
  const [removed, setRemoved] = useState<RemovedItem[]>([]);
  const [stats, setStats] = useState<FilterStats | null>(null);
  const [status, setStatus] = useState("Pronto.");
  const [processing, setProcessing] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  // Config
  const [cleanSymbols, setCleanSymbols] = useState<boolean>((saved.cleanSymbols as boolean) ?? true);
  const [dedupeExact, setDedupeExact] = useState<boolean>((saved.dedupeExact as boolean) ?? true);
  const [dedupeNear, setDedupeNear] = useState<boolean>((saved.dedupeNear as boolean) ?? true);
  const [keepOrder, setKeepOrder] = useState<boolean>((saved.keepOrder as boolean) ?? true);
  const [splitLarge, setSplitLarge] = useState<boolean>((saved.splitLarge as boolean) ?? true);
  const [cleanAsterisk1, setCleanAsterisk1] = useState<boolean>((saved.cleanAsterisk1 as boolean) ?? true);
  const [cleanAsterisk2, setCleanAsterisk2] = useState<boolean>((saved.cleanAsterisk2 as boolean) ?? true);
  const [cleanAsterisk3, setCleanAsterisk3] = useState<boolean>((saved.cleanAsterisk3 as boolean) ?? true);
  const [cleanHash1, setCleanHash1] = useState<boolean>((saved.cleanHash1 as boolean) ?? true);
  const [cleanHash2, setCleanHash2] = useState<boolean>((saved.cleanHash2 as boolean) ?? true);
  const [cleanHash3, setCleanHash3] = useState<boolean>((saved.cleanHash3 as boolean) ?? true);
  const [useOCR, setUseOCR] = useState<boolean>((saved.useOCR as boolean) ?? false);
  const [minChars, setMinChars] = useState<string>(String(saved.minChars ?? 20));
  const [sim, setSim] = useState<string>(String(saved.sim ?? 0.72));
  const [shingle, setShingle] = useState<string>(String(saved.shingle ?? 3));
  const [windowN, setWindowN] = useState<string>(String(saved.windowN ?? 250));

  // Rules
  const [banWords, setBanWords] = useState<string>((saved.banWords as string) || "");
  const [banRegex, setBanRegex] = useState<string>((saved.banRegex as string) || "");
  const [keepWords, setKeepWords] = useState<string>((saved.keepWords as string) || "");
  const [keepRegex, setKeepRegex] = useState<string>((saved.keepRegex as string) || "");
  const [captureWords, setCaptureWords] = useState<string>((saved.captureWords as string) || "");
  const [captureRegex, setCaptureRegex] = useState<string>((saved.captureRegex as string) || "");

  const fileRef = useRef<HTMLInputElement>(null);

  // Auto-save to localStorage
  useEffect(() => {
    saveLS({
      raw, banWords, banRegex, keepWords, keepRegex, captureWords, captureRegex,
      cleanSymbols, dedupeExact, dedupeNear, keepOrder, splitLarge,
      cleanAsterisk1, cleanAsterisk2, cleanAsterisk3, cleanHash1, cleanHash2, cleanHash3,
      useOCR, minChars, sim, shingle, windowN, lastOut: outText
    });
  }, [raw, banWords, banRegex, keepWords, keepRegex, captureWords, captureRegex,
    cleanSymbols, dedupeExact, dedupeNear, keepOrder, splitLarge,
    cleanAsterisk1, cleanAsterisk2, cleanAsterisk3, cleanHash1, cleanHash2, cleanHash3,
    useOCR, minChars, sim, shingle, windowN, outText]);

  // ── File import ──────────────────────────────────────────────────────────────
  const handleFiles = useCallback(async (files: FileList) => {
    if (!files.length) return;
    setProcessing(true);
    setStatus("Importando arquivos…");
    let combined = "";

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      try {
        if (ext === "txt" || ext === "md") {
          combined += await file.text() + "\n\n";
        } else if (ext === "json") {
          const txt = await file.text();
          let obj: unknown;
          try { obj = JSON.parse(txt); } catch { combined += txt + "\n\n"; continue; }
          const parts: string[] = [];
          (function walk(x: unknown) {
            if (x == null) return;
            if (typeof x === "string") { if (x.trim()) parts.push(x); return; }
            if (Array.isArray(x)) { x.forEach(walk); return; }
            if (typeof x === "object") { Object.values(x as Record<string, unknown>).forEach(walk); return; }
          })(obj);
          combined += parts.join("\n\n") + "\n\n";
        } else if (ext === "docx") {
          setStatus(`Convertendo DOCX: ${file.name}…`);
          const mammoth = await import("mammoth");
          const buf = await file.arrayBuffer();
          const res = await mammoth.extractRawText({ arrayBuffer: buf });
          combined += (res.value || "") + "\n\n";
        } else if (ext === "pdf") {
          setStatus(`Extraindo PDF: ${file.name}…`);
          const pdfjs = await import("pdfjs-dist");
          // Usa unpkg CDN para o worker, evitando problemas de bundling com Vite
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
          const buf = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: buf }).promise;
          const totalPages = pdf.numPages;
          for (let i = 1; i <= totalPages; i++) {
            setStatus(`PDF ${file.name}: página ${i}/${totalPages}…`);
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            if (content.items.length > 0) {
              const pageText = (content.items as Array<{ str: string }>).map(it => it.str).join(" ");
              combined += `--- Página ${i} ---\n${pageText}\n\n`;
            } else if (useOCR) {
              setStatus(`OCR página ${i}/${totalPages}…`);
              try {
                // Carrega Tesseract.js via CDN somente quando necessário
                if (!(window as any).Tesseract) {
                  await new Promise<void>((resolve, reject) => {
                    const s = document.createElement("script");
                    s.src = "https://unpkg.com/tesseract.js@4.0.1/dist/tesseract.min.js";
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error("Falha ao carregar Tesseract"));
                    document.head.appendChild(s);
                  });
                }
                const Tesseract = (window as any).Tesseract;
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d")!;
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvas, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport } as any).promise;
                const imgData = canvas.toDataURL("image/png");
                const worker = await Tesseract.createWorker("por");
                const ocrResult = await worker.recognize(imgData);
                await worker.terminate();
                combined += `--- Página ${i} (OCR) ---\n${ocrResult.data.text}\n\n`;
              } catch {
                combined += `--- Página ${i} (Erro OCR) ---\nNão foi possível extrair.\n\n`;
              }
            } else {
              combined += `--- Página ${i} ---\n[Sem texto extraível — ative OCR para digitalizado]\n\n`;
            }
          }
        }
      } catch (e: any) {
        toast({ title: `Erro ao importar ${file.name}`, description: e?.message, variant: "destructive" });
      }
    }

    setRaw(prev => prev ? prev + "\n\n" + combined.trim() : combined.trim());
    setStatus(`Importação concluída (${files.length} arquivo${files.length > 1 ? "s" : ""}).`);
    setProcessing(false);
  }, [useOCR, toast]);

  // ── Run filter ───────────────────────────────────────────────────────────────
  const runFilter = useCallback(() => {
    if (!raw.trim()) {
      toast({ title: "Cole o texto ou importe arquivos primeiro.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    setStatus("Filtrando…");

    setTimeout(() => {
      try {
        const cfg: FilterCfg = {
          cleanSymbols, cleanAsterisk1, cleanAsterisk2, cleanAsterisk3,
          cleanHash1, cleanHash2, cleanHash3,
          dedupeExact, dedupeNear, keepOrder, splitLarge,
          minChars: Math.max(0, Number(minChars) || 0),
          sim: Math.max(0.5, Math.min(0.95, Number(sim) || 0.72)),
          shingleSize: Math.max(2, Math.min(5, Number(shingle) || 3)),
          windowN: Math.max(10, Math.min(2000, Number(windowN) || 250)),
          banWords: parseLines(banWords),
          banRegexList: buildRegexList(parseLines(banRegex)),
          keepWords: parseLines(keepWords),
          keepRegexList: buildRegexList(parseLines(keepRegex)),
          captureWords: parseLines(captureWords),
          captureRegexList: buildRegexList(parseLines(captureRegex)),
        };
        const res = filterText(raw, cfg);
        setOutText(res.outText);
        setRemoved(res.removed);
        setStats(res.stats);
        setStatus(
          `✅ Pronto — ${res.stats.kept} parágrafos mantidos, ` +
          `${res.stats.removed} removidos de ${res.stats.total} total.`
        );
      } catch (e: any) {
        setStatus("Erro ao filtrar: " + (e?.message || "desconhecido"));
      } finally {
        setProcessing(false);
      }
    }, 50);
  }, [raw, cleanSymbols, cleanAsterisk1, cleanAsterisk2, cleanAsterisk3,
    cleanHash1, cleanHash2, cleanHash3, dedupeExact, dedupeNear, keepOrder, splitLarge,
    minChars, sim, shingle, windowN, banWords, banRegex, keepWords, keepRegex, captureWords, captureRegex]);

  // ── Export ───────────────────────────────────────────────────────────────────
  const exportTxt = () => download("filtrado.txt", outText);
  const exportJson = () => download("filtrado.json", JSON.stringify({ createdAt: new Date().toISOString(), output: outText, stats }, null, 2), "application/json");
  const exportMarkdown = () => download("filtrado.md", outText, "text/markdown;charset=utf-8");
  const exportWord = () => {
    const paragraphs = outText.split(/\n\n+/);
    let body = "";
    for (const p of paragraphs) {
      if (!p.trim()) continue;
      const safe = escapeHtml(p.trim());
      body += `<p style="font-family:'Times New Roman',serif;font-size:12pt;line-height:1.5;margin-bottom:12pt;">${safe}</p>`;
    }
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'></head><body>${body}</body></html>`;
    download("filtrado.doc", html, "application/msword");
  };
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(outText);
      toast({ title: "Texto copiado!", description: "Pode colar no Word (Ctrl+V)" });
    } catch {
      toast({ title: "Erro ao copiar", variant: "destructive" });
    }
  };
  const exportRemovedTxt = () => download("removidos.txt", removed.map((r, i) => `${i + 1}. [${r.motivo}]\n${r.texto}`).join("\n\n"));
  const exportRemovedJson = () => download("removidos.json", JSON.stringify(removed, null, 2), "application/json");

  // ── Render ───────────────────────────────────────────────────────────────────
  const CkBox = ({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(!!v)} data-testid={`check-${id}`} />
      <label htmlFor={id} className="text-xs text-muted-foreground cursor-pointer select-none">{label}</label>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b px-4 py-2 flex items-center gap-3 bg-card shrink-0">
        <Link href="/">
          <Button size="sm" variant="ghost" className="gap-1 text-xs text-muted-foreground" data-testid="button-back-home">
            <ChevronLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
        </Link>
        <Filter className="w-4 h-4 text-yellow-500" />
        <span className="font-semibold text-sm">Filtrador Jurídico</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Limpa repetições, sujeira e prepara textos para a IA
        </span>
        {stats && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            <span className="text-green-600 dark:text-green-400 font-medium">{stats.kept} mantidos</span>
            <span className="text-red-500 font-medium">{stats.removed} removidos</span>
            <span className="text-muted-foreground">{stats.total} total</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden gap-0">
        {/* ── LEFT PANEL ── */}
        <div className="w-[400px] min-w-[320px] border-r flex flex-col overflow-y-auto bg-card/50">
          <div className="p-3 space-y-4 flex-1">

            {/* Import */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Upload className="w-3.5 h-3.5" /> Importar Arquivos
              </h2>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".txt,.pdf,.docx,.json,.md"
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
                data-testid="input-import-files"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1.5"
                onClick={() => fileRef.current?.click()}
                disabled={processing}
                data-testid="button-import-files"
              >
                <Upload className="w-3.5 h-3.5" />
                {processing ? "Processando…" : "Selecionar TXT / PDF / DOCX / JSON / MD"}
              </Button>
              <div className="flex items-center gap-2 mt-2">
                <Checkbox id="useOCR" checked={useOCR} onCheckedChange={v => setUseOCR(!!v)} data-testid="check-useOCR" />
                <label htmlFor="useOCR" className="text-xs text-muted-foreground cursor-pointer">
                  Usar OCR para PDFs digitalizados <span className="text-yellow-500">(lento)</span>
                </label>
              </div>
            </section>

            {/* Raw text */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Texto Bruto
              </h2>
              <Textarea
                value={raw}
                onChange={e => setRaw(e.target.value)}
                placeholder="Cole aqui o texto gigante… ou importe arquivos acima"
                className="min-h-[140px] text-xs font-mono resize-y"
                data-testid="textarea-raw-text"
              />
              <div className="flex justify-between items-center mt-1">
                <span className="text-[10px] text-muted-foreground">{raw.length.toLocaleString()} caracteres</span>
                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-red-500" onClick={() => setRaw("")} data-testid="button-clear-raw">
                  <Eraser className="w-3 h-3 mr-1" /> Limpar
                </Button>
              </div>
            </section>

            {/* General config */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Settings className="w-3.5 h-3.5" /> Configurações Gerais
              </h2>
              <div className="border rounded-md p-3 space-y-2">
                <div className="grid grid-cols-2 gap-1.5">
                  <CkBox id="cleanSymbols" label="Limpar símbolos / markdown" checked={cleanSymbols} onChange={setCleanSymbols} />
                  <CkBox id="dedupeExact" label="Remover duplicatas exatas" checked={dedupeExact} onChange={setDedupeExact} />
                  <CkBox id="dedupeNear" label="Remover duplic. aproximadas" checked={dedupeNear} onChange={setDedupeNear} />
                  <CkBox id="keepOrder" label="Manter ordem original" checked={keepOrder} onChange={setKeepOrder} />
                  <CkBox id="splitLarge" label="Dividir trechos grandes" checked={splitLarge} onChange={setSplitLarge} />
                  <CkBox id="cleanAsterisk1" label="Limpar * (1x)" checked={cleanAsterisk1} onChange={setCleanAsterisk1} />
                  <CkBox id="cleanAsterisk2" label="Limpar ** (2x)" checked={cleanAsterisk2} onChange={setCleanAsterisk2} />
                  <CkBox id="cleanAsterisk3" label="Limpar *** (3x)" checked={cleanAsterisk3} onChange={setCleanAsterisk3} />
                  <CkBox id="cleanHash1" label="Limpar # (1x)" checked={cleanHash1} onChange={setCleanHash1} />
                  <CkBox id="cleanHash2" label="Limpar ## (2x)" checked={cleanHash2} onChange={setCleanHash2} />
                  <CkBox id="cleanHash3" label="Limpar ### (3x)" checked={cleanHash3} onChange={setCleanHash3} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Mín. caracteres</Label>
                    <Input type="number" value={minChars} onChange={e => setMinChars(e.target.value)} className="h-7 text-xs" data-testid="input-min-chars" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Similaridade (0.50–0.95)</Label>
                    <Input type="number" step="0.01" value={sim} onChange={e => setSim(e.target.value)} className="h-7 text-xs" data-testid="input-similarity" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Shingle (2–5)</Label>
                    <Input type="number" value={shingle} onChange={e => setShingle(e.target.value)} className="h-7 text-xs" data-testid="input-shingle" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Janela (parágrafos)</Label>
                    <Input type="number" value={windowN} onChange={e => setWindowN(e.target.value)} className="h-7 text-xs" data-testid="input-window" />
                  </div>
                </div>
              </div>
            </section>

            {/* Exclusion rules */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Trash2 className="w-3.5 h-3.5 text-red-500" /> Regras de Exclusão
              </h2>
              <div className="border rounded-md p-3 space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Excluir se contiver (1 por linha)</Label>
                  <Textarea value={banWords} onChange={e => setBanWords(e.target.value)} placeholder={"modelo padrão\npede deferimento"} className="min-h-[70px] text-xs font-mono resize-y mt-1" data-testid="textarea-ban-words" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Excluir por REGEX</Label>
                  <Textarea value={banRegex} onChange={e => setBanRegex(e.target.value)} placeholder={"^\\s{3,}.$"} className="min-h-[50px] text-xs font-mono resize-y mt-1" data-testid="textarea-ban-regex" />
                </div>
                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-red-500 w-full" onClick={() => { setBanWords(""); setBanRegex(""); }} data-testid="button-clear-ban-rules">
                  <Eraser className="w-3 h-3 mr-1" /> Limpar Exclusão
                </Button>
              </div>
            </section>

            {/* VIP rules */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-green-500" /> Regras VIP (Manter Sempre)
              </h2>
              <div className="border rounded-md p-3 space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Manter se contiver (1 por linha)</Label>
                  <Textarea value={keepWords} onChange={e => setKeepWords(e.target.value)} placeholder={"urgente\nimportante"} className="min-h-[60px] text-xs font-mono resize-y mt-1" data-testid="textarea-keep-words" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Manter por REGEX</Label>
                  <Textarea value={keepRegex} onChange={e => setKeepRegex(e.target.value)} placeholder={"^URGENTE"} className="min-h-[40px] text-xs font-mono resize-y mt-1" data-testid="textarea-keep-regex" />
                </div>
                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-red-500 w-full" onClick={() => { setKeepWords(""); setKeepRegex(""); }} data-testid="button-clear-keep-rules">
                  <Eraser className="w-3 h-3 mr-1" /> Limpar VIP
                </Button>
              </div>
            </section>

            {/* Capture rules */}
            <section>
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-blue-500" /> Regras de Captura (Destaque)
              </h2>
              <div className="border rounded-md p-3 space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Destacar se contiver (1 por linha)</Label>
                  <Textarea value={captureWords} onChange={e => setCaptureWords(e.target.value)} placeholder={"falsificação\nestelionato"} className="min-h-[60px] text-xs font-mono resize-y mt-1" data-testid="textarea-capture-words" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Destacar por REGEX</Label>
                  <Textarea value={captureRegex} onChange={e => setCaptureRegex(e.target.value)} placeholder={"\\b(falsificação|fraude)\\b"} className="min-h-[40px] text-xs font-mono resize-y mt-1" data-testid="textarea-capture-regex" />
                </div>
                <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2 text-red-500 w-full" onClick={() => { setCaptureWords(""); setCaptureRegex(""); }} data-testid="button-clear-capture-rules">
                  <Eraser className="w-3 h-3 mr-1" /> Limpar Captura
                </Button>
              </div>
            </section>

            {/* Regex guide */}
            <section>
              <details className="border rounded-md">
                <summary className="px-3 py-2 text-xs font-medium cursor-pointer flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-muted-foreground" /> Guia Rápido de Regex
                </summary>
                <div className="px-3 pb-3 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                  <p><strong>\b</strong> — limite de palavra: <code className="bg-muted px-1 rounded">\bFraude\b</code></p>
                  <p><strong>^</strong> — início de linha: <code className="bg-muted px-1 rounded">^Modelo</code></p>
                  <p><strong>$</strong> — fim de linha: <code className="bg-muted px-1 rounded">deferimento$</code></p>
                  <p><strong>|</strong> — ou: <code className="bg-muted px-1 rounded">Fraude|Estelionato</code></p>
                  <p><strong>{"[\\s\\S]{0,500}"}</strong> — até 500 chars de contexto</p>
                  <p className="text-yellow-600 dark:text-yellow-400">Dica: teste em regex101.com antes de usar aqui.</p>
                </div>
              </details>
            </section>
          </div>

          {/* Sticky bottom action buttons */}
          <div className="sticky bottom-0 border-t bg-card p-3 space-y-2">
            {/* Status */}
            <div className={`text-[11px] rounded-md px-3 py-2 border flex items-center gap-2 ${
              status.startsWith("✅") ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
              : status.startsWith("Erro") ? "border-red-500/30 bg-red-500/10 text-red-700"
              : "border-border bg-muted/30 text-muted-foreground"
            }`} data-testid="filter-status">
              {processing ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> :
               status.startsWith("✅") ? <CheckCircle2 className="w-3 h-3 shrink-0" /> :
               status.startsWith("Erro") ? <AlertCircle className="w-3 h-3 shrink-0" /> : null}
              {status}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={runFilter}
                disabled={processing || !raw.trim()}
                className="gap-1.5 text-xs font-bold"
                data-testid="button-run-filter"
              >
                {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
                Filtrar Agora
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs gap-1"
                onClick={() => {
                  if (confirm("Limpar tudo?")) {
                    setRaw(""); setOutText(""); setRemoved([]); setStats(null); setStatus("Pronto.");
                  }
                }}
                data-testid="button-clear-all"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar Tudo
              </Button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b px-3 py-2 flex flex-wrap gap-2 items-center bg-card/50 shrink-0">
            <span className="text-xs font-medium text-muted-foreground mr-1">Resultado Filtrado</span>
            <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={copyText} disabled={!outText} data-testid="button-copy-filtered">
              <Copy className="w-3.5 h-3.5" /> Copiar
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={exportTxt} disabled={!outText} data-testid="button-export-txt">
              <Download className="w-3.5 h-3.5" /> TXT
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={exportWord} disabled={!outText} data-testid="button-export-word">
              <FileText className="w-3.5 h-3.5" /> Word
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={exportJson} disabled={!outText} data-testid="button-export-json">
              <Download className="w-3.5 h-3.5" /> JSON
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={exportMarkdown} disabled={!outText} data-testid="button-export-md">
              <Download className="w-3.5 h-3.5" /> MD
            </Button>
            {removed.length > 0 && (
              <Button
                size="sm"
                variant={showRemoved ? "secondary" : "ghost"}
                className="text-xs gap-1 h-7 ml-auto"
                onClick={() => setShowRemoved(v => !v)}
                data-testid="button-toggle-removed"
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                {showRemoved ? "Ver resultado" : `Ver removidos (${removed.length})`}
              </Button>
            )}
          </div>

          {/* Removed export bar */}
          {showRemoved && removed.length > 0 && (
            <div className="border-b px-3 py-1.5 flex gap-2 bg-red-500/5 shrink-0">
              <span className="text-[10px] text-muted-foreground self-center">Exportar removidos:</span>
              <Button size="sm" variant="outline" className="text-[10px] h-6 gap-1" onClick={exportRemovedTxt} data-testid="button-export-removed-txt">TXT</Button>
              <Button size="sm" variant="outline" className="text-[10px] h-6 gap-1" onClick={exportRemovedJson} data-testid="button-export-removed-json">JSON</Button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {showRemoved ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-500 mb-3">{removed.length} parágrafos removidos:</p>
                {removed.slice(0, 300).map((r, i) => (
                  <div key={i} className="border-l-2 border-red-400 pl-3 py-1 bg-red-500/5 rounded-r text-xs" data-testid={`removed-item-${i}`}>
                    <p className="font-medium text-red-600 dark:text-red-400 text-[10px] mb-0.5">{i + 1}. {r.motivo}</p>
                    <p className="text-muted-foreground font-mono leading-relaxed">{r.texto}</p>
                  </div>
                ))}
                {removed.length > 300 && (
                  <p className="text-xs text-muted-foreground text-center py-4">… e mais {removed.length - 300} itens (exportar para ver todos)</p>
                )}
              </div>
            ) : outText ? (
              <pre
                className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground"
                style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "12pt", lineHeight: "1.6" }}
                data-testid="filtered-output"
              >
                {outText}
              </pre>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-3 py-20">
                <Filter className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">O texto filtrado aparece aqui</p>
                <p className="text-xs max-w-sm opacity-70">
                  Cole o texto bruto (ou importe PDF/DOCX) no painel esquerdo,
                  configure as regras e clique em <strong>Filtrar Agora</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
