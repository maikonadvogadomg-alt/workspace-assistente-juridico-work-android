import { type User, type InsertUser, type Snippet, type InsertSnippet, type CustomAction, type InsertCustomAction, type Ementa, type InsertEmenta, type AiHistory, type InsertAiHistory, type PromptTemplate, type InsertPromptTemplate, type DocTemplate, type InsertDocTemplate, type SharedParecer, type ProcessoMonitorado, type InsertProcessoMonitorado, type AppSetting, type TramitacaoPublicacao, users, snippets, customActions, ementas, aiHistory, promptTemplates, docTemplates, sharedPareceres, processosMonitorados, appSettings, tramitacaoPublicacoes } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, desc } from "drizzle-orm";
import pg from "pg";
import { getLocalConfig, setLocalConfig, isAiKey, type LocalConfig } from "./local-config";

let pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

export let db = drizzle(pool);

export async function reconnectDb(newUrl: string): Promise<void> {
  process.env.DATABASE_URL = newUrl;
  try { await pool.end(); } catch {}
  pool = new pg.Pool({ connectionString: newUrl, connectionTimeoutMillis: 8000 });
  db = drizzle(pool);
  _dbAvailable = null;
  _backend = new DatabaseStorage();
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getSnippets(): Promise<Snippet[]>;
  getSnippet(id: string): Promise<Snippet | undefined>;
  createSnippet(snippet: InsertSnippet): Promise<Snippet>;
  updateSnippetTitle(id: string, title: string): Promise<Snippet | undefined>;
  deleteSnippet(id: string): Promise<void>;
  getCustomActions(): Promise<CustomAction[]>;
  getCustomAction(id: string): Promise<CustomAction | undefined>;
  createCustomAction(action: InsertCustomAction): Promise<CustomAction>;
  updateCustomAction(id: string, action: InsertCustomAction): Promise<CustomAction | undefined>;
  deleteCustomAction(id: string): Promise<void>;
  getEmentas(): Promise<Ementa[]>;
  getEmenta(id: string): Promise<Ementa | undefined>;
  createEmenta(ementa: InsertEmenta): Promise<Ementa>;
  updateEmenta(id: string, ementa: InsertEmenta): Promise<Ementa | undefined>;
  deleteEmenta(id: string): Promise<void>;
  getAiHistory(): Promise<AiHistory[]>;
  createAiHistory(entry: InsertAiHistory): Promise<AiHistory>;
  deleteAiHistory(id: string): Promise<void>;
  clearAiHistory(): Promise<void>;
  getPromptTemplates(): Promise<PromptTemplate[]>;
  getPromptTemplate(id: string): Promise<PromptTemplate | undefined>;
  createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(id: string, template: InsertPromptTemplate): Promise<PromptTemplate | undefined>;
  deletePromptTemplate(id: string): Promise<void>;
  getDocTemplates(): Promise<DocTemplate[]>;
  getDocTemplate(id: string): Promise<DocTemplate | undefined>;
  createDocTemplate(template: InsertDocTemplate): Promise<DocTemplate>;
  updateDocTemplate(id: string, template: InsertDocTemplate): Promise<DocTemplate | undefined>;
  deleteDocTemplate(id: string): Promise<void>;
  getSharedParecer(id: string): Promise<SharedParecer | undefined>;
  createSharedParecer(id: string, html: string, processo: string): Promise<SharedParecer>;
  getProcessosMonitorados(): Promise<ProcessoMonitorado[]>;
  getProcessoMonitorado(id: string): Promise<ProcessoMonitorado | undefined>;
  createProcessoMonitorado(p: InsertProcessoMonitorado): Promise<ProcessoMonitorado>;
  updateProcessoMonitorado(id: string, data: Partial<InsertProcessoMonitorado>): Promise<ProcessoMonitorado | undefined>;
  deleteProcessoMonitorado(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getSnippets(): Promise<Snippet[]> {
    return db.select().from(snippets);
  }

  async getSnippet(id: string): Promise<Snippet | undefined> {
    const [snippet] = await db.select().from(snippets).where(eq(snippets.id, id));
    return snippet;
  }

  async createSnippet(insertSnippet: InsertSnippet): Promise<Snippet> {
    const [snippet] = await db.insert(snippets).values(insertSnippet).returning();
    return snippet;
  }

  async updateSnippetTitle(id: string, title: string): Promise<Snippet | undefined> {
    const [snippet] = await db.update(snippets).set({ title }).where(eq(snippets.id, id)).returning();
    return snippet;
  }

  async deleteSnippet(id: string): Promise<void> {
    await db.delete(snippets).where(eq(snippets.id, id));
  }

  async getCustomActions(): Promise<CustomAction[]> {
    return db.select().from(customActions);
  }

  async getCustomAction(id: string): Promise<CustomAction | undefined> {
    const [action] = await db.select().from(customActions).where(eq(customActions.id, id));
    return action;
  }

  async createCustomAction(action: InsertCustomAction): Promise<CustomAction> {
    const [created] = await db.insert(customActions).values(action).returning();
    return created;
  }

  async updateCustomAction(id: string, action: InsertCustomAction): Promise<CustomAction | undefined> {
    const [updated] = await db.update(customActions).set(action).where(eq(customActions.id, id)).returning();
    return updated;
  }

  async deleteCustomAction(id: string): Promise<void> {
    await db.delete(customActions).where(eq(customActions.id, id));
  }

  async getEmentas(): Promise<Ementa[]> {
    return db.select().from(ementas);
  }

  async getEmenta(id: string): Promise<Ementa | undefined> {
    const [ementa] = await db.select().from(ementas).where(eq(ementas.id, id));
    return ementa;
  }

  async createEmenta(ementa: InsertEmenta): Promise<Ementa> {
    const [created] = await db.insert(ementas).values(ementa).returning();
    return created;
  }

  async updateEmenta(id: string, ementa: InsertEmenta): Promise<Ementa | undefined> {
    const [updated] = await db.update(ementas).set(ementa).where(eq(ementas.id, id)).returning();
    return updated;
  }

  async deleteEmenta(id: string): Promise<void> {
    await db.delete(ementas).where(eq(ementas.id, id));
  }

  async getAiHistory(): Promise<AiHistory[]> {
    return db.select().from(aiHistory).orderBy(desc(aiHistory.createdAt));
  }

  async createAiHistory(entry: InsertAiHistory): Promise<AiHistory> {
    const [created] = await db.insert(aiHistory).values(entry).returning();
    return created;
  }

  async deleteAiHistory(id: string): Promise<void> {
    await db.delete(aiHistory).where(eq(aiHistory.id, id));
  }

  async clearAiHistory(): Promise<void> {
    await db.delete(aiHistory);
  }

  async getPromptTemplates(): Promise<PromptTemplate[]> {
    return db.select().from(promptTemplates);
  }

  async getPromptTemplate(id: string): Promise<PromptTemplate | undefined> {
    const [template] = await db.select().from(promptTemplates).where(eq(promptTemplates.id, id));
    return template;
  }

  async createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate> {
    const [created] = await db.insert(promptTemplates).values(template).returning();
    return created;
  }

  async updatePromptTemplate(id: string, template: InsertPromptTemplate): Promise<PromptTemplate | undefined> {
    const [updated] = await db.update(promptTemplates).set(template).where(eq(promptTemplates.id, id)).returning();
    return updated;
  }

  async deletePromptTemplate(id: string): Promise<void> {
    await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  }

  async getDocTemplates(): Promise<DocTemplate[]> {
    return db.select().from(docTemplates);
  }

  async getDocTemplate(id: string): Promise<DocTemplate | undefined> {
    const [template] = await db.select().from(docTemplates).where(eq(docTemplates.id, id));
    return template;
  }

  async createDocTemplate(template: InsertDocTemplate): Promise<DocTemplate> {
    const [created] = await db.insert(docTemplates).values(template).returning();
    return created;
  }

  async updateDocTemplate(id: string, template: InsertDocTemplate): Promise<DocTemplate | undefined> {
    const [updated] = await db.update(docTemplates).set(template).where(eq(docTemplates.id, id)).returning();
    return updated;
  }

  async deleteDocTemplate(id: string): Promise<void> {
    await db.delete(docTemplates).where(eq(docTemplates.id, id));
  }

  async getSharedParecer(id: string): Promise<SharedParecer | undefined> {
    const [parecer] = await db.select().from(sharedPareceres).where(eq(sharedPareceres.id, id));
    return parecer;
  }

  async createSharedParecer(id: string, html: string, processo: string): Promise<SharedParecer> {
    const [created] = await db.insert(sharedPareceres).values({ id, html, processo }).returning();
    return created;
  }

  async getProcessosMonitorados(): Promise<ProcessoMonitorado[]> {
    return db.select().from(processosMonitorados).orderBy(desc(processosMonitorados.updatedAt));
  }

  async getProcessoMonitorado(id: string): Promise<ProcessoMonitorado | undefined> {
    const [p] = await db.select().from(processosMonitorados).where(eq(processosMonitorados.id, id));
    return p;
  }

  async createProcessoMonitorado(p: InsertProcessoMonitorado): Promise<ProcessoMonitorado> {
    const [created] = await db.insert(processosMonitorados).values(p).returning();
    return created;
  }

  async updateProcessoMonitorado(id: string, data: Partial<InsertProcessoMonitorado>): Promise<ProcessoMonitorado | undefined> {
    const [updated] = await db.update(processosMonitorados).set({ ...data, updatedAt: new Date() }).where(eq(processosMonitorados.id, id)).returning();
    return updated;
  }

  async deleteProcessoMonitorado(id: string): Promise<void> {
    await db.delete(processosMonitorados).where(eq(processosMonitorados.id, id));
  }

  async getSetting(key: string): Promise<string | null> {
    if (isAiKey(key)) {
      const local = getLocalConfig(key as keyof LocalConfig);
      if (local) return local;
    }
    try {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
      return row?.value ?? null;
    } catch {
      return getLocalConfig(key as keyof LocalConfig);
    }
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (isAiKey(key)) {
      setLocalConfig(key as keyof LocalConfig, value);
    }
    try {
      await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: new Date() },
      });
    } catch {
      if (!isAiKey(key)) throw new Error("Banco de dados indisponível. Configure a URL do banco nas Configurações.");
    }
  }

  async getTramitacaoPublicacoes(limit = 100): Promise<TramitacaoPublicacao[]> {
    return db.select().from(tramitacaoPublicacoes).orderBy(desc(tramitacaoPublicacoes.createdAt)).limit(limit);
  }

  async upsertTramitacaoPublicacao(data: {
    extId: string;
    idempotencyKey?: string;
    numeroProcesso: string;
    numeroProcessoMascara: string;
    tribunal: string;
    orgao: string;
    classe: string;
    texto: string;
    disponibilizacaoDate: string;
    publicacaoDate: string;
    inicioPrazoDate: string;
    linkTramitacao: string;
    linkTribunal: string;
    destinatarios: string;
    advogados: string;
  }): Promise<TramitacaoPublicacao> {
    const [created] = await db.insert(tramitacaoPublicacoes).values(data).onConflictDoNothing().returning();
    if (created) return created;
    const [existing] = await db.select().from(tramitacaoPublicacoes).where(eq(tramitacaoPublicacoes.extId, data.extId));
    return existing;
  }

  async markPublicacaoLida(id: string, lida: string): Promise<void> {
    await db.update(tramitacaoPublicacoes).set({ lida }).where(eq(tramitacaoPublicacoes.id, id));
  }
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

export class MemoryStorage implements IStorage {
  private _users: User[] = [];
  private _snippets: Snippet[] = [];
  private _actions: CustomAction[] = [];
  private _ementas: Ementa[] = [];
  private _history: AiHistory[] = [];
  private _prompts: PromptTemplate[] = [];
  private _docs: DocTemplate[] = [];
  private _pareceres: SharedParecer[] = [];
  private _processos: ProcessoMonitorado[] = [];
  private _tramitacao: TramitacaoPublicacao[] = [];

  async getUser(id: string) { return this._users.find(u => u.id === id); }
  async getUserByUsername(u: string) { return this._users.find(x => x.username === u); }
  async createUser(u: InsertUser): Promise<User> {
    const r = { id: uid(), ...u } as User;
    this._users.push(r); return r;
  }

  async getSnippets() { return [...this._snippets]; }
  async getSnippet(id: string) { return this._snippets.find(s => s.id === id); }
  async createSnippet(s: InsertSnippet): Promise<Snippet> {
    const r = { id: uid(), title: "Untitled", mode: "html", html: "", css: "", js: "", ...s } as Snippet;
    this._snippets.push(r); return r;
  }
  async updateSnippetTitle(id: string, title: string) {
    const s = this._snippets.find(x => x.id === id);
    if (s) s.title = title; return s;
  }
  async deleteSnippet(id: string) { this._snippets = this._snippets.filter(s => s.id !== id); }

  async getCustomActions() { return [...this._actions]; }
  async getCustomAction(id: string) { return this._actions.find(a => a.id === id); }
  async createCustomAction(a: InsertCustomAction): Promise<CustomAction> {
    const r = { id: uid(), label: "", description: "", prompt: "", ...a } as CustomAction;
    this._actions.push(r); return r;
  }
  async updateCustomAction(id: string, a: InsertCustomAction) {
    const i = this._actions.findIndex(x => x.id === id);
    if (i >= 0) { this._actions[i] = { ...this._actions[i], ...a }; return this._actions[i]; }
    return undefined;
  }
  async deleteCustomAction(id: string) { this._actions = this._actions.filter(a => a.id !== id); }

  async getEmentas() { return [...this._ementas]; }
  async getEmenta(id: string) { return this._ementas.find(e => e.id === id); }
  async createEmenta(e: InsertEmenta): Promise<Ementa> {
    const r = { id: uid(), categoria: "Geral", titulo: "", texto: "", ...e } as Ementa;
    this._ementas.push(r); return r;
  }
  async updateEmenta(id: string, e: InsertEmenta) {
    const i = this._ementas.findIndex(x => x.id === id);
    if (i >= 0) { this._ementas[i] = { ...this._ementas[i], ...e }; return this._ementas[i]; }
    return undefined;
  }
  async deleteEmenta(id: string) { this._ementas = this._ementas.filter(e => e.id !== id); }

  async getAiHistory() { return [...this._history].reverse().slice(0, 200); }
  async createAiHistory(e: InsertAiHistory): Promise<AiHistory> {
    const r = { id: uid(), createdAt: new Date(), model: "", provider: "", inputTokens: 0, outputTokens: 0, estimatedCost: 0, inputPreview: "", chatHistory: [], ...e } as AiHistory;
    this._history.push(r); return r;
  }
  async deleteAiHistory(id: string) { this._history = this._history.filter(h => h.id !== id); }
  async clearAiHistory() { this._history = []; }

  async getPromptTemplates() { return [...this._prompts]; }
  async getPromptTemplate(id: string) { return this._prompts.find(p => p.id === id); }
  async createPromptTemplate(t: InsertPromptTemplate): Promise<PromptTemplate> {
    const r = { id: uid(), categoria: "Geral", titulo: "", texto: "", ...t } as PromptTemplate;
    this._prompts.push(r); return r;
  }
  async updatePromptTemplate(id: string, t: InsertPromptTemplate) {
    const i = this._prompts.findIndex(x => x.id === id);
    if (i >= 0) { this._prompts[i] = { ...this._prompts[i], ...t }; return this._prompts[i]; }
    return undefined;
  }
  async deletePromptTemplate(id: string) { this._prompts = this._prompts.filter(p => p.id !== id); }

  async getDocTemplates() { return [...this._docs]; }
  async getDocTemplate(id: string) { return this._docs.find(d => d.id === id); }
  async createDocTemplate(t: InsertDocTemplate): Promise<DocTemplate> {
    const r = { id: uid(), categoria: "Geral", titulo: "", conteudo: "", docxBase64: null, docxFilename: null, ...t } as DocTemplate;
    this._docs.push(r); return r;
  }
  async updateDocTemplate(id: string, t: InsertDocTemplate) {
    const i = this._docs.findIndex(x => x.id === id);
    if (i >= 0) { this._docs[i] = { ...this._docs[i], ...t }; return this._docs[i]; }
    return undefined;
  }
  async deleteDocTemplate(id: string) { this._docs = this._docs.filter(d => d.id !== id); }

  async getSharedParecer(id: string) { return this._pareceres.find(p => p.id === id); }
  async createSharedParecer(id: string, html: string, processo: string): Promise<SharedParecer> {
    const r = { id, html, processo, createdAt: new Date() } as SharedParecer;
    this._pareceres.push(r); return r;
  }

  async getProcessosMonitorados() { return [...this._processos]; }
  async getProcessoMonitorado(id: string) { return this._processos.find(p => p.id === id); }
  async createProcessoMonitorado(p: InsertProcessoMonitorado): Promise<ProcessoMonitorado> {
    const r = { id: uid(), apelido: "", classe: "", orgaoJulgador: "", dataAjuizamento: "", ultimaMovimentacao: "", ultimaMovimentacaoData: "", assuntos: "", status: "ativo", createdAt: new Date(), updatedAt: new Date(), ...p } as ProcessoMonitorado;
    this._processos.push(r); return r;
  }
  async updateProcessoMonitorado(id: string, data: Partial<InsertProcessoMonitorado>) {
    const i = this._processos.findIndex(x => x.id === id);
    if (i >= 0) { this._processos[i] = { ...this._processos[i], ...data, updatedAt: new Date() }; return this._processos[i]; }
    return undefined;
  }
  async deleteProcessoMonitorado(id: string) { this._processos = this._processos.filter(p => p.id !== id); }

  async getSetting(key: string): Promise<string | null> {
    return getLocalConfig(key as any) || null;
  }
  async setSetting(key: string, value: string): Promise<void> {
    if (isAiKey(key)) setLocalConfig(key as any, value);
  }

  async getTramitacaoPublicacoes(limit = 100) { return this._tramitacao.slice(0, limit); }
  async upsertTramitacaoPublicacao(data: any): Promise<TramitacaoPublicacao> {
    const existing = this._tramitacao.find(t => t.extId === data.extId);
    if (existing) return existing;
    const r = { id: uid(), lida: "nao", createdAt: new Date(), idempotencyKey: null, ...data } as TramitacaoPublicacao;
    this._tramitacao.push(r); return r;
  }
  async markPublicacaoLida(id: string, lida: string) {
    const t = this._tramitacao.find(x => x.id === id);
    if (t) t.lida = lida;
  }
}

let _dbAvailable: boolean | null = null;
let _backend: DatabaseStorage | MemoryStorage = new DatabaseStorage();

export async function checkDbAndInitStorage(): Promise<boolean> {
  if (_dbAvailable !== null) return _dbAvailable;
  try {
    const client = await pool.connect();
    client.release();
    _dbAvailable = true;
    console.log("[storage] Banco de dados conectado — usando PostgreSQL");
  } catch (e: any) {
    _dbAvailable = false;
    _backend = new MemoryStorage();
    console.warn("[storage] Banco indisponível — usando memória. Configure o banco na tela de Configurações.");
  }
  return _dbAvailable;
}

export const storage = new Proxy({} as any, {
  get(_t, prop) {
    return (_backend as any)[prop].bind(_backend);
  },
});
