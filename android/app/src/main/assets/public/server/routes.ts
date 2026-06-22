import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, reconnectDb } from "./storage";
import { getLocalConfig, setLocalConfig } from "./local-config";
import {
  insertSnippetSchema,
  insertCustomActionSchema,
  insertEmentaSchema,
  insertAiHistorySchema,
  insertPromptTemplateSchema,
  insertDocTemplateSchema,
} from "@shared/schema";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import multer from "multer";
import mammoth from "mammoth";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
import { Document, Paragraph, TextRun, Packer, AlignmentType } from "docx";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import jwt from "jsonwebtoken";

const execFileAsync = promisify(execFile);

import { decode } from "html-entities";

function truncateChatHistory(
  history: Array<{ role: string; content: string }>,
  maxChars: number,
): Array<{ role: string; content: string }> {
  if (!Array.isArray(history) || history.length === 0) return history;
  const totalChars = history.reduce((s, m) => s + (m.content || "").length, 0);
  if (totalChars <= maxChars) return history;
  const kept: Array<{ role: string; content: string }> = [];
  let usedChars = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const c = (history[i].content || "").length;
    if (usedChars + c > maxChars && kept.length >= 2) break;
    kept.unshift(history[i]);
    usedChars += c;
  }
  console.log(
    `[truncateChatHistory] Reduced ${history.length} msgs (${totalChars} chars) → ${kept.length} msgs (${usedChars} chars)`,
  );
  return kept;
}

function cleanPemKey(raw: string): string {
  const beginIdx = raw.indexOf("-----BEGIN");
  if (beginIdx === -1) return raw;
  const endMarkerMatch = raw.match(/-----END[^-]*-----/);
  if (!endMarkerMatch) return raw;
  const endIdx = raw.indexOf(endMarkerMatch[0]) + endMarkerMatch[0].length;
  const pemSection = raw.slice(beginIdx, endIdx);
  const headerMatch = pemSection.match(
    /^(-----BEGIN[^-]*-----)([\s\S]+)(-----END[^-]*-----)$/,
  );
  if (!headerMatch) return pemSection;
  const header = headerMatch[1];
  const body = headerMatch[2].replace(/\s+/g, "");
  const footer = headerMatch[3];
  const lines = body.match(/.{1,64}/g) || [];
  return `${header}\n${lines.join("\n")}\n${footer}`;
}

function cleanHtml(html: string): string {
  // Remove script and style elements and their content
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode HTML entities (like &nbsp;, &lt;, etc.)
  text = decode(text);
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

function requireAuth(req: any, res: any, next: any) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return next();
  }
  if (req.session?.authenticated) {
    return next();
  }
  return res.status(401).json({ message: "Não autorizado" });
}

function fallbackAiResponse(prompt: string, model = "fallback") {
  const clean = prompt.trim().slice(0, 400);
  return [
    `MODO CONTINGÊNCIA (${model})`,
    "",
    "O provedor principal de IA não respondeu neste momento.",
    "O sistema está ativo e pode continuar com sua estrutura.",
    "",
    "TEXTO RECEBIDO:",
    clean || "[vazio]",
    "",
    "ORIENTAÇÃO:",
    "Verifique depois as chaves/URL do provedor e tente novamente.",
  ].join("\n");
}

async function safeStream(
  res: any,
  generator: () => Promise<void>,
  fallbackText: string,
) {
  try {
    await generator();
  } catch (error) {
    console.warn("[ai] Aviso:", (error as Error).message);
    res.write(`data: ${JSON.stringify({ content: fallbackText })}\n\n`);
  }
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "placeholder",
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || "placeholder",
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Limpa a chave: pega só a primeira linha não-vazia e remove espaços/quebras
function sanitizeKey(raw: string): string {
  return (raw || "").split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)[0] || "";
}

function autoDetectProvider(key: string): { url: string; model: string } | null {
  const k = sanitizeKey(key);
  if (k.startsWith("gsk_")) return { url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" };
  if (k.startsWith("sk-or-")) return { url: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" };
  if (k.startsWith("pplx-")) return { url: "https://api.perplexity.ai", model: "sonar-pro" };
  if (k.startsWith("sk-ant-")) return { url: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-20241022" };
  if (k.startsWith("AIza")) return { url: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" };
  if (k.startsWith("xai-")) return { url: "https://api.x.ai/v1", model: "grok-2-latest" };
  if (k.startsWith("sk-") && k.length > 40) return { url: "https://api.openai.com/v1", model: "gpt-4o-mini" };
  if (/^[a-f0-9]{32}$/.test(k)) return { url: "https://api.together.xyz/v1", model: "deepseek-ai/deepseek-coder-33b-instruct" };
  return null;
}

async function geminiStream(
  res: any,
  systemPrompt: string,
  userContent: string,
  model: string,
  maxOutputTokens: number,
  customKey?: string,
  customUrl?: string,
  customModel?: string,
) {
  if (customKey && customUrl) {
    const customOpenAI = new OpenAI({ apiKey: customKey, baseURL: customUrl });
    const stream = await customOpenAI.chat.completions.create({
      model: customModel || model || "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      stream: true,
      max_tokens: Math.min(maxOutputTokens, 32000),
      temperature: 0.7,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return;
  }

  const ownGeminiKey = getLocalConfig("gemini_api_key");
  const effectiveKey = customKey || ownGeminiKey || null;

  if (effectiveKey && !customUrl) {
    const client2 = new GoogleGenAI({ apiKey: effectiveKey });
    const fullPrompt2 = `${systemPrompt}\n\n${userContent}`;
    const stream2 = await client2.models.generateContentStream({
      model,
      contents: [{ role: "user", parts: [{ text: fullPrompt2 }] }],
      config: { maxOutputTokens: Math.min(maxOutputTokens, 65536), temperature: 0.7 },
    });
    for await (const chunk of stream2) {
      const content = chunk.text || "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return;
  }

  const geminiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const geminiUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (geminiKey && geminiUrl) {
    const geminiClient = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: { apiVersion: "", baseUrl: geminiUrl },
    });
    const fullPrompt = `${systemPrompt}\n\n${userContent}`;
    const stream = await geminiClient.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      config: { maxOutputTokens: Math.min(maxOutputTokens, 65536), temperature: 0.7 },
    });
    for await (const chunk of stream) {
      const content = chunk.text || "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return;
  }

  const fallbackKey = geminiKey || "placeholder";
  const client = new GoogleGenAI({ apiKey: fallbackKey });
  const fullPrompt = `${systemPrompt}\n\n${userContent}`;
  const stream = await client.models.generateContentStream({
    model,
    contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
    config: { maxOutputTokens: Math.min(maxOutputTokens, 65536), temperature: 0.7 },
  });
  for await (const chunk of stream) {
    const content = chunk.text || "";
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }
}

async function geminiStreamMessages(
  res: any,
  messages: Array<{ role: "user" | "model"; parts: [{ text: string }] }>,
  model: string,
  maxOutputTokens: number,
  customKey?: string,
  customUrl?: string,
  customModel?: string,
) {
  if (customKey && customUrl) {
    const customOpenAI = new OpenAI({ apiKey: customKey, baseURL: customUrl });
    const openAiMessages = messages.map(m => ({
      role: m.role === "model" ? "assistant" as const : "user" as const,
      content: m.parts[0].text,
    }));
    const stream = await customOpenAI.chat.completions.create({
      model: customModel || model || "gpt-3.5-turbo",
      messages: openAiMessages,
      stream: true,
      max_tokens: Math.min(maxOutputTokens, 32000),
      temperature: 0.7,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return;
  }

  let client = gemini;
  if (customKey && !customUrl) {
    client = new GoogleGenAI({ apiKey: customKey });
  }

  const geminiKey2 = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const geminiUrl2 = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!customKey && geminiKey2 && geminiUrl2) {
    const geminiClient2 = new GoogleGenAI({
      apiKey: geminiKey2,
      httpOptions: { apiVersion: "", baseUrl: geminiUrl2 },
    });
    const stream = await geminiClient2.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: messages,
      config: { maxOutputTokens: Math.min(maxOutputTokens, 65536), temperature: 0.7 },
    });
    for await (const chunk of stream) {
      const content = chunk.text || "";
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
    return;
  }

  const stream = await client.models.generateContentStream({
    model,
    contents: messages,
    config: { maxOutputTokens: Math.min(maxOutputTokens, 65536), temperature: 0.7 },
  });
  for await (const chunk of stream) {
    const content = chunk.text || "";
    if (content) {
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }
  }
}

const SYSTEM_PROMPT_BASE = `Voce e uma assistente juridica especializada em Direito brasileiro. Produza documentos COMPLETOS, EXTENSOS e PRONTOS PARA USO IMEDIATO.

REGRAS ABSOLUTAS:
1. DOCUMENTO COMPLETO E EXTENSO — nunca resuma, nunca corte, nunca omita. Escreva o documento inteiro do inicio ao fim. O advogado copia e cola direto no Word.
2. ESTRUTURA OBRIGATORIA para peticoes e minutas: Endereçamento → Qualificação das partes → Dos Fatos (detalhado) → Do Direito (com fundamentacao legal) → Dos Pedidos → Local, data e assinatura.
3. FUNDAMENTACAO ROBUSTA — cite artigos de lei, numeros de lei, doutrina, principios. Desenvolva cada argumento em paragrafos proprios.
4. Base-se EXCLUSIVAMENTE no texto fornecido. Nao invente fatos. Se faltar dado: [INFORMAR: descricao]. Se ha ementas selecionadas, CITE-AS literalmente.
5. MANTENHA nomes, CPFs, numeros, dados pessoais EXATAMENTE como estao. NAO altere nenhum dado.
6. TEXTO PURO sem markdown. NAO use asteriscos (*), hashtags (#), tracos (---), nem nenhuma sintaxe markdown. Para titulos, escreva em CAIXA ALTA. Para negrito, escreva em CAIXA ALTA. Paragrafos separados por linha em branco. Cada paragrafo em uma unica linha continua (sem quebras no meio da frase).
7. CADA PARAGRAFO maximo 5 linhas. Nunca junte varios argumentos num bloco so. Separe cada ideia em paragrafo proprio.
8. NUNCA produza um rascunho curto. O MINIMO ABSOLUTO para qualquer minuta ou peticao e 15 PAGINAS completas (aproximadamente 7.500 palavras). Desenvolva extensamente cada secao: fatos com narrativa cronologica detalhada, fundamentacao juridica com multiplos artigos e jurisprudencia, teses subsidiarias, pedidos detalhados e fundamentados individualmente.
9. PROIBIDO entregar texto com menos de 15 paginas em minutas e peticoes. Se necessario, aprofunde argumentacao, inclua mais jurisprudencia, desenvolva teses alternativas e subsidiarias, detalhe cada pedido com fundamentacao propria.
10. FORMATACAO DO TEXTO:
   - Titulos e subtitulos: CAIXA ALTA, negrito, centralizado, sem recuo.
   - Paragrafos do corpo: justificados, recuo de 4cm na primeira linha, espacamento 1.5.
   - Citacoes (ementas, artigos, sumulas): recuo 4cm dos dois lados, justificado, fonte 10pt, espacamento simples, italico.
   - Assinatura do advogado: negrito, CAIXA ALTA, centralizado.
   - Data e cidade: alinhados a direita.
   - "Nestes termos, pede deferimento": alinhado a esquerda, sem recuo.
   - OAB e nome do advogado: centralizado.
11. EMENTAS: quando citar ementa de jurisprudencia, COPIE O TEXTO COMPLETO da ementa — nao resuma, nao corte. Se a ementa selecionada for a base do argumento, cite na integra como citacao longa ABNT (recuo 4cm dos dois lados, fonte 10pt, espacamento simples, justificado). Apos a citacao, inclua sempre a referencia completa: (Tribunal, Numero do Processo, Relator, Data).`;

const ACTION_PROMPTS: Record<string, string> = {
  resumir:
    "Elabore RESUMO ESTRUTURADO do documento com as seguintes secoes, CADA UMA em bloco separado por linha em branco:\n\n1. NATUREZA DA DEMANDA\n[descricao]\n\n2. FATOS PRINCIPAIS\n[datas, nomes, valores]\n\n3. FUNDAMENTOS JURIDICOS\n[bases legais e argumentos]\n\n4. CONCLUSAO E PEDIDO\n[resultado pretendido]\n\nNao omita detalhes. Cada topico deve iniciar em nova linha apos linha em branco.\n\nDOCUMENTO:\n{{textos}}",
  revisar:
    "Analise erros gramaticais, concordancia, logica juridica. Sugira melhorias de redacao. Aponte omissoes/contradicoes.\n\nTEXTO:\n{{textos}}",
  refinar:
    "Reescreva elevando linguagem para padrao de tribunais superiores. Melhore fluidez e vocabulario juridico.\n\nTEXTO:\n{{textos}}",
  simplificar:
    "Traduza para linguagem simples e acessivel, mantendo rigor tecnico. Cliente leigo deve entender.\n\nTEXTO:\n{{textos}}",
  minuta:
    "Elabore PETICAO/MINUTA JURIDICA COMPLETA, EXTENSA E PROFISSIONAL com NO MINIMO 15 PAGINAS (7.500+ palavras). Inclua OBRIGATORIAMENTE todas as secoes abaixo, desenvolvendo CADA UMA extensamente:\n\nEXMO(A). SR(A). DR(A). JUIZ(A) DE DIREITO DA ... VARA DE ... DA COMARCA DE ...\n\n[QUALIFICACAO COMPLETA DAS PARTES com todos os dados]\n\nDOS FATOS\n[Narrativa EXTENSA, detalhada e cronologica dos fatos — minimo 8 paragrafos desenvolvidos, com datas, valores, circunstancias e contexto completo]\n\nDO DIREITO\n[Fundamentacao juridica ROBUSTA com citacao de artigos de lei, codigos, leis especificas, principios constitucionais, doutrina e jurisprudencia — minimo 12 paragrafos com multiplas teses principais e subsidiarias]\n\nDA JURISPRUDENCIA\n[Citacao de precedentes relevantes de tribunais superiores e regionais — minimo 5 julgados com ementa]\n\nDOS DANOS / DA RESPONSABILIDADE (quando aplicavel)\n[Desenvolvimento detalhado da teoria da responsabilidade civil/penal aplicavel]\n\nDOS PEDIDOS\n[Lista numerada e DETALHADA de todos os pedidos, cada um com fundamentacao propria — minimo 8 pedidos]\n\nDO VALOR DA CAUSA\n[Fundamentacao do valor atribuido]\n\n[Data e assinatura]\n\nATENCAO: O documento DEVE ter no minimo 15 PAGINAS COMPLETAS. E PROIBIDO entregar rascunho curto ou resumido. Desenvolva extensamente cada secao como uma peticao real de escritorio de advocacia.\n\nINFORMACOES:\n{{textos}}",
  analisar:
    "Elabore ANALISE JURIDICA com as seguintes secoes, CADA UMA separada por linha em branco:\n\n1. RISCOS PROCESSUAIS\n[analise dos riscos]\n\n2. TESES FAVORAVEIS E CONTRARIAS\n[argumentos pro e contra]\n\n3. JURISPRUDENCIA APLICAVEL\n[precedentes relevantes]\n\n4. PROXIMOS PASSOS\n[recomendacoes de atuacao]\n\nCada secao deve iniciar em nova linha apos linha em branco.\n\nDOCUMENTO:\n{{textos}}",
  "modo-estrito":
    "Corrija APENAS erros gramaticais e de estilo. Nao altere estrutura ou conteudo.\n\nTEXTO:\n{{textos}}",
  "modo-redacao":
    "Melhore o texto tornando-o mais profissional e persuasivo, mantendo todos dados e fatos.\n\nTEXTO:\n{{textos}}",
  "modo-interativo":
    "Identifique lacunas e pontos que precisam complementacao pelo advogado.\n\nTEXTO:\n{{textos}}",
};

async function seedData() {
  const existing = await storage.getSnippets();
  if (existing.length > 0) return;

  await storage.createSnippet({
    title: "Cartao de Perfil",
    html: `<div class="profile-card">\n  <div class="avatar">JD</div>\n  <h2>Joao da Silva</h2>\n  <p class="role">Desenvolvedor Frontend</p>\n  <div class="stats">\n    <div><strong>142</strong><span>Projetos</span></div>\n    <div><strong>1.2k</strong><span>Seguidores</span></div>\n    <div><strong>89</strong><span>Repos</span></div>\n  </div>\n  <button onclick="this.textContent='Seguindo!'">Seguir</button>\n</div>`,
    css: `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:'Segoe UI',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#0f172a; }\n.profile-card { background:#1e293b; border-radius:16px; padding:2rem; text-align:center; color:#e2e8f0; width:320px; box-shadow:0 25px 50px rgba(0,0,0,0.3); }\n.avatar { width:80px; height:80px; border-radius:50%; background:linear-gradient(135deg,#6366f1,#8b5cf6); display:flex; align-items:center; justify-content:center; margin:0 auto 1rem; font-size:1.5rem; font-weight:700; }\nh2 { font-size:1.3rem; margin-bottom:0.3rem; }\n.role { color:#94a3b8; font-size:0.9rem; margin-bottom:1.5rem; }\n.stats { display:flex; justify-content:space-around; margin-bottom:1.5rem; }\n.stats div { display:flex; flex-direction:column; }\n.stats strong { font-size:1.2rem; }\n.stats span { font-size:0.75rem; color:#94a3b8; }\nbutton { width:100%; padding:0.6rem; background:#6366f1; color:#fff; border:none; border-radius:8px; font-size:0.95rem; cursor:pointer; transition:background 0.2s; }\nbutton:hover { background:#4f46e5; }`,
    js: `console.log("Cartao de perfil carregado!");`,
  });

  await storage.createSnippet({
    title: "Contador Animado",
    html: `<div class="counter-app">\n  <h1>Contador</h1>\n  <div class="display" id="count">0</div>\n  <div class="buttons">\n    <button onclick="decrement()">-</button>\n    <button onclick="reset()">Reset</button>\n    <button onclick="increment()">+</button>\n  </div>\n</div>`,
    css: `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:'Segoe UI',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:linear-gradient(135deg,#1a1a2e,#16213e); color:#fff; }\n.counter-app { text-align:center; }\nh1 { font-size:1.5rem; letter-spacing:2px; text-transform:uppercase; opacity:0.7; margin-bottom:1rem; }\n.display { font-size:5rem; font-weight:800; margin:1rem 0; transition:transform 0.15s; }\n.buttons { display:flex; gap:1rem; }\nbutton { padding:0.8rem 1.5rem; font-size:1.2rem; border:none; border-radius:12px; cursor:pointer; font-weight:600; transition:transform 0.1s; }\nbutton:active { transform:scale(0.95); }\nbutton:first-child { background:#ef4444; color:#fff; }\nbutton:nth-child(2) { background:#6b7280; color:#fff; }\nbutton:last-child { background:#22c55e; color:#fff; }`,
    js: `let count = 0;\nconst display = document.getElementById('count');\nfunction increment() { count++; display.textContent = count; display.style.transform='scale(1.1)'; setTimeout(()=>display.style.transform='scale(1)',150); }\nfunction decrement() { count--; display.textContent = count; display.style.transform='scale(0.9)'; setTimeout(()=>display.style.transform='scale(1)',150); }\nfunction reset() { count=0; display.textContent=count; }`,
  });

  await storage.createSnippet({
    title: "Lista de Tarefas",
    html: `<div class="todo-app">\n  <h1>Minhas Tarefas</h1>\n  <div class="input-row">\n    <input type="text" id="taskInput" placeholder="Nova tarefa..." />\n    <button onclick="addTask()">Adicionar</button>\n  </div>\n  <ul id="taskList"></ul>\n</div>`,
    css: `* { margin:0; padding:0; box-sizing:border-box; }\nbody { font-family:'Segoe UI',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#fafaf9; }\n.todo-app { background:#fff; border-radius:16px; padding:2rem; width:380px; box-shadow:0 4px 24px rgba(0,0,0,0.08); }\nh1 { font-size:1.4rem; color:#1c1917; margin-bottom:1.2rem; }\n.input-row { display:flex; gap:0.5rem; margin-bottom:1rem; }\ninput { flex:1; padding:0.6rem 0.8rem; border:1px solid #d6d3d1; border-radius:8px; font-size:0.9rem; outline:none; }\ninput:focus { border-color:#6366f1; box-shadow:0 0 0 3px rgba(99,102,241,0.1); }\nbutton { padding:0.6rem 1rem; background:#6366f1; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:0.9rem; }\nul { list-style:none; }\nli { display:flex; align-items:center; gap:0.5rem; padding:0.6rem 0; border-bottom:1px solid #f5f5f4; cursor:pointer; }\nli.done span { text-decoration:line-through; color:#a8a29e; }\n.dot { width:8px; height:8px; border-radius:50%; background:#6366f1; flex-shrink:0; }\nli.done .dot { background:#a8a29e; }`,
    js: `function addTask() {\n  const input = document.getElementById('taskInput');\n  const val = input.value.trim();\n  if (!val) return;\n  const li = document.createElement('li');\n  li.innerHTML = '<span class=\"dot\"></span><span>' + val + '</span>';\n  li.onclick = () => li.classList.toggle('done');\n  document.getElementById('taskList').appendChild(li);\n  input.value = '';\n}\ndocument.getElementById('taskInput').addEventListener('keydown', e => { if(e.key==='Enter') addTask(); });`,
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  try {
    await seedData();
  } catch (error) {
    console.warn("[seed] Aviso:", (error as Error).message);
  }

  app.get("/sw.js", (req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.sendFile(path.resolve("client/public/sw.js"));
  });

  app.get("/api/auth/check", (req, res) => {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
      return res.json({ authenticated: true, passwordRequired: false });
    }
    return res.json({
      authenticated: !!req.session?.authenticated,
      passwordRequired: true,
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword) {
      return res.json({ success: true });
    }
    const { password } = req.body;
    if (password === appPassword) {
      req.session!.authenticated = true;
      return res.json({ success: true });
    }
    return res.status(401).json({ message: "Senha incorreta" });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session?.destroy(() => {});
    return res.json({ success: true });
  });

  app.get("/parecer/:id", async (req, res) => {
    const data = await storage.getSharedParecer(req.params.id);
    if (!data)
      return res
        .status(404)
        .send(
          "<html><body><h1>Parecer não encontrado ou expirado</h1></body></html>",
        );
    const pageHtml = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Parecer de Auditoria Financeira${data.processo ? " - " + data.processo : ""}</title>
<style>
body{margin:0;padding:20px;background:#e5e7eb;font-family:system-ui}
.paper{max-width:900px;margin:0 auto;background:#fff;border-radius:12px;padding:20px 24px;box-shadow:0 8px 24px rgba(0,0,0,.12);font-family:'Times New Roman',Georgia,serif;font-size:13px;line-height:1.5;color:#1a1a1a}
.paper .title{text-align:center;font-size:16px;font-weight:bold;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px}
.paper .subtitle{text-align:center;font-size:12px;color:#555;margin-bottom:16px}
.paper .section{margin:16px 0 8px;font-size:14px;font-weight:bold;border-bottom:2px solid #1a1a1a;padding-bottom:4px}
.paper .subsection{margin:10px 0 6px;font-size:13px;font-weight:bold}
.quad{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0}
.quad-box{border:2px solid #d1d5db;border-radius:10px;padding:14px;text-align:center}
.quad-box.a{border-color:#ef4444;background:#fef2f2}
.quad-box.b{border-color:#10b981;background:#f0fdf4}
.quad-box .lbl{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.quad-box .val{font-size:22px;font-weight:900}
.quad-box.a .val{color:#dc2626}
.quad-box.b .val{color:#059669}
.proveito{text-align:center;margin:12px 0;padding:12px;background:#eff6ff;border:2px solid #3b82f6;border-radius:10px}
.proveito .lbl{font-size:11px;color:#666;text-transform:uppercase}
.proveito .val{font-size:20px;font-weight:900;color:#1d4ed8}
.honorarios{text-align:center;margin:8px 0;padding:10px;background:#fefce8;border:2px solid #eab308;border-radius:10px}
.honorarios .lbl{font-size:11px;color:#666;text-transform:uppercase}
.honorarios .val{font-size:18px;font-weight:900;color:#a16207}
.total-geral{text-align:center;margin:8px 0 16px;padding:12px;background:#f0fdf4;border:2px solid #059669;border-radius:10px}
.total-geral .lbl{font-size:11px;color:#666;text-transform:uppercase}
.total-geral .val{font-size:18px;font-weight:900;color:#059669}
.criterios-box{background:#fffdf0;border:1px solid #ccc;padding:15px;margin:10px 0;font-size:11pt;text-align:justify;line-height:1.5}
table.mem{border-collapse:collapse;width:100%;font-size:10px;margin:8px 0;font-family:ui-monospace,monospace}
table.mem th,table.mem td{border:1px solid #d1d5db;padding:4px 6px;text-align:right}
table.mem th{background:#f1f5f9;font-weight:800;text-align:center;font-size:9px;text-transform:uppercase}
table.mem td:first-child{text-align:center;font-weight:600}
table.mem tr:nth-child(even){background:#f8fafc}
table.mem tr.cap{background:#dbeafe !important;font-weight:700}
.assinatura{text-align:center;margin-top:30px;padding-top:10px}
.assinatura .linha{width:300px;border-top:1px solid #1a1a1a;margin:0 auto 6px;padding-top:6px}
.assinatura .nome{font-weight:bold;font-size:13px}
.assinatura .oab{font-size:11px;color:#555}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-family:system-ui}
.topbar button{border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;background:#3b82f6;color:#fff;font-size:12px}
.topbar button:hover{opacity:.9}
@media print{.topbar{display:none!important}}
@media(max-width:700px){.quad{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="topbar"><span style="font-size:13px;font-weight:700">Parecer de Auditoria Financeira</span><button onclick="window.print()">Imprimir PDF</button></div>
<div class="paper">${data.html}</div>
</body>
</html>`;
    res.send(pageHtml);
  });

  app.get("/api/tjmg/fatores", async (req, res) => {
    try {
      const startYear = parseInt(req.query.startYear as string) || 2017;
      const endYear =
        parseInt(req.query.endYear as string) || new Date().getFullYear();

      const response = await fetch(
        "https://www.debit.com.br/tabelas/tribunal-justica-mg",
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        },
      );
      if (!response.ok)
        throw new Error(
          "Erro ao acessar fonte de dados TJMG: HTTP " + response.status,
        );
      const html = await response.text();

      const fatores: Record<string, number> = {};
      const regex = /(\d{2})\/(\d{4})<\/td>\s*<td[^>]*>\s*([\d.,]+)/g;
      let match;
      while ((match = regex.exec(html)) !== null) {
        const mes = match[1];
        const ano = parseInt(match[2]);
        const valor = parseFloat(match[3].replace(/\./g, "").replace(",", "."));
        if (ano >= startYear && ano <= endYear && !isNaN(valor) && valor > 0) {
          fatores[`${ano}-${mes}`] = valor;
        }
      }

      const count = Object.keys(fatores).length;
      if (count === 0) {
        return res
          .status(404)
          .json({
            message: "Nenhum fator TJMG encontrado para o período solicitado.",
          });
      }

      res.json({
        fatores,
        count,
        startYear,
        endYear,
        source: "debit.com.br (dados oficiais TJMG)",
      });
    } catch (error: any) {
      console.error("TJMG fetch error:", error);
      res
        .status(500)
        .json({
          message:
            "Erro ao buscar fatores TJMG: " +
            (error.message || "erro desconhecido"),
        });
    }
  });

  app.post("/api/pdpj/test-connection", async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente } = req.body;
      if (!cpf || !tribunal)
        return res
          .status(400)
          .json({ message: "CPF e Tribunal sao obrigatorios" });

      const privateKey = cleanPemKey(process.env.PDPJ_PEM_PRIVATE_KEY || "");
      if (!privateKey)
        return res
          .status(500)
          .json({ message: "Chave PEM nao configurada no servidor" });

      // Gerar token real para o teste
      const now = Math.floor(Date.now() / 1000);
      const isPjud = modo === "pjud";
      const payload = {
        sub: cpf.replace(/\D/g, ""),
        iss: isPjud ? "pjud" : "pdpj",
        aud: isPjud ? "hc" : "pdpj-docs",
        iat: now,
        exp: now + 3600,
      };

      const token = jwt.sign(payload, privateKey, { algorithm: "RS256" });

      // Endpoint de teste (Domicilio Eletronico - Representados como exemplo de check)
      let baseUrl =
        ambiente === "producao"
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br";

      // Suporte para Mocks do SwaggerHub
      if (ambiente === "mock1")
        baseUrl = "https://virtserver.swaggerhub.com/MAIKONMG1_1/CNJ/1.0.0";
      if (ambiente === "mock2")
        baseUrl = "https://virtserver.swaggerhub.com/MAIKONMG1_12/CNJ/1.0.0";

      const endpoint =
        ambiente === "mock1" || ambiente === "mock2"
          ? "" // Mocks ja incluem o path no baseUrl
          : "/domicilio-eletronico/api/v1/representados";

      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        const label =
          response.status === 401
            ? "Chave nao autorizada (verifique registro no PDPJ)"
            : response.status === 403
              ? "Acesso negado (403) — pode ser restricao de IP do servidor"
              : `Erro HTTP ${response.status}`;
        return res.json({
          connected: false,
          message: `${label}: ${errorText.substring(0, 200)}`,
          http_status: response.status,
          ambiente,
          modo,
          debug_token_payload: payload,
        });
      }

      const data = await response.json().catch(() => ({}));
      res.json({
        connected: true,
        message: "Conexao estabelecida com sucesso!",
        ambiente,
        modo,
        data: data,
        debug_token_payload: payload,
      });
    } catch (error: any) {
      console.error("PDPJ Connection Test error:", error);
      res.status(500).json({
        connected: false,
        message: "Erro interno: " + error.message,
        ambiente: req.body.ambiente,
      });
    }
  });

  app.get("/api/pdpj/status", (_req, res) => {
    res.json({ configured: !!process.env.PDPJ_PEM_PRIVATE_KEY });
  });

  app.post("/api/pdpj/comunicacoes", async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente, dataInicio, dataFim, pagina } =
        req.body;
      const privateKey = cleanPemKey(process.env.PDPJ_PEM_PRIVATE_KEY || "");
      if (!privateKey)
        return res.status(500).json({ message: "Chave PEM nao configurada" });

      const now = Math.floor(Date.now() / 1000);
      const isPjud = modo === "pjud";
      const token = jwt.sign(
        {
          sub: cpf.replace(/\D/g, ""),
          iss: isPjud ? "pjud" : "pdpj",
          aud: isPjud ? "hc" : "pdpj-docs",
          iat: now,
          exp: now + 3600,
        },
        privateKey,
        { algorithm: "RS256" },
      );

      const baseUrl =
        ambiente === "producao"
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br";

      // Ajuste para o endpoint correto de comunicacoes do Domicilio Eletronico
      const url = new URL(
        `${baseUrl}/domicilio-eletronico/api/v1/comunicacoes`,
      );
      if (dataInicio) url.searchParams.append("dataInicio", dataInicio);
      if (dataFim) url.searchParams.append("dataFim", dataFim);
      url.searchParams.append("pagina", (pagina || 0).toString());
      url.searchParams.append("tamanho", "20");

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const errText = await response.text();
        return res
          .status(response.status)
          .json({
            message: `Erro PDPJ (${response.status}): ${errText.substring(0, 100)}`,
          });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pdpj/representados", async (req, res) => {
    try {
      const { cpf, modo, ambiente } = req.body;
      const privateKey = cleanPemKey(process.env.PDPJ_PEM_PRIVATE_KEY || "");
      if (!privateKey)
        return res.status(500).json({ message: "Chave PEM nao configurada" });

      const now = Math.floor(Date.now() / 1000);
      const isPjud = modo === "pjud";
      const token = jwt.sign(
        {
          sub: cpf.replace(/\D/g, ""),
          iss: isPjud ? "pjud" : "pdpj",
          aud: isPjud ? "hc" : "pdpj-docs",
          iat: now,
          exp: now + 3600,
        },
        privateKey,
        { algorithm: "RS256" },
      );

      const baseUrl =
        ambiente === "producao"
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br";

      const response = await fetch(
        `${baseUrl}/domicilio-eletronico/api/v1/representados`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (!response.ok) {
        const errText = await response.text();
        return res
          .status(response.status)
          .json({
            message: `Erro PDPJ (${response.status}): ${errText.substring(0, 100)}`,
          });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pdpj/habilitacao", async (req, res) => {
    try {
      const { cpf, modo, ambiente, documento } = req.body;
      const privateKey = cleanPemKey(process.env.PDPJ_PEM_PRIVATE_KEY || "");
      const now = Math.floor(Date.now() / 1000);
      const isPjud = modo === "pjud";
      const token = jwt.sign(
        {
          sub: cpf.replace(/\D/g, ""),
          iss: isPjud ? "pjud" : "pdpj",
          aud: isPjud ? "hc" : "pdpj-docs",
          iat: now,
          exp: now + 3600,
        },
        privateKey!,
        { algorithm: "RS256" },
      );

      const baseUrl =
        ambiente === "producao"
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br";

      const response = await fetch(
        `${baseUrl}/domicilio-eletronico/api/v1/habilita/verificar/${documento}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/pdpj/pessoa", async (req, res) => {
    try {
      const { cpf, modo, ambiente, documento, tipoPessoa } = req.body;
      const privateKey = cleanPemKey(process.env.PDPJ_PEM_PRIVATE_KEY || "");
      const now = Math.floor(Date.now() / 1000);
      const isPjud = modo === "pjud";
      const token = jwt.sign(
        {
          sub: cpf.replace(/\D/g, ""),
          iss: isPjud ? "pjud" : "pdpj",
          aud: isPjud ? "hc" : "pdpj-docs",
          iat: now,
          exp: now + 3600,
        },
        privateKey!,
        { algorithm: "RS256" },
      );

      const baseUrl =
        ambiente === "producao"
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br";

      const endpoint =
        tipoPessoa === "juridica" ? "pessoa-juridica" : "pessoa-fisica";
      const response = await fetch(
        `${baseUrl}/domicilio-eletronico/api/v1/${endpoint}/${documento}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ─── Webhook público do Tramitação (sem auth — requisição vem de servidor externo) ───
  app.post("/api/webhooks/tramitacao", async (req, res) => {
    try {
      const payload = req.body;
      if (
        payload?.event_type === "publications.created" &&
        Array.isArray(payload?.payload?.publications)
      ) {
        for (const pub of payload.payload.publications) {
          await storage.upsertTramitacaoPublicacao({
            extId: String(pub.id),
            idempotencyKey: payload.idempotency_key,
            numeroProcesso: pub.numero_processo || "",
            numeroProcessoMascara: pub.numero_processo_com_mascara || "",
            tribunal: pub.siglaTribunal || "",
            orgao: pub.nomeOrgao || "",
            classe: pub.nomeClasse || "",
            texto: pub.texto || "",
            disponibilizacaoDate: pub.disponibilizacao_date || "",
            publicacaoDate: pub.publication_date || "",
            inicioPrazoDate: pub.inicio_do_prazo_date || "",
            linkTramitacao: pub.link_tramitacao || "",
            linkTribunal: pub.link || "",
            destinatarios: JSON.stringify(pub.destinatarios || []),
            advogados: JSON.stringify(pub.destinatario_advogados || []),
          });
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      console.error("Webhook tramitacao error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ── Demo key endpoints (sem autenticação — configuração pública da chave demo) ──
  app.get("/api/demo-key-status", async (_req, res) => {
    const envKey = (process.env.PUBLIC_API_KEY || "").trim();
    const dbKey = (await storage.getSetting("demo_api_key")) || "";
    const hasPublicKey = !!(envKey || dbKey);
    const dbModel = (await storage.getSetting("demo_api_model")) || "";
    const dbUrl = (await storage.getSetting("demo_api_url")) || "";
    const publicModel = (dbModel || process.env.PUBLIC_API_MODEL || "gpt-4o-mini").trim();
    const publicUrl = (dbUrl || process.env.PUBLIC_API_URL || "https://api.openai.com/v1").trim();
    res.json({ hasPublicKey, model: hasPublicKey ? publicModel : null, url: hasPublicKey ? publicUrl : null });
  });

  app.get("/api/demo-key-config", async (_req, res) => {
    const key = (await storage.getSetting("demo_api_key")) || "";
    const model = (await storage.getSetting("demo_api_model")) || "";
    const url = (await storage.getSetting("demo_api_url")) || "";
    res.json({ hasKey: !!key, model, url });
  });

  app.post("/api/demo-key-config", async (req, res) => {
    const { key, model, url, perplexityKey } = req.body;
    if (key !== undefined) await storage.setSetting("demo_api_key", sanitizeKey(key));
    if (model !== undefined) await storage.setSetting("demo_api_model", model.trim());
    if (url !== undefined) await storage.setSetting("demo_api_url", url.trim());
    if (perplexityKey !== undefined) await storage.setSetting("perplexity_api_key", sanitizeKey(perplexityKey));
    res.json({ ok: true });
  });

  app.get("/api/perplexity-key-status", async (_req, res) => {
    const k = (await storage.getSetting("perplexity_api_key")) || "";
    res.json({ configured: !!k, masked: k ? k.substring(0, 8) + "..." : "" });
  });

  app.post("/api/demo-key-test", async (req, res) => {
    const { key, model, url } = req.body;
    if (!key || !key.trim()) return res.json({ ok: false, error: "Chave não informada." });
    const apiKey = sanitizeKey(key);
    // Auto-detecta o provedor se não vier URL (prioridade: URL enviada > auto-detecção)
    const detected = autoDetectProvider(apiKey);
    const apiUrl = ((url && url.trim()) || detected?.url || "").replace(/\/$/, "");
    const apiModel = ((model && model.trim()) || detected?.model || "llama-3.3-70b-versatile");
    const isPerplexityTest = apiUrl.includes("perplexity.ai");
    const maxTokTest = isPerplexityTest ? 50 : 10;
    try {
      // Gemini via SDK nativo (mais confiável)
      if (apiKey.startsWith("AIza") && !apiUrl.includes("openai")) {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        await ai.models.generateContent({ model: apiModel, contents: "Responda apenas: OK" });
        return res.json({ ok: true, model: apiModel });
      }
      const testUrl = (apiUrl || "https://api.groq.com/openai/v1").replace(/\/chat\/completions\/?$/, "");
      const response = await fetch(`${testUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: apiModel,
          messages: [{ role: "user", content: "OK" }],
          max_tokens: maxTokTest,
          stream: false,
        }),
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        let errMsg = `Erro ${response.status}`;
        try { errMsg = (JSON.parse(errBody) as any)?.error?.message ?? errMsg; } catch {}
        if (response.status === 401) errMsg = "Chave inválida ou expirada. Verifique no painel do provedor.";
        else if (response.status === 403) errMsg = "Sem permissão. Verifique se sua conta tem acesso ao modelo.";
        else if (response.status === 429) errMsg = "Limite de requisições atingido. Tente em alguns segundos.";
        return res.json({ ok: false, error: errMsg });
      }
      const data = await response.json() as any;
      return res.json({ ok: true, model: data?.model ?? apiModel });
    } catch (e: any) {
      return res.json({ ok: false, error: e?.message ?? "Falha na conexão." });
    }
  });

  app.post("/api/tts", async (req, res) => {
    const txtFile = `/tmp/tts_in_${Date.now()}.txt`;
    const mp3File = `/tmp/tts_out_${Date.now()}.mp3`;
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "Texto obrigatorio" });
      }

      const cleanText = text
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      const truncated = cleanText.slice(0, 4096);

      fs.writeFileSync(txtFile, truncated, "utf8");

      await execFileAsync(
        "python3",
        [
          "-m",
          "edge_tts",
          "--file",
          txtFile,
          "--voice",
          "pt-BR-FranciscaNeural",
          "--rate=+18%",
          "--write-media",
          mp3File,
        ],
        { timeout: 45000 },
      );

      const audioBuffer = fs.readFileSync(mp3File);

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
    } catch (error: any) {
      console.error("TTS error:", error);
      res
        .status(500)
        .json({
          message:
            "Erro ao gerar audio: " + (error.message || "erro desconhecido"),
        });
    } finally {
      try {
        fs.unlinkSync(txtFile);
      } catch {}
      try {
        fs.unlinkSync(mp3File);
      } catch {}
    }
  });

  app.post("/api/voice-chat", async (req, res) => {
    try {
      const { message, history, model, customKey, customUrl, customModelName, perplexityKey } = req.body;
      if (!message || typeof message !== "string") {
        return res.status(400).json({ message: "Mensagem obrigatória" });
      }

      const systemPrompt = `Você é uma assistente jurídica brasileira conversacional. O advogado está FALANDO com você por voz.

REGRAS PARA RESPOSTAS POR VOZ:
1. Responda em NO MÁXIMO 3 frases curtas e diretas
2. Use linguagem natural de conversa, NÃO use formatação (sem markdown, sem asteriscos, sem listas)
3. Seja objetiva e prática — o advogado quer resposta rápida
4. Se precisar de mais informações, pergunte de forma direta
5. Nunca repita a pergunta do advogado
6. Use português brasileiro informal mas profissional
7. Se for sobre legislação, cite o artigo de forma natural na frase`;

      console.log(`[Voice Chat] "${message.substring(0, 80)}" model=${model || "default"}`);
      const startMs = Date.now();

      const isPerplexityVoice = model === "perplexity";
      if (isPerplexityVoice) {
        let pKey = ((perplexityKey as string) || "").trim();
        if (!pKey) pKey = ((await storage.getSetting("perplexity_api_key")) || "").trim();
        if (!pKey) {
          const dbKey = ((await storage.getSetting("demo_api_key")) || "").trim();
          const dbUrl = ((await storage.getSetting("demo_api_url")) || "").trim();
          if (dbKey && dbUrl && dbUrl.includes("perplexity")) pKey = dbKey;
        }
        if (!pKey) return res.status(400).json({ message: "Chave Perplexity não configurada." });

        const chatMsgs: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        if (Array.isArray(history) && history.length > 0) {
          for (const msg of history) {
            const c = (msg.text || msg.content || "").trim();
            if (c) chatMsgs.push({ role: msg.role === "assistant" ? "assistant" : "user", content: c });
          }
        }
        chatMsgs.push({ role: "user", content: message });

        const pRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pKey}` },
          body: JSON.stringify({ model: "sonar-pro", messages: chatMsgs, max_tokens: 4096, temperature: 0.7 }),
        });
        if (!pRes.ok) {
          const errTxt = await pRes.text().catch(() => "");
          console.error("[Voice Chat Perplexity] Error:", pRes.status, errTxt.substring(0, 200));
          return res.status(500).json({ message: `Erro Perplexity (${pRes.status}): ${errTxt.substring(0, 100)}` });
        }
        const data = await pRes.json() as any;
        const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui responder.";
        const clean = reply.replace(/\*\*/g, "").replace(/#{1,3}\s/g, "").replace(/\n{2,}/g, " ").trim();
        console.log(`[Voice Chat Perplexity] ${Date.now() - startMs}ms — "${clean.substring(0, 80)}"`);
        return res.json({ reply: clean });
      }

      const isCustomModel = model === "custom";
      const personalKey = sanitizeKey((customKey as string) || "");
      const dbDemoKey = (await storage.getSetting("demo_api_key") || "").trim();
      const dbDemoUrl = (await storage.getSetting("demo_api_url") || "").trim();
      const dbDemoModel = (await storage.getSetting("demo_api_model") || "").trim();
      const publicEnvKey = (process.env.PUBLIC_API_KEY || "").trim();
      const publicEnvUrl = (process.env.PUBLIC_API_URL || "").trim();
      const publicEnvModel = (process.env.PUBLIC_API_MODEL || "").trim();
      const detectedVC = personalKey ? autoDetectProvider(personalKey) : null;
      const useCustomKey = !!personalKey || !!(isCustomModel && (dbDemoKey || publicEnvKey));
      const cKey = personalKey || (isCustomModel ? (dbDemoKey || publicEnvKey) : "");

      if (useCustomKey && cKey) {
        const cUrl = (personalKey
          ? ((customUrl as string) || detectedVC?.url || dbDemoUrl || publicEnvUrl || "https://api.groq.com/openai/v1")
          : (dbDemoUrl || publicEnvUrl || "https://api.groq.com/openai/v1")
        ).replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
        const cModel = (personalKey
          ? ((customModelName as string) || detectedVC?.model || dbDemoModel || publicEnvModel || "llama-3.3-70b-versatile")
          : (dbDemoModel || publicEnvModel || "llama-3.3-70b-versatile")
        ).trim();

        const chatMsgs: Array<{ role: string; content: string }> = [
          { role: "system", content: systemPrompt },
        ];
        if (Array.isArray(history) && history.length > 0) {
          for (const msg of history) {
            chatMsgs.push({ role: msg.role === "assistant" ? "assistant" : "user", content: msg.text || msg.content || "" });
          }
        }
        chatMsgs.push({ role: "user", content: message });

        const cRes = await fetch(`${cUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
          body: JSON.stringify({ model: cModel, messages: chatMsgs, max_tokens: 4096, temperature: 0.7 }),
        });
        if (!cRes.ok) {
          const errTxt = await cRes.text().catch(() => "");
          console.error("[Voice Chat Custom] Error:", cRes.status, errTxt.substring(0, 200));
          if (cRes.status === 401 || cRes.status === 403) {
            console.log(`[Voice Chat] Chave inválida (${cRes.status}) — usando Gemini`);
          } else {
            let userMsg = `Erro na sua chave (${cRes.status})`;
            if (cRes.status === 429) userMsg = "Limite de requisições atingido. Aguarde alguns segundos e tente novamente.";
            else if (errTxt) userMsg = `Erro (${cRes.status}): ${errTxt.substring(0, 100)}`;
            return res.status(502).json({ message: userMsg });
          }
        } else {
          const data = await cRes.json() as any;
          const reply = data.choices?.[0]?.message?.content || "Desculpe, não consegui responder.";
          const clean = reply.replace(/\*\*/g, "").replace(/#{1,3}\s/g, "").replace(/\n{2,}/g, " ").trim();
          console.log(`[Voice Chat Custom] ${Date.now() - startMs}ms — "${clean.substring(0, 80)}"`);
          return res.json({ reply: clean });
        }
      }

      // Sem chave ou chave inválida → Gemini do Replit
      console.log(`[Voice Chat] Sem chave válida — usando Gemini`);
      const contents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
      if (Array.isArray(history) && history.length > 0) {
        let first = true;
        for (const msg of history) {
          const role = msg.role === "assistant" ? "model" as const : "user" as const;
          const content = msg.text || msg.content || "";
          if (first && role === "user") {
            contents.push({ role: "user", parts: [{ text: `${systemPrompt}\n\n${content}` }] });
            first = false;
          } else {
            contents.push({ role, parts: [{ text: content }] });
          }
        }
      }
      contents.push({ role: "user", parts: [{ text: contents.length === 0 ? `${systemPrompt}\n\n${message}` : message }] });
      const result = await gemini.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { maxOutputTokens: 1500, temperature: 0.7 },
      });
      const reply = result.text || "Desculpe, não consegui responder.";
      const clean = reply.replace(/\*\*/g, "").replace(/#{1,3}\s/g, "").replace(/\*/g, "").replace(/\n{2,}/g, " ").trim();
      console.log(`[Voice Chat Gemini] ${Date.now() - startMs}ms — "${clean.substring(0, 80)}"`);
      return res.json({ reply: clean });
    } catch (error: any) {
      console.error("[Voice Chat] Error:", error?.message);
      return res.status(500).json({ message: "Erro ao processar conversa" });
    }
  });

  app.use("/api", requireAuth);

  app.post("/api/share/parecer", async (req, res) => {
    try {
      const { html, processo } = req.body;
      if (!html)
        return res
          .status(400)
          .json({ message: "HTML do parecer é obrigatório" });
      const sanitized = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
        .replace(/on\w+\s*=\s*'[^']*'/gi, "");
      const id =
        Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      await storage.createSharedParecer(id, sanitized, processo || "");
      const url = `${req.protocol}://${req.get("host")}/parecer/${id}`;
      res.json({ id, url });
    } catch (error) {
      res.status(500).json({ message: "Erro ao compartilhar parecer" });
    }
  });

  app.get("/api/snippets", async (_req, res) => {
    try {
      const snippets = await storage.getSnippets();
      res.json(snippets);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch snippets" });
    }
  });

  app.get("/api/snippets/:id", async (req, res) => {
    try {
      const snippet = await storage.getSnippet(req.params.id);
      if (!snippet) {
        return res.status(404).json({ message: "Snippet not found" });
      }
      res.json(snippet);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch snippet" });
    }
  });

  app.post("/api/snippets", async (req, res) => {
    try {
      const parsed = insertSnippetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid snippet data" });
      }
      const snippet = await storage.createSnippet(parsed.data);
      res.status(201).json(snippet);
    } catch (error) {
      res.status(500).json({ message: "Failed to create snippet" });
    }
  });

  app.patch("/api/snippets/:id", async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== "string") {
        return res.status(400).json({ message: "Title is required" });
      }
      const snippet = await storage.updateSnippetTitle(req.params.id, title);
      if (!snippet) {
        return res.status(404).json({ message: "Snippet not found" });
      }
      res.json(snippet);
    } catch (error) {
      res.status(500).json({ message: "Failed to update snippet" });
    }
  });

  app.delete("/api/snippets/:id", async (req, res) => {
    try {
      await storage.deleteSnippet(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete snippet" });
    }
  });

  app.get("/api/custom-actions", async (_req, res) => {
    try {
      const actions = await storage.getCustomActions();
      res.json(actions);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar modelos" });
    }
  });

  app.post("/api/custom-actions", async (req, res) => {
    try {
      const parsed = insertCustomActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos" });
      }
      const action = await storage.createCustomAction(parsed.data);
      res.status(201).json(action);
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar modelo" });
    }
  });

  app.patch("/api/custom-actions/:id", async (req, res) => {
    try {
      const parsed = insertCustomActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos" });
      }
      const action = await storage.updateCustomAction(
        req.params.id,
        parsed.data,
      );
      if (!action) {
        return res.status(404).json({ message: "Modelo nao encontrado" });
      }
      res.json(action);
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar modelo" });
    }
  });

  app.delete("/api/custom-actions/:id", async (req, res) => {
    try {
      await storage.deleteCustomAction(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir modelo" });
    }
  });

  app.get("/api/ementas", async (_req, res) => {
    try {
      const items = await storage.getEmentas();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar ementas" });
    }
  });

  app.post("/api/ementas", async (req, res) => {
    try {
      const parsed = insertEmentaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos" });
      }
      const ementa = await storage.createEmenta(parsed.data);
      res.status(201).json(ementa);
    } catch (error) {
      res.status(500).json({ message: "Erro ao criar ementa" });
    }
  });

  app.patch("/api/ementas/:id", async (req, res) => {
    try {
      const parsed = insertEmentaSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos" });
      }
      const ementa = await storage.updateEmenta(req.params.id, parsed.data);
      if (!ementa) {
        return res.status(404).json({ message: "Ementa nao encontrada" });
      }
      res.json(ementa);
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar ementa" });
    }
  });

  app.delete("/api/ementas/:id", async (req, res) => {
    try {
      await storage.deleteEmenta(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir ementa" });
    }
  });

  app.post("/api/jurisprudencia/buscar", async (req, res) => {
    try {
      const { q, tribunais, apiKey: clientKey } = req.body as { q: string; tribunais: string[]; apiKey?: string };
      if (!q?.trim())
        return res.status(400).json({ message: "Termo de busca obrigatório" });

      const rawKey = clientKey?.trim() || process.env.DATAJUD_API_KEY || "";
      if (!rawKey) {
        return res.status(400).json({
          message: "Chave DataJud não configurada. Acesse as Configurações e insira sua chave do CNJ (datajud-wiki.cnj.jus.br).",
        });
      }
      const DATAJUD_KEY = rawKey.startsWith("ApiKey ") || rawKey.startsWith("APIKey ")
        ? rawKey.replace(/^APIKey /, "ApiKey ")
        : `ApiKey ${rawKey}`;

      const tribunaisList =
        Array.isArray(tribunais) && tribunais.length > 0 ? tribunais : [];

      const tribunalMap: Record<string, string> = {
        STJ: "stj", STF: "stf",
        TRF1: "trf1", TRF2: "trf2", TRF3: "trf3", TRF4: "trf4", TRF5: "trf5", TRF6: "trf6",
        TJMG: "tjmg", TJSP: "tjsp", TJRJ: "tjrj",
      };

      const indices = tribunaisList.length > 0
        ? tribunaisList.map(t => tribunalMap[t] || t.toLowerCase()).map(i => `api_publica_${i}`)
        : ["api_publica_stj", "api_publica_trf1", "api_publica_trf6"];

      const payload = {
        size: 10,
        query: {
          bool: {
            should: [
              { match: { ementa: { query: q, boost: 5 } } },
              { match_phrase: { ementa: { query: q, boost: 8 } } },
              { match: { "assuntos.nome": { query: q, boost: 3 } } },
              { match: { "classe.nome": { query: q, boost: 2 } } },
              { match: { "orgaoJulgador.nome": { query: q, boost: 1 } } },
              { match: { numeroProcesso: { query: q, boost: 1 } } },
            ],
            minimum_should_match: 1,
          },
        },
        sort: [{ _score: { order: "desc" } }, { dataAjuizamento: { order: "desc" } }],
      };

      const allResults: any[] = [];
      let totalErrors = 0;
      const errorMessages: string[] = [];
      for (const idx of indices) {
        try {
          const url = `https://api-publica.datajud.cnj.jus.br/${idx}/_search`;
          const cnjRes = await fetch(url, {
            method: "POST",
            headers: { Authorization: DATAJUD_KEY, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!cnjRes.ok) {
            totalErrors++;
            const errText = await cnjRes.text().catch(() => "");
            errorMessages.push(`${idx.replace("api_publica_", "").toUpperCase()}: HTTP ${cnjRes.status}`);
            console.warn(`DataJud ${idx} returned ${cnjRes.status}:`, errText.substring(0, 200));
            continue;
          }
          const data = (await cnjRes.json()) as any;
          const hits: any[] = data?.hits?.hits || [];
          for (const hit of hits) {
            const s = hit._source || {};
            const numProc = s.numeroProcesso || "";
            const formatted = numProc.length === 20
              ? `${numProc.slice(0,7)}-${numProc.slice(7,9)}.${numProc.slice(9,13)}.${numProc.slice(13,14)}.${numProc.slice(14,16)}.${numProc.slice(16)}`
              : numProc;
            const assuntos = (s.assuntos || []).map((a: any) => a.nome).filter(Boolean).join(", ");
            const ultimoMov = (s.movimentos || []).slice(-1)[0];
            const orgao = s.orgaoJulgador?.nome || ultimoMov?.orgaoJulgador?.nome || "";
            const dataMov = s.dataAjuizamento
              ? (() => { const d = s.dataAjuizamento; return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`; })()
              : ultimoMov?.dataHora
                ? new Date(ultimoMov.dataHora).toLocaleDateString("pt-BR")
                : "Não informado";
            const ementaText = s.ementa || assuntos || "Sem ementa disponível";
            allResults.push({
              tribunal: s.tribunal || idx.replace("api_publica_", "").toUpperCase(),
              tipo: s.classe?.nome || "Processo",
              processo: formatted,
              relator: orgao,
              data: dataMov,
              ementa: ementaText,
              assuntos: assuntos || "",
              tese: ultimoMov ? `${ultimoMov.nome}${ultimoMov.complementosTabelados?.length ? " — " + ultimoMov.complementosTabelados.map((c: any) => c.nome).join(", ") : ""}` : "Sem movimentos",
              url: numProc ? `https://jurisprudencia.cnj.jus.br/pesquisa-unificada?numero=${numProc}` : null,
            });
          }
        } catch (err: any) {
          totalErrors++;
          errorMessages.push(`${idx.replace("api_publica_", "").toUpperCase()}: ${err.message}`);
        }
      }

      if (allResults.length === 0 && totalErrors === indices.length) {
        return res.status(503).json({
          message: `O DataJud (CNJ) está temporariamente indisponível. Tente novamente em alguns minutos. Detalhes: ${errorMessages.join("; ")}`,
        });
      }

      res.json({
        results: allResults.slice(0, 20),
        warnings: totalErrors > 0 && allResults.length > 0
          ? [`Alguns tribunais não responderam: ${errorMessages.join("; ")}`]
          : undefined,
      });
    } catch (e: any) {
      console.error("Erro busca jurisprudência DataJud:", e.message);
      res.status(500).json({
        message:
          "Falha na comunicação com o DataJud (CNJ). Verifique sua conexão e tente novamente.",
      });
    }
  });

  app.get("/api/ai-history", async (_req, res) => {
    try {
      const history = await storage.getAiHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar historico" });
    }
  });

  app.post("/api/ai-history", async (req, res) => {
    try {
      const parsed = insertAiHistorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos" });
      }
      const entry = await storage.createAiHistory(parsed.data);
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({ message: "Erro ao salvar historico" });
    }
  });

  app.delete("/api/ai-history/:id", async (req, res) => {
    try {
      await storage.deleteAiHistory(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir historico" });
    }
  });

  app.delete("/api/ai-history", async (_req, res) => {
    try {
      await storage.clearAiHistory();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Erro ao limpar historico" });
    }
  });

  app.get("/api/ai-usage-summary", async (_req, res) => {
    try {
      const history = await storage.getAiHistory();
      const byProvider: Record<string, { calls: number; inputTokens: number; outputTokens: number; cost: number }> = {};
      let totalCost = 0;
      let totalCalls = 0;
      for (const h of history) {
        const prov = (h as any).provider || "Desconhecido";
        if (!byProvider[prov]) byProvider[prov] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
        byProvider[prov].calls++;
        byProvider[prov].inputTokens += (h as any).inputTokens || 0;
        byProvider[prov].outputTokens += (h as any).outputTokens || 0;
        byProvider[prov].cost += (h as any).estimatedCost || 0;
        totalCost += (h as any).estimatedCost || 0;
        totalCalls++;
      }
      const credit = parseFloat((await storage.getSetting("user_credit")) || "0");
      res.json({ byProvider, totalCost: Math.round(totalCost * 10000) / 10000, totalCalls, credit, remaining: Math.round((credit - totalCost) * 10000) / 10000 });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar resumo" });
    }
  });

  app.post("/api/ai-usage-credit", async (req, res) => {
    const { credit } = req.body;
    if (credit === undefined) return res.status(400).json({ message: "Crédito não informado" });
    await storage.setSetting("user_credit", String(credit));
    res.json({ ok: true });
  });

  app.get("/api/prompt-templates", async (_req, res) => {
    try {
      const templates = await storage.getPromptTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar modelos de prompt" });
    }
  });

  app.post("/api/prompt-templates", async (req, res) => {
    try {
      const parsed = insertPromptTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Dados invalidos" });
      const template = await storage.createPromptTemplate(parsed.data);
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ message: "Erro ao salvar modelo de prompt" });
    }
  });

  app.patch("/api/prompt-templates/:id", async (req, res) => {
    try {
      const parsed = insertPromptTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Dados invalidos" });
      const updated = await storage.updatePromptTemplate(
        req.params.id,
        parsed.data,
      );
      if (!updated)
        return res.status(404).json({ message: "Modelo nao encontrado" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar modelo de prompt" });
    }
  });

  app.delete("/api/prompt-templates/:id", async (req, res) => {
    try {
      await storage.deletePromptTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Erro ao excluir modelo de prompt" });
    }
  });

  app.get("/api/doc-templates", async (_req, res) => {
    try {
      const templates = await storage.getDocTemplates();
      res.json(templates);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Erro ao buscar templates de documento" });
    }
  });

  app.post("/api/doc-templates", async (req, res) => {
    try {
      const parsed = insertDocTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Dados invalidos" });
      const template = await storage.createDocTemplate(parsed.data);
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ message: "Erro ao salvar template de documento" });
    }
  });

  app.patch("/api/doc-templates/:id", async (req, res) => {
    try {
      const parsed = insertDocTemplateSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ message: "Dados invalidos" });
      const updated = await storage.updateDocTemplate(
        req.params.id,
        parsed.data,
      );
      if (!updated)
        return res.status(404).json({ message: "Template nao encontrado" });
      res.json(updated);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Erro ao atualizar template de documento" });
    }
  });

  app.delete("/api/doc-templates/:id", async (req, res) => {
    try {
      await storage.deleteDocTemplate(req.params.id);
      res.status(204).send();
    } catch (error) {
      res
        .status(500)
        .json({ message: "Erro ao excluir template de documento" });
    }
  });

  app.post(
    "/api/doc-templates/upload-docx",
    upload.single("file"),
    async (req, res) => {
      try {
        const file = req.file;
        if (!file)
          return res.status(400).json({ message: "Nenhum arquivo enviado" });
        const titulo =
          req.body.titulo || file.originalname.replace(/\.docx$/i, "");
        const categoria = req.body.categoria || "Geral";
        const docxBase64 = file.buffer.toString("base64");

        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file.buffer);
        const docXml = await zip.file("word/document.xml")?.async("string");
        let conteudo = "{{CONTEUDO}}";
        if (docXml) {
          const textContent = docXml
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const preview = textContent.substring(0, 300);
          conteudo =
            preview +
            (textContent.length > 300 ? "..." : "") +
            "\n\n{{CONTEUDO}}";
        }

        const template = await storage.createDocTemplate({
          titulo,
          categoria,
          conteudo,
          docxBase64,
          docxFilename: file.originalname,
        });
        res.status(201).json(template);
      } catch (error) {
        console.error("Upload docx template error:", error);
        res.status(500).json({ message: "Erro ao importar template Word" });
      }
    },
  );

  app.post("/api/export/word-with-template", async (req, res) => {
    try {
      const { text, title, templateId, html, formatting } = req.body;
      if (!text)
        return res.status(400).json({ message: "Texto é obrigatório" });

      const fmt = formatting || {
        fontFamily: "Times New Roman",
        fontSize: 12,
        lineHeight: 1.5,
        textAlign: "justify",
        paragraphIndent: 4,
        citationIndent: 4,
        marginTop: 3,
        marginBottom: 3,
        marginLeft: 2,
        marginRight: 2,
      };
      if (!fmt.marginTop) fmt.marginTop = 3;
      if (!fmt.marginBottom) fmt.marginBottom = 3;
      if (!fmt.marginLeft) fmt.marginLeft = 2;
      if (!fmt.marginRight) fmt.marginRight = 2;
      if (!fmt.paragraphIndent) fmt.paragraphIndent = 4;
      const pgMarTop = Math.round(fmt.marginTop * 567);
      const pgMarBottom = Math.round(fmt.marginBottom * 567);
      const pgMarLeft = Math.round(fmt.marginLeft * 567);
      const pgMarRight = Math.round(fmt.marginRight * 567);
      const pgMarXml = `w:top="${pgMarTop}" w:right="${pgMarRight}" w:bottom="${pgMarBottom}" w:left="${pgMarLeft}" w:header="709" w:footer="709" w:gutter="0"`;
      const docTitle = title || "documento";

      const decodeEntities = (s: string): string =>
        s
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&apos;/g, "'")
          .replace(/&ndash;/g, "–")
          .replace(/&mdash;/g, "—")
          .replace(/&laquo;/g, "«")
          .replace(/&raquo;/g, "»")
          .replace(/&ordm;/g, "º")
          .replace(/&ordf;/g, "ª")
          .replace(/&sect;/g, "§")
          .replace(/&para;/g, "¶")
          .replace(/&Aacute;/g, "Á")
          .replace(/&aacute;/g, "á")
          .replace(/&Agrave;/g, "À")
          .replace(/&agrave;/g, "à")
          .replace(/&Acirc;/g, "Â")
          .replace(/&acirc;/g, "â")
          .replace(/&Atilde;/g, "Ã")
          .replace(/&atilde;/g, "ã")
          .replace(/&Eacute;/g, "É")
          .replace(/&eacute;/g, "é")
          .replace(/&Egrave;/g, "È")
          .replace(/&egrave;/g, "è")
          .replace(/&Ecirc;/g, "Ê")
          .replace(/&ecirc;/g, "ê")
          .replace(/&Iacute;/g, "Í")
          .replace(/&iacute;/g, "í")
          .replace(/&Ocirc;/g, "Ô")
          .replace(/&ocirc;/g, "ô")
          .replace(/&Otilde;/g, "Õ")
          .replace(/&otilde;/g, "õ")
          .replace(/&Oacute;/g, "Ó")
          .replace(/&oacute;/g, "ó")
          .replace(/&Uacute;/g, "Ú")
          .replace(/&uacute;/g, "ú")
          .replace(/&Ccedil;/g, "Ç")
          .replace(/&ccedil;/g, "ç")
          .replace(/&Ucirc;/g, "Û")
          .replace(/&ucirc;/g, "û")
          .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
          .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
            String.fromCharCode(parseInt(h, 16)),
          );

      const cleanContent = (c: string) => {
        if (!c) return "";
        return decodeEntities(c).replace(
          /[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g,
          "",
        );
      };

      let docxContent = "";
      const docContent = html ? cleanContent(html) : cleanContent(text);

      if (html) {
        const escXml = (s: string) =>
          s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const htmlToWordXml = (htmlStr: string): string => {
          // Helper: parse a table HTML element into OOXML <w:tbl>
          const tableToOoxml = (
            tableHtml: string,
            fmtFont: string,
            fmtFontSize: string,
          ): string => {
            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let rowMatch;
            const rows: string[] = [];
            while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
              const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
              let cellMatch;
              const cells: string[] = [];
              while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
                const isHeader = cellMatch[1].toLowerCase() === "th";
                const cellText =
                  escXml(cellMatch[2].replace(/<[^>]+>/g, "").trim()) || " ";
                const boldXml = isHeader ? "<w:b/><w:bCs/>" : "";
                const jc = isHeader ? "center" : "left";
                cells.push(
                  `<w:tc><w:tcPr><w:tcBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${fmtFont}" w:hAnsi="${fmtFont}"/><w:sz w:val="${fmtFontSize}"/><w:szCs w:val="${fmtFontSize}"/>${boldXml}</w:rPr><w:t xml:space="preserve">${cellText}</w:t></w:r></w:p></w:tc>`,
                );
              }
              if (cells.length > 0) rows.push(`<w:tr>${cells.join("")}</w:tr>`);
            }
            if (rows.length === 0) return "";
            return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders></w:tblPr>${rows.join("")}</w:tbl>`;
          };

          interface BlockInfo {
            text: string;
            htmlContent: string;
            bold: boolean;
            align: string;
            textIndentCm: number;
            marginLeftCm: number;
            isCitacao: boolean;
            isSmallFont: boolean;
            isSingleSpacing: boolean;
          }

          const fmtFontSize = fmt.fontSize * 2;
          const fmtLineSpacing = String(Math.round(fmt.lineHeight * 240));
          const fmtFont = fmt.fontFamily || "Times New Roman";
          const fmtAlign =
            fmt.textAlign === "justify" ? "both" : fmt.textAlign || "both";

          // Convert inline HTML (strong/em/u/br) to OOXML runs preserving formatting
          const htmlContentToRuns = (
            html: string,
            fontSize: string,
            defaultBold: boolean,
          ): string => {
            const parts: Array<{
              text: string;
              bold: boolean;
              italic: boolean;
              underline: boolean;
              br: boolean;
            }> = [];
            const tagPat =
              /(<br\s*\/?>|<\/?(?:strong|b|em|i|u)[^>]*>|<[^>]+>)/gi;
            let lastIdx = 0;
            let curBold = defaultBold,
              curItalic = false,
              curUnder = false;
            let m2: RegExpExecArray | null;
            while ((m2 = tagPat.exec(html)) !== null) {
              if (m2.index > lastIdx) {
                const txt = decodeEntities(html.slice(lastIdx, m2.index));
                if (txt)
                  parts.push({
                    text: txt,
                    bold: curBold,
                    italic: curItalic,
                    underline: curUnder,
                    br: false,
                  });
              }
              const tag2 = m2[0].toLowerCase().replace(/\s+/g, "");
              if (tag2.startsWith("<br")) {
                parts.push({
                  text: "",
                  bold: curBold,
                  italic: curItalic,
                  underline: curUnder,
                  br: true,
                });
              } else if (tag2 === "<strong>" || tag2 === "<b>") curBold = true;
              else if (tag2 === "</strong>" || tag2 === "</b>")
                curBold = defaultBold;
              else if (tag2 === "<em>" || tag2 === "<i>") curItalic = true;
              else if (tag2 === "</em>" || tag2 === "</i>") curItalic = false;
              else if (tag2 === "<u>") curUnder = true;
              else if (tag2 === "</u>") curUnder = false;
              lastIdx = m2.index + m2[0].length;
            }
            if (lastIdx < html.length) {
              const txt = decodeEntities(html.slice(lastIdx));
              if (txt)
                parts.push({
                  text: txt,
                  bold: curBold,
                  italic: curItalic,
                  underline: curUnder,
                  br: false,
                });
            }
            if (parts.length === 0) return "";
            return parts
              .map((p) => {
                if (p.br) return "<w:r><w:br/></w:r>";
                const bx = p.bold ? "<w:b/><w:bCs/>" : "";
                const ix = p.italic ? "<w:i/><w:iCs/>" : "";
                const ux = p.underline ? '<w:u w:val="single"/>' : "";
                return `<w:r><w:rPr><w:rFonts w:ascii="${fmtFont}" w:hAnsi="${fmtFont}"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/>${bx}${ix}${ux}</w:rPr><w:t xml:space="preserve">${escXml(p.text)}</w:t></w:r>`;
              })
              .join("");
          };

          const parseBlockAttrs = (
            attrs: string,
            tag: string,
            content: string,
          ) => {
            const hasBold =
              /<strong|<b>/i.test(content) ||
              /font-weight:\s*bold/i.test(attrs);
            const plainText = decodeEntities(
              content
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<[^>]+>/g, "")
                .trim(),
            );
            let align = "both",
              textIndentCm = 0,
              marginLeftCm = 0;
            let isCitacao = false,
              isSmallFont = false,
              isSingleSpacing = false;
            const sm = attrs.match(/style="([^"]*)"/i);
            const style = sm ? sm[1] : "";
            if (/text-align:\s*center/i.test(style)) align = "center";
            else if (/text-align:\s*right/i.test(style)) align = "right";
            else if (/text-align:\s*left/i.test(style)) align = "left";
            const im = style.match(/text-indent:\s*([\d.]+)cm/i);
            if (im) textIndentCm = parseFloat(im[1]);
            const mm = style.match(/margin-left:\s*([\d.]+)cm/i);
            if (mm) marginLeftCm = parseFloat(mm[1]);
            if (marginLeftCm === 0) {
              const ms = style.match(
                /(?:^|;)\s*margin:\s*[\d.]+[a-z%]*\s+[\d.]+[a-z%]*\s+[\d.]+[a-z%]*\s+([\d.]+)cm/i,
              );
              if (ms) marginLeftCm = parseFloat(ms[1]);
            }
            if (marginLeftCm === 0) {
              const pl = style.match(/padding-left:\s*([\d.]+)cm/i);
              if (pl) marginLeftCm = parseFloat(pl[1]);
            }
            const fs = style.match(/font-size:\s*([\d.]+)pt/i);
            if (fs && parseFloat(fs[1]) < fmt.fontSize) isSmallFont = true;
            if (
              /line-height:\s*1[;\s"]/i.test(style) ||
              /line-height:\s*1$/i.test(style)
            )
              isSingleSpacing = true;
            if (marginLeftCm >= 2 || /recuo-4cm|citacao/i.test(attrs))
              isCitacao = true;
            if (tag.toLowerCase() === "blockquote") {
              isCitacao = true;
              if (marginLeftCm === 0) marginLeftCm = 4;
            }
            if (tag.toLowerCase().match(/^h[1-6]$/)) {
              align = align === "both" ? "center" : align;
            }
            return {
              text: plainText,
              htmlContent: content,
              bold: hasBold || /font-weight:\s*bold/i.test(style),
              align,
              textIndentCm,
              marginLeftCm,
              isCitacao,
              isSmallFont,
              isSingleSpacing,
            };
          };

          const blocks: BlockInfo[] = [];
          // Processa TODOS os elementos de bloco em ordem de documento
          // (parágrafos, títulos, blockquotes, listas) mantendo a posição correta
          const tagRegex =
            /<(p|blockquote|h[1-6]|div|ul|ol)([^>]*?)>([\s\S]*?)<\/\1>/gi;
          let match;

          while ((match = tagRegex.exec(htmlStr)) !== null) {
            const [, tag, attrs, content] = match;
            if (/^(?:ul|ol)$/i.test(tag)) {
              // Extrai <li> em ordem dentro da lista
              const isOrdered = tag.toLowerCase() === "ol";
              const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
              let li: RegExpExecArray | null;
              let liIdx = 0;
              while ((li = liRegex.exec(content)) !== null) {
                liIdx++;
                const liContent = li[1];
                const liText = decodeEntities(
                  liContent
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<[^>]+>/g, "")
                    .trim(),
                );
                if (liText) {
                  const prefix = isOrdered ? `${liIdx}. ` : "\u2022 ";
                  blocks.push({
                    text: `${prefix}${liText}`,
                    htmlContent: `${prefix}${liContent}`,
                    bold: false,
                    align: "both",
                    textIndentCm: 0,
                    marginLeftCm: isOrdered ? 2 : 1.5,
                    isCitacao: false,
                    isSmallFont: false,
                    isSingleSpacing: false,
                  });
                }
              }
            } else {
              const b = parseBlockAttrs(attrs, tag, content);
              if (b.text) blocks.push(b);
            }
          }

          if (blocks.length === 0 && htmlStr.trim()) {
            const fallbackText = htmlStr.replace(/<[^>]+>/g, "").trim();
            if (fallbackText) {
              blocks.push({
                text: fallbackText,
                htmlContent: fallbackText,
                bold: false,
                align: "both",
                textIndentCm: 0,
                marginLeftCm: 0,
                isCitacao: false,
                isSmallFont: false,
                isSingleSpacing: false,
              });
            }
          }

          const blockToOoxml = (b: BlockInfo): string => {
            const indentTwips = Math.round(b.textIndentCm * 567);
            const marginTwips = Math.round(b.marginLeftCm * 567);
            let indentation = "";
            if (indentTwips > 0)
              indentation = `<w:ind w:firstLine="${indentTwips}"/>`;
            else if (marginTwips > 0)
              indentation = `<w:ind w:left="${marginTwips}"/>`;

            const fontSize = String(
              b.isSmallFont ? Math.max(fmtFontSize - 4, 16) : fmtFontSize,
            );
            const spacing = b.isSingleSpacing
              ? 'line="240" lineRule="auto"'
              : `line="${fmtLineSpacing}" lineRule="auto"`;
            const jcVal = b.align === "both" ? fmtAlign : b.align;
            const runs = htmlContentToRuns(b.htmlContent, fontSize, b.bold);
            const safeRuns =
              runs ||
              `<w:r><w:rPr><w:rFonts w:ascii="${fmtFont}" w:hAnsi="${fmtFont}"/><w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr><w:t xml:space="preserve">${escXml(b.text)}</w:t></w:r>`;
            return `<w:p><w:pPr><w:jc w:val="${jcVal}"/>${indentation}<w:spacing w:after="120" ${spacing}/></w:pPr>${safeRuns}</w:p>`;
          };

          // Process HTML in document order: handle tables inline with paragraphs
          const segments: string[] = [];
          const tableRegex = /<table[\s\S]*?<\/table>/gi;
          let lastIndex = 0;
          let tMatch;
          const parseSection = (html: string): BlockInfo[] => {
            const result2: BlockInfo[] = [];
            const pr = /<(p|blockquote|h[1-6]|div|ul|ol)([^>]*?)>([\s\S]*?)<\/\1>/gi;
            let pm;
            while ((pm = pr.exec(html)) !== null) {
              const [, ptag, pattrs, pcontent] = pm;
              if (/^(?:ul|ol)$/i.test(ptag)) {
                const isOrd = ptag.toLowerCase() === "ol";
                const lr = /<li[^>]*>([\s\S]*?)<\/li>/gi;
                let lx: RegExpExecArray | null;
                let lxi = 0;
                while ((lx = lr.exec(pcontent)) !== null) {
                  lxi++;
                  const lc = lx[1];
                  const lt = decodeEntities(lc.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim());
                  if (lt) {
                    const px = isOrd ? `${lxi}. ` : "\u2022 ";
                    result2.push({ text: `${px}${lt}`, htmlContent: `${px}${lc}`, bold: false, align: "both", textIndentCm: 0, marginLeftCm: isOrd ? 2 : 1.5, isCitacao: false, isSmallFont: false, isSingleSpacing: false });
                  }
                }
              } else {
                const b = parseBlockAttrs(pattrs, ptag, pcontent);
                if (b.text) result2.push(b);
              }
            }
            return result2;
          };

          while ((tMatch = tableRegex.exec(htmlStr)) !== null) {
            const before = htmlStr.slice(lastIndex, tMatch.index);
            if (before.trim()) {
              segments.push(parseSection(before).map(blockToOoxml).join(""));
            }
            segments.push(
              tableToOoxml(tMatch[0], fmtFont, String(fmtFontSize)),
            );
            lastIndex = tMatch.index + tMatch[0].length;
          }

          // Process remaining HTML after last table (or all HTML if no tables)
          const remaining =
            lastIndex === 0 ? htmlStr : htmlStr.slice(lastIndex);
          if (remaining.trim() || lastIndex === 0) {
            if (blocks.length > 0 && lastIndex === 0) {
              segments.push(blocks.map(blockToOoxml).join(""));
            } else if (lastIndex > 0 && remaining.trim()) {
              segments.push(parseSection(remaining).map(blockToOoxml).join(""));
            }
          }

          const result = segments.join("");
          if (!result && htmlStr.trim()) {
            const fallbackText = htmlStr.replace(/<[^>]+>/g, "").trim();
            if (fallbackText)
              return blockToOoxml({
                text: fallbackText,
                htmlContent: fallbackText,
                bold: false,
                align: "both",
                textIndentCm: 0,
                marginLeftCm: 0,
                isCitacao: false,
                isSmallFont: false,
                isSingleSpacing: false,
              });
          }
          return result;
        };

        let finalHtml = html;
        if (templateId) {
          const template = await storage.getDocTemplate(templateId);
          if (template && !template.docxBase64) {
            finalHtml = template.conteudo.replace(/\{\{CONTEUDO\}\}/gi, html);
          }
        }
        docxContent = htmlToWordXml(finalHtml);
      } else {
        let finalText = text;
        if (templateId) {
          const template = await storage.getDocTemplate(templateId);
          if (template && !template.docxBase64) {
            finalText = template.conteudo.replace(/\{\{CONTEUDO\}\}/gi, text);
          }
        }

        const cleanText = finalText
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/__(.+?)__/g, "$1")
          .replace(/_(.+?)_/g, "$1")
          .replace(/~~(.+?)~~/g, "$1")
          .replace(/`(.+?)`/g, "$1")
          .replace(/^[-*+]\s+/gm, "")
          .replace(/^\d+\.\s+/gm, "");

        const fmtFontSizePlain = String(fmt.fontSize * 2);
        const fmtLineSpacingPlain = String(Math.round(fmt.lineHeight * 240));
        const fmtFontPlain = fmt.fontFamily || "Times New Roman";
        const fmtAlignPlain =
          fmt.textAlign === "justify" ? "both" : fmt.textAlign || "both";
        const fmtIndentPlain = Math.round((fmt.paragraphIndent || 0) * 567);

        const paragraphs = cleanText
          .split(/\n\n+/)
          .filter((p: string) => p.trim());
        docxContent = paragraphs
          .map((p: string) => {
            const isTitle =
              p === p.toUpperCase() && p.length < 200 && p.length > 3;
            const indent =
              !isTitle && fmtIndentPlain > 0
                ? `<w:ind w:firstLine="${fmtIndentPlain}"/>`
                : "";
            return `<w:p><w:pPr><w:jc w:val="${isTitle ? "center" : fmtAlignPlain}"/>${indent}<w:spacing w:after="200" w:line="${fmtLineSpacingPlain}" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${fmtFontPlain}" w:hAnsi="${fmtFontPlain}"/><w:sz w:val="${fmtFontSizePlain}"/><w:szCs w:val="${fmtFontSizePlain}"/>${isTitle ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, `</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="${fmtFontPlain}" w:hAnsi="${fmtFontPlain}"/><w:sz w:val="${fmtFontSizePlain}"/><w:szCs w:val="${fmtFontSizePlain}"/></w:rPr><w:br/><w:t xml:space="preserve">`)}</w:t></w:r></w:p>`;
          })
          .join("");
      }

      const JSZip = (await import("jszip")).default;
      let buffer: Buffer;

      let docxTemplate: { docxBase64: string | null } | null = null;
      if (templateId) {
        const tpl = await storage.getDocTemplate(templateId);
        if (tpl?.docxBase64) docxTemplate = tpl;
      }

      if (docxTemplate?.docxBase64) {
        const tplBuffer = Buffer.from(docxTemplate.docxBase64, "base64");
        const zip = await JSZip.loadAsync(tplBuffer);
        const origDocXml = await zip.file("word/document.xml")?.async("string");
        if (origDocXml) {
          const sectPrMatch = origDocXml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
          const sectPr = sectPrMatch
            ? sectPrMatch[0]
            : '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';

          const bodyMatch = origDocXml.match(/<w:body>([\s\S]*)<\/w:body>/);
          let beforeContent = "";
          let afterContent = "";
          if (bodyMatch) {
            const bodyInner = bodyMatch[1].replace(
              /<w:sectPr[\s\S]*?<\/w:sectPr>/,
              "",
            );
            const allParas = bodyInner.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
            let placeholderIdx = -1;
            for (let i = 0; i < allParas.length; i++) {
              const paraText = allParas[i].replace(/<[^>]+>/g, "");
              if (
                paraText.includes("{{CONTEUDO}}") ||
                paraText.includes("{{ CONTEUDO }}") ||
                paraText.includes("{{conteudo}}")
              ) {
                placeholderIdx = i;
                break;
              }
            }
            if (placeholderIdx >= 0) {
              beforeContent = allParas.slice(0, placeholderIdx).join("");
              afterContent = allParas.slice(placeholderIdx + 1).join("");
            } else {
              beforeContent = allParas.join("");
            }
          }

          const nsMatch = origDocXml.match(/<w:document([^>]*)>/);
          const nsAttrs = nsMatch
            ? nsMatch[1]
            : ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
          const newDocXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document${nsAttrs}><w:body>${beforeContent}${docxContent}${afterContent}${sectPr}</w:body></w:document>`;
          zip.file("word/document.xml", newDocXml, { binary: false });
        }
        buffer = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
      } else {
        const docxml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"><w:body>${docxContent}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar ${pgMarXml}/></w:sectPr></w:body></w:document>`;

        const zip = new JSZip();
        zip.file(
          "[Content_Types].xml",
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
        );
        zip.file(
          "_rels/.rels",
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
        );
        zip.file("word/document.xml", docxml, { binary: false });
        zip.file(
          "word/_rels/document.xml.rels",
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
        );
        buffer = await zip.generateAsync({
          type: "nodebuffer",
          compression: "DEFLATE",
        });
      }
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${docTitle}.docx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Word template export error:", error);
      res
        .status(500)
        .json({ message: "Erro ao gerar documento Word com template" });
    }
  });

  app.post("/api/import/url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string")
        return res.status(400).json({ message: "URL invalida" });
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ message: "URL mal formada" });
      }
      if (!["http:", "https:"].includes(parsedUrl.protocol))
        return res
          .status(400)
          .json({ message: "Apenas URLs http/https sao permitidas" });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; LegalAssistant/1.0)",
          },
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok)
        return res
          .status(502)
          .json({ message: `Site retornou erro ${response.status}` });
      const contentType = response.headers.get("content-type") || "";
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("text/plain") &&
        !contentType.includes("application/xhtml")
      ) {
        return res
          .status(415)
          .json({
            message: "O link nao aponta para uma pagina de texto legivel",
          });
      }

      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<header[\s\S]*?<\/header>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/[ \t]+/g, " ")
        .split("\n")
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 0)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (text.length < 100)
        return res
          .status(422)
          .json({ message: "Nao foi possivel extrair texto desta pagina" });
      return res.json({
        text: text.substring(0, 80000),
        length: text.length,
        url,
      });
    } catch (err: any) {
      if (err?.name === "AbortError")
        return res
          .status(504)
          .json({ message: "Tempo limite excedido ao acessar o link" });
      return res.status(500).json({ message: "Erro ao buscar o link" });
    }
  });

  app.post(
    "/api/upload/extract-text",
    upload.array("files", 10),
    async (req, res) => {
      try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "Nenhum arquivo enviado" });
        }

        let combinedText = "";

        for (const file of files) {
          const ext = file.originalname.toLowerCase().split(".").pop() || "";
          const mime = file.mimetype || "";
          let extractedText = "";

          try {
            const isPdf = ext === "pdf" || mime === "application/pdf";
            const isDocx =
              ext === "docx" ||
              mime ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            const isHtml =
              ["html", "htm", "xml"].includes(ext) ||
              mime.includes("html") ||
              mime.includes("xml");

            if (isPdf) {
              try {
                const data = await pdfParse(file.buffer);
                extractedText = data.text || "";
              } catch {
                extractedText = "";
              }

              const textLength = extractedText.replace(/\s+/g, "").length;
              const fileSizeKB = file.buffer.length / 1024;
              if (
                textLength < 50 ||
                (fileSizeKB > 100 && textLength < fileSizeKB * 0.5)
              ) {
                const ocrTmpDir = fs.mkdtempSync(path.join("/tmp", "ocr-"));
                try {
                  const pdfPath = path.join(ocrTmpDir, "input.pdf");
                  fs.writeFileSync(pdfPath, file.buffer);
                  await execFileAsync(
                    "pdftoppm",
                    [
                      "-png",
                      "-r",
                      "300",
                      pdfPath,
                      path.join(ocrTmpDir, "page"),
                    ],
                    { timeout: 300000 },
                  );
                  const pageFiles = fs
                    .readdirSync(ocrTmpDir)
                    .filter((f) => f.startsWith("page") && f.endsWith(".png"))
                    .sort();
                  let ocrText = "";
                  for (const pageFile of pageFiles) {
                    const { stdout } = await execFileAsync(
                      "tesseract",
                      [
                        path.join(ocrTmpDir, pageFile),
                        "stdout",
                        "-l",
                        "por+eng",
                      ],
                      { timeout: 60000 },
                    );
                    ocrText += stdout + "\n";
                  }
                  extractedText = ocrText || extractedText;
                } finally {
                  fs.rmSync(ocrTmpDir, { recursive: true, force: true });
                }
              }
            } else if (isDocx) {
              const result = await mammoth.extractRawText({
                buffer: file.buffer,
              });
              extractedText = result.value;
            } else if (isHtml) {
              extractedText = cleanHtml(file.buffer.toString("utf-8"));
            } else {
              extractedText = file.buffer.toString("utf-8");
            }
          } catch (err) {
            console.error(`Erro no arquivo ${file.originalname}:`, err);
          }

          combinedText += (combinedText ? "\n\n---\n\n" : "") + extractedText;
        }

        res.json({ text: combinedText });
      } catch (error) {
        console.error("Erro na extracao:", error);
        res.status(500).json({ message: "Erro ao processar arquivos" });
      }
    },
  );

  app.post(
    "/api/upload/transcribe",
    upload.array("files", 5),
    async (req, res) => {
      try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "Nenhum arquivo enviado" });
        }

        const results: { filename: string; text: string; error?: string }[] =
          [];
        const tmpDir = fs.mkdtempSync(path.join("/tmp", "transcribe-"));

        for (const file of files) {
          const ext = file.originalname.toLowerCase().split(".").pop() || "";
          const mime = file.mimetype || "";
          const isAudio =
            [
              "mp3",
              "wav",
              "m4a",
              "ogg",
              "oga",
              "opus",
              "ptt",
              "flac",
              "aac",
              "wma",
              "webm",
            ].includes(ext) || mime.startsWith("audio/");
          const isVideo =
            [
              "mp4",
              "mov",
              "avi",
              "mkv",
              "wmv",
              "flv",
              "webm",
              "3gp",
              "m4v",
            ].includes(ext) || mime.startsWith("video/");
          const needsConversion = [
            "ogg",
            "oga",
            "opus",
            "ptt",
            "wma",
            "webm",
            "flac",
            "aac",
          ].includes(ext);

          if (!isAudio && !isVideo) {
            results.push({
              filename: file.originalname,
              text: "",
              error:
                "Formato nao suportado. Use audio (MP3, WAV, M4A, OGG, OPUS, PTT) ou video (MP4, MOV, AVI, MKV).",
            });
            continue;
          }

          if (file.size === 0) {
            results.push({
              filename: file.originalname,
              text: "",
              error: "Arquivo vazio.",
            });
            continue;
          }

          const safeExt = ext.replace(/[^a-z0-9]/g, "") || "bin";
          const timestamp = Date.now();
          const inputPath = path.join(tmpDir, `input_${timestamp}.${safeExt}`);
          let audioPath = inputPath;

          try {
            fs.writeFileSync(inputPath, file.buffer);

            if (isVideo || needsConversion) {
              audioPath = path.join(tmpDir, `audio_${timestamp}.mp3`);
              try {
                await execFileAsync(
                  "ffmpeg",
                  [
                    "-i",
                    inputPath,
                    "-vn",
                    "-acodec",
                    "libmp3lame",
                    "-q:a",
                    "4",
                    "-y",
                    audioPath,
                  ],
                  { timeout: 120000 },
                );
              } catch (ffErr) {
                results.push({
                  filename: file.originalname,
                  text: "",
                  error: isVideo
                    ? "Erro ao extrair audio do video. Verifique se o arquivo nao esta corrompido."
                    : "Erro ao converter audio. Verifique se o arquivo nao esta corrompido.",
                });
                continue;
              }
            }

            const audioStream = fs.createReadStream(audioPath);

            const dbKey = (await storage.getSetting("demo_api_key") || "").trim();
            const dbUrl = (await storage.getSetting("demo_api_url") || "").trim();

            let transcription: any;
            if (dbKey && dbUrl && dbUrl.includes("groq")) {
              const groqClient = new OpenAI({ apiKey: dbKey, baseURL: dbUrl });
              transcription = await groqClient.audio.transcriptions.create({
                model: "whisper-large-v3",
                file: fs.createReadStream(audioPath),
                response_format: "json",
                language: "pt",
              });
            } else if (dbKey && dbUrl && (dbUrl.includes("openai.com") || dbUrl.includes("sk-"))) {
              const ownClient = new OpenAI({ apiKey: dbKey, baseURL: dbUrl });
              transcription = await ownClient.audio.transcriptions.create({
                model: "whisper-1",
                file: fs.createReadStream(audioPath),
                response_format: "json",
                language: "pt",
              });
            } else {
              transcription = await openai.audio.transcriptions.create({
                model: "gpt-4o-mini-transcribe",
                file: audioStream,
                response_format: "json",
                language: "pt",
              });
            }

            const text =
              typeof transcription === "string"
                ? transcription
                : (transcription as { text: string }).text || "";

            if (!text.trim()) {
              results.push({
                filename: file.originalname,
                text: "",
                error:
                  "Nao foi possivel transcrever. O audio pode estar sem fala ou muito baixo.",
              });
            } else {
              results.push({ filename: file.originalname, text: text.trim() });
            }
          } finally {
            try {
              fs.unlinkSync(inputPath);
            } catch {}
            if (audioPath !== inputPath) {
              try {
                fs.unlinkSync(audioPath);
              } catch {}
            }
          }
        }

        try {
          fs.rmdirSync(tmpDir);
        } catch {}
        res.json({ results });
      } catch (error) {
        console.error("Transcription error:", error);
        res.status(500).json({ message: "Erro ao transcrever arquivo" });
      }
    },
  );

  app.post("/api/ai/process", async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);
    try {
      const {
        text: rawText,
        action,
        customActionId,
        ementaIds,
        model,
        effortLevel,
        verbosity,
        recentContext,
        perplexityKey,
        customKey,
        customUrl,
        customModel: customModelName,
      } = req.body;
      if (!rawText || (!action && !customActionId)) {
        return res
          .status(400)
          .json({ message: "Texto e ação são obrigatórios" });
      }
      const text = rawText
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const isPerplexity = model === "perplexity";
      const geminiModel =
        model === "economico" ? "gemini-2.5-flash" : "gemini-2.5-pro";
      const effort =
        typeof effortLevel === "number"
          ? Math.min(5, Math.max(1, effortLevel))
          : 3;
      const verb = verbosity === "curta" ? "curta" : "longa";

      let ementasForSystem = "";
      if (ementaIds && Array.isArray(ementaIds) && ementaIds.length > 0) {
        const selectedEmentas = [];
        for (const eid of ementaIds) {
          const em = await storage.getEmenta(eid);
          if (em) selectedEmentas.push(em);
        }
        if (selectedEmentas.length > 0) {
          ementasForSystem =
            "\n\nJURISPRUDÊNCIA DE REFERÊNCIA SELECIONADA PELO ADVOGADO:\nO advogado selecionou as seguintes ementas da sua biblioteca. Use-as como fundamentação.\n\nREGRAS OBRIGATÓRIAS PARA USO DAS EMENTAS:\n1. RESUMO DO CONTEÚDO: NUNCA copie a ementa inteira se ela for longa. Resuma o corpo do texto de forma inteligente para extrair apenas a tese pertinente, conectando ao argumento da peça.\n2. PRESERVAÇÃO DA FONTE (REGRA CRÍTICA E INVIOLÁVEL): A parte final da ementa (Tribunal, Número do Processo, Relator, Data de Julgamento, etc.) DEVE ser reproduzida EXATAMENTE como fornecida, sem nenhuma alteração, paráfrase ou resumo.\n3. Formate a citação da ementa em itálico e justificado.\n\n" +
            selectedEmentas
              .map((e, i) => `EMENTA ${i + 1} [${e.categoria}] - ${e.titulo}:\n${e.texto}`)
              .join("\n\n") +
            "\n\nIMPORTANTE: Lembre-se da regra crítica: resuma inteligentemente a ementa, mas PRESERVE A FONTE OFICIAL intacta. Integre o argumento organicamente.\n";
          console.log(
            `[AI Process] ${selectedEmentas.length} ementa(s) incluída(s) no contexto do sistema`,
          );
        }
      }

      let promptTemplate: string | undefined;

      if (customActionId) {
        const customAction = await storage.getCustomAction(customActionId);
        if (!customAction) {
          return res
            .status(400)
            .json({ message: "Modelo personalizado nao encontrado" });
        }
        promptTemplate = customAction.prompt + "\n\n{{textos}}";
      } else {
        promptTemplate = ACTION_PROMPTS[action];
      }

      if (!promptTemplate) {
        return res.status(400).json({ message: "Ação inválida" });
      }

      const economicoExtra = "";

      const effortLabels: Record<number, string> = {
        1: "ESFORCO: RAPIDO. Direto e objetivo.",
        2: "ESFORCO: BASICO. Pontos principais.",
        3: "ESFORCO: DETALHADO. Analise completa.",
        4: "ESFORCO: PROFUNDO. Fundamentacao robusta, nuances, legislacao.",
        5: "ESFORCO: EXAUSTIVO. Todos os angulos, teses, jurisprudencia.",
      };
      const verbosityInstr =
        verb === "curta"
          ? "TAMANHO: CONCISO. Direto ao ponto."
          : "TAMANHO: COMPLETO. Desenvolva cada argumento.";
      const effortVerbosityInstr = `\n\n${effortLabels[effort] || effortLabels[3]}\n${verbosityInstr}`;

      const maxTokens =
        verb === "curta"
          ? effort <= 2
            ? 32768
            : 65536
          : effort <= 2
            ? 65536
            : 65536;

      // Contexto das conversas recentes para a IA lembrar
      let recentContextStr = "";
      if (Array.isArray(recentContext) && recentContext.length > 0) {
        recentContextStr = "\n\n--- HISTÓRICO COMPLETO DO ADVOGADO (para contexto) ---\nIMPORTANTE: Estas são TODAS as interações do advogado sem exceção. Utilize este histórico completo como base para qualquer nova ação solicitada. Se o advogado pedir análise, resumo ou qualquer ação sobre o conteúdo anterior, você TEM acesso ao texto abaixo.\n\n" +
          recentContext.map((item: any, i: number) => {
            const acaoLabel = item.acao || "consulta";
            return `[${i + 1}] Ação: ${acaoLabel}\nPergunta: ${item.pergunta || ""}\nResposta completa: ${item.resposta || ""}`;
          }).join("\n\n") +
          "\n--- FIM DO HISTÓRICO ---\n" +
          "REGRA: Quando o advogado pedir análise, revisão ou qualquer ação sobre conteúdo anterior, USE o texto do histórico acima como base. NUNCA diga que não tem informação se o histórico contém dados relevantes. Você tem acesso ao historico COMPLETO sem nenhuma truncagem.";
      }

      const systemPromptWithEmentas =
        SYSTEM_PROMPT_BASE +
        economicoExtra +
        effortVerbosityInstr +
        recentContextStr +
        ementasForSystem;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Gemini 2.5 Flash/Pro suportam até 1 milhão de tokens — processar SEMPRE em chamada única
      // Evita cobranças múltiplas desnecessárias por divisão de documentos
      const MAX_DIRECT_CHARS = 800000; // ~200k tokens — limite seguro para chamada única
      const safeText =
        text.length > MAX_DIRECT_CHARS
          ? text.substring(0, MAX_DIRECT_CHARS)
          : text;

      const userPrompt = promptTemplate.replace("{{textos}}", safeText);

      const isCustom = model === "custom";

      if (isCustom) {
        // ── Chave Própria / Demo (qualquer serviço OpenAI-compatível) ─────────
        const personalKey = sanitizeKey((customKey as string) || "");
        const dbDemoKey = (await storage.getSetting("demo_api_key")) || "";
        const publicKey = (process.env.PUBLIC_API_KEY || "").trim() || dbDemoKey;
        const cKey = personalKey || publicKey;
        const usingDemoKey = !personalKey && !!publicKey;
        const dbDemoUrl = (await storage.getSetting("demo_api_url")) || "";
        const dbDemoModel = (await storage.getSetting("demo_api_model")) || "";
        // Se não há chave pessoal, usa SEMPRE a URL e modelo da chave demo (ignora o que o frontend enviou)
        const cUrl = (personalKey
          ? ((customUrl as string) || process.env.PUBLIC_API_URL || "https://api.openai.com/v1")
          : (dbDemoUrl || process.env.PUBLIC_API_URL || "https://api.openai.com/v1")
        ).replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
        const cModel = (personalKey
          ? ((customModelName as string) || process.env.PUBLIC_API_MODEL || "gpt-4o-mini")
          : (dbDemoModel || process.env.PUBLIC_API_MODEL || "gpt-4o-mini")
        ).trim();
        if (!cKey) {
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "Chave Própria não configurada. Acesse Configurações ⚙ e preencha sua chave, ou peça ao administrador para configurar uma Chave Demo no servidor." })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          } else {
            res.status(400).json({ message: "Chave Própria não configurada." });
          }
          return;
        }
        if (usingDemoKey) {
          res.write(`data: ${JSON.stringify({ demoMode: true })}\n\n`);
        }
        console.log(`[Custom] URL: ${cUrl}, Model: ${cModel}, Action: ${action || "custom"}`);
        const cMessages = [
          { role: "system", content: systemPromptWithEmentas },
          { role: "user", content: userPrompt },
        ];
        const isGroqUrl = cUrl.includes("groq.com");
        const isPplxUrl = cUrl.includes("perplexity.ai") || cKey.startsWith("pplx-");
        const isOrUrl = cUrl.includes("openrouter.ai");
        const effectiveMax = isGroqUrl ? Math.min(maxTokens, 32000)
          : isPplxUrl ? Math.min(maxTokens, 8000)
          : isOrUrl ? Math.min(maxTokens, 65536)
          : maxTokens;
        let cRes = await fetch(`${cUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
          body: JSON.stringify({ model: cModel, messages: cMessages, stream: true, max_tokens: effectiveMax, temperature: 0.3 }),
        });
        if (!cRes.ok) {
          const errTxt = await cRes.text().catch(() => "");
          console.error("[Custom] First attempt error:", cRes.status, errTxt.substring(0, 300));
          const isTokenErr = errTxt.includes("max_tokens") || errTxt.includes("context_length") || errTxt.includes("too large") || errTxt.includes("context_window");
          if (isTokenErr) {
            const fallbackMax = isPplxUrl ? 4000 : isGroqUrl ? 16000 : 32000;
            cRes = await fetch(`${cUrl}/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
              body: JSON.stringify({ model: cModel, messages: cMessages, stream: true, max_tokens: fallbackMax, temperature: 0.3 }),
            });
          }
        }
        if (!cRes.ok) {
          const errTxt = await cRes.text().catch(() => "");
          let errDetail = errTxt.substring(0, 300);
          try { errDetail = (JSON.parse(errTxt) as any)?.error?.message ?? errDetail; } catch {}
          const httpCode = cRes.status;
          let userMsg = `Erro da API (${httpCode}): ${errDetail}`;
          if (httpCode === 401) userMsg = "Chave de API inválida ou expirada. Verifique nas Configurações.";
          else if (httpCode === 403) userMsg = "Sem permissão. Verifique se sua conta tem acesso ao modelo.";
          else if (httpCode === 429) userMsg = "Limite de requisições atingido. Aguarde alguns segundos.";
          console.error("[Custom] Final error:", userMsg);
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          } else { res.status(502).json({ message: userMsg }); }
          return;
        }
        const cBody = cRes.body as any;
        if (!cBody) { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); return; }
        const cReader = cBody.getReader ? cBody.getReader() : null;
        if (cReader) {
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done: cDone, value } = await cReader.read();
            if (cDone) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const d = line.slice(6).trim();
              if (d === "[DONE]") break;
              try {
                const json = JSON.parse(d);
                const content = json?.choices?.[0]?.delta?.content;
                if (content) res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
              } catch {}
            }
          }
        }
      } else if (isPerplexity) {
        // ── Perplexity sonar-pro (busca na web) ──────────────────────────────
        let pKey = (perplexityKey || process.env.PERPLEXITY_API_KEY || "").trim();
        if (!pKey) {
          const dbPplxKey = (await storage.getSetting("perplexity_api_key") || "").trim();
          if (dbPplxKey) {
            pKey = dbPplxKey;
          }
        }
        if (!pKey) {
          const dbKey = (await storage.getSetting("demo_api_key") || "").trim();
          const dbUrl = (await storage.getSetting("demo_api_url") || "").trim();
          if (dbKey && dbUrl && dbUrl.includes("perplexity")) {
            pKey = dbKey;
          }
        }
        if (!pKey) {
          if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ error: "Chave Perplexity não configurada. Acesse Configurações e cole sua chave de perplexity.ai/settings/api" })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
          } else {
            res.status(400).json({ message: "Chave Perplexity não configurada." });
          }
          return;
        }
        console.log(`[Perplexity] Action: ${action || "custom"}, Text: ${text.length} chars`);
        const pMessages = [
          { role: "system", content: systemPromptWithEmentas },
          { role: "user", content: userPrompt },
        ];
        const pRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${pKey}`,
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: pMessages,
            stream: true,
            max_tokens: Math.min(maxTokens, 8000),
            temperature: 0.2,
          }),
        });
        if (!pRes.ok) {
          const errText = await pRes.text().catch(() => "");
          console.error("[Perplexity] error:", pRes.status, errText);
          const errMsg = pRes.status === 401
            ? "Chave Perplexity inválida. Verifique nas Configurações."
            : pRes.status === 404
              ? "Modelo Perplexity não encontrado. Verifique se sua chave tem acesso ao plano correto."
              : pRes.status === 429
                ? "Limite de uso Perplexity atingido. Aguarde e tente novamente."
                : `Erro Perplexity (${pRes.status}): ${errText.substring(0, 200)}`;
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        // Parse SSE stream from Perplexity (OpenAI-compatible format)
        const reader = pRes.body as any;
        if (!reader) { res.end(); return; }
        let buffer = "";
        let pplxCitations: string[] = [];
        for await (const chunk of reader) {
          buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            const data = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
            try {
              const json = JSON.parse(data);
              const content = json?.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
              }
              if (json?.citations && Array.isArray(json.citations) && json.citations.length > 0) {
                pplxCitations = json.citations;
              }
            } catch {}
          }
        }
        if (pplxCitations.length > 0) {
          res.write(`data: ${JSON.stringify({ citations: pplxCitations })}\n\n`);
        }
      } else {
        // ── Gemini (usa chave própria/demo se disponível para evitar cobrança Replit) ──
        const dbKey = (await storage.getSetting("demo_api_key")) || "";
        const dbUrl = (await storage.getSetting("demo_api_url")) || "";
        const dbModel = (await storage.getSetting("demo_api_model")) || "";
        const cleanKey = (k: string) => { const t = k.trim(); const eqIdx = t.indexOf("="); if (eqIdx > 0 && eqIdx < 30 && /^[A-Z_]+$/.test(t.substring(0, eqIdx))) return t.substring(eqIdx + 1).trim(); return t; };
        const rawOwnKey = cleanKey(((customKey as string) || "").trim() || (process.env.PUBLIC_API_KEY || "").trim() || cleanKey(dbKey));
        const ownKey = rawOwnKey.length > 10 ? rawOwnKey : "";
        const detected = ownKey ? autoDetectProvider(ownKey) : null;
        const ownUrl = ((customUrl as string) || "").trim() || (process.env.PUBLIC_API_URL || "").trim() || dbUrl || (detected?.url || "");
        const ownModel = ((customModelName as string) || "").trim() || (process.env.PUBLIC_API_MODEL || "").trim() || dbModel || (detected?.model || "");
        if (ownKey) {
          console.log(`[AI Process] Using own key → URL: ${ownUrl || "Gemini direct"}, Model: ${ownUrl ? ownModel : geminiModel}, Action: ${action || "custom"}${detected ? " (auto-detected)" : ""}`);
          await geminiStream(
            res,
            systemPromptWithEmentas,
            userPrompt,
            geminiModel,
            maxTokens,
            ownKey,
            ownUrl || undefined,
            ownModel || undefined,
          );
        } else {
          console.log(
            `[AI Process] Model: ${geminiModel}, Action: ${action || "custom"}, Text: ${text.length} chars, MaxTokens: ${maxTokens}`,
          );
          await geminiStream(
            res,
            systemPromptWithEmentas,
            userPrompt,
            geminiModel,
            maxTokens,
          );
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

      const _usedModel = isPerplexity ? "sonar-pro" : geminiModel;
      const _usedProvider = isPerplexity ? "Perplexity" : "Gemini/Replit";
      const estInputTokens = Math.ceil(text.length / 4);
      const estOutputTokens = Math.ceil(maxTokens * 0.3);
      const costPerMToken: Record<string, number> = {
        "gemini-2.5-flash": 0.15, "gemini-2.5-pro": 1.25, "sonar-pro": 3.0,
        "llama-3.3-70b-versatile": 0.59, "gpt-4o-mini": 0.15, "gpt-4o": 2.50,
      };
      const rate = costPerMToken[_usedModel] || 0.50;
      const estCost = ((estInputTokens + estOutputTokens) / 1_000_000) * rate;
      try {
        await storage.createAiHistory({
          action: action || "custom",
          inputPreview: text.substring(0, 100),
          result: `[${_usedProvider}/${_usedModel}]`,
          model: _usedModel,
          provider: _usedProvider,
          inputTokens: estInputTokens,
          outputTokens: estOutputTokens,
          estimatedCost: Math.round(estCost * 10000) / 10000,
        });
      } catch (e: any) { console.warn("[Usage log]", e?.message); }
    } catch (error: any) {
      console.error("AI processing error:", error?.message || error);
      const errorMsg =
        error?.status === 429
          ? "Limite de uso atingido. Aguarde alguns segundos e tente novamente."
          : error?.status === 503 || error?.status === 502
            ? "Servidor de IA temporariamente indisponível. Tente novamente em instantes."
            : error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT"
              ? "Conexão com a IA foi interrompida. Tente novamente."
              : `Erro ao processar: ${error?.message || "erro desconhecido"}`;
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: errorMsg });
      }
    }
  });

  app.post("/api/ai/refine", async (req, res) => {
    req.setTimeout(0);
    res.setTimeout(0);
    try {
      const {
        previousResult,
        instruction,
        originalText,
        model,
        ementaIds,
        chatHistory,
        effortLevel,
        verbosity,
        perplexityKey,
        customKey: refineCustomKey,
        customUrl: refineCustomUrl,
        customModel: refineCustomModelName,
      } = req.body;
      const isPerplexityRefine = model === "perplexity";
      const isCustomRefine = model === "custom";
      if (!instruction) {
        return res
          .status(400)
          .json({ message: "Instrução é obrigatória" });
      }
      const hasChatContext = Array.isArray(chatHistory) && chatHistory.length > 0;
      if (!previousResult && !hasChatContext && !originalText) {
        return res
          .status(400)
          .json({ message: "Nenhum contexto disponível para refinamento" });
      }

      const geminiModel =
        model === "economico" ? "gemini-2.5-flash" : "gemini-2.5-pro";
      const effort =
        typeof effortLevel === "number"
          ? Math.min(5, Math.max(1, effortLevel))
          : 3;
      const verb = verbosity === "curta" ? "curta" : "longa";

      let ementasForRefine = "";
      if (ementaIds && Array.isArray(ementaIds) && ementaIds.length > 0) {
        const selectedEmentas = [];
        for (const eid of ementaIds) {
          const em = await storage.getEmenta(eid);
          if (em) selectedEmentas.push(em);
        }
        if (selectedEmentas.length > 0) {
          ementasForRefine =
            "\n\nJURISPRUDÊNCIA DE REFERÊNCIA SELECIONADA PELO ADVOGADO:\nO advogado selecionou as seguintes ementas da sua biblioteca. Use-as como fundamentação.\n\nREGRAS OBRIGATÓRIAS PARA USO DAS EMENTAS:\n1. RESUMO DO CONTEÚDO: NUNCA copie a ementa inteira se ela for longa. Resuma o corpo do texto de forma inteligente para extrair apenas a tese pertinente, conectando ao argumento da peça.\n2. PRESERVAÇÃO DA FONTE (REGRA CRÍTICA E INVIOLÁVEL): A parte final da ementa (Tribunal, Número do Processo, Relator, Data de Julgamento, etc.) DEVE ser reproduzida EXATAMENTE como fornecida, sem nenhuma alteração, paráfrase ou resumo.\n3. Formate a citação da ementa em itálico e justificado.\n\n" +
            selectedEmentas
              .map((e, i) => `EMENTA ${i + 1} [${e.categoria}] - ${e.titulo}:\n${e.texto}`)
              .join("\n\n") +
            "\n\nIMPORTANTE: Lembre-se da regra crítica: resuma inteligentemente a ementa, mas PRESERVE A FONTE OFICIAL intacta. Integre o argumento organicamente.\n";
          console.log(
            `[AI Refine] ${selectedEmentas.length} ementa(s) incluída(s) no contexto do sistema`,
          );
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const historyTurnCount = Array.isArray(chatHistory)
        ? chatHistory.length
        : 0;
      console.log(
        `[AI Refine] Model: ${geminiModel}, Instruction: "${instruction.substring(0, 100)}", Ementas: ${ementasForRefine.length > 0 ? "YES" : "NO"}, Chat turns: ${historyTurnCount}`,
      );

      const refineSystemPrompt = `Voce e uma assistente juridica especializada. Seu UNICO papel e construir e ajustar documentos juridicos brasileiros.

REGRA ABSOLUTA: Se a mensagem do advogado NAO for uma instrucao juridica clara (ex: reclamacao, desabafo, frustracao, mensagem generica), IGNORE o conteudo emocional e retorne o documento atual SEM alteracoes. Nunca comente sobre frustracao, custo, dinheiro ou emocoes. Apenas documente.

${originalText ? `TEXTO BASE:\n---\n${originalText.substring(0, 15000)}\n---\n` : ""}${ementasForRefine}

MODOS DE OPERACAO (use apenas quando a instrucao for juridicamente clara):
1. CONSTRUCAO ("faz minuta/peticao/recurso"): Documento INTEIRO com MINIMO 15 PAGINAS e todas as secoes. Cite legislacao extensamente. Dado ausente: [CAMPO A PREENCHER].
2. EXPANSAO ("expande/mais detalhes/mais argumentos"): Expanda com mais argumentacao juridica. O resultado deve ter no minimo 15 paginas.
3. AJUSTE ("muda/corrige/altera X"): Documento COMPLETO com a alteracao especifica. Nao encurte. Mantenha o tamanho minimo de 15 paginas.
4. PERGUNTA juridica ("o que acha?/qual fundamento?"): Responda diretamente, sem repetir o documento.

REGRAS FIXAS: Mantenha dados pessoais exatos. Texto puro sem markdown. Use historico da conversa. Nao invente fatos. Se instrucao for vaga ou emocional, retorne o documento atual integralmente.

FORMATACAO OBRIGATORIA: Use paragrafos CURTOS, com no maximo 4 a 5 linhas cada. Sempre pule uma linha em branco entre cada paragrafo. Nao crie blocos de texto longos ou embolados. NAO use asteriscos (*), hashtags (#) ou qualquer sintaxe markdown. Para titulos use CAIXA ALTA. Cada paragrafo em uma unica linha continua, sem quebras no meio da frase.`;

      const refineEffortLabels: Record<number, string> = {
        1: "ESFORCO: RAPIDO.",
        2: "ESFORCO: BASICO.",
        3: "ESFORCO: DETALHADO.",
        4: "ESFORCO: PROFUNDO.",
        5: "ESFORCO: EXAUSTIVO.",
      };
      const refineVerbInstr = verb === "curta" ? "Conciso." : "Completo.";
      const refineEffortBlock = `\n\n${refineEffortLabels[effort] || refineEffortLabels[3]}\n${refineVerbInstr}`;
      const refineMaxTokens =
        verb === "curta"
          ? effort <= 2
            ? 32768
            : 65536
          : effort <= 2
            ? 65536
            : 65536;
      const fullRefinePrompt = refineSystemPrompt + refineEffortBlock;

      const geminiMessages: Array<{
        role: "user" | "model";
        parts: [{ text: string }];
      }> = [];

      const geminiChatHistory = truncateChatHistory(chatHistory as Array<{ role: string; content: string }>, 1_500_000);
      if (Array.isArray(geminiChatHistory) && geminiChatHistory.length > 0) {
        let systemInjected = false;
        for (const msg of geminiChatHistory) {
          if (msg.role === "assistant" || msg.role === "user") {
            const trimmedContent = msg.content;
            const geminiRole = msg.role === "assistant" ? "model" : "user";
            if (!systemInjected && geminiRole === "user") {
              geminiMessages.push({
                role: "user",
                parts: [{ text: `${fullRefinePrompt}\n\n${trimmedContent}` }],
              });
              systemInjected = true;
            } else {
              geminiMessages.push({
                role: geminiRole,
                parts: [{ text: trimmedContent }],
              });
            }
          }
        }
        if (!systemInjected) {
          geminiMessages.push({
            role: "user",
            parts: [{ text: `${fullRefinePrompt}\n\n${instruction}` }],
          });
        }
      } else {
        const docRef = previousResult || originalText || "";
        geminiMessages.push({
          role: "user",
          parts: [
            {
              text: `${fullRefinePrompt}\n\nDOCUMENTO ATUAL:\n${docRef}`,
            },
          ],
        });
        if (docRef.trim()) {
          geminiMessages.push({
            role: "model",
            parts: [{ text: docRef }],
          });
        }
        geminiMessages.push({ role: "user", parts: [{ text: instruction }] });
      }

      console.log(
        `[AI Refine] Model: ${isCustomRefine ? "custom" : isPerplexityRefine ? "perplexity" : geminiModel}, Effort: ${effort}, Verbosity: ${verb}, MaxTokens: ${refineMaxTokens}`,
      );

      if (isCustomRefine) {
        // ── Chave Própria / Demo (qualquer serviço OpenAI-compatível) ────────
        const personalKeyR = sanitizeKey((refineCustomKey as string) || "");
        const dbDemoKeyR = (await storage.getSetting("demo_api_key")) || "";
        const publicKeyR = (process.env.PUBLIC_API_KEY || "").trim() || dbDemoKeyR;
        const cKey = personalKeyR || publicKeyR;
        const usingDemoKeyR = !personalKeyR && !!publicKeyR;
        const dbDemoUrlR = (await storage.getSetting("demo_api_url")) || "";
        const dbDemoModelR = (await storage.getSetting("demo_api_model")) || "";
        // Se não há chave pessoal, usa SEMPRE a URL e modelo da chave demo
        const cUrl = (personalKeyR
          ? ((refineCustomUrl as string) || process.env.PUBLIC_API_URL || "https://api.openai.com/v1")
          : (dbDemoUrlR || process.env.PUBLIC_API_URL || "https://api.openai.com/v1")
        ).replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
        const cModel = (personalKeyR
          ? ((refineCustomModelName as string) || process.env.PUBLIC_API_MODEL || "gpt-4o-mini")
          : (dbDemoModelR || process.env.PUBLIC_API_MODEL || "gpt-4o-mini")
        ).trim();
        if (!cKey) {
          res.write(`data: ${JSON.stringify({ error: "Chave Própria não configurada. Acesse Configurações ⚙ e preencha sua chave, ou configure a Chave Demo no servidor." })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        if (usingDemoKeyR) {
          res.write(`data: ${JSON.stringify({ demoMode: true })}\n\n`);
        }
        const cMsgs: Array<{ role: string; content: string }> = [
          { role: "system", content: fullRefinePrompt },
        ];
        const customChatHistory = truncateChatHistory(chatHistory as Array<{ role: string; content: string }>, 500_000);
        if (Array.isArray(customChatHistory) && customChatHistory.length > 0) {
          for (const msg of (customChatHistory as any[])) {
            const role = msg.role === "assistant" ? "assistant" : "user";
            const c = (msg.content || "").trim();
            if (c) cMsgs.push({ role, content: c });
          }
        } else {
          const docRefC = previousResult || originalText || "";
          cMsgs.push({ role: "user", content: `DOCUMENTO ATUAL:\n${docRefC}` });
          if (docRefC.trim()) cMsgs.push({ role: "assistant", content: docRefC });
          cMsgs.push({ role: "user", content: instruction });
        }
        const isGroqR = cUrl.includes("groq.com");
        const isPplxR = cUrl.includes("perplexity.ai") || cKey.startsWith("pplx-");
        const isOrR = cUrl.includes("openrouter.ai");
        const effectiveRefineMax = isGroqR ? Math.min(refineMaxTokens, 32000)
          : isPplxR ? Math.min(refineMaxTokens, 8000)
          : isOrR ? Math.min(refineMaxTokens, 65536)
          : refineMaxTokens;
        let cRes2 = await fetch(`${cUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
          body: JSON.stringify({ model: cModel, messages: cMsgs, stream: true, max_tokens: effectiveRefineMax, temperature: 0.3 }),
        });
        if (!cRes2.ok) {
          const errTxt2 = await cRes2.text().catch(() => "");
          console.error("[Refine Custom] First attempt error:", cRes2.status, errTxt2.substring(0, 300));
          const isTokenErr2 = errTxt2.includes("max_tokens") || errTxt2.includes("context_length") || errTxt2.includes("too large") || errTxt2.includes("context_window");
          if (isTokenErr2) {
            const fallbackMax2 = isPplxR ? 4000 : isGroqR ? 16000 : 32000;
            cRes2 = await fetch(`${cUrl}/chat/completions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
              body: JSON.stringify({ model: cModel, messages: cMsgs, stream: true, max_tokens: fallbackMax2, temperature: 0.3 }),
            });
          }
        }
        if (!cRes2.ok) {
          const errTxt2 = await cRes2.text().catch(() => "");
          let errDetail2 = errTxt2.substring(0, 300);
          try { errDetail2 = (JSON.parse(errTxt2) as any)?.error?.message ?? errDetail2; } catch {}
          const code2 = cRes2.status;
          let msg2 = `Erro da API (${code2}): ${errDetail2}`;
          if (code2 === 401) msg2 = "Chave de API inválida ou expirada. Verifique nas Configurações.";
          else if (code2 === 403) msg2 = "Sem permissão. Verifique se sua conta tem acesso ao modelo.";
          else if (code2 === 429) msg2 = "Limite de requisições atingido. Aguarde alguns segundos.";
          res.write(`data: ${JSON.stringify({ error: msg2 })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        const cBody2 = cRes2.body as any;
        if (cBody2) {
          const cReader2 = cBody2.getReader ? cBody2.getReader() : null;
          if (cReader2) {
            const dec2 = new TextDecoder();
            let buf2 = "";
            while (true) {
              const { done: cDone2, value } = await cReader2.read();
              if (cDone2) break;
              buf2 += dec2.decode(value, { stream: true });
              const lines2 = buf2.split("\n");
              buf2 = lines2.pop() || "";
              for (const line2 of lines2) {
                if (!line2.startsWith("data: ")) continue;
                const d2 = line2.slice(6).trim();
                if (d2 === "[DONE]") break;
                try {
                  const json2 = JSON.parse(d2);
                  const content2 = json2?.choices?.[0]?.delta?.content;
                  if (content2) res.write(`data: ${JSON.stringify({ text: content2 })}\n\n`);
                } catch {}
              }
            }
          }
        }
      } else if (isPerplexityRefine) {
        let pKey = ((perplexityKey as string) || process.env.PERPLEXITY_API_KEY || "").trim();
        if (!pKey) {
          const dbPplxKeyR = (await storage.getSetting("perplexity_api_key") || "").trim();
          if (dbPplxKeyR) pKey = dbPplxKeyR;
        }
        if (!pKey) {
          const dbKey = (await storage.getSetting("demo_api_key") || "").trim();
          const dbUrl = (await storage.getSetting("demo_api_url") || "").trim();
          if (dbKey && dbUrl && dbUrl.includes("perplexity")) {
            pKey = dbKey;
          }
        }
        if (!pKey) {
          res.write(`data: ${JSON.stringify({ error: "Chave Perplexity não configurada. Acesse Configurações." })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        // Build OpenAI-compatible messages from chatHistory
        const pMessages: Array<{ role: string; content: string }> = [
          { role: "system", content: fullRefinePrompt },
        ];
        const pplxChatHistory = truncateChatHistory(chatHistory as Array<{ role: string; content: string }>, 400_000);
        if (Array.isArray(pplxChatHistory) && pplxChatHistory.length > 0) {
          for (const msg of pplxChatHistory) {
            const role = msg.role === "assistant" ? "assistant" : "user";
            const c = (msg.content || "").trim();
            if (c) pMessages.push({ role, content: c });
          }
        } else {
          const docRefP = previousResult || originalText || "";
          pMessages.push({ role: "user", content: `DOCUMENTO ATUAL:\n${docRefP}` });
          if (docRefP.trim()) pMessages.push({ role: "assistant", content: docRefP });
          pMessages.push({ role: "user", content: instruction });
        }
        const pRes = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${pKey}` },
          body: JSON.stringify({ model: "sonar-pro", messages: pMessages, stream: true, max_tokens: Math.min(refineMaxTokens, 8000), temperature: 0.2 }),
        });
        if (!pRes.ok) {
          const errText2 = await pRes.text().catch(() => "");
          console.error("[Perplexity Refine] error:", pRes.status, errText2.substring(0, 300));
          const errMsg = pRes.status === 401 ? "Chave Perplexity inválida." : `Erro Perplexity (${pRes.status}): ${errText2.substring(0, 200)}`;
          res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        }
        let buf2 = "";
        let pplxCitations2: string[] = [];
        for await (const chunk of pRes.body as any) {
          buf2 += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
          const lines = buf2.split("\n");
          buf2 = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "data: [DONE]") continue;
            const d = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
            try {
              const j = JSON.parse(d);
              const c = j?.choices?.[0]?.delta?.content;
              if (c) res.write(`data: ${JSON.stringify({ text: c })}\n\n`);
              if (j?.citations && Array.isArray(j.citations) && j.citations.length > 0) {
                pplxCitations2 = j.citations;
              }
            } catch {}
          }
        }
        if (pplxCitations2.length > 0) {
          res.write(`data: ${JSON.stringify({ citations: pplxCitations2 })}\n\n`);
        }
      } else {
        const dbKeyR = (await storage.getSetting("demo_api_key")) || "";
        const dbUrlR = (await storage.getSetting("demo_api_url")) || "";
        const dbModelR = (await storage.getSetting("demo_api_model")) || "";
        const cleanKeyR = (k: string) => { const t = k.trim(); const eqIdx = t.indexOf("="); if (eqIdx > 0 && eqIdx < 30 && /^[A-Z_]+$/.test(t.substring(0, eqIdx))) return t.substring(eqIdx + 1).trim(); return t; };
        const rawOwnKeyR = cleanKeyR(((refineCustomKey as string) || "").trim() || (process.env.PUBLIC_API_KEY || "").trim() || cleanKeyR(dbKeyR));
        const ownKeyR = rawOwnKeyR.length > 10 ? rawOwnKeyR : "";
        const detectedR = ownKeyR ? autoDetectProvider(ownKeyR) : null;
        const ownUrlR = ((refineCustomUrl as string) || "").trim() || (process.env.PUBLIC_API_URL || "").trim() || dbUrlR || (detectedR?.url || "");
        const ownModelR = ((refineCustomModelName as string) || "").trim() || (process.env.PUBLIC_API_MODEL || "").trim() || dbModelR || (detectedR?.model || "");
        if (ownKeyR) {
          console.log(`[AI Refine] Using own key → URL: ${ownUrlR || "Gemini direct"}, Model: ${ownUrlR ? ownModelR : geminiModel}${detectedR ? " (auto-detected)" : ""}`);
          await geminiStreamMessages(
            res,
            geminiMessages,
            geminiModel,
            refineMaxTokens,
            ownKeyR,
            ownUrlR || undefined,
            ownModelR || undefined,
          );
        } else {
          await geminiStreamMessages(
            res,
            geminiMessages,
            geminiModel,
            refineMaxTokens,
          );
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error: any) {
      console.error("AI refine error:", error?.message || error);
      const errorMsg =
        error?.status === 429
          ? "Limite de uso atingido. Aguarde alguns segundos e tente novamente."
          : error?.status === 503 || error?.status === 502
            ? "Servidor de IA temporariamente indisponível. Tente novamente em instantes."
            : error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT"
              ? "Conexão com a IA foi interrompida. Tente novamente."
              : `Erro ao processar: ${error?.message || "erro desconhecido"}`;
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: errorMsg });
      }
    }
  });

  function parseInlineRuns(line: string, defaultBold = false): TextRun[] {
    const runs: TextRun[] = [];
    const regex = /\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*(.+?)\*/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        runs.push(
          new TextRun({
            text: line.slice(lastIndex, match.index),
            size: 24,
            font: "Times New Roman",
            bold: defaultBold,
          }),
        );
      }
      const boldText = match[1] || match[2];
      const italicText = match[3] || match[4];
      if (boldText) {
        runs.push(
          new TextRun({
            text: boldText,
            bold: true,
            size: 24,
            font: "Times New Roman",
          }),
        );
      } else if (italicText) {
        runs.push(
          new TextRun({
            text: italicText,
            italics: true,
            size: 24,
            font: "Times New Roman",
            bold: defaultBold,
          }),
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      runs.push(
        new TextRun({
          text: line.slice(lastIndex),
          size: 24,
          font: "Times New Roman",
          bold: defaultBold,
        }),
      );
    }
    if (runs.length === 0) {
      runs.push(
        new TextRun({
          text: line,
          size: 24,
          font: "Times New Roman",
          bold: defaultBold,
        }),
      );
    }
    return runs;
  }

  app.post("/api/export/word", async (req, res) => {
    try {
      const { text, title } = req.body;
      if (!text) {
        return res.status(400).json({ message: "Texto é obrigatório" });
      }

      const paragraphs = text.split(/\n\n+/).filter((p: string) => p.trim());
      const docChildren: Paragraph[] = [];

      if (title) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 28,
                font: "Times New Roman",
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
        );
      }

      for (const para of paragraphs) {
        const lines = para.split("\n");

        for (const rawLine of lines) {
          const trimmed = rawLine.trim();
          if (!trimmed) continue;

          const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const headingText = headingMatch[2].replace(/\*\*/g, "");
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: headingText,
                    bold: true,
                    size: level <= 2 ? 28 : 24,
                    font: "Times New Roman",
                    allCaps: level <= 2,
                  }),
                ],
                spacing: { before: 360, after: 200 },
                alignment:
                  level <= 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
              }),
            );
            continue;
          }

          const isAllCaps =
            trimmed === trimmed.toUpperCase() &&
            trimmed.length < 120 &&
            trimmed.length > 3 &&
            !/^\d/.test(trimmed) &&
            !trimmed.includes("http");
          if (isAllCaps) {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: trimmed.replace(/\*\*/g, ""),
                    bold: true,
                    size: 24,
                    font: "Times New Roman",
                  }),
                ],
                spacing: { before: 360, after: 200 },
                alignment: AlignmentType.JUSTIFIED,
              }),
            );
            continue;
          }

          const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
          if (bulletMatch) {
            docChildren.push(
              new Paragraph({
                children: parseInlineRuns(bulletMatch[1]),
                spacing: { after: 80 },
                indent: { left: 720, hanging: 360 },
                bullet: { level: 0 },
              }),
            );
            continue;
          }

          const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
          if (numberedMatch) {
            const numRuns = parseInlineRuns(numberedMatch[2]);
            numRuns.unshift(
              new TextRun({
                text: numberedMatch[1] + ". ",
                bold: true,
                size: 24,
                font: "Times New Roman",
              }),
            );
            docChildren.push(
              new Paragraph({
                children: numRuns,
                spacing: { after: 120 },
                indent: { left: 720, hanging: 360 },
              }),
            );
            continue;
          }

          const letterMatch = trimmed.match(/^([a-z])[.)]\s+(.+)$/);
          if (letterMatch) {
            const letRuns = parseInlineRuns(letterMatch[2]);
            letRuns.unshift(
              new TextRun({
                text: letterMatch[1] + ") ",
                bold: true,
                size: 24,
                font: "Times New Roman",
              }),
            );
            docChildren.push(
              new Paragraph({
                children: letRuns,
                spacing: { after: 120 },
                indent: { left: 1080, hanging: 360 },
              }),
            );
            continue;
          }

          docChildren.push(
            new Paragraph({
              children: parseInlineRuns(trimmed),
              spacing: { after: 200, line: 360 },
              alignment: AlignmentType.JUSTIFIED,
              indent: { firstLine: 2268 },
            }),
          );
        }

        docChildren.push(
          new Paragraph({
            children: [],
            spacing: { after: 120 },
          }),
        );
      }

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1701,
                  right: 1134,
                  bottom: 1134,
                  left: 1701,
                },
              },
            },
            children: docChildren,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(title || "documento").replace(/[^a-zA-Z0-9\s-]/g, "")}.docx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Word export error:", error);
      res.status(500).json({ message: "Erro ao exportar Word" });
    }
  });

  app.post("/api/jwt/generate", async (req, res) => {
    const pemKey = process.env.PDPJ_PEM_PRIVATE_KEY;
    try {
      if (!pemKey) {
        return res.status(400).json({
          message:
            "Chave PEM nao configurada. Adicione a chave privada PEM nas configuracoes de segredo com o nome PDPJ_PEM_PRIVATE_KEY.",
        });
      }

      const { cpf, tribunal, expiresInMinutes, nome, modo } = req.body;

      if (
        !cpf ||
        typeof cpf !== "string" ||
        cpf.replace(/\D/g, "").length !== 11
      ) {
        return res
          .status(400)
          .json({ message: "CPF invalido. Deve ter 11 digitos." });
      }

      const cleanCpf = cpf.replace(/\D/g, "");
      const expMinutes = Math.min(
        Math.max(parseInt(expiresInMinutes) || 5, 1),
        60,
      );
      const validTribunals = [
        "TJMG",
        "TJSP",
        "TJRJ",
        "TJRS",
        "TJPR",
        "TJSC",
        "TJBA",
        "TJPE",
        "TJCE",
        "TJGO",
        "TJDF",
        "TRT2",
        "TRT3",
        "TRF1",
        "TRF3",
        "CNJ",
      ];
      const selectedTribunal = validTribunals.includes(tribunal)
        ? tribunal
        : "TJMG";
      const isPjud = modo === "pjud";

      const now = Math.floor(Date.now() / 1000);
      const payload: Record<string, any> = {
        sub: cleanCpf,
        iss: isPjud ? "https://seu-issuer.example" : "pdpj-br",
        aud: isPjud ? "pjud" : "https://gateway.stg.cloud.pje.jus.br",
        iat: now,
        exp: now + expMinutes * 60,
        jti: `${isPjud ? "pjud" : "pdpj"}-${Date.now()}`,
        tribunal: selectedTribunal,
        scope: "pdpj.read pdpj.write",
      };
      if (nome && typeof nome === "string" && nome.trim()) {
        payload.name = nome.trim();
      }

      let formattedKey = pemKey;
      if (formattedKey.includes("\\n")) {
        formattedKey = formattedKey.replace(/\\n/g, "\n");
      }

      if (
        formattedKey.includes("Bag Attributes") ||
        formattedKey.includes("friendlyName")
      ) {
        const keyTypes = ["RSA PRIVATE KEY", "PRIVATE KEY", "EC PRIVATE KEY"];
        for (const keyType of keyTypes) {
          const beginMarker = `-----BEGIN ${keyType}-----`;
          const endMarker = `-----END ${keyType}-----`;
          const beginIdx = formattedKey.indexOf(beginMarker);
          const endIdx = formattedKey.indexOf(endMarker);
          if (beginIdx !== -1 && endIdx !== -1) {
            formattedKey = formattedKey.substring(
              beginIdx,
              endIdx + endMarker.length,
            );
            break;
          }
        }
      }

      if (!formattedKey.includes("\n") && formattedKey.includes("-----")) {
        const beginMatch = formattedKey.match(/-----BEGIN [^-]+-----/);
        const endMatch = formattedKey.match(/-----END [^-]+-----/);
        if (beginMatch && endMatch) {
          const header = beginMatch[0];
          const footer = endMatch[0];
          const body = formattedKey
            .replace(header, "")
            .replace(footer, "")
            .replace(/\s+/g, "");
          formattedKey = `${header}\n${body.replace(/(.{64})/g, "$1\n").trim()}\n${footer}`;
        }
      }
      if (!formattedKey.startsWith("-----BEGIN")) {
        formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey
          .replace(/\s+/g, "")
          .replace(/(.{64})/g, "$1\n")
          .trim()}\n-----END PRIVATE KEY-----`;
      }
      formattedKey = formattedKey.trim();

      const token = jwt.sign(payload, formattedKey, { algorithm: "RS256" });

      const expiresAt = new Date((now + expMinutes * 60) * 1000).toLocaleString(
        "pt-BR",
        { timeZone: "America/Sao_Paulo" },
      );

      res.json({
        token,
        tokenType: "Bearer",
        expiresIn: expMinutes * 60,
        expiresAt,
        payload,
        header: `Authorization: Bearer ${token}`,
      });
    } catch (error: any) {
      console.error("JWT generation error:", error);
      if (
        pemKey &&
        (error.message?.includes("PEM") ||
          error.message?.includes("key") ||
          error.message?.includes("asymmetric"))
      ) {
        const pemStart = pemKey.substring(0, 30);
        const hasBegin = pemKey.includes("-----BEGIN");
        const hasEnd = pemKey.includes("-----END");
        const hasNewlines = pemKey.includes("\n");
        return res.status(400).json({
          message:
            "Erro na chave PEM. A chave privada pode estar em formato incorreto.",
          diagnostico: {
            temBeginMarker: hasBegin,
            temEndMarker: hasEnd,
            temQuebrasDeLinha: hasNewlines,
            inicio: pemStart + "...",
            dica: !hasBegin
              ? "A chave deve comecar com -----BEGIN PRIVATE KEY----- ou -----BEGIN RSA PRIVATE KEY-----"
              : !hasEnd
                ? "A chave deve terminar com -----END PRIVATE KEY----- ou -----END RSA PRIVATE KEY-----"
                : "Tente colar a chave PEM completa novamente nos segredos do projeto, mantendo as quebras de linha.",
          },
        });
      }
      res
        .status(500)
        .json({
          message:
            "Erro ao gerar token JWT: " +
            (error.message || "erro desconhecido"),
        });
    }
  });



  app.get("/api/jwt/status", async (_req, res) => {
    const hasPem = !!process.env.PDPJ_PEM_PRIVATE_KEY;
    res.json({ configured: hasPem });
  });

  app.get("/api/processos", requireAuth, async (_req, res) => {
    try {
      const processos = await storage.getProcessosMonitorados();
      res.json(processos);
    } catch (error: any) {
      res
        .status(500)
        .json({ message: "Erro ao listar processos: " + error.message });
    }
  });

  app.get("/api/processos/:id", requireAuth, async (req, res) => {
    try {
      const processo = await storage.getProcessoMonitorado(req.params.id);
      if (!processo)
        return res.status(404).json({ message: "Processo nao encontrado" });
      res.json(processo);
    } catch (error: any) {
      res.status(500).json({ message: "Erro: " + error.message });
    }
  });

  app.post("/api/processos", requireAuth, async (req, res) => {
    try {
      const {
        numero,
        tribunal,
        apelido,
        classe,
        orgaoJulgador,
        dataAjuizamento,
        ultimaMovimentacao,
        ultimaMovimentacaoData,
        assuntos,
      } = req.body;
      if (
        !numero ||
        typeof numero !== "string" ||
        !tribunal ||
        typeof tribunal !== "string"
      ) {
        return res
          .status(400)
          .json({ message: "Numero e tribunal sao obrigatorios" });
      }
      const validated = {
        numero: String(numero).trim(),
        tribunal: String(tribunal).trim(),
        apelido: String(apelido || "").trim(),
        classe: String(classe || "").trim(),
        orgaoJulgador: String(orgaoJulgador || "").trim(),
        dataAjuizamento: String(dataAjuizamento || "").trim(),
        ultimaMovimentacao: String(ultimaMovimentacao || "").trim(),
        ultimaMovimentacaoData: String(ultimaMovimentacaoData || "").trim(),
        assuntos: String(assuntos || "").trim(),
        status: "ativo" as const,
      };
      const processo = await storage.createProcessoMonitorado(validated);
      res.json(processo);
    } catch (error: any) {
      res
        .status(500)
        .json({ message: "Erro ao salvar processo: " + error.message });
    }
  });

  app.patch("/api/processos/:id", requireAuth, async (req, res) => {
    try {
      const allowedFields = [
        "apelido",
        "status",
        "classe",
        "orgaoJulgador",
        "dataAjuizamento",
        "ultimaMovimentacao",
        "ultimaMovimentacaoData",
        "assuntos",
      ];
      const data: Record<string, string> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          data[key] = String(req.body[key]).trim();
        }
      }
      if (data.status && !["ativo", "arquivado"].includes(data.status)) {
        return res.status(400).json({ message: "Status invalido" });
      }
      const updated = await storage.updateProcessoMonitorado(
        req.params.id,
        data,
      );
      if (!updated)
        return res.status(404).json({ message: "Processo nao encontrado" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: "Erro ao atualizar: " + error.message });
    }
  });

  app.delete("/api/processos/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteProcessoMonitorado(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: "Erro ao remover: " + error.message });
    }
  });

  const DATAJUD_API_KEY =
    process.env.DATAJUD_API_KEY ||
    "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";

  const TRIBUNAL_ALIASES: Record<string, string> = {
    TJAC: "api_publica_tjac",
    TJAL: "api_publica_tjal",
    TJAM: "api_publica_tjam",
    TJAP: "api_publica_tjap",
    TJBA: "api_publica_tjba",
    TJCE: "api_publica_tjce",
    TJDFT: "api_publica_tjdft",
    TJES: "api_publica_tjes",
    TJGO: "api_publica_tjgo",
    TJMA: "api_publica_tjma",
    TJMG: "api_publica_tjmg",
    TJMS: "api_publica_tjms",
    TJMT: "api_publica_tjmt",
    TJPA: "api_publica_tjpa",
    TJPB: "api_publica_tjpb",
    TJPE: "api_publica_tjpe",
    TJPI: "api_publica_tjpi",
    TJPR: "api_publica_tjpr",
    TJRJ: "api_publica_tjrj",
    TJRN: "api_publica_tjrn",
    TJRO: "api_publica_tjro",
    TJRR: "api_publica_tjrr",
    TJRS: "api_publica_tjrs",
    TJSC: "api_publica_tjsc",
    TJSE: "api_publica_tjse",
    TJSP: "api_publica_tjsp",
    TJTO: "api_publica_tjto",
    TRF1: "api_publica_trf1",
    TRF2: "api_publica_trf2",
    TRF3: "api_publica_trf3",
    TRF4: "api_publica_trf4",
    TRF5: "api_publica_trf5",
    TRF6: "api_publica_trf6",
    TST: "api_publica_tst",
    STJ: "api_publica_stj",
    STF: "api_publica_stf",
    TRT1: "api_publica_trt1",
    TRT2: "api_publica_trt2",
    TRT3: "api_publica_trt3",
    TRT4: "api_publica_trt4",
    TRT5: "api_publica_trt5",
    TRT6: "api_publica_trt6",
    TRT7: "api_publica_trt7",
    TRT8: "api_publica_trt8",
    TRT9: "api_publica_trt9",
    TRT10: "api_publica_trt10",
    TRT11: "api_publica_trt11",
    TRT12: "api_publica_trt12",
    TRT13: "api_publica_trt13",
    TRT14: "api_publica_trt14",
    TRT15: "api_publica_trt15",
    TRT16: "api_publica_trt16",
    TRT17: "api_publica_trt17",
    TRT18: "api_publica_trt18",
    TRT19: "api_publica_trt19",
    TRT20: "api_publica_trt20",
    TRT21: "api_publica_trt21",
    TRT22: "api_publica_trt22",
    TRT23: "api_publica_trt23",
    TRT24: "api_publica_trt24",
  };

  function detectTribunalFromNumber(numero: string): string | null {
    const clean = numero.replace(/[.\-\s]/g, "");
    if (clean.length < 20) return null;
    const justica = clean.substring(13, 14);
    const segmento = clean.substring(14, 16);
    if (justica === "8") {
      const tjMap: Record<string, string> = {
        "01": "TJAC",
        "02": "TJAL",
        "03": "TJAP",
        "04": "TJAM",
        "05": "TJBA",
        "06": "TJCE",
        "07": "TJDFT",
        "08": "TJES",
        "09": "TJGO",
        "10": "TJMA",
        "11": "TJMT",
        "12": "TJMS",
        "13": "TJMG",
        "14": "TJPA",
        "15": "TJPB",
        "16": "TJPE",
        "17": "TJPI",
        "18": "TJPR",
        "19": "TJRJ",
        "20": "TJRN",
        "21": "TJRO",
        "22": "TJRR",
        "23": "TJRS",
        "24": "TJSC",
        "25": "TJSE",
        "26": "TJSP",
        "27": "TJTO",
      };
      return tjMap[segmento] || null;
    }
    if (justica === "4") {
      const trfMap: Record<string, string> = {
        "01": "TRF1",
        "02": "TRF2",
        "03": "TRF3",
        "04": "TRF4",
        "05": "TRF5",
        "06": "TRF6",
      };
      return trfMap[segmento] || null;
    }
    if (justica === "5") {
      const trtMap: Record<string, string> = {
        "01": "TRT1",
        "02": "TRT2",
        "03": "TRT3",
        "04": "TRT4",
        "05": "TRT5",
        "06": "TRT6",
        "07": "TRT7",
        "08": "TRT8",
        "09": "TRT9",
        "10": "TRT10",
        "11": "TRT11",
        "12": "TRT12",
        "13": "TRT13",
        "14": "TRT14",
        "15": "TRT15",
        "16": "TRT16",
        "17": "TRT17",
        "18": "TRT18",
        "19": "TRT19",
        "20": "TRT20",
        "21": "TRT21",
        "22": "TRT22",
        "23": "TRT23",
        "24": "TRT24",
      };
      return trtMap[segmento] || null;
    }
    return null;
  }

  app.post("/api/datajud/consulta", requireAuth, async (req, res) => {
    try {
      const { numeroProcesso, tribunal } = req.body;
      if (!numeroProcesso || typeof numeroProcesso !== "string") {
        return res
          .status(400)
          .json({ message: "Numero do processo e obrigatorio" });
      }
      const cleanNum = numeroProcesso.replace(/[.\-\s]/g, "");
      let selectedTribunal = tribunal as string;
      if (!selectedTribunal || !TRIBUNAL_ALIASES[selectedTribunal]) {
        const detected = detectTribunalFromNumber(cleanNum);
        if (detected) {
          selectedTribunal = detected;
        } else {
          return res
            .status(400)
            .json({
              message:
                "Nao foi possivel detectar o tribunal. Selecione manualmente.",
            });
        }
      }
      const alias = TRIBUNAL_ALIASES[selectedTribunal];
      const url = `https://api-publica.datajud.cnj.jus.br/${alias}/_search`;
      const body = {
        query: {
          match: {
            numeroProcesso: cleanNum,
          },
        },
        size: 1,
      };
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `APIKey ${DATAJUD_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("DataJud API error:", response.status, errText);
        return res
          .status(502)
          .json({ message: `Erro na API DataJud: ${response.status}` });
      }
      const data = await response.json();
      const hits = data?.hits?.hits || [];
      if (hits.length === 0) {
        return res.json({
          found: false,
          message: "Processo nao encontrado no DataJud.",
        });
      }
      const processo = hits[0]._source;
      const movimentos = (processo.movimentos || []).sort(
        (a: any, b: any) =>
          new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime(),
      );
      res.json({
        found: true,
        tribunal: selectedTribunal,
        processo: {
          numero: processo.numeroProcesso,
          classe: processo.classe?.nome || "",
          classeCode: processo.classe?.codigo || "",
          sistema: processo.sistema?.nome || "",
          formato: processo.formato?.nome || "",
          orgaoJulgador: processo.orgaoJulgador?.nome || "",
          codigoOrgao: processo.orgaoJulgador?.codigo || "",
          municipio: processo.orgaoJulgador?.codigoMunicipioIBGE || "",
          dataAjuizamento: processo.dataAjuizamento || "",
          dataUltimaAtualizacao: processo.dataHoraUltimaAtualizacao || "",
          grau: processo.grau || "",
          nivelSigilo: processo.nivelSigilo || 0,
          assuntos: (processo.assuntos || []).map((a: any) => ({
            nome: a.nome || "",
            codigo: a.codigo || "",
          })),
          movimentos: movimentos.map((m: any) => ({
            dataHora: m.dataHora || "",
            nome: m.nome || "",
            codigo: m.codigo || "",
            complementos: m.complementosTabelados || [],
          })),
        },
      });
    } catch (error: any) {
      console.error("DataJud error:", error);
      res
        .status(500)
        .json({
          message:
            "Erro ao consultar DataJud: " +
            (error.message || "erro desconhecido"),
        });
    }
  });

  app.post("/api/datajud/consulta-oab", requireAuth, async (req, res) => {
    try {
      const { oab, uf, tribunal } = req.body;
      if (!oab || typeof oab !== "string") {
        return res.status(400).json({ message: "Numero da OAB e obrigatorio" });
      }
      if (!tribunal || !TRIBUNAL_ALIASES[tribunal]) {
        return res
          .status(400)
          .json({ message: "Tribunal e obrigatorio para busca por OAB" });
      }
      const cleanOab = oab.replace(/\D/g, "");
      if (!cleanOab) {
        return res.status(400).json({ message: "Numero da OAB invalido" });
      }
      const alias = TRIBUNAL_ALIASES[tribunal];
      const url = `https://api-publica.datajud.cnj.jus.br/${alias}/_search`;
      const cleanUf = (uf || "").toUpperCase().trim();
      const oabWithUf = cleanUf ? `${cleanOab}${cleanUf}` : cleanOab;
      const queryAttempts = [
        { match: { "advogados.inscricao": cleanOab } },
        {
          query_string: {
            query: `"${cleanOab}" OR "${oabWithUf}"`,
            fields: ["*inscricao*", "*advogado*", "*OAB*"],
          },
        },
      ];

      let hits: any[] = [];
      for (const queryBody of queryAttempts) {
        const body = {
          query: queryBody,
          size: 50,
          sort: [{ dataHoraUltimaAtualizacao: { order: "desc" } }],
        };
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `APIKey ${DATAJUD_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          });
          if (response.ok) {
            const data = await response.json();
            hits = data?.hits?.hits || [];
            if (hits.length > 0) break;
          }
        } catch (e) {
          console.log("DataJud OAB query attempt failed:", e);
        }
      }

      if (hits.length === 0) {
        return res.json({
          found: false,
          processos: [],
          message:
            "A API publica do DataJud pode nao disponibilizar dados de advogados/OAB para busca. Use a busca por numero do processo, ou tente a Consulta Processual no portal do tribunal.",
        });
      }
      const processos = hits.map((hit: any) => {
        const p = hit._source;
        const movs = (p.movimentos || []).sort(
          (a: any, b: any) =>
            new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime(),
        );
        return {
          numero: p.numeroProcesso || "",
          classe: p.classe?.nome || "",
          orgaoJulgador: p.orgaoJulgador?.nome || "",
          dataAjuizamento: p.dataAjuizamento || "",
          dataUltimaAtualizacao: p.dataHoraUltimaAtualizacao || "",
          grau: p.grau || "",
          assuntos: (p.assuntos || []).map((a: any) => ({
            nome: a.nome || "",
            codigo: a.codigo || "",
          })),
          ultimaMovimentacao: movs.length > 0 ? movs[0].nome : "",
          ultimaMovimentacaoData: movs.length > 0 ? movs[0].dataHora : "",
          totalMovimentos: movs.length,
        };
      });
      res.json({ found: true, total: hits.length, tribunal, processos });
    } catch (error: any) {
      console.error("DataJud OAB error:", error);
      res
        .status(500)
        .json({
          message:
            "Erro ao consultar DataJud por OAB: " +
            (error.message || "erro desconhecido"),
        });
    }
  });

  // ===== CORPORATIVO PROXY (PDPJ) =====
  const CORPORATIVO_BASE =
    "https://gateway.cloud.pje.jus.br/corporativo-proxy/api/v1";

  app.get(
    "/api/corporativo/advogado/cpf/:cpf",
    requireAuth,
    async (req, res) => {
      try {
        const cpf = req.params.cpf.replace(/\D/g, "");
        if (cpf.length !== 11) {
          return res.status(400).json({ message: "CPF inválido" });
        }
        const response = await fetch(
          `${CORPORATIVO_BASE}/advogado/oab/${cpf}`,
          {
            headers: { Accept: "application/json" },
          },
        );
        if (response.status === 204) {
          return res.json({ found: false, data: [] });
        }
        if (!response.ok) {
          let errMsg = `Erro na API: ${response.status}`;
          try {
            const t = await response.text();
            if (t) errMsg = t;
          } catch {}
          console.error(
            `Corporativo advogado/cpf error: ${response.status}`,
            errMsg,
          );
          if (response.status === 403)
            errMsg = "API bloqueada - acesso apenas de IPs brasileiros";
          return res.status(response.status).json({ message: errMsg });
        }
        const data = await response.json();
        res.json({ found: true, data: Array.isArray(data) ? data : [data] });
      } catch (error: any) {
        console.error("Corporativo advogado/cpf error:", error.message);
        res
          .status(500)
          .json({
            message:
              "Erro ao consultar API Corporativo: " +
              (error.message || "erro desconhecido"),
          });
      }
    },
  );

  app.get(
    "/api/corporativo/advogado/oab/:uf/:inscricao",
    requireAuth,
    async (req, res) => {
      try {
        const { uf, inscricao } = req.params;
        if (!uf || !inscricao) {
          return res
            .status(400)
            .json({ message: "UF e número de inscrição são obrigatórios" });
        }
        const response = await fetch(
          `${CORPORATIVO_BASE}/advogado/oab/${uf.toUpperCase()}/${inscricao.replace(/\D/g, "")}`,
          {
            headers: { Accept: "application/json" },
          },
        );
        if (response.status === 204) {
          return res.json({ found: false, data: null });
        }
        if (!response.ok) {
          let errMsg = `Erro na API: ${response.status}`;
          try {
            const t = await response.text();
            if (t) errMsg = t;
          } catch {}
          console.error(
            `Corporativo advogado/oab error: ${response.status}`,
            errMsg,
          );
          if (response.status === 403)
            errMsg = "API bloqueada - acesso apenas de IPs brasileiros";
          return res.status(response.status).json({ message: errMsg });
        }
        const data = await response.json();
        res.json({ found: true, data });
      } catch (error: any) {
        console.error("Corporativo advogado/oab error:", error.message);
        res
          .status(500)
          .json({
            message:
              "Erro ao consultar API Corporativo: " +
              (error.message || "erro desconhecido"),
          });
      }
    },
  );

  app.get(
    "/api/corporativo/magistrados/:tribunal",
    requireAuth,
    async (req, res) => {
      try {
        const tribunal = req.params.tribunal.toUpperCase();
        const response = await fetch(
          `${CORPORATIVO_BASE}/magistrado?siglaTribunal=${tribunal}`,
          {
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok) {
          let errMsg = `Erro na API: ${response.status}`;
          try {
            const t = await response.text();
            if (t) errMsg = t;
          } catch {}
          console.error(
            `Corporativo magistrados error: ${response.status}`,
            errMsg,
          );
          if (response.status === 403)
            errMsg = "API bloqueada - acesso apenas de IPs brasileiros";
          return res.status(response.status).json({ message: errMsg });
        }
        const data = await response.json();
        res.json({ found: true, data: Array.isArray(data) ? data : [] });
      } catch (error: any) {
        console.error("Corporativo magistrados error:", error.message);
        res
          .status(500)
          .json({
            message:
              "Erro ao consultar magistrados: " +
              (error.message || "erro desconhecido"),
          });
      }
    },
  );

  // ===== PDPJ AUTHENTICATED API PROXY =====
  const DOMICILIO_BASE_PROD = "https://domicilio-eletronico.pdpj.jus.br";
  const DOMICILIO_BASE_STG =
    "https://gateway.stg.cloud.pje.jus.br/domicilio-eletronico-hml";
  const COMUNICAAPI_BASE_PROD = "https://comunicaapi.pje.jus.br/api/v1";
  const COMUNICAAPI_BASE_STG = "https://hcomunicaapi.cnj.jus.br/api/v1";

  function formatPemKey(pemKey: string): string {
    let formattedKey = pemKey;
    if (formattedKey.includes("\\n")) {
      formattedKey = formattedKey.replace(/\\n/g, "\n");
    }
    if (
      formattedKey.includes("Bag Attributes") ||
      formattedKey.includes("friendlyName")
    ) {
      const keyTypes = ["RSA PRIVATE KEY", "PRIVATE KEY", "EC PRIVATE KEY"];
      for (const keyType of keyTypes) {
        const beginMarker = `-----BEGIN ${keyType}-----`;
        const endMarker = `-----END ${keyType}-----`;
        const beginIdx = formattedKey.indexOf(beginMarker);
        const endIdx = formattedKey.indexOf(endMarker);
        if (beginIdx !== -1 && endIdx !== -1) {
          formattedKey = formattedKey.substring(
            beginIdx,
            endIdx + endMarker.length,
          );
          break;
        }
      }
    }
    if (!formattedKey.includes("\n") && formattedKey.includes("-----")) {
      const beginMatch = formattedKey.match(/-----BEGIN [^-]+-----/);
      const endMatch = formattedKey.match(/-----END [^-]+-----/);
      if (beginMatch && endMatch) {
        const header = beginMatch[0];
        const footer = endMatch[0];
        const body = formattedKey
          .replace(header, "")
          .replace(footer, "")
          .replace(/\s+/g, "");
        formattedKey = `${header}\n${body.replace(/(.{64})/g, "$1\n").trim()}\n${footer}`;
      }
    }
    if (!formattedKey.startsWith("-----BEGIN")) {
      formattedKey = `-----BEGIN PRIVATE KEY-----\n${formattedKey
        .replace(/\s+/g, "")
        .replace(/(.{64})/g, "$1\n")
        .trim()}\n-----END PRIVATE KEY-----`;
    }
    return formattedKey.trim();
  }

  function generatePdpjToken(
    cpf: string,
    modo: "pdpj" | "pjud" = "pdpj",
    tribunal: string = "TJMG",
    expiresMinutes: number = 15,
    ambiente: string = "homologacao",
  ): string | null {
    const pemKey = process.env.PDPJ_PEM_PRIVATE_KEY;
    if (!pemKey) return null;

    const formattedKey = formatPemKey(pemKey);
    const now = Math.floor(Date.now() / 1000);
    const isPjud = modo === "pjud";
    const isProd = ambiente === "producao";

    const payload: Record<string, any> = {
      sub: cpf,
      iss: isPjud ? (isProd ? "pjud-client" : "pjud-client-hml") : "pdpj-br",
      aud: isPjud
        ? isProd
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br"
        : isProd
          ? "https://gateway.cloud.pje.jus.br"
          : "https://gateway.stg.cloud.pje.jus.br",
      iat: now,
      exp: now + expiresMinutes * 60,
      jti: `${isPjud ? "pjud" : "pdpj"}-${Date.now()}`,
      tribunal,
      scope: "pdpj.read pdpj.write",
    };

    return jwt.sign(payload, formattedKey, { algorithm: "RS256" });
  }

  async function pdpjFetch(
    url: string,
    token: string,
    cpf?: string,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (cpf) {
      headers["On-behalf-Of"] = cpf.replace(/\D/g, "");
    }
    return fetch(url, { headers });
  }

  app.get("/api/pdpj/status", requireAuth, (_req, res) => {
    const hasPem = !!process.env.PDPJ_PEM_PRIVATE_KEY;
    res.json({ configured: hasPem });
  });

  app.post("/api/pdpj/test-connection", requireAuth, async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente } = req.body;
      const cleanCpf = (cpf || "").replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const token = generatePdpjToken(
        cleanCpf,
        modo || "pdpj",
        tribunal || "TJMG",
        15,
        ambiente || "homologacao",
      );
      if (!token) {
        return res.status(400).json({ message: "Chave PEM não configurada" });
      }

      const baseUrl =
        ambiente === "producao" ? DOMICILIO_BASE_PROD : DOMICILIO_BASE_STG;
      const response = await pdpjFetch(`${baseUrl}/api/v1/eu`, token, cleanCpf);

      if (response.ok) {
        const data = await response.json();
        res.json({
          connected: true,
          data,
          ambiente: ambiente || "homologacao",
        });
      } else {
        let errMsg = `Status ${response.status}`;
        try {
          const t = await response.text();
          if (t) errMsg = t;
        } catch {}
        if (response.status === 403)
          errMsg = "Acesso bloqueado - API restrita a IPs brasileiros";
        if (response.status === 401)
          errMsg =
            "Token não autorizado - verifique se a chave PEM está registrada no PDPJ";
        res.json({
          connected: false,
          status: response.status,
          message: errMsg,
        });
      }
    } catch (error: any) {
      console.error("PDPJ test connection error:", error.message);
      res.json({
        connected: false,
        message: "Erro de conexão: " + (error.message || "desconhecido"),
      });
    }
  });

  app.post("/api/pdpj/comunicacoes", requireAuth, async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente, dataInicio, dataFim, pagina } =
        req.body;
      const cleanCpf = (cpf || "").replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const token = generatePdpjToken(
        cleanCpf,
        modo || "pdpj",
        tribunal || "TJMG",
        15,
        ambiente || "homologacao",
      );
      if (!token) {
        return res.status(400).json({ message: "Chave PEM não configurada" });
      }

      const baseUrl =
        ambiente === "producao" ? DOMICILIO_BASE_PROD : DOMICILIO_BASE_STG;
      let url = `${baseUrl}/api/v1/comunicacoes-representantes?page=${pagina || 0}&size=20`;
      if (dataInicio) url += `&dataInicio=${dataInicio}`;
      if (dataFim) url += `&dataFim=${dataFim}`;

      const response = await pdpjFetch(url, token, cleanCpf);

      if (!response.ok) {
        let errMsg = `Erro ${response.status}`;
        try {
          const t = await response.text();
          if (t) errMsg = t;
        } catch {}
        if (response.status === 403) errMsg = "API restrita a IPs brasileiros";
        if (response.status === 401) errMsg = "Token não autorizado";
        return res.status(response.status).json({ message: errMsg });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PDPJ comunicacoes error:", error.message);
      res
        .status(500)
        .json({
          message:
            "Erro ao consultar comunicações: " +
            (error.message || "desconhecido"),
        });
    }
  });

  app.post("/api/pdpj/representados", requireAuth, async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente, dataInicio, dataFim } = req.body;
      const cleanCpf = (cpf || "").replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const token = generatePdpjToken(
        cleanCpf,
        modo || "pdpj",
        tribunal || "TJMG",
        15,
        ambiente || "homologacao",
      );
      if (!token) {
        return res.status(400).json({ message: "Chave PEM não configurada" });
      }

      const baseUrl =
        ambiente === "producao" ? DOMICILIO_BASE_PROD : DOMICILIO_BASE_STG;
      let url = `${baseUrl}/api/v1/representados`;
      const params: string[] = [];
      if (dataInicio) params.push(`dataInicio=${dataInicio}`);
      if (dataFim) params.push(`dataFim=${dataFim}`);
      if (params.length) url += `?${params.join("&")}`;

      const response = await pdpjFetch(url, token, cleanCpf);

      if (!response.ok) {
        let errMsg = `Erro ${response.status}`;
        try {
          const t = await response.text();
          if (t) errMsg = t;
        } catch {}
        if (response.status === 403) errMsg = "API restrita a IPs brasileiros";
        if (response.status === 401) errMsg = "Token não autorizado";
        return res.status(response.status).json({ message: errMsg });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PDPJ representados error:", error.message);
      res
        .status(500)
        .json({
          message:
            "Erro ao consultar representados: " +
            (error.message || "desconhecido"),
        });
    }
  });

  app.post("/api/pdpj/habilitacao", requireAuth, async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente, documento } = req.body;
      const cleanCpf = (cpf || "").replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ message: "CPF inválido" });
      }
      const cleanDoc = (documento || "").replace(/\D/g, "");
      if (!cleanDoc || (cleanDoc.length !== 11 && cleanDoc.length !== 14)) {
        return res
          .status(400)
          .json({ message: "Documento (CPF ou CNPJ) inválido" });
      }

      const token = generatePdpjToken(
        cleanCpf,
        modo || "pdpj",
        tribunal || "TJMG",
        15,
        ambiente || "homologacao",
      );
      if (!token) {
        return res.status(400).json({ message: "Chave PEM não configurada" });
      }

      const baseUrl =
        ambiente === "producao" ? DOMICILIO_BASE_PROD : DOMICILIO_BASE_STG;
      const response = await pdpjFetch(
        `${baseUrl}/api/v1/pessoas/${cleanDoc}/verificar-habilitacao`,
        token,
        cleanCpf,
      );

      if (!response.ok) {
        let errMsg = `Erro ${response.status}`;
        try {
          const t = await response.text();
          if (t) errMsg = t;
        } catch {}
        if (response.status === 403) errMsg = "API restrita a IPs brasileiros";
        if (response.status === 401) errMsg = "Token não autorizado";
        return res.status(response.status).json({ message: errMsg });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PDPJ habilitacao error:", error.message);
      res
        .status(500)
        .json({
          message:
            "Erro ao verificar habilitação: " +
            (error.message || "desconhecido"),
        });
    }
  });

  app.post("/api/pdpj/pessoa", requireAuth, async (req, res) => {
    try {
      const { cpf, modo, tribunal, ambiente, tipoPessoa, documento } = req.body;
      const cleanCpf = (cpf || "").replace(/\D/g, "");
      if (cleanCpf.length !== 11) {
        return res.status(400).json({ message: "CPF inválido" });
      }

      const token = generatePdpjToken(
        cleanCpf,
        modo || "pdpj",
        tribunal || "TJMG",
        15,
        ambiente || "homologacao",
      );
      if (!token) {
        return res.status(400).json({ message: "Chave PEM não configurada" });
      }

      const baseUrl =
        ambiente === "producao" ? DOMICILIO_BASE_PROD : DOMICILIO_BASE_STG;
      const cleanDoc = (documento || "").replace(/\D/g, "");
      let url: string;
      if (tipoPessoa === "juridica") {
        url = `${baseUrl}/api/v1/pessoas-juridicas?cnpj=${cleanDoc}`;
      } else {
        url = `${baseUrl}/api/v1/pessoas-fisicas-pdpj?cpf=${cleanDoc}`;
      }

      const response = await pdpjFetch(url, token, cleanCpf);

      if (!response.ok) {
        let errMsg = `Erro ${response.status}`;
        try {
          const t = await response.text();
          if (t) errMsg = t;
        } catch {}
        if (response.status === 403) errMsg = "API restrita a IPs brasileiros";
        if (response.status === 401) errMsg = "Token não autorizado";
        return res.status(response.status).json({ message: errMsg });
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error("PDPJ pessoa error:", error.message);
      res
        .status(500)
        .json({
          message:
            "Erro ao consultar pessoa: " + (error.message || "desconhecido"),
        });
    }
  });

  app.get("/api/datajud/tribunais", requireAuth, (_req, res) => {
    const tribunais = Object.keys(TRIBUNAL_ALIASES).map((key) => ({
      sigla: key,
      tipo: key.startsWith("TJ")
        ? "Estadual"
        : key.startsWith("TRF")
          ? "Federal"
          : key.startsWith("TRT")
            ? "Trabalhista"
            : "Superior",
    }));
    res.json(tribunais);
  });

  // ─── CNJ Comunicações Processuais ─────────────────────────────────────────
  const COMUNICAAPI_PROD = "https://comunicaapi.pje.jus.br/api/v1";
  const COMUNICAAPI_HML = "https://hcomunicaapi.cnj.jus.br/api/v1";

  app.post("/api/cnj/comunicacoes", requireAuth, async (req, res) => {
    try {
      const {
        numeroOab, ufOab, nomeAdvogado, nomeParte, numeroProcesso,
        dataDisponibilizacaoInicio, dataDisponibilizacaoFim,
        ambiente
      } = req.body;

      if (!numeroOab && !nomeAdvogado && !nomeParte && !numeroProcesso) {
        return res.status(400).json({
          message: "Informe pelo menos um critério: OAB, nome do advogado, nome da parte ou número do processo."
        });
      }

      const baseUrl = ambiente === "producao" ? COMUNICAAPI_PROD : COMUNICAAPI_HML;
      const url = new URL(`${baseUrl}/comunicacao`);

      if (numeroOab) url.searchParams.append("numeroOab", numeroOab.toString().replace(/\D/g, ""));
      if (ufOab) url.searchParams.append("ufOab", ufOab.toUpperCase());
      if (nomeAdvogado) url.searchParams.append("nomeAdvogado", nomeAdvogado);
      if (nomeParte) url.searchParams.append("nomeParte", nomeParte);
      if (numeroProcesso) url.searchParams.append("numeroProcesso", numeroProcesso.replace(/[.\-\s]/g, ""));
      if (dataDisponibilizacaoInicio) url.searchParams.append("dataDisponibilizacaoInicio", dataDisponibilizacaoInicio);
      if (dataDisponibilizacaoFim) url.searchParams.append("dataDisponibilizacaoFim", dataDisponibilizacaoFim);

      const response = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const isGeoBlocked = errText.includes("block access from your country") || errText.includes("CloudFront");
        if (isGeoBlocked && ambiente === "producao") {
          return res.status(403).json({
            message: "A API de produção do CNJ bloqueia acesso internacional. Use o ambiente de homologação ou acesse de um servidor brasileiro.",
            geoBlocked: true,
          });
        }
        return res.status(response.status).json({
          message: `Erro na API CNJ (${response.status}): ${errText.substring(0, 200)}`,
        });
      }

      const data = await response.json();

      const items = (data.items || []).map((item: any) => ({
        id: item.id,
        dataDisponibilizacao: item.data_disponibilizacao || item.datadisponibilizacao,
        tribunal: item.siglaTribunal,
        tipo: item.tipoComunicacao,
        orgao: item.nomeOrgao,
        processo: item.numeroprocessocommascara || item.numero_processo,
        classe: item.nomeClasse,
        codigoClasse: item.codigoClasse,
        tipoDocumento: item.tipoDocumento,
        texto: item.texto,
        link: item.link,
        meio: item.meiocompleto || item.meio,
        status: item.status,
        hash: item.hash,
        numeroComunicacao: item.numeroComunicacao,
        destinatarios: (item.destinatarios || []).map((d: any) => ({
          nome: d.nome,
          polo: d.polo === "A" ? "Ativo" : d.polo === "P" ? "Passivo" : d.polo,
        })),
        advogados: (item.destinatarioadvogados || []).map((da: any) => ({
          nome: da.advogado?.nome,
          oab: da.advogado?.numero_oab,
          uf: da.advogado?.uf_oab,
        })),
      }));

      res.json({
        status: data.status || "success",
        message: data.message || "Sucesso",
        total: data.count || items.length,
        items,
        fonte: "CNJ Comunicações Processuais (PCP)",
        ambiente: ambiente === "producao" ? "Produção" : "Homologação",
      });
    } catch (error: any) {
      console.error("CNJ Comunicações error:", error.message);
      res.status(500).json({
        message: "Erro ao consultar comunicações no CNJ: " + (error.message || "erro desconhecido"),
      });
    }
  });

  app.get("/api/cnj/comunicacoes/certidao/:hash", requireAuth, async (req, res) => {
    try {
      const hash = (req.params.hash || "").replace(/[^a-zA-Z0-9]/g, "");
      if (!hash || hash.length < 5) {
        return res.status(400).json({ message: "Hash inválido" });
      }
      const ambiente = (req.query.ambiente as string) === "producao" ? "producao" : "homologacao";
      const baseUrl = ambiente === "producao" ? COMUNICAAPI_PROD : COMUNICAAPI_HML;

      const response = await fetch(`${baseUrl}/comunicacao/${hash}/certidao`, {
        headers: { Accept: "application/pdf" },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          message: `Erro ao obter certidão (${response.status})`,
        });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=certidao_${hash}.pdf`);
      res.send(buffer);
    } catch (error: any) {
      console.error("CNJ Certidão error:", error.message);
      res.status(500).json({ message: "Erro ao obter certidão: " + error.message });
    }
  });

  // ─── AI Config (chaves próprias + banco) ─────────────────────────────────
  app.get("/api/settings/ai-config", requireAuth, async (_req, res) => {
    try {
      const keys = ["gemini_api_key", "openai_api_key", "perplexity_api_key", "demo_api_key", "demo_api_url", "demo_api_model"];
      const result: Record<string, string> = {};
      for (const k of keys) {
        const v = await storage.getSetting(k);
        result[k] = v || "";
      }
      const dbUrl = getLocalConfig("database_url") || process.env.DATABASE_URL || "";
      result.database_url = dbUrl ? dbUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@") : "";
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/settings/ai-config", requireAuth, async (req, res) => {
    try {
      const allowed = ["gemini_api_key", "openai_api_key", "perplexity_api_key", "demo_api_key", "demo_api_url", "demo_api_model"];
      for (const k of allowed) {
        if (typeof req.body[k] === "string" && req.body[k].trim()) {
          await storage.setSetting(k, req.body[k].trim());
        }
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/settings/database-reconnect", requireAuth, async (req, res) => {
    const { database_url } = req.body;
    if (!database_url || typeof database_url !== "string") {
      return res.status(400).json({ message: "database_url é obrigatório" });
    }
    const url = database_url.trim();
    try {
      setLocalConfig("database_url", url);
      await reconnectDb(url);
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      const { db: freshDb } = await import("./storage");
      const migrationsFolder = process.env.NODE_ENV === "production"
        ? path.join(process.cwd(), "migrations")
        : path.join(process.cwd(), "migrations");
      await migrate(freshDb, { migrationsFolder });
      res.json({ ok: true, message: "Banco conectado e tabelas criadas com sucesso!" });
    } catch (e: any) {
      res.status(500).json({ message: `Erro ao conectar: ${e.message}` });
    }
  });

  app.get("/api/settings/database-status", requireAuth, async (_req, res) => {
    try {
      const { db: currentDb } = await import("./storage");
      await currentDb.execute("SELECT 1" as any);
      res.json({ connected: true, mode: "postgres" });
    } catch {
      res.json({ connected: false, mode: "memory" });
    }
  });

  app.get("/api/settings/system-status", requireAuth, async (_req, res) => {
    try {
      const { db: currentDb } = await import("./storage");
      let dbMode = "memory";
      try {
        await currentDb.execute("SELECT 1" as any);
        dbMode = "postgres";
      } catch {}
      const cfg = (await import("./local-config")).readLocalConfig();
      res.json({
        dbMode,
        hasDbUrl: !!(cfg.database_url || process.env.DATABASE_URL),
        hasGeminiKey: !!(cfg.gemini_api_key || process.env.AI_INTEGRATIONS_GEMINI_API_KEY),
        hasOpenAiKey: !!(cfg.openai_api_key || process.env.AI_INTEGRATIONS_OPENAI_API_KEY),
        hasPerplexityKey: !!cfg.perplexity_api_key,
        hasDemoKey: !!cfg.demo_api_key,
        hasAppPassword: !!(cfg.app_password || process.env.APP_PASSWORD),
        hasSessionSecret: !!(cfg.session_secret || process.env.SESSION_SECRET),
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/settings/app-password", requireAuth, async (req, res) => {
    const { value } = req.body;
    if (!value || typeof value !== "string") return res.status(400).json({ message: "Senha obrigatória" });
    setLocalConfig("app_password", value.trim());
    process.env.APP_PASSWORD = value.trim();
    res.json({ ok: true });
  });

  app.put("/api/settings/session-secret", requireAuth, async (req, res) => {
    const { value } = req.body;
    if (!value || typeof value !== "string") return res.status(400).json({ message: "Segredo obrigatório" });
    setLocalConfig("session_secret", value.trim());
    process.env.SESSION_SECRET = value.trim();
    res.json({ ok: true });
  });

  // ─── Teste de chave de IA ───────────────────────────────────────────────────
  app.post("/api/settings/test-ai-key", requireAuth, async (req, res) => {
    const { key, provider } = req.body;
    const testKey = sanitizeKey((key as string) || "");
    const effectiveKey = testKey || getLocalConfig("gemini_api_key") || "";

    if (!effectiveKey) {
      return res.status(400).json({ ok: false, message: "Nenhuma chave configurada. Salve sua chave primeiro." });
    }

    try {
      if (provider === "openai" || (effectiveKey.startsWith("sk-") && !effectiveKey.startsWith("sk-ant-") && !effectiveKey.startsWith("sk-or-"))) {
        const ownKey = testKey || getLocalConfig("openai_api_key") || "";
        if (!ownKey) return res.status(400).json({ ok: false, message: "Chave OpenAI não configurada." });
        const client = new OpenAI({ apiKey: ownKey, baseURL: "https://api.openai.com/v1" });
        await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: "responda apenas: ok" }],
          max_tokens: 5,
        });
        return res.json({ ok: true, message: "Chave OpenAI funcionando!" });
      }

      // Gemini (AIzaSy...)
      const geminiKey = testKey || getLocalConfig("gemini_api_key") || "";
      if (!geminiKey) return res.status(400).json({ ok: false, message: "Chave Gemini não configurada." });
      const client = new GoogleGenAI({ apiKey: geminiKey });
      const result = await client.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: "responda apenas: ok" }] }],
        config: { maxOutputTokens: 5 },
      });
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return res.json({ ok: true, message: `Chave Gemini funcionando! Resposta: "${text.trim()}"` });
    } catch (e: any) {
      const msg = e?.message || String(e);
      const friendly = msg.includes("API_KEY_INVALID") || msg.includes("invalid") ? "Chave inválida — verifique se copiou corretamente."
        : msg.includes("PERMISSION_DENIED") ? "Chave sem permissão — verifique no painel da Google se a API está ativada."
        : msg.includes("quota") || msg.includes("429") ? "Limite de uso atingido — aguarde alguns minutos."
        : msg.includes("ENOTFOUND") || msg.includes("fetch") ? "Sem acesso à internet do servidor."
        : msg.substring(0, 150);
      return res.status(400).json({ ok: false, message: friendly });
    }
  });

  // ─── App Settings genérico (DEVE ficar depois das rotas específicas) ───────
  app.get("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const value = await storage.getSetting(req.params.key);
      res.json({ value });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/settings/:key", requireAuth, async (req, res) => {
    try {
      const { value } = req.body;
      if (typeof value !== "string")
        return res.status(400).json({ message: "value required" });
      await storage.setSetting(req.params.key, value);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ─── Tramitação Inteligente Proxy ──────────────────────────────────────────
  const TRAMITACAO_BASE =
    "https://planilha.tramitacaointeligente.com.br/api/v1";

  async function tramitacaoFetch(
    path: string,
    method: string,
    token: string,
    body?: any,
  ) {
    const res = await fetch(`${TRAMITACAO_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res;
  }

  app.get("/api/tramitacao/clientes", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res
          .status(400)
          .json({
            message: "Token do Tramitação Inteligente não configurado.",
          });
      const qs = new URLSearchParams();
      if (req.query.page) qs.set("page", String(req.query.page));
      if (req.query.per_page) qs.set("per_page", String(req.query.per_page));
      const upstream = await tramitacaoFetch(`/clientes?${qs}`, "GET", token);
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tramitacao/clientes", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch(
        "/clientes",
        "POST",
        token,
        req.body,
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tramitacao/clientes/:id", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch(
        `/clientes/${req.params.id}`,
        "GET",
        token,
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch("/api/tramitacao/clientes/:id", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch(
        `/clientes/${req.params.id}`,
        "PATCH",
        token,
        req.body,
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tramitacao/notas", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const qs = new URLSearchParams();
      if (req.query.customer_id)
        qs.set("customer_id", String(req.query.customer_id));
      if (req.query.page) qs.set("page", String(req.query.page));
      if (req.query.per_page) qs.set("per_page", String(req.query.per_page));
      const upstream = await tramitacaoFetch(`/notas?${qs}`, "GET", token);
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/tramitacao/notas", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch("/notas", "POST", token, req.body);
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/tramitacao/notas/:id", requireAuth, async (req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch(
        `/notas/${req.params.id}`,
        "DELETE",
        token,
      );
      res.status(upstream.status).json({ ok: upstream.status === 204 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tramitacao/usuarios", requireAuth, async (_req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.status(400).json({ message: "Token não configurado." });
      const upstream = await tramitacaoFetch(
        "/usuarios?per_page=100",
        "GET",
        token,
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tramitacao/test", requireAuth, async (_req, res) => {
    try {
      const token = await storage.getSetting("tramitacao_token");
      if (!token)
        return res.json({
          ok: false,
          message:
            "Token não configurado. Acesse Configurações e insira seu token.",
        });
      if (/^\d+$/.test(token.trim())) {
        return res.json({
          ok: false,
          message: `O valor "${token}" parece ser um ID de assinante, não um token de API. Acesse planilha.tramitacaointeligente.com.br/api/chaves para obter o token correto.`,
        });
      }
      const upstream = await tramitacaoFetch(
        "/clientes?per_page=1",
        "GET",
        token,
      );
      if (upstream.ok) {
        return res.json({
          ok: true,
          message: "Conexão OK! Token válido e API respondendo.",
        });
      } else if (upstream.status === 401) {
        return res.json({
          ok: false,
          message:
            "Token inválido ou expirado (401). Verifique em planilha.tramitacaointeligente.com.br/api/chaves.",
        });
      } else {
        const body = await upstream.text().catch(() => "");
        return res.json({
          ok: false,
          message: `API retornou ${upstream.status}: ${body.slice(0, 100)}`,
        });
      }
    } catch (e: any) {
      res.status(500).json({ ok: false, message: e.message });
    }
  });

  app.get("/api/tramitacao/publicacoes", requireAuth, async (_req, res) => {
    try {
      const pubs = await storage.getTramitacaoPublicacoes(200);
      res.json({ publicacoes: pubs });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // Sync publications from Tramitação Inteligente API directly
  app.post(
    "/api/tramitacao/sync-publicacoes",
    requireAuth,
    async (_req, res) => {
      try {
        const token = await storage.getSetting("tramitacao_token");
        if (!token)
          return res
            .status(400)
            .json({
              message:
                "Token do Tramitação Inteligente não configurado. Vá em Configurações e salve seu token.",
            });

        // Try fetching publications from the API (most likely endpoint names)
        const endpoints = [
          "/publications?per_page=50&page=1",
          "/publicacoes?per_page=50&page=1",
        ];
        let rawPubs: any[] = [];
        let fetchOk = false;

        for (const ep of endpoints) {
          try {
            const upstream = await tramitacaoFetch(ep, "GET", token);
            if (upstream.ok) {
              const data = await upstream.json();
              // Handle both array and object responses
              rawPubs = Array.isArray(data)
                ? data
                : Array.isArray(data?.publications)
                  ? data.publications
                  : Array.isArray(data?.publicacoes)
                    ? data.publicacoes
                    : Array.isArray(data?.data)
                      ? data.data
                      : [];
              fetchOk = true;
              break;
            }
          } catch (_) {
            /* try next endpoint */
          }
        }

        if (!fetchOk) {
          // If API fetch failed, just return what's in our local DB
          const localPubs = await storage.getTramitacaoPublicacoes(200);
          return res.json({
            publicacoes: localPubs,
            synced: 0,
            source: "local",
            warning:
              "Não foi possível conectar à API do Tramitação Inteligente. Mostrando publicações locais recebidas via webhook.",
          });
        }

        let savedCount = 0;
        for (const pub of rawPubs) {
          try {
            await storage.upsertTramitacaoPublicacao({
              extId: String(pub.id || pub.ext_id || Math.random()),
              idempotencyKey: pub.idempotency_key || "",
              numeroProcesso: pub.numero_processo || pub.process_number || "",
              numeroProcessoMascara:
                pub.numero_processo_com_mascara || pub.numero_processo || "",
              tribunal: pub.siglaTribunal || pub.tribunal || pub.court || "",
              orgao: pub.nomeOrgao || pub.orgao || pub.organ || "",
              classe: pub.nomeClasse || pub.classe || pub.class || "",
              texto: pub.texto || pub.text || pub.content || "",
              disponibilizacaoDate:
                pub.disponibilizacao_date || pub.available_date || "",
              publicacaoDate: pub.publication_date || pub.published_at || "",
              inicioPrazoDate:
                pub.inicio_do_prazo_date || pub.deadline_start || "",
              linkTramitacao: pub.link_tramitacao || pub.link || "",
              linkTribunal: pub.link_tribunal || pub.tribunal_link || "",
              destinatarios: JSON.stringify(
                pub.destinatarios || pub.recipients || [],
              ),
              advogados: JSON.stringify(
                pub.destinatario_advogados || pub.lawyers || [],
              ),
            });
            savedCount++;
          } catch (_) {
            /* skip invalid entries */
          }
        }

        const allPubs = await storage.getTramitacaoPublicacoes(200);
        res.json({ publicacoes: allPubs, synced: savedCount, source: "api" });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  app.patch(
    "/api/tramitacao/publicacoes/:id/lida",
    requireAuth,
    async (req, res) => {
      try {
        await storage.markPublicacaoLida(req.params.id, req.body.lida || "sim");
        res.json({ ok: true });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  app.post("/api/code/run", requireAuth, async (req, res) => {
    try {
      const { code, language } = req.body as { code: string; language: string };
      if (!code || !code.trim()) {
        return res.json({ output: "", error: "", executedCode: code || "" });
      }
      if (language === "python") {
        const { execFile } = await import("child_process");
        const { writeFileSync, unlinkSync, mkdtempSync } = await import("fs");
        const { join } = await import("path");
        const { tmpdir } = await import("os");
        const tmpDir = mkdtempSync(join(tmpdir(), "pyrun-"));
        const tmpFile = join(tmpDir, "script.py");
        writeFileSync(tmpFile, code, "utf-8");
        const result = await new Promise<{ output: string; error: string }>((resolve) => {
          const proc = execFile("python3", [tmpFile], { timeout: 30000, maxBuffer: 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8" } }, (err, stdout, stderr) => {
            try { unlinkSync(tmpFile); } catch {}
            if (err && (err as any).killed) {
              resolve({ output: "", error: "Tempo limite excedido (30s). Verifique loops infinitos." });
            } else if (err && !stdout && !stderr) {
              resolve({ output: "", error: err.message });
            } else {
              resolve({ output: stdout || "(sem saída — use print() para ver resultados)", error: stderr || "" });
            }
          });
        });
        return res.json({ output: result.output, error: result.error, executedCode: code });
      }
      if (language === "javascript") {
        const { execFile } = await import("child_process");
        const { writeFileSync, unlinkSync, mkdtempSync } = await import("fs");
        const { join } = await import("path");
        const { tmpdir } = await import("os");
        const tmpDir = mkdtempSync(join(tmpdir(), "jsrun-"));
        const tmpFile = join(tmpDir, "script.js");
        writeFileSync(tmpFile, code, "utf-8");
        const result = await new Promise<{ output: string; error: string }>((resolve) => {
          execFile("node", [tmpFile], { timeout: 30000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            try { unlinkSync(tmpFile); } catch {}
            if (err && (err as any).killed) {
              resolve({ output: "", error: "Tempo limite excedido (30s)." });
            } else if (err && !stdout && !stderr) {
              resolve({ output: "", error: err.message });
            } else {
              resolve({ output: stdout || "(sem saída — use console.log() para ver resultados)", error: stderr || "" });
            }
          });
        });
        return res.json({ output: result.output, error: result.error, executedCode: code });
      }
      res.status(400).json({ message: "Linguagem não suportada. Use python ou javascript." });
    } catch (e: any) {
      console.error("[code/run]", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/previdenciario/extrair", requireAuth, async (req, res) => {
    try {
      const { texto, tipo } = req.body as {
        texto: string;
        tipo: "cnis" | "carta";
      };
      if (!texto || !tipo)
        return res
          .status(400)
          .json({ message: "texto e tipo são obrigatórios" });

      const promptCnis = `Você é especialista em documentos previdenciários brasileiros. Analise o texto do CNIS abaixo e retorne APENAS um JSON válido, sem markdown, organizando todo texto adicional.

Formato exato:
{
  "dadosSegurado": { "nit": "", "cpf": "", "nome": "", "nascimento": "", "mae": "" },
  "periodosContribuicao": [
    { "dataInicial": "DD/MM/YYYY", "dataFinal": "DD/MM/YYYY", "descricao": "nome empresa", "naturezaVinculo": "EMPREGADO|CONTRIBUINTE_INDIVIDUAL|BENEFICIO_INCAPACIDADE|NAO_INFORMADO", "contarCarencia": true }
  ],
  "salarios": [
    { "competencia": "MM/YYYY", "valor": 0.00 }
  ]
}

TEXTO DO CNIS:
${texto.slice(0, 12000)}`;

      const promptCarta = `Você é especialista em documentos previdenciários brasileiros. Analise o texto da Carta de Concessão do INSS abaixo e retorne APENAS um JSON válido, sem markdown, sem texto adicional.

Formato exato:
{
  "numeroBeneficio": "",
  "especie": "",
  "codigoEspecie": "",
  "dib": "DD/MM/YYYY",
  "dip": "DD/MM/YYYY",
  "rmi": 0.00,
  "salarioBeneficio": 0.00,
  "coeficiente": "",
  "segurado": { "nome": "", "cpf": "", "nit": "" },
  "tempoContribuicao": "",
  "dataDespacho": "DD/MM/YYYY"
}

TEXTO DA CARTA:
${texto.slice(0, 12000)}`;

      const prompt = tipo === "cnis" ? promptCnis : promptCarta;
      const prevKey = ((await storage.getSetting("demo_api_key")) || "").trim();
      const prevUrl = ((await storage.getSetting("demo_api_url")) || "").trim();
      const prevModel = ((await storage.getSetting("demo_api_model")) || "").trim();
      let response: any;
      if (prevKey && prevUrl) {
        const prevRes = await fetch(`${prevUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${prevKey}` },
          body: JSON.stringify({ model: prevModel || "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], max_tokens: 8000, temperature: 0.1 }),
        });
        if (!prevRes.ok) throw new Error(`Erro API: ${prevRes.status}`);
        const prevJson = await prevRes.json() as any;
        const text = prevJson.choices?.[0]?.message?.content || "{}";
        response = { candidates: [{ content: { parts: [{ text }] } }] };
      } else {
        let prevClient = gemini;
        if (prevKey && !prevUrl) {
          prevClient = new GoogleGenAI({ apiKey: prevKey });
        }
        response = await prevClient.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { temperature: 0.1 },
        });
      }

      let raw = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      raw = raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(raw);
      res.json({ data, tipo });
    } catch (e: any) {
      console.error("[previdenciario/extrair]", e.message);
      res.status(500).json({ message: e.message });
    }
  });

  // ── Pesquisa pública OAB + DataJud ─────────────────────────────────────────

  app.get("/api/pesquisa/oab", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q || "").trim();
      const uf = String(req.query.uf || "").trim().toUpperCase();
      if (!q) return res.status(400).json({ message: "Parâmetro 'q' obrigatório" });

      // Tenta busca por inscrição (número) ou nome
      const url = `https://cna.oab.org.br/api/CNA/Search?nome=${encodeURIComponent(q)}${uf ? `&UF=${uf}` : ""}`;
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
          "Referer": "https://cna.oab.org.br/",
        },
      });

      if (!resp.ok) {
        return res.status(resp.status).json({ message: `OAB retornou status ${resp.status}` });
      }

      const text = await resp.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = []; }

      // A API da OAB retorna array ou objeto com Data
      const items = Array.isArray(data) ? data : (data?.Data || data?.data || []);
      res.json({ items });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/pesquisa/processo", requireAuth, async (req, res) => {
    try {
      const numero = String(req.query.numero || "").trim().replace(/\D/g, "");
      const tribunal = String(req.query.tribunal || "trf4").trim().toLowerCase();
      if (!numero) return res.status(400).json({ message: "Parâmetro 'numero' obrigatório" });

      const tribunaisMap: Record<string, string> = {
        trf1: "api_publica_trf1", trf2: "api_publica_trf2",
        trf3: "api_publica_trf3", trf4: "api_publica_trf4",
        trf5: "api_publica_trf5", trf6: "api_publica_trf6",
        tjmg: "api_publica_tjmg", tjsp: "api_publica_tjsp",
        tjrs: "api_publica_tjrs", tjpr: "api_publica_tjpr",
        tst: "api_publica_tst", stj: "api_publica_stj",
        stf: "api_publica_stf",
      };

      const apiName = tribunaisMap[tribunal] || `api_publica_${tribunal}`;
      const url = `https://api-publica.datajud.cnj.jus.br/${apiName}/_search`;

      const body = {
        query: { match: { "numeroProcesso.keyword": { query: numero.replace(/(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})/, "$1-$2.$3.$4.$5.$6") } } },
        size: 5,
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "APIKey cDZHYzlZa0JadVREZDJCendFbXNpMEswK0xqbGkzOVd1UT09",
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        return res.status(resp.status).json({ message: `DataJud retornou status ${resp.status}` });
      }

      const data: any = await resp.json();
      const hits = data?.hits?.hits?.map((h: any) => h._source) || [];
      res.json({ items: hits, total: data?.hits?.total?.value || 0 });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Robô DJEN ───────────────────────────────────────────────────────────────
  const djenModule = await import("./djen");

  app.get("/api/djen/config", requireAuth, async (_req, res) => {
    try {
      const config = await djenModule.getDjenConfig();
      res.json({
        ...config,
        emailSenha: config.emailSenha ? "••••••••" : "",
        pdpjPemKey: config.pdpjPemKey ? "••• (configurada)" : "",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/djen/config", requireAuth, async (req, res) => {
    try {
      const atual = await djenModule.getDjenConfig();
      const body = req.body as Record<string, any>;
      const novo = {
        ...atual,
        ...body,
        emailSenha: body.emailSenha === "••••••••" ? atual.emailSenha : (body.emailSenha || ""),
        pdpjPemKey: String(body.pdpjPemKey || "").startsWith("•••") ? atual.pdpjPemKey : (body.pdpjPemKey || ""),
      };
      await djenModule.saveDjenConfig(novo);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/djen/clientes", requireAuth, async (_req, res) => {
    try {
      res.json(await djenModule.listarClientes());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/djen/clientes", requireAuth, async (req, res) => {
    try {
      const { nomeCompleto, email, tratamento, nomeCaso, numeroProcesso } = req.body;
      if (!nomeCompleto || !numeroProcesso) {
        return res.status(400).json({ message: "Nome e número do processo são obrigatórios" });
      }
      const criado = await djenModule.criarCliente({ nomeCompleto, email, tratamento, nomeCaso, numeroProcesso });
      res.status(201).json(criado);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/djen/clientes/:id", requireAuth, async (req, res) => {
    try {
      await djenModule.deletarCliente(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/djen/publicacoes", requireAuth, async (_req, res) => {
    try {
      res.json(await djenModule.listarPublicacoes());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/djen/execucoes", requireAuth, async (_req, res) => {
    try {
      res.json(await djenModule.listarExecucoes());
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/djen/executar", requireAuth, async (_req, res) => {
    try {
      const resultado = await djenModule.executarRobo();
      res.json(resultado);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/djen/gerar-token", requireAuth, async (_req, res) => {
    try {
      const config = await djenModule.getDjenConfig();
      if (!config.pdpjPemKey || !config.advogadoCpf) {
        return res.status(400).json({ message: "Configure a chave PEM e o CPF antes de gerar o token." });
      }
      const token = await djenModule.gerarTokenPublico(config);
      res.json({ token });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ── Consulta Corporativo OAB ────────────────────────────────────────────────
  app.get("/api/corporativo/advogado/cpf/:cpf", requireAuth, async (req, res) => {
    try {
      const { cpf } = req.params;
      const r = await fetch(`https://cna.oab.org.br/api/advogados/cpf/${cpf}`, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return res.status(r.status).json({ found: false, message: "Erro ao consultar CNA/OAB", data: [] });
      }
      const json: any = await r.json();
      const items = Array.isArray(json) ? json : (json.data ?? json.items ?? (json.Nome ? [json] : []));
      return res.json({ found: items.length > 0, data: items });
    } catch (e: any) {
      return res.status(500).json({ found: false, message: e.message || "Erro interno", data: [] });
    }
  });

  app.get("/api/corporativo/advogado/oab/:uf/:numero", requireAuth, async (req, res) => {
    try {
      const { uf, numero } = req.params;
      const r = await fetch(`https://cna.oab.org.br/api/advogados/${uf}/${numero}`, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return res.status(r.status).json({ found: false, message: "Advogado não encontrado", data: null });
      }
      const json: any = await r.json();
      return res.json({ found: true, data: json });
    } catch (e: any) {
      return res.status(500).json({ found: false, message: e.message || "Erro interno", data: null });
    }
  });

  app.get("/api/corporativo/magistrados/:tribunal", requireAuth, async (req, res) => {
    try {
      const { tribunal } = req.params;
      const r = await fetch(`https://www.cnj.jus.br/scp/consulta.do?tipoConsulta=magistrados&tribunal=${encodeURIComponent(tribunal)}`, {
        headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        return res.json({ found: false, data: [], message: "Tribunal não encontrado ou sem dados" });
      }
      const json: any = await r.json().catch(() => null);
      const items = Array.isArray(json) ? json : (json?.data ?? json?.items ?? []);
      return res.json({ found: items.length > 0, data: items });
    } catch (e: any) {
      return res.status(500).json({ found: false, message: e.message || "Erro interno", data: [] });
    }
  });

  app.post("/api/code-assistant", async (req, res) => {
    try {
      const { message, history, apiKey, apiUrl, apiModel } = req.body;
      if (!message) {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
      }

      const systemPrompt = `Você é um assistente inteligente versátil. Responda com precisão, clareza e profundidade.

REGRAS:
1. Responda de forma completa e direta — nunca corte a resposta no meio
2. Quando gerar código, use boas práticas e retorne o código INTEIRO e funcional
3. Responda em português, salvo se o usuário escrever em outro idioma
4. Adapte o tom: técnico para perguntas técnicas, conversacional para perguntas gerais
5. Se não entender o pedido, peça esclarecimento
6. Não há restrição de assunto — responda perguntas jurídicas, técnicas, gerais, pesquisa ou qualquer tema`;

      const msgs: Array<{ role: string; content: string }> = [
        { role: "system", content: systemPrompt },
      ];

      if (Array.isArray(history)) {
        for (const h of history) {
          const c = (h.content || "").trim();
          if (c) msgs.push({ role: h.role === "assistant" ? "assistant" : "user", content: c });
        }
      }

      if (!msgs.some(m => m.role === "user" && m.content === message)) {
        msgs.push({ role: "user", content: message });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let cKey = sanitizeKey((apiKey as string) || "");

      if (!cKey) {
        console.log(`[Code Assistant] Sem chave — usando Gemini`);
        const geminiContents: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
        let firstUser = true;
        for (const m of msgs) {
          if (m.role === "system") continue;
          const role = m.role === "assistant" ? "model" as const : "user" as const;
          if (firstUser && role === "user") {
            geminiContents.push({ role: "user", parts: [{ text: m.content }] });
            firstUser = false;
          } else {
            geminiContents.push({ role, parts: [{ text: m.content }] });
          }
        }
        try {
          const geminiResult = await gemini.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: geminiContents,
            config: { maxOutputTokens: 32000, temperature: 0.3 },
          });
          for await (const chunk of geminiResult) {
            const t = chunk.text || "";
            if (t) res.write(`data: ${JSON.stringify({ text: t })}\n\n`);
          }
        } catch (gemErr: any) {
          console.error("[Code Assistant] Gemini error:", gemErr?.message);
          res.write(`data: ${JSON.stringify({ error: "Erro ao conectar com a IA. Configure uma chave de API nas Configurações para continuar." })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }

      const detectedCode = autoDetectProvider(cKey);
      // Prioridade: URL enviada pelo frontend → auto-detecção pela chave → fallback
      const resolvedUrl = (apiUrl && apiUrl.trim()) ? apiUrl.trim()
        : detectedCode?.url || "https://api.groq.com/openai/v1";
      const resolvedModel = (apiModel && apiModel.trim()) ? apiModel.trim()
        : detectedCode?.model || "llama-3.3-70b-versatile";

      // Valida que a URL bate com a chave (evita enviar chave do Groq para o Perplexity, etc.)
      const keyMatchesUrl = detectedCode && resolvedUrl && resolvedUrl.includes(new URL(detectedCode.url).hostname);
      const urlMismatch = detectedCode && resolvedUrl && !keyMatchesUrl;
      const url = (urlMismatch ? detectedCode.url : resolvedUrl).replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");
      const model = (urlMismatch ? detectedCode.model : resolvedModel).trim();
      if (urlMismatch) {
        console.log(`[Code Assistant] Key/URL mismatch — using detected URL: ${detectedCode.url}`);
      }

      console.log(`[Code Assistant] URL: ${url}, Model: ${model}, Msg: "${message.substring(0, 80)}"`);

      const isGroq = url.includes("groq.com");
      const isPerplexityCA = url.includes("perplexity.ai");
      const maxToksCA = isGroq ? 32000 : isPerplexityCA ? 8000 : 65536;

      let apiRes = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
        body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: maxToksCA, temperature: 0.3 }),
      });

      if (!apiRes.ok) {
        const errTxt = await apiRes.text().catch(() => "");
        console.error("[Code Assistant] API Error:", apiRes.status, errTxt.substring(0, 300));
        if (errTxt.includes("max_tokens") || errTxt.includes("context_length") || errTxt.includes("context_window")) {
          apiRes = await fetch(`${url}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${cKey}` },
            body: JSON.stringify({ model, messages: msgs, stream: true, max_tokens: isPerplexityCA ? 4000 : 32000, temperature: 0.3 }),
          });
          if (!apiRes.ok) {
            const errTxt2 = await apiRes.text().catch(() => "");
            const friendlyMsg2 = apiRes.status === 401 ? "Chave de API inválida ou expirada. Gere uma nova chave no painel do provedor." : `Erro da API (${apiRes.status}): ${errTxt2.substring(0, 150)}`;
            res.write(`data: ${JSON.stringify({ error: friendlyMsg2 })}\n\n`);
            res.end();
            return;
          }
        } else if (apiRes.status === 401 || apiRes.status === 403) {
          console.log(`[Code Assistant] Chave inválida (${apiRes.status}) — usando Gemini`);
          res.write(`data: ${JSON.stringify({ text: "_⚠️ Chave inválida ou bloqueada — respondendo com Gemini._\n\n" })}\n\n`);
          const gmContents2: Array<{ role: "user" | "model"; parts: [{ text: string }] }> = [];
          let firstU2 = true;
          for (const m of msgs) {
            if (m.role === "system") continue;
            const role2 = m.role === "assistant" ? "model" as const : "user" as const;
            if (firstU2 && role2 === "user") {
              gmContents2.push({ role: "user", parts: [{ text: m.content }] });
              firstU2 = false;
            } else {
              gmContents2.push({ role: role2, parts: [{ text: m.content }] });
            }
          }
          try {
            const gmResult2 = await gemini.models.generateContentStream({
              model: "gemini-2.5-flash",
              contents: gmContents2,
              config: { maxOutputTokens: 32000, temperature: 0.3 },
            });
            for await (const chunk of gmResult2) {
              const t = chunk.text || "";
              if (t) res.write(`data: ${JSON.stringify({ text: t })}\n\n`);
            }
          } catch (gmErr2: any) {
            console.error("[Code Assistant] Gemini fallback error:", gmErr2?.message);
            res.write(`data: ${JSON.stringify({ error: "Chave inválida e Gemini também falhou. Verifique sua chave de API." })}\n\n`);
          }
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          res.end();
          return;
        } else {
          let friendlyMsg = `Erro da API (${apiRes.status}): ${errTxt.substring(0, 150)}`;
          if (apiRes.status === 429) friendlyMsg = "Limite de requisições atingido (429). Aguarde alguns segundos e tente novamente.";
          res.write(`data: ${JSON.stringify({ error: friendlyMsg })}\n\n`);
          res.end();
          return;
        }
      }

      const reader = apiRes.body as any;
      if (reader && typeof reader[Symbol.asyncIterator] === "function") {
        const decoder = new TextDecoder();
        let caBuf = "";
        let caCitations: string[] = [];
        for await (const chunk of reader) {
          caBuf += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
          const lines = caBuf.split("\n");
          caBuf = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content || "";
              if (delta) {
                res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
              }
              if (parsed?.citations && Array.isArray(parsed.citations) && parsed.citations.length > 0) {
                caCitations = parsed.citations;
              }
            } catch {}
          }
        }
        if (caCitations.length > 0) {
          res.write(`data: ${JSON.stringify({ citations: caCitations })}\n\n`);
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("[Code Assistant] Error:", error?.message);
      if (!res.headersSent) {
        res.status(500).json({ message: "Erro ao processar" });
      } else {
        res.write(`data: ${JSON.stringify({ error: error?.message || "Erro interno" })}\n\n`);
        res.end();
      }
    }
  });

  app.post("/api/git-push", async (_req, res) => {
    try {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);
      
      const result = await execAsync("git push origin main", { cwd: process.cwd() });
      res.json({ success: true, message: "Push ao GitHub realizado com sucesso!" });
    } catch (error: any) {
      console.error("Git push error:", error?.message);
      res.status(500).json({ success: false, message: `Erro ao fazer push: ${error?.message}` });
    }
  });

  return httpServer;
}
