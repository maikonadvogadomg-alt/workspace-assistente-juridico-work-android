import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "wouter";
import {
  Play,
  Code2,
  Eye,
  Copy,
  Download,
  Trash2,
  FileCode,
  Paintbrush,
  Braces,
  Save,
  FolderOpen,
  RotateCcw,
  Pencil,
  Check,
  X,
  Search,
  CodeXml,
  Gavel,
  Upload,
  Maximize,
  PanelLeftClose,
  PanelLeftOpen,
  Atom,
  Terminal,
  Globe,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Snippet } from "@shared/schema";

type PlaygroundMode = "html" | "react" | "python";

const DEFAULT_HTML = `<div style="max-width: 600px; margin: 40px auto; padding: 20px; font-family: sans-serif;">
  <h1 style="color: #333;">Bem-vindo ao HTML Playground</h1>
  <p style="color: #666; margin: 16px 0;">Cole seu codigo HTML aqui e veja o resultado ao vivo!</p>
  <button onclick="alert('Funcionou!')" style="padding: 10px 24px; font-size: 16px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer;">Clique aqui</button>
</div>`;

const DEFAULT_JSX = `// ALQUIMIA v.14 — Central de Dossiês e Modelos
// Lê PDF do INSS via PDF.js (CDN), salva histórico no localStorage
// SEM Firebase, SEM npm packages — roda 100% no Playground

const S = {
  page: { minHeight:'100vh', background:'#0a0a0a', color:'#cbd5e1', padding:'24px', fontFamily:'system-ui,sans-serif' },
  wrap: { maxWidth:1200, margin:'0 auto' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'2px solid #a3a082', paddingBottom:24, marginBottom:32, flexWrap:'wrap', gap:16 },
  avatar: { width:56, height:56, background:'#a3a082', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontWeight:'bold', fontSize:22, border:'2px solid white' },
  title: { color:'#a3a082', fontWeight:'bold', fontSize:20, letterSpacing:-0.5, margin:0 },
  sub: { fontSize:9, letterSpacing:4, opacity:0.6, textTransform:'uppercase', margin:0 },
  nav: { display:'flex', background:'#161614', padding:4, borderRadius:12, border:'1px solid #2d2d2a' },
  navBtn: (active) => ({ padding:'6px 16px', borderRadius:8, fontSize:11, fontWeight:'bold', border:'none', cursor:'pointer', background: active ? '#a3a082' : 'transparent', color: active ? '#000' : '#64748b' }),
  saveBtn: { background:'#5d5e53', color:'white', padding:'8px 20px', borderRadius:12, fontWeight:'bold', fontSize:11, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:8 },
  main: { display:'grid', gridTemplateColumns:'1fr 2fr', gap:32 },
  section: { background:'#161614', padding:20, borderRadius:16, border:'1px solid #2d2d2a', marginBottom:16 },
  sLabel: { color:'#a3a082', fontSize:9, fontWeight:900, textTransform:'uppercase', letterSpacing:2, marginBottom:12, display:'flex', alignItems:'center', gap:8 },
  uploadZone: { padding:40, borderRadius:16, border:'2px dashed #2d2d2a', textAlign:'center', cursor:'pointer', background:'#161614' },
  fieldBox: { background:'#000', padding:12, borderRadius:10, border:'1px solid #1e1e1e', marginBottom:8 },
  fieldLabel: { fontSize:9, fontWeight:'bold', color:'#475569', textTransform:'uppercase', display:'block', marginBottom:2 },
  input: { width:'100%', background:'transparent', border:'none', outline:'none', color:'#e2e8f0', fontSize:12, fontWeight:'bold', boxSizing:'border-box' },
  grid2: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  docArea: { background:'white', color:'black', padding:64, borderRadius:8, minHeight:900 },
  copyBtn: { background:'#000', color:'white', padding:'10px 20px', borderRadius:10, fontWeight:'bold', fontSize:11, border:'none', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8, marginRight:8 },
  printBtn: { background:'#f0f0f0', color:'#000', padding:'10px 20px', borderRadius:10, fontWeight:'bold', fontSize:11, border:'none', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8 },
  statusOk: { background:'rgba(16,185,129,0.1)', color:'#4ade80', border:'1px solid rgba(16,185,129,0.3)', padding:'12px 16px', borderRadius:10, marginBottom:16, fontWeight:'bold', fontSize:13 },
  statusErr: { background:'rgba(239,68,68,0.1)', color:'#f87171', border:'1px solid rgba(239,68,68,0.3)', padding:'12px 16px', borderRadius:10, marginBottom:16, fontWeight:'bold', fontSize:13 },
  histItem: { background:'#000', padding:12, borderRadius:10, border:'1px solid #1e1e1e', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 },
  tabBtn: (active) => ({ padding:'8px 20px', borderRadius:10, fontSize:11, fontWeight:'bold', border:\`1px solid \${active?'#000':'#e2e8f0'}\`, cursor:'pointer', background:active?'#000':'#f8fafc', color:active?'white':'#9ca3af', marginLeft:6 }),
  textarea: { width:'100%', height:320, background:'#f8fafc', border:'1px solid #e2e8f0', padding:24, borderRadius:12, fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box', resize:'vertical' },
};

const DEFAULT_TEMPLATES = [
  { id:'proc', titulo:'Procuração (Modelo Adjair)', texto:\`PROCURAÇÃO AD JUDICIA ET EXTRA

OUTORGANTE: {{NOME}}, {{NACIONALIDADE}}, {{ESTADO_CIVIL}}, portador(a) da cédula de identidade RG nº {{RG}} {{ORGAO}}, inscrito(a) no CPF sob o nº {{CPF}} e NIT nº {{NIT}}, residente e domiciliado(a) na {{ENDERECO}}, bairro {{BAIRRO}}, na cidade de {{CIDADE}}, CEP {{CEP}}.

OUTORGADO: MAIKON DA ROCHA, OAB/MG nº 183.712, com endereço profissional na Avenida Agenor Carlos Werner nº 304, Centro, Manhumirim/MG.

PODERES: Pelo presente instrumento o outorgante confere ao outorgado amplos poderes para o foro em geral, com cláusula ad judicia et extra, especialmente para requerer concessão/revisão de benefícios previdenciários junto ao INSS.

CLÁUSULA DE HONORÁRIOS: Fica autorizado o destaque de 30% do proveito econômico obtido.\` },
  { id:'contr', titulo:'Contrato de Honorários', texto:\`CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATANTE: {{NOME}}, inscrito(a) no CPF sob o nº {{CPF}}.
CONTRATADO: MAIKON DA ROCHA, OAB/MG.

VALOR: 30% sobre o êxito da demanda previdenciária.\` }
];

const FICHA_VAZIA = { nome:'',nit:'',cpf:'',rg:'',orgao:'SSP',nascimento:'',mae:'',estadoCivil:'CASADO(A)',nacionalidade:'BRASILEIRA',endereco:'',bairro:'',cidade:'',cep:'' };
const LS_KEY = 'alquimia_historico_v14';

function App() {
  const [aba, setAba] = useState('importar');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [ficha, setFicha] = useState({...FICHA_VAZIA});
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [templateAtivo, setTemplateAtivo] = useState(0);
  const [historico, setHistorico] = useState(() => { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]'); } catch { return []; } });
  const fileInputRef = useRef(null);

  const mostrarStatus = (type, text) => {
    setStatus({type, text});
    if (type !== 'error') setTimeout(() => setStatus(null), 3000);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!window.pdfjsLib) { mostrarStatus('error', 'PDF.js carregando... aguarde um instante e tente novamente.'); return; }
    setLoading(true);
    mostrarStatus('info', 'Extraindo dados do PDF...');
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\\n';
      }
      processarDados(text);
    } catch (err) {
      mostrarStatus('error', 'Não foi possível ler este PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const processarDados = (text) => {
    const clean = text.replace(/[\\uFFFD\\uFFFE\\uFFFF]/g,'').replace(/\\s+/g,' ');
    const d = {...FICHA_VAZIA};
    const get = (re) => { const m = clean.match(re); return m ? m[1] : null; };
    const rg = get(/(?:Identidade|RG|Número)\\s*(?:Número:|nº|n)\\s*([\\d.xX-]+)/i);
    const orgao = get(/(?:Órgão Emissor:|Órgão)\\s*([A-Z/]+)/i);
    const nit = get(/NIT\\s*(\\d{3}\\.\\d{5}\\.\\d{2}-\\d)/i);
    const cpf = get(/CPF\\s*(\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2})/i);
    const est = get(/Estado Civil\\s*([A-Z\\s(A)]+)/i);
    const log = get(/Logradouro:\\s*([^,]+)/i);
    const num = get(/Número:\\s*(\\d+)/i);
    const bairro = get(/Bairro:\\s*([^,]+)/i);
    const cidade = clean.match(/([A-ZÀ-Ú\\s]{3,})\\s*-\\s*([A-Z]{2})/i);
    const cep = get(/CEP:\\s*(\\d{8})/i);
    if (rg) d.rg = rg;
    if (orgao) d.orgao = orgao;
    if (nit) d.nit = nit;
    if (cpf) d.cpf = cpf;
    if (est) d.estadoCivil = est.trim();
    if (log && num) d.endereco = \`\${log.trim()}, \${num}\`;
    if (bairro) d.bairro = bairro.trim();
    if (cidade) d.cidade = \`\${cidade[1].trim()} - \${cidade[2]}\`;
    if (cep) d.cep = cep.replace(/(\\d{5})(\\d{3})/, '$1-$2');
    const nomes = clean.match(/[A-ZÀ-Ú]{4,}(?:\\s[A-ZÀ-Ú]{2,}){2,}/g);
    if (nomes) {
      const ign = ['INSTITUTO NACIONAL','SEGURO SOCIAL','CADASTRO NACIONAL','DADOS CADASTRAIS'];
      d.nome = nomes.find(n => !ign.some(ig => n.includes(ig))) || '';
    }
    setFicha(d);
    mostrarStatus('success', '✅ Dossiê preenchido automaticamente!');
  };

  const documentoGerado = useMemo(() => {
    let t = templates[templateAtivo].texto;
    return t
      .replace(/{{NOME}}/g, ficha.nome||'____________________')
      .replace(/{{RG}}/g, ficha.rg||'__________')
      .replace(/{{ORGAO}}/g, ficha.orgao||'SSP')
      .replace(/{{CPF}}/g, ficha.cpf||'___.___.___-__')
      .replace(/{{NIT}}/g, ficha.nit||'___.___.___-_')
      .replace(/{{ENDERECO}}/g, ficha.endereco||'____________________')
      .replace(/{{BAIRRO}}/g, ficha.bairro||'__________')
      .replace(/{{CIDADE}}/g, ficha.cidade||'__________')
      .replace(/{{CEP}}/g, ficha.cep||'_____-___')
      .replace(/{{ESTADO_CIVIL}}/g, ficha.estadoCivil||'__________')
      .replace(/{{NACIONALIDADE}}/g, ficha.nacionalidade||'BRASILEIRA');
  }, [ficha, templates, templateAtivo]);

  const copiarWord = () => {
    navigator.clipboard.writeText(documentoGerado).then(() => mostrarStatus('success', '✅ Copiado! Cole no Word (Ctrl+V).'));
  };

  const salvarLocal = () => {
    if (!ficha.nome) { mostrarStatus('error', 'Preencha o nome antes de salvar.'); return; }
    const novo = [...historico.filter(h => h.nome !== ficha.nome), { nome:ficha.nome, data:new Date().toISOString(), ficha:{...ficha} }];
    setHistorico(novo);
    localStorage.setItem(LS_KEY, JSON.stringify(novo));
    mostrarStatus('success', '✅ Dossiê salvo localmente!');
  };

  const excluir = (nome, e) => {
    e.stopPropagation();
    const novo = historico.filter(h => h.nome !== nome);
    setHistorico(novo);
    localStorage.setItem(LS_KEY, JSON.stringify(novo));
  };

  const Field = ({label, field}) => (
    <div style={S.fieldBox}>
      <span style={S.fieldLabel}>{label}</span>
      <input style={S.input} value={ficha[field]||''} onChange={e=>setFicha({...ficha,[field]:e.target.value})} />
    </div>
  );

  return (
    <div style={S.page}>
      <style>{\`@media print{.noprint{display:none!important}body{background:white!important;color:black!important}}\`}</style>
      <div style={S.wrap}>
        <header style={S.header} className="noprint">
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <div style={S.avatar}>M</div>
            <div>
              <p style={S.title}>MAIKON CALDEIRA</p>
              <p style={S.sub}>Alquimia v.14 — Central de Dossiês e Modelos</p>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <nav style={S.nav}>
              <button style={S.navBtn(aba==='importar')} onClick={()=>setAba('importar')}>FICHA</button>
              <button style={S.navBtn(aba==='modelos')} onClick={()=>setAba('modelos')}>EDITAR TEXTO</button>
            </nav>
            <button style={S.saveBtn} onClick={salvarLocal}>💾 SALVAR</button>
          </div>
        </header>

        {status && <div style={status.type==='error'?S.statusErr:S.statusOk}>{status.text}</div>}

        <div style={S.main}>
          <div className="noprint">
            <div style={{...S.uploadZone, opacity:loading?0.5:1}} onClick={()=>!loading&&fileInputRef.current.click()}>
              <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFile} style={{display:'none'}} />
              <div style={{fontSize:36,marginBottom:8}}>{loading?'⏳':'📄'}</div>
              <p style={{fontWeight:'bold',color:'white',margin:0}}>{loading?'Processando PDF...':'Importar PDF do INSS'}</p>
              <p style={{fontSize:10,color:'#475569',margin:'4px 0 0',textTransform:'uppercase',letterSpacing:2}}>Dados Cadastrais ou CNIS</p>
            </div>
            <div style={S.section}>
              <div style={S.sLabel}>👤 Dossiê do Segurado</div>
              <Field label="Nome Completo" field="nome" />
              <div style={S.grid2}><Field label="CPF" field="cpf" /><Field label="RG" field="rg" /></div>
              <div style={S.grid2}><Field label="Órgão" field="orgao" /><Field label="NIT" field="nit" /></div>
              <Field label="📍 Endereço" field="endereco" />
              <div style={S.grid2}><Field label="Bairro" field="bairro" /><Field label="CEP" field="cep" /></div>
              <Field label="Cidade - UF" field="cidade" />
              <div style={S.grid2}><Field label="Estado Civil" field="estadoCivil" /><Field label="Nacionalidade" field="nacionalidade" /></div>
            </div>
            <div style={S.section}>
              <div style={S.sLabel}>🗂️ Casos Salvos</div>
              {historico.length===0 && <p style={{fontSize:11,color:'#475569',fontStyle:'italic'}}>Nenhum caso salvo ainda.</p>}
              {historico.map(h=>(
                <div key={h.nome} style={S.histItem} onClick={()=>setFicha({...h.ficha})}>
                  <div>
                    <p style={{margin:0,fontSize:11,fontWeight:'bold',color:'white'}}>{h.nome}</p>
                    <p style={{margin:0,fontSize:9,color:'#475569'}}>{new Date(h.data).toLocaleDateString()}</p>
                  </div>
                  <button onClick={e=>excluir(h.nome,e)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16}}>🗑️</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={S.docArea}>
              <div style={{marginBottom:32}} className="noprint">
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
                  <span style={{fontSize:11,fontWeight:900,color:'#9ca3af',textTransform:'uppercase'}}>Modelos</span>
                  <div>{templates.map((t,i)=>(
                    <button key={t.id} style={S.tabBtn(templateAtivo===i)} onClick={()=>setTemplateAtivo(i)}>{t.titulo}</button>
                  ))}</div>
                </div>
                {aba==='modelos' && (
                  <div>
                    <p style={{fontSize:10,color:'#9ca3af',marginBottom:8}}>Cole seu texto. Use {'{{NOME}}, {{CPF}}, {{RG}}, {{ENDERECO}}, {{NIT}}'}</p>
                    <textarea style={S.textarea} value={templates[templateAtivo].texto}
                      onChange={e=>{const n=[...templates];n[templateAtivo]={...n[templateAtivo],texto:e.target.value};setTemplates(n);}} />
                  </div>
                )}
              </div>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',top:0,right:0,display:'flex',flexWrap:'wrap',gap:4}} className="noprint">
                  <button style={S.copyBtn} onClick={copiarWord}>📋 Copiar para o Word</button>
                  <button style={S.printBtn} onClick={()=>window.print()}>🖨️ Imprimir/PDF</button>
                </div>
                <div style={{textAlign:'center',marginBottom:48,paddingTop:8}}>
                  <p style={{fontSize:9,fontWeight:'bold',letterSpacing:5,textTransform:'uppercase',borderBottom:'2px solid black',paddingBottom:4,display:'inline-block'}}>Maikon Caldeira — Advocacia Estratégica</p>
                  <h2 style={{fontSize:18,fontWeight:900,textTransform:'uppercase',margin:'8px 0 0'}}>Instrumento de Mandato e Peça Técnica</h2>
                </div>
                <div style={{whiteSpace:'pre-wrap',fontSize:'12pt',lineHeight:1.8,textAlign:'justify',fontFamily:'Times New Roman,serif'}}>
                  {documentoGerado}
                </div>
                <div style={{marginTop:80,paddingTop:24,borderTop:'1px solid #e5e7eb',display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:16}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{width:200,borderBottom:'2px solid black',marginBottom:4}}></div>
                    <p style={{fontSize:10,fontWeight:'bold',textTransform:'uppercase',letterSpacing:2,margin:0}}>Maikon Caldeira</p>
                    <p style={{fontSize:8,color:'#9ca3af',textTransform:'uppercase',letterSpacing:2,margin:0}}>OAB/MG nº 183.712</p>
                  </div>
                  <div style={{fontSize:9,color:'#9ca3af',fontStyle:'italic'}}>Dossiê auditado em {new Date().toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}`;

const DEFAULT_PYTHON = `# PYTHON NO NAVEGADOR — funciona com biblioteca padrão + numpy/pandas
# Use print() para ver resultados
# NÃO funciona: streamlit, PyPDF2, requests, flask — são pacotes de servidor

# Exemplo: processar texto e montar tabela (equivalente ao Streamlit/PyPDF2)
texto_bruto = """
João Silva,OAB 12345,São Paulo,Ativo
Maria Souza,OAB 67890,Rio de Janeiro,Ativo
Pedro Lima,OAB 11111,Belo Horizonte,Inativo
"""

print("=== TABELA DE DADOS ===")
print(f"{'Nome':<15} {'OAB':<12} {'Cidade':<20} {'Status'}")
print("-" * 60)

linhas = [l.strip() for l in texto_bruto.strip().split("\\n") if l.strip()]
tabela = []
for linha in linhas:
    cols = [c.strip() for c in linha.split(",")]
    tabela.append(cols)
    print(f"{cols[0]:<15} {cols[1]:<12} {cols[2]:<20} {cols[3]}")

print(f"\\nTotal: {len(tabela)} registros")
print(f"Ativos: {sum(1 for r in tabela if r[3] == 'Ativo')}")
`;

const DEFAULT_CSS = ``;

const DEFAULT_JS = `// Exemplo de consulta ao Mock do CNJ (SwaggerHub)
async function testarAPI() {
  const baseUrl = "https://virtserver.swaggerhub.com/MAIKONMG1_12/CNJ/1.0.0";
  const endpoint = "/domicilio-eletronico/api/v1/representados";
  
  try {
    const response = await fetch(baseUrl + endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer SEUTOKENAQUI"
      }
    });
    
    if (!response.ok) {
      throw new Error("Erro HTTP: " + response.status);
    }
    
    const data = await response.json();
    console.log("Dados recebidos do SwaggerHub:", data);
    alert("Sucesso! Verifique os dados no console do navegador (F12).");
  } catch (error) {
    console.error("Erro na requisição:", error);
    alert("Erro na requisição: " + error.message);
  }
}

// Para testar, descomente a linha abaixo e clique em 'Executar'
// testarAPI();`;

const AUTOSAVE_KEY = "html-playground-autosave";

type ActiveTab = "html" | "css" | "js" | "jsx" | "python";
type MobileView = "editor" | "preview";

// Detect code language from content
function detectMode(code: string): PlaygroundMode | null {
  const c = code.trim();
  // React/JSX indicators
  if (/import\s+React/i.test(c) || /from ['"]react['"]/i.test(c) || /<[A-Z][a-zA-Z]*[\s/>]/.test(c)
    || /useState|useEffect|useRef|useCallback/i.test(c) || /jsx/i.test(c.slice(0, 20))) return "react";
  // Python indicators (must not be confused with HTML/JS)
  if (!c.includes("<") && (
    /^(def |class |import |from |print\(|#.*python)/im.test(c)
    || /:\s*\n\s+/.test(c)
    || /^\s*if __name__/m.test(c)
  )) return "python";
  return null;
}

// Pre-process JSX: remove React/ReactDOM imports, handle export default
function preprocessJSX(code: string): string {
  return code
    .replace(/^import\s+React[^;]*;?\s*\n?/gm, "")
    .replace(/^import\s+ReactDOM[^;]*;?\s*\n?/gm, "")
    .replace(/^import\s+\{[^}]*\}\s+from\s+['"]react['"][;]?\s*\n?/gm, "")
    .replace(/^export\s+default\s+function\s+(\w+)/gm, "function $1")
    .replace(/^export\s+default\s+(\w+)\s*;?\s*$/gm, "")
    .replace(/^export\s+\{[^}]*\}\s*;?\s*$/gm, "");
}

export default function Playground() {
  const [html, setHtml] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return JSON.parse(saved).html || DEFAULT_HTML;
    } catch {}
    return DEFAULT_HTML;
  });
  const [css, setCss] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedHtml = parsed.html || "";
        const lower = savedHtml.trim().toLowerCase();
        const isComplete = lower.includes("<!doctype") || (lower.includes("<html") && lower.includes("</html>"));
        if (isComplete) return "";
        return parsed.css ?? DEFAULT_CSS;
      }
    } catch {}
    return DEFAULT_CSS;
  });
  const [js, setJs] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedHtml = parsed.html || "";
        const lower = savedHtml.trim().toLowerCase();
        const isComplete = lower.includes("<!doctype") || (lower.includes("<html") && lower.includes("</html>"));
        if (isComplete) return "";
        return parsed.js ?? DEFAULT_JS;
      }
    } catch {}
    return DEFAULT_JS;
  });
  const [title, setTitle] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return JSON.parse(saved).title || "Sem titulo";
    } catch {}
    return "Sem titulo";
  });
  const [mode, setMode] = useState<PlaygroundMode>(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return (JSON.parse(saved).mode as PlaygroundMode) || "html";
    } catch {}
    return "html";
  });
  const [jsx, setJsx] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return JSON.parse(saved).jsx || DEFAULT_JSX;
    } catch {}
    return DEFAULT_JSX;
  });
  const [python, setPython] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) return JSON.parse(saved).python || DEFAULT_PYTHON;
    } catch {}
    return DEFAULT_PYTHON;
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>("html");
  const [editorCollapsed, setEditorCollapsed] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("editor");
  const [autoRun, setAutoRun] = useState(true);
  const [savedDialogOpen, setSavedDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mobileIframeRef = useRef<HTMLIFrameElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [codeOutput, setCodeOutput] = useState<string>("");
  const [codeError, setCodeError] = useState<string>("");
  const [codeRunning, setCodeRunning] = useState(false);

  const runCodeWithAI = async (codeToRun?: string) => {
    const code = codeToRun ?? python;
    if (!code.trim()) return;
    setCodeRunning(true);
    setCodeOutput("");
    setCodeError("");
    try {
      const res = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language: "python" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        setCodeError(err.message || "Erro no servidor");
      } else {
        const data = await res.json();
        setCodeOutput(data.output || "");
        setCodeError(data.error || "");
      }
    } catch (e: any) {
      setCodeError(e.message || "Erro de conexão");
    } finally {
      setCodeRunning(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ html, css, js, title, mode, jsx, python }));
    } catch {}
  }, [html, css, js, title, mode, jsx, python]);

  const prevHtmlWasComplete = useRef(false);
  useEffect(() => {
    const lower = html.trim().toLowerCase();
    const isComplete = lower.includes("<!doctype") || (lower.includes("<html") && lower.includes("</html>"));
    if (isComplete && !prevHtmlWasComplete.current) {
      if (css !== "" || js !== "") {
        setCss("");
        setJs("");
      }
    }
    prevHtmlWasComplete.current = isComplete;
  }, [html]);

  const isCompleteDocument = useCallback((code: string) => {
    const trimmed = code.trim().toLowerCase();
    return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html");
  }, []);

  const extractCompleteDocument = useCallback((code: string) => {
    const lower = code.toLowerCase();
    const doctypeIdx = lower.indexOf("<!doctype");
    const htmlIdx = lower.indexOf("<html");
    const startIdx = doctypeIdx >= 0 ? doctypeIdx : htmlIdx;
    if (startIdx > 0) {
      return code.substring(startIdx);
    }
    return code;
  }, []);

  const hasCompleteDocument = useCallback((code: string) => {
    const lower = code.trim().toLowerCase();
    return lower.includes("<!doctype") || (lower.includes("<html") && lower.includes("</html>"));
  }, []);

  const handleHtmlPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text");
    // Auto-detect mode
    const detected = detectMode(pasted);
    if (detected === "react") {
      e.preventDefault();
      setMode("react");
      setJsx(pasted);
      setActiveTab("jsx");
      toast({ title: "React/JSX detectado", description: "Modo React ativado automaticamente." });
      return;
    }
    if (detected === "python") {
      e.preventDefault();
      setMode("python");
      setPython(pasted);
      setActiveTab("python");
      toast({ title: "Python detectado", description: "Modo Python ativado automaticamente." });
      return;
    }
    if (hasCompleteDocument(pasted)) {
      e.preventDefault();
      const cleaned = extractCompleteDocument(pasted);
      setHtml(cleaned);
      setCss("");
      setJs("");
      toast({ title: "Documento completo detectado", description: "CSS e JS limpos automaticamente. Seu codigo sera usado como esta." });
    }
  }, [hasCompleteDocument, extractCompleteDocument, toast]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content) {
        toast({ title: "Erro", description: "Arquivo vazio ou nao pode ser lido.", variant: "destructive" });
        return;
      }
      const fileName = file.name.replace(/\.[^.]+$/, "") || "Importado";
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "py") {
        setMode("python");
        setPython(content);
        setTitle(fileName);
        setActiveTab("python");
        toast({ title: "Arquivo importado!", description: `"${file.name}" carregado em modo Python.` });
      } else if (ext === "jsx" || ext === "tsx") {
        setMode("react");
        setJsx(content);
        setTitle(fileName);
        setActiveTab("jsx");
        toast({ title: "Arquivo importado!", description: `"${file.name}" carregado em modo React.` });
      } else if (hasCompleteDocument(content)) {
        setMode("html");
        setHtml(extractCompleteDocument(content));
        setCss("");
        setJs("");
        setTitle(fileName);
        setActiveTab("html");
        toast({ title: "Arquivo importado!", description: `"${file.name}" carregado como documento completo.` });
      } else {
        setMode("html");
        setHtml(content);
        setTitle(fileName);
        setActiveTab("html");
        toast({ title: "Arquivo importado!", description: `"${file.name}" carregado no editor HTML.` });
      }
    };
    reader.onerror = () => {
      toast({ title: "Erro", description: "Nao foi possivel ler o arquivo.", variant: "destructive" });
    };
    reader.readAsText(file);
    if (htmlFileInputRef.current) htmlFileInputRef.current.value = "";
  }, [hasCompleteDocument, extractCompleteDocument, toast]);

  const buildReactDocument = useCallback(() => {
    const processedJsx = preprocessJSX(jsx);
    const needsPdfJs = jsx.includes("pdfjsLib") || jsx.includes("pdf.js");
    const pdfJsScripts = needsPdfJs ? `
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function() {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    }
  });
</script>` : "";
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
${pdfJsScripts}
<style>
*{box-sizing:border-box;} body{margin:0;font-family:sans-serif;}
${css}
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, Fragment } = React;
${processedJsx}
try {
  const _root = ReactDOM.createRoot(document.getElementById('root'));
  _root.render(<App />);
} catch(e) {
  document.getElementById('root').innerHTML =
    '<div style="color:red;padding:20px;font-family:monospace;white-space:pre-wrap">'+
    'Erro ao montar: ' + e.message + '\\n\\nCertifique-se de ter um componente chamado App</div>';
}
</script>
</body></html>`;
  }, [jsx, css]);

  const buildPythonDocument = useCallback(() => {
    const outputText = codeOutput || "";
    const errorText = codeError || "";
    const escapedOut = outputText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const escapedErr = errorText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const content = codeRunning
      ? '<span class="info">⟳ Executando...</span>'
      : (!outputText && !errorText)
        ? '<span class="info">Clique em ▶ Executar para rodar o código Python 3.11</span>'
        : (escapedErr ? `<span class="err">${escapedErr}</span>\n` : "") + (escapedOut ? `<span class="ok">$ python3 script.py</span>\n${escapedOut}` : "");
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  body { margin:0; background:#0f172a; color:#e2e8f0; font-family:'Consolas','Courier New',monospace; }
  #output { padding:20px; white-space:pre-wrap; font-size:13px; line-height:1.6; min-height:100vh; }
  .info { color:#60a5fa; }
  .ok { color:#4ade80; font-size:11px; }
  .err { color:#f87171; }
</style>
</head>
<body>
<div id="output">${content}</div>
</body></html>`;
  }, [python, codeOutput, codeError, codeRunning]);

  const buildDocument = useCallback(() => {
    if (mode === "react") return buildReactDocument();
    if (mode === "python") return buildPythonDocument();
    const completeDoc = hasCompleteDocument(html);
    if (completeDoc) {
      let doc = extractCompleteDocument(html);
      if (!doc.toLowerCase().includes("<meta charset")) {
        const headMatch = doc.match(/<head[^>]*>/i);
        if (headMatch) {
          doc = doc.replace(headMatch[0], `${headMatch[0]}\n<meta charset="UTF-8">`);
        }
      }
      if (!doc.toLowerCase().includes("viewport")) {
        const headMatch = doc.match(/<head[^>]*>/i);
        if (headMatch) {
          doc = doc.replace(headMatch[0], `${headMatch[0]}\n<meta name="viewport" content="width=device-width, initial-scale=1.0">`);
        }
      }
      return doc;
    }
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${css}</style>
</head>
<body>
${html}
<script>${js}<\/script>
</body>
</html>`;
  }, [html, css, js, mode, hasCompleteDocument, extractCompleteDocument, buildReactDocument, buildPythonDocument]);

  const prevBlobUrl = useRef<string | null>(null);

  const updatePreview = useCallback(() => {
    const doc = buildDocument();
    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
    }
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    prevBlobUrl.current = blobUrl;
    if (iframeRef.current) {
      iframeRef.current.src = blobUrl;
    }
    if (mobileIframeRef.current) {
      mobileIframeRef.current.src = blobUrl;
    }
  }, [buildDocument]);

  useEffect(() => {
    if (autoRun) {
      const timer = setTimeout(updatePreview, 500);
      return () => clearTimeout(timer);
    }
  }, [html, css, js, jsx, python, mode, autoRun, updatePreview]);

  useEffect(() => {
    updatePreview();
  }, []);

  useEffect(() => {
    if (mobileView === "preview") {
      const timer = setTimeout(() => {
        updatePreview();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [mobileView, buildDocument]);

  const savedSnippets = useQuery<Snippet[]>({
    queryKey: ["/api/snippets"],
  });

  const getContentForMode = () => {
    if (mode === "react") return { html: jsx, css: "", js: "" };
    if (mode === "python") return { html: python, css: "", js: "" };
    return { html, css, js };
  };

  const saveSnippetMutation = useMutation({
    mutationFn: async () => {
      const content = getContentForMode();
      const res = await apiRequest("POST", "/api/snippets", { title, ...content, mode });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snippets"] });
      toast({ title: "Salvo!", description: "Codigo salvo com sucesso." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao salvar.", variant: "destructive" });
    },
  });

  const deleteSnippetMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/snippets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snippets"] });
      toast({ title: "Removido", description: "Codigo removido." });
    },
  });

  const renameSnippetMutation = useMutation({
    mutationFn: async ({ id, newTitle }: { id: string; newTitle: string }) => {
      const res = await apiRequest("PATCH", `/api/snippets/${id}`, { title: newTitle });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snippets"] });
      setRenamingId(null);
      toast({ title: "Renomeado!", description: "Nome atualizado." });
    },
    onError: () => {
      toast({ title: "Erro", description: "Falha ao renomear.", variant: "destructive" });
    },
  });

  const loadSnippet = (snippet: Snippet) => {
    setTitle(snippet.title);
    // Auto-detect mode for old snippets that have mode="html" but contain React/Python
    let snippetMode = (snippet.mode as PlaygroundMode) || "html";
    if (snippetMode === "html" && snippet.html) {
      const detected = detectMode(snippet.html);
      if (detected === "react" || detected === "python") snippetMode = detected;
    }
    setMode(snippetMode);
    if (snippetMode === "react") {
      setJsx(snippet.html);
      setActiveTab("jsx");
    } else if (snippetMode === "python") {
      setPython(snippet.html);
      setActiveTab("python");
    } else if (hasCompleteDocument(snippet.html)) {
      setHtml(extractCompleteDocument(snippet.html));
      setCss("");
      setJs("");
      setActiveTab("html");
    } else {
      setHtml(snippet.html);
      setCss(snippet.css);
      setJs(snippet.js);
      setActiveTab("html");
    }
    setSavedDialogOpen(false);
    toast({ title: "Carregado!", description: `"${snippet.title}" aberto.` });
  };

  const handleCopyCode = () => {
    const doc = buildDocument();
    navigator.clipboard.writeText(doc);
    toast({ title: "Copiado!", description: "Codigo copiado." });
  };

  const handleDownload = () => {
    let content: string;
    let ext: string;
    let mimeType: string;
    if (mode === "python") {
      content = python;
      ext = "py";
      mimeType = "text/plain";
    } else if (mode === "react") {
      content = jsx;
      ext = "jsx";
      mimeType = "text/plain";
    } else {
      content = buildDocument();
      ext = "html";
      mimeType = "text/html";
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "playground"}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Baixado!", description: `Arquivo .${ext} salvo no seu aparelho.` });
  };

  const handleFullScreen = () => {
    const doc = buildDocument();
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleClear = () => {
    if (mode === "react") { setJsx(""); return; }
    if (mode === "python") { setPython(""); return; }
    setHtml(""); setCss(""); setJs("");
    setTitle("Sem titulo");
  };

  const handleReset = () => {
    if (mode === "react") { setJsx(DEFAULT_JSX); return; }
    if (mode === "python") { setPython(DEFAULT_PYTHON); return; }
    setHtml(DEFAULT_HTML); setCss(DEFAULT_CSS); setJs(DEFAULT_JS);
    setTitle("Sem titulo");
  };

  const switchMode = (newMode: PlaygroundMode) => {
    setMode(newMode);
    if (newMode === "react") setActiveTab("jsx");
    else if (newMode === "python") setActiveTab("python");
    else setActiveTab("html");
  };

  const getEditorValue = () => {
    if (activeTab === "jsx") return jsx;
    if (activeTab === "python") return python;
    if (activeTab === "html") return html;
    if (activeTab === "css") return css;
    return js;
  };

  const setEditorValue = (value: string) => {
    if (activeTab === "jsx") setJsx(value);
    else if (activeTab === "python") setPython(value);
    else if (activeTab === "html") setHtml(value);
    else if (activeTab === "css") setCss(value);
    else setJs(value);
  };

  const getTabIcon = (tab: ActiveTab) => {
    if (tab === "html") return <FileCode className="w-3.5 h-3.5" />;
    if (tab === "css") return <Paintbrush className="w-3.5 h-3.5" />;
    if (tab === "jsx") return <Atom className="w-3.5 h-3.5 text-blue-400" />;
    if (tab === "python") return <Terminal className="w-3.5 h-3.5 text-yellow-400" />;
    return <Braces className="w-3.5 h-3.5" />;
  };

  const currentValue = getEditorValue();

  const filteredSnippets = savedSnippets.data?.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRenaming = (snippet: Snippet, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(snippet.id);
    setRenameValue(snippet.title);
  };

  const confirmRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (renameValue.trim()) {
      renameSnippetMutation.mutate({ id, newTitle: renameValue.trim() });
    }
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(null);
  };

  return (
    <div className="flex flex-col h-screen bg-background" data-testid="playground-container">
      <header className="flex items-center justify-between gap-2 px-2 sm:px-3 py-2 border-b bg-card/50 backdrop-blur-sm shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <Code2 className="w-5 h-5 text-primary shrink-0" />
          <span className="font-semibold text-sm hidden sm:inline whitespace-nowrap">Playground</span>
          {/* Mode selector */}
          <div className="flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
            <Button
              size="sm"
              variant={mode === "html" ? "default" : "ghost"}
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => switchMode("html")}
              data-testid="button-mode-html"
              title="HTML / CSS / JS"
            >
              <Globe className="w-3 h-3" /> HTML
            </Button>
            <Button
              size="sm"
              variant={mode === "react" ? "default" : "ghost"}
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => switchMode("react")}
              data-testid="button-mode-react"
              title="React / JSX"
            >
              <Atom className="w-3 h-3 text-blue-400" /> React
            </Button>
            <Button
              size="sm"
              variant={mode === "python" ? "default" : "ghost"}
              className="h-6 px-2 text-[11px] gap-1"
              onClick={() => switchMode("python")}
              data-testid="button-mode-python"
              title="Python (via WebAssembly)"
            >
              <Terminal className="w-3 h-3 text-yellow-400" /> Python
            </Button>
          </div>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-xs w-24 sm:w-32 bg-transparent border-transparent focus:border-border"
            placeholder="Nome do projeto..."
            data-testid="input-title"
          />
        </div>

        <div className="flex items-center gap-1 flex-wrap">
          <div className="flex items-center gap-0.5 sm:hidden">
            <Button
              size="icon"
              variant={mobileView === "editor" ? "default" : "ghost"}
              onClick={() => setMobileView("editor")}
              data-testid="button-mobile-editor"
            >
              <CodeXml className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant={mobileView === "preview" ? "default" : "ghost"}
              onClick={() => { setMobileView("preview"); updatePreview(); }}
              data-testid="button-mobile-preview"
            >
              <Eye className="w-4 h-4" />
            </Button>
          </div>

          <div className="h-4 w-px bg-border sm:hidden" />

          {mode === "python" ? (
            <Button
              variant="default"
              onClick={() => runCodeWithAI()}
              disabled={codeRunning}
              className="text-xs gap-1"
              data-testid="button-run-python"
            >
              {codeRunning ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden sm:inline">Rodando...</span></>
              ) : (
                <><Play className="w-3.5 h-3.5" /><span className="hidden sm:inline">Executar</span></>
              )}
            </Button>
          ) : (
            <>
              <Button
                variant={autoRun ? "default" : "outline"}
                onClick={() => setAutoRun(!autoRun)}
                className="text-xs gap-1 hidden sm:inline-flex"
                data-testid="button-auto-run"
              >
                <Eye className="w-3.5 h-3.5" />
                Auto
              </Button>
              {!autoRun && (
                <Button
                  variant="default"
                  onClick={updatePreview}
                  className="text-xs gap-1"
                  data-testid="button-run"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Executar</span>
                </Button>
              )}
            </>
          )}

          <div className="h-4 w-px bg-border hidden sm:block" />

          <input
            ref={htmlFileInputRef}
            type="file"
            accept=".html,.htm,.svg,.xml,.txt,text/html"
            className="hidden"
            onChange={handleFileImport}
            data-testid="input-import-html"
          />
          <Button size="icon" variant="ghost" onClick={() => htmlFileInputRef.current?.click()} data-testid="button-import-html">
            <Upload className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleFullScreen} data-testid="button-fullscreen">
            <Maximize className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCopyCode} data-testid="button-copy">
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleDownload} data-testid="button-download">
            <Download className="w-4 h-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={() => saveSnippetMutation.mutate()}
            disabled={saveSnippetMutation.isPending}
            data-testid="button-save"
          >
            <Save className="w-4 h-4" />
          </Button>

          <Dialog open={savedDialogOpen} onOpenChange={(open) => { setSavedDialogOpen(open); if (!open) { setRenamingId(null); setSearchQuery(""); } }}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid="button-open-snippets">
                <FolderOpen className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Meus Codigos Salvos</DialogTitle>
              </DialogHeader>

              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar por nome..."
                  className="pl-8 text-sm"
                  data-testid="input-search-snippets"
                />
              </div>

              <div className="max-h-96 overflow-y-auto space-y-1.5">
                {savedSnippets.isLoading && (
                  <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
                )}
                {filteredSnippets && filteredSnippets.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {searchQuery ? "Nenhum resultado encontrado." : "Nenhum codigo salvo ainda."}
                  </p>
                )}
                {filteredSnippets?.map((snippet) => (
                  <div
                    key={snippet.id}
                    className="flex items-center justify-between gap-2 p-3 rounded-md bg-muted/50 hover-elevate cursor-pointer"
                    onClick={() => renamingId !== snippet.id && loadSnippet(snippet)}
                    data-testid={`snippet-item-${snippet.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      {renamingId === snippet.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            className="text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmRename(snippet.id, e as any);
                              if (e.key === "Escape") { setRenamingId(null); }
                            }}
                            data-testid={`input-rename-${snippet.id}`}
                          />
                          <Button size="icon" variant="ghost" onClick={(e) => confirmRename(snippet.id, e)} data-testid={`button-confirm-rename-${snippet.id}`}>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelRename} data-testid={`button-cancel-rename-${snippet.id}`}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium truncate">{snippet.title}</p>
                          <p className="text-xs text-muted-foreground">
                            HTML: {snippet.html.length} | CSS: {snippet.css.length} | JS: {snippet.js.length}
                          </p>
                        </>
                      )}
                    </div>
                    {renamingId !== snippet.id && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => startRenaming(snippet, e)}
                          data-testid={`button-rename-snippet-${snippet.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSnippetMutation.mutate(snippet.id);
                          }}
                          data-testid={`button-delete-snippet-${snippet.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <div className="h-4 w-px bg-border" />

          <Button size="icon" variant="ghost" onClick={handleReset} data-testid="button-reset">
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleClear} data-testid="button-clear">
            <Trash2 className="w-4 h-4" />
          </Button>

          <Link href="/">
            <Button variant="default" data-testid="button-legal-assistant">
              <Gavel className="w-4 h-4" />
              <span className="hidden sm:inline">Assistente Juridico</span>
              <span className="sm:hidden">Assistente</span>
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Desktop: lado a lado */}
      <div className="hidden sm:flex flex-1 overflow-hidden">
        {!editorCollapsed && (
          <div className="flex flex-col w-1/2 border-r shrink-0">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as ActiveTab)}
              >
                <TabsList>
                  {mode === "html" && <>
                    <TabsTrigger value="html" className="text-xs gap-1 px-2.5" data-testid="tab-html">
                      {getTabIcon("html")} HTML
                    </TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-2.5" data-testid="tab-css">
                      {getTabIcon("css")} CSS
                    </TabsTrigger>
                    <TabsTrigger value="js" className="text-xs gap-1 px-2.5" data-testid="tab-js">
                      {getTabIcon("js")} JS
                    </TabsTrigger>
                  </>}
                  {mode === "react" && <>
                    <TabsTrigger value="jsx" className="text-xs gap-1 px-2.5" data-testid="tab-jsx">
                      {getTabIcon("jsx")} JSX
                    </TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-2.5" data-testid="tab-css-react">
                      {getTabIcon("css")} CSS
                    </TabsTrigger>
                  </>}
                  {mode === "python" && (
                    <TabsTrigger value="python" className="text-xs gap-1 px-2.5" data-testid="tab-python">
                      {getTabIcon("python")} Python
                    </TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2 pr-1">
                {mode === "html" && hasCompleteDocument(html) && activeTab === "html" && (
                  <span className="text-[10px] text-primary" data-testid="text-full-doc">Documento completo</span>
                )}
                {mode === "react" && <span className="text-[10px] text-blue-400">React 18 + Babel</span>}
                {mode === "python" && <span className="text-[10px] text-yellow-400">Python 3 (WebAssembly)</span>}
                <span className="text-[10px] text-muted-foreground tabular-nums" data-testid="text-line-count">
                  {currentValue.split("\n").length} linhas
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditorCollapsed(true)}
                  data-testid="button-collapse-editor"
                  title="Minimizar editor"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <div className="absolute inset-0 flex">
                <div className="w-10 shrink-0 bg-muted/20 border-r flex flex-col items-end py-2 pr-2 overflow-hidden select-none pointer-events-none">
                  {currentValue.split("\n").map((_line: string, i: number) => (
                    <span key={i} className="text-[10px] leading-[1.625rem] text-muted-foreground/50 tabular-nums">
                      {i + 1}
                    </span>
                  ))}
                </div>
                <textarea
                  value={currentValue}
                  onChange={(e) => setEditorValue(e.target.value)}
                  onPaste={activeTab === "html" ? handleHtmlPaste : undefined}
                  className="flex-1 resize-none bg-transparent font-mono text-sm leading-[1.625rem] p-2 focus:outline-none text-foreground"
                  spellCheck={false}
                  style={{ tabSize: 2 }}
                  data-testid={`editor-${activeTab}`}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
            {editorCollapsed && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditorCollapsed(false)}
                data-testid="button-expand-editor"
                title="Mostrar editor"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            )}
            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Resultado</span>
            {autoRun && (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                ao vivo
              </span>
            )}
          </div>
          <div className="flex-1 relative min-h-0">
            {mode === "python" ? (
              <div className="absolute inset-0 bg-[#0f172a] text-[#e2e8f0] font-mono text-[13px] leading-relaxed overflow-auto p-4" data-testid="python-output">
                {!codeOutput && !codeError && !codeRunning && (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 select-none">
                    <Terminal className="w-10 h-10 opacity-30" />
                    <span className="text-sm">Cole seu código Python e clique em <strong className="text-yellow-400">Executar</strong></span>
                    <span className="text-xs opacity-60">Executado via Google Gemini (servidor)</span>
                  </div>
                )}
                {codeRunning && (
                  <div className="flex items-center gap-2 text-blue-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Executando código...</span>
                  </div>
                )}
                {!codeRunning && codeError && (
                  <pre className="text-red-400 whitespace-pre-wrap break-words">{codeError}</pre>
                )}
                {!codeRunning && codeOutput && (
                  <pre className="whitespace-pre-wrap break-words text-green-300">{codeOutput}</pre>
                )}
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                title="Resultado"
                sandbox="allow-scripts allow-modals allow-forms allow-popups"
                className="absolute inset-0 w-full h-full border-0 bg-neutral-50 dark:bg-neutral-900"
                data-testid="preview-iframe"
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile: empilhado com toggle */}
      <div className="flex sm:hidden flex-col flex-1 overflow-hidden">
        {mobileView === "editor" && (
          <div className="flex flex-col flex-1">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/30 shrink-0">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as ActiveTab)}
              >
                <TabsList>
                  {mode === "html" && <>
                    <TabsTrigger value="html" className="text-xs gap-1 px-3" data-testid="tab-html-mobile">{getTabIcon("html")} HTML</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-3" data-testid="tab-css-mobile">{getTabIcon("css")} CSS</TabsTrigger>
                    <TabsTrigger value="js" className="text-xs gap-1 px-3" data-testid="tab-js-mobile">{getTabIcon("js")} JS</TabsTrigger>
                  </>}
                  {mode === "react" && <>
                    <TabsTrigger value="jsx" className="text-xs gap-1 px-3" data-testid="tab-jsx-mobile">{getTabIcon("jsx")} JSX</TabsTrigger>
                    <TabsTrigger value="css" className="text-xs gap-1 px-3" data-testid="tab-css-react-mobile">{getTabIcon("css")} CSS</TabsTrigger>
                  </>}
                  {mode === "python" && (
                    <TabsTrigger value="python" className="text-xs gap-1 px-3" data-testid="tab-python-mobile">{getTabIcon("python")} Python</TabsTrigger>
                  )}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex-1 relative overflow-hidden">
              <textarea
                value={currentValue}
                onChange={(e) => setEditorValue(e.target.value)}
                onPaste={activeTab === "html" ? handleHtmlPaste : undefined}
                className="absolute inset-0 w-full h-full resize-none bg-transparent font-mono text-sm leading-relaxed p-3 focus:outline-none text-foreground"
                spellCheck={false}
                style={{ tabSize: 2 }}
                data-testid={`editor-mobile-${activeTab}`}
              />
            </div>
          </div>
        )}

        {/* Mobile run button for Python */}
        {mobileView === "editor" && mode === "python" && (
          <div className="px-3 py-2 border-b bg-muted/30 shrink-0 flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => { runCodeWithAI(); setMobileView("preview"); }}
              disabled={codeRunning}
              className="text-xs gap-1 flex-1"
              data-testid="button-run-python-mobile"
            >
              {codeRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Rodando...</> : <><Play className="w-3 h-3" /> Executar Python</>}
            </Button>
          </div>
        )}

        {mobileView === "preview" && (
          <div className="flex flex-col flex-1 relative">
            <div className="flex-1 relative min-h-0">
              {mode === "python" ? (
                <div className="absolute inset-0 bg-[#0f172a] text-[#e2e8f0] font-mono text-sm leading-relaxed overflow-auto p-4" data-testid="python-output-mobile">
                  {!codeOutput && !codeError && !codeRunning && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                      <Terminal className="w-8 h-8 opacity-30" />
                      <span className="text-sm text-center">Pressione <strong className="text-yellow-400">Executar Python</strong> no editor</span>
                    </div>
                  )}
                  {codeRunning && <div className="flex items-center gap-2 text-blue-400"><Loader2 className="w-4 h-4 animate-spin" /> Executando...</div>}
                  {!codeRunning && codeError && <pre className="text-red-400 whitespace-pre-wrap break-words">{codeError}</pre>}
                  {!codeRunning && codeOutput && <pre className="whitespace-pre-wrap break-words text-green-300">{codeOutput}</pre>}
                </div>
              ) : (
                <iframe
                  ref={mobileIframeRef}
                  title="Resultado"
                  sandbox="allow-scripts allow-modals allow-forms allow-popups"
                  className="absolute inset-0 w-full h-full border-0 bg-white dark:bg-neutral-900"
                  data-testid="preview-iframe-mobile"
                />
              )}
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 z-10">
              <Button
                size="icon"
                variant="default"
                className="rounded-full shadow-lg opacity-80"
                onClick={handleFullScreen}
                data-testid="button-mobile-fullscreen"
              >
                <Maximize className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="default"
                className="rounded-full shadow-lg opacity-80"
                onClick={() => setMobileView("editor")}
                data-testid="button-mobile-back-editor"
              >
                <CodeXml className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
