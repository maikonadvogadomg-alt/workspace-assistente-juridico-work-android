// Interceptor de API para modo offline/APK
// Redireciona chamadas /api/ para localStorage + APIs diretas

import type { Snippet, CustomAction, Ementa, PromptTemplate, DocTemplate, AiHistory } from "@shared/schema";

// ── Storage helpers ─────────────────────────────────────────────────────────
function ls<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}
function lsSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function uid(): string { return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); }

// ── Responses helpers ───────────────────────────────────────────────────────
function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}
function emptyOk(): Response { return jsonRes({ ok: true }); }
function notFound(): Response { return jsonRes({ error: "Not found" }, 404); }

// ── AI Config (chaves salvas localmente) ────────────────────────────────────
type AiConfig = {
  gemini_api_key: string; openai_api_key: string; perplexity_api_key: string;
  demo_api_key: string; demo_api_url: string; demo_api_model: string; database_url: string;
};
const AI_CONFIG_KEY = "apk_ai_config";
function getAiConfig(): AiConfig {
  return ls(AI_CONFIG_KEY, {
    gemini_api_key: "", openai_api_key: "", perplexity_api_key: "",
    demo_api_key: "", demo_api_url: "", demo_api_model: "", database_url: "",
  });
}

// ── AI Chat direto ───────────────────────────────────────────────────────────
async function callAiDirect(body: {
  messages: Array<{ role: string; content: string }>;
  provider?: string; model?: string; systemPrompt?: string;
  action?: string; text?: string;
}): Promise<Response> {
  const cfg = getAiConfig();
  const provider = body.provider || "gemini";
  const messages = body.messages || [];
  const system = body.systemPrompt || "Você é um assistente jurídico especializado em direito brasileiro.";

  // Gemini
  if (provider === "gemini" && cfg.gemini_api_key) {
    try {
      const contents = messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cfg.gemini_api_key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents,
            generationConfig: { temperature: 0.7 },
          }),
        }
      );
      const d = await r.json();
      const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta.";
      return jsonRes({ result: text, provider: "gemini", model: "gemini-2.0-flash" });
    } catch (e) { return jsonRes({ error: String(e) }, 500); }
  }

  // OpenAI
  if ((provider === "openai" || provider === "gpt") && cfg.openai_api_key) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.openai_api_key}` },
        body: JSON.stringify({
          model: body.model || "gpt-4o-mini",
          messages: [{ role: "system", content: system }, ...messages],
          temperature: 0.7,
        }),
      });
      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content || "Sem resposta.";
      return jsonRes({ result: text, provider: "openai", model: body.model || "gpt-4o-mini" });
    } catch (e) { return jsonRes({ error: String(e) }, 500); }
  }

  // Perplexity
  if (provider === "perplexity" && cfg.perplexity_api_key) {
    try {
      const r = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.perplexity_api_key}` },
        body: JSON.stringify({
          model: body.model || "llama-3.1-sonar-large-128k-online",
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content || "Sem resposta.";
      return jsonRes({ result: text, provider: "perplexity", model: body.model || "llama-3.1-sonar-large-128k-online" });
    } catch (e) { return jsonRes({ error: String(e) }, 500); }
  }

  // Demo key / URL customizado
  if (cfg.demo_api_key && cfg.demo_api_url) {
    try {
      const r = await fetch(`${cfg.demo_api_url}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.demo_api_key}` },
        body: JSON.stringify({
          model: cfg.demo_api_model || "gpt-4o-mini",
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      const d = await r.json();
      const text = d?.choices?.[0]?.message?.content || "Sem resposta.";
      return jsonRes({ result: text, provider: "demo", model: cfg.demo_api_model });
    } catch (e) { return jsonRes({ error: String(e) }, 500); }
  }

  return jsonRes({
    error: "Nenhuma chave de API configurada. Vá em Configurações e adicione sua chave.",
    result: "⚠️ Configure sua chave de API em Configurações (ícone de engrenagem) para usar o assistente de IA.",
  }, 200);
}

// ── Snippets CRUD (localStorage) ─────────────────────────────────────────────
const SNIP_KEY = "apk_snippets";
function getSnippets(): Snippet[] { return ls(SNIP_KEY, []); }
function saveSnippets(s: Snippet[]) { lsSave(SNIP_KEY, s); }

function handleSnippets(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const idMatch = path.match(/\/api\/snippets\/([^/]+)/);
  const id = idMatch?.[1];
  const method = opts?.method?.toUpperCase() || "GET";

  if (method === "GET" && !id) {
    return jsonRes(getSnippets());
  }
  if (method === "POST" && !id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    const snip: Snippet = { id: uid(), title: data.title || "Sem título", html: data.html || "", css: data.css || "", js: data.js || "", mode: data.mode || "html" };
    const snips = [...getSnippets(), snip];
    saveSnippets(snips);
    return jsonRes(snip, 201);
  }
  if (method === "PATCH" && id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    const snips = getSnippets().map(s => s.id === id ? { ...s, ...data } : s);
    saveSnippets(snips);
    return jsonRes(snips.find(s => s.id === id) || {});
  }
  if (method === "DELETE" && id) {
    saveSnippets(getSnippets().filter(s => s.id !== id));
    return emptyOk();
  }
  return jsonRes(getSnippets());
}

// ── Custom Actions CRUD ───────────────────────────────────────────────────────
const CA_KEY = "apk_custom_actions";
function getCustomActions(): CustomAction[] { return ls(CA_KEY, []); }
function handleCustomActions(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const idMatch = path.match(/\/api\/custom-actions\/([^/]+)/);
  const id = idMatch?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = getCustomActions();

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item: CustomAction = { id: uid(), label: data.label || "", description: data.description || "", prompt: data.prompt || "" };
    lsSave(CA_KEY, [...items, item]);
    return jsonRes(item, 201);
  }
  if (method === "PATCH" && id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    items = items.map(i => i.id === id ? { ...i, ...data } : i);
    lsSave(CA_KEY, items);
    return jsonRes(items.find(i => i.id === id) || {});
  }
  if (method === "DELETE" && id) {
    lsSave(CA_KEY, items.filter(i => i.id !== id));
    return emptyOk();
  }
  return jsonRes(items);
}

// ── Ementas CRUD ──────────────────────────────────────────────────────────────
const EM_KEY = "apk_ementas";
function getEmentas(): Ementa[] { return ls(EM_KEY, []); }
function handleEmentas(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const id = path.match(/\/api\/ementas\/([^/]+)/)?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = getEmentas();

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item: Ementa = { id: uid(), titulo: data.titulo || "", categoria: data.categoria || "Geral", texto: data.texto || "" };
    lsSave(EM_KEY, [...items, item]);
    return jsonRes(item, 201);
  }
  if (method === "PATCH" && id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    items = items.map(i => i.id === id ? { ...i, ...data } : i);
    lsSave(EM_KEY, items);
    return jsonRes(items.find(i => i.id === id) || {});
  }
  if (method === "DELETE" && id) {
    lsSave(EM_KEY, items.filter(i => i.id !== id));
    return emptyOk();
  }
  return jsonRes(items);
}

// ── Prompt Templates CRUD ─────────────────────────────────────────────────────
const PT_KEY = "apk_prompt_templates";
function getPromptTemplates(): PromptTemplate[] { return ls(PT_KEY, []); }
function handlePromptTemplates(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const id = path.match(/\/api\/prompt-templates\/([^/]+)/)?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = getPromptTemplates();

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item: PromptTemplate = { id: uid(), titulo: data.titulo || "", categoria: data.categoria || "Geral", texto: data.texto || "" };
    lsSave(PT_KEY, [...items, item]);
    return jsonRes(item, 201);
  }
  if (method === "PATCH" && id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    items = items.map(i => i.id === id ? { ...i, ...data } : i);
    lsSave(PT_KEY, items);
    return jsonRes(items.find(i => i.id === id) || {});
  }
  if (method === "DELETE" && id) {
    lsSave(PT_KEY, items.filter(i => i.id !== id));
    return emptyOk();
  }
  return jsonRes(items);
}

// ── Doc Templates CRUD ────────────────────────────────────────────────────────
const DT_KEY = "apk_doc_templates";
function getDocTemplates(): DocTemplate[] { return ls(DT_KEY, []); }
function handleDocTemplates(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const id = path.match(/\/api\/doc-templates\/([^/]+)/)?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = getDocTemplates();

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item: DocTemplate = { id: uid(), titulo: data.titulo || "", categoria: data.categoria || "Geral", conteudo: data.conteudo || "", docxBase64: data.docxBase64 || null, docxFilename: data.docxFilename || null };
    lsSave(DT_KEY, [...items, item]);
    return jsonRes(item, 201);
  }
  if (method === "PATCH" && id) {
    const data = JSON.parse((opts?.body as string) || "{}");
    items = items.map(i => i.id === id ? { ...i, ...data } : i);
    lsSave(DT_KEY, items);
    return jsonRes(items.find(i => i.id === id) || {});
  }
  if (method === "DELETE" && id) {
    lsSave(DT_KEY, items.filter(i => i.id !== id));
    return emptyOk();
  }
  return jsonRes(items);
}

// ── AI History CRUD ───────────────────────────────────────────────────────────
const AH_KEY = "apk_ai_history";
function getAiHistory(): AiHistory[] { return ls(AH_KEY, []); }
function handleAiHistory(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const id = path.match(/\/api\/ai-history\/([^/]+)/)?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = getAiHistory();

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item: AiHistory = { id: uid(), createdAt: new Date(), ...data };
    const updated = [item, ...items].slice(0, 200);
    lsSave(AH_KEY, updated);
    return jsonRes(item, 201);
  }
  if (method === "DELETE" && id) {
    lsSave(AH_KEY, items.filter(i => i.id !== id));
    return emptyOk();
  }
  if (method === "DELETE" && !id) {
    lsSave(AH_KEY, []);
    return emptyOk();
  }
  return jsonRes(items);
}

// ── Processos ─────────────────────────────────────────────────────────────────
const PROC_KEY = "apk_processos";
function handleProcessos(url: string, opts: RequestInit | undefined): Response {
  const path = new URL(url, "http://x").pathname;
  const id = path.match(/\/api\/processos\/([^/]+)/)?.[1];
  const method = opts?.method?.toUpperCase() || "GET";
  let items = ls(PROC_KEY, []);

  if (method === "GET") return jsonRes(items);
  if (method === "POST") {
    const data = JSON.parse((opts?.body as string) || "{}");
    const item = { id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data };
    lsSave(PROC_KEY, [...items, item]);
    return jsonRes(item, 201);
  }
  if (method === "DELETE" && id) {
    lsSave(PROC_KEY, items.filter((i: { id: string }) => i.id !== id));
    return emptyOk();
  }
  return jsonRes(items);
}

// ── AI Usage ─────────────────────────────────────────────────────────────────
function getAiUsage(): Response {
  const history = getAiHistory();
  const totalCost = history.reduce((sum, h) => sum + (h.estimatedCost || 0), 0);
  return jsonRes({ totalCost, creditsRemaining: 999, unlimited: true });
}

// ── Interceptor Principal ──────────────────────────────────────────────────────
export function installOfflineApi() {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const opts = init || (input instanceof Request ? { method: (input as Request).method, body: (input as Request).body } : {});

    // Só interceptar /api/ relativo ou absoluto com /api/
    const isApi = url.startsWith("/api/") || url.includes("/api/");
    if (!isApi) return originalFetch(input, init);

    try {
      // Auth
      if (url.includes("/api/auth/check")) {
        return jsonRes({ authenticated: true, passwordRequired: false });
      }
      if (url.includes("/api/auth/login")) {
        return jsonRes({ ok: true, authenticated: true });
      }

      // Settings AI Config
      if (url.includes("/api/settings/ai-config")) {
        const method = opts?.method?.toUpperCase() || "GET";
        if (method === "POST" || method === "PUT") {
          const data = JSON.parse((opts?.body as string) || "{}");
          lsSave(AI_CONFIG_KEY, { ...getAiConfig(), ...data });
          return jsonRes({ ok: true });
        }
        return jsonRes(getAiConfig());
      }

      // System Status
      if (url.includes("/api/settings/system-status")) {
        const cfg = getAiConfig();
        return jsonRes({
          dbMode: "memory", hasDbUrl: false,
          hasGeminiKey: !!cfg.gemini_api_key,
          hasOpenAiKey: !!cfg.openai_api_key,
          hasPerplexityKey: !!cfg.perplexity_api_key,
          hasDemoKey: !!cfg.demo_api_key,
          hasAppPassword: false, hasSessionSecret: false,
        });
      }

      // Test AI Key
      if (url.includes("/api/settings/test-ai-key")) {
        const data = JSON.parse((opts?.body as string) || "{}");
        try {
          const res = await callAiDirect({
            messages: [{ role: "user", content: "Responda apenas: OK" }],
            provider: data.provider || "gemini",
          });
          const d = await res.json();
          return jsonRes({ ok: !d.error, message: d.error || "Chave funcionando!" });
        } catch (e) {
          return jsonRes({ ok: false, message: String(e) });
        }
      }

      // Settings misc
      if (url.includes("/api/settings/")) {
        return jsonRes({ ok: true });
      }

      // Demo key
      if (url.includes("/api/demo-key")) {
        return jsonRes({ available: false, configured: false });
      }

      // AI Usage / Credit
      if (url.includes("/api/ai-usage")) {
        return getAiUsage();
      }

      // AI Chat / Process / Refine
      if (url.includes("/api/ai/process") || url.includes("/api/ai/refine") ||
          url.includes("/api/ai/chat") || url.includes("/api/ai/")) {
        const data = JSON.parse((opts?.body as string) || "{}");
        return callAiDirect({
          messages: data.messages || [{ role: "user", content: data.text || data.input || "" }],
          provider: data.provider,
          model: data.model,
          systemPrompt: data.systemPrompt,
        });
      }

      // Code / Python execution
      if (url.includes("/api/code") || url.includes("/api/code-assistant")) {
        const data = JSON.parse((opts?.body as string) || "{}");
        return callAiDirect({
          messages: [{ role: "user", content: data.code || data.input || "" }],
          provider: "gemini",
          systemPrompt: "Execute o código Python/JavaScript e retorne o resultado. Se for Python, simule a saída como se estivesse executando.",
        });
      }

      // Snippets
      if (url.includes("/api/snippets")) {
        return handleSnippets(url, opts);
      }

      // Custom Actions
      if (url.includes("/api/custom-actions")) {
        return handleCustomActions(url, opts);
      }

      // Ementas
      if (url.includes("/api/ementas")) {
        return handleEmentas(url, opts);
      }

      // Prompt Templates
      if (url.includes("/api/prompt-templates")) {
        return handlePromptTemplates(url, opts);
      }

      // Doc Templates
      if (url.includes("/api/doc-templates")) {
        return handleDocTemplates(url, opts);
      }

      // AI History
      if (url.includes("/api/ai-history")) {
        return handleAiHistory(url, opts);
      }

      // Processos Monitorados
      if (url.includes("/api/processos")) {
        return handleProcessos(url, opts);
      }

      // JWT / Token
      if (url.includes("/api/jwt") || url.includes("/api/token")) {
        return jsonRes({ token: "", message: "Não disponível no modo offline." });
      }

      // Tramitação
      if (url.includes("/api/tramitacao")) {
        return jsonRes([]);
      }

      // DJEN
      if (url.includes("/api/djen")) {
        return jsonRes({ ok: false, message: "Não disponível no modo offline." });
      }

      // Jurisprudência (requer internet + chaves de API externas)
      if (url.includes("/api/jurisprudencia")) {
        return jsonRes({ results: [], message: "Busca online não disponível offline." });
      }

      // DataJud / PDPJ / CNJ
      if (url.includes("/api/datajud") || url.includes("/api/pdpj") || url.includes("/api/cnj")) {
        return jsonRes({ error: "API externa não disponível offline.", data: null });
      }

      // Previdenciário
      if (url.includes("/api/previdenciario")) {
        const data = JSON.parse((opts?.body as string) || "{}");
        return callAiDirect({
          messages: [{ role: "user", content: `Analise os dados previdenciários: ${data.text || ""}` }],
          systemPrompt: "Você é especialista em direito previdenciário brasileiro. Analise os dados e forneça informações relevantes.",
        });
      }

      // Git push (playground)
      if (url.includes("/api/git-push")) {
        return jsonRes({ ok: false, message: "Use o Playground para GitHub." });
      }

      // Upload extract-text — processado localmente na página, não chega aqui
      if (url.includes("/api/upload/extract-text")) {
        return jsonRes({ error: "Processamento local ativo — use a extração direta no app." }, 501);
      }

      // Import URL
      if (url.includes("/api/import/url")) {
        return jsonRes({ content: "", message: "Import via URL não disponível offline." });
      }

      // Export Word
      if (url.includes("/api/export/")) {
        return jsonRes({ error: "Export direto não disponível offline. Copie o texto e cole no Word." }, 501);
      }

      // TTS / Voice
      if (url.includes("/api/tts") || url.includes("/api/voice")) {
        return jsonRes({ error: "Voz não disponível no APK offline." }, 501);
      }

      // Fallback — retorna vazio para não quebrar
      console.warn("[offline-api] Endpoint não mapeado:", url);
      return jsonRes([]);

    } catch (err) {
      console.error("[offline-api] Erro:", err);
      return jsonRes({ error: String(err) }, 500);
    }
  };
}
