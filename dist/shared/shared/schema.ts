// Stub de tipos para build offline — sem drizzle-orm
export type User = { id: string; username: string; password: string };
export type InsertUser = Omit<User, "id">;

export type Snippet = {
  id: string; title: string; html: string; css: string; js: string; mode: string;
};
export type InsertSnippet = Omit<Snippet, "id">;

export type CustomAction = {
  id: string; label: string; description: string; prompt: string;
};
export type InsertCustomAction = Omit<CustomAction, "id">;

export type Ementa = { id: string; titulo: string; categoria: string; texto: string };
export type InsertEmenta = Omit<Ementa, "id">;

export type AiHistory = {
  id: string; action: string; inputPreview: string; result: string;
  model: string | null; provider: string | null;
  inputTokens: number | null; outputTokens: number | null;
  estimatedCost: number | null;
  chatHistory: Array<{ role: string; content: string }> | null;
  createdAt: Date;
};
export type InsertAiHistory = Omit<AiHistory, "id" | "createdAt">;

export type PromptTemplate = { id: string; titulo: string; categoria: string; texto: string };
export type InsertPromptTemplate = Omit<PromptTemplate, "id">;

export type DocTemplate = {
  id: string; titulo: string; categoria: string; conteudo: string;
  docxBase64: string | null; docxFilename: string | null;
};
export type InsertDocTemplate = Omit<DocTemplate, "id">;

export type SharedParecer = { id: string; html: string; processo: string; createdAt: Date };
export type ProcessoMonitorado = {
  id: string; numero: string; tribunal: string; apelido: string;
  classe: string; orgaoJulgador: string; dataAjuizamento: string;
  ultimaMovimentacao: string; ultimaMovimentacaoData: string;
  assuntos: string; status: string; createdAt: Date; updatedAt: Date;
};
export type InsertProcessoMonitorado = Omit<ProcessoMonitorado, "id" | "createdAt" | "updatedAt">;

export type AppSetting = { key: string; value: string; updatedAt: Date };
export type TramitacaoPublicacao = {
  id: string; extId: string; idempotencyKey: string | null;
  numeroProcesso: string; numeroProcessoMascara: string;
  tribunal: string; orgao: string; classe: string; texto: string;
  disponibilizacaoDate: string; publicacaoDate: string;
  inicioPrazoDate: string; linkTramitacao: string; linkTribunal: string;
  destinatarios: string; advogados: string; lida: string; createdAt: Date;
};

export type DjenCliente = {
  id: string; nomeCompleto: string; email: string; tratamento: string;
  nomeCaso: string; numeroProcesso: string; createdAt: Date;
};
export type InsertDjenCliente = Omit<DjenCliente, "id" | "createdAt">;

export type DjenPublicacao = {
  id: string; execucaoId: string; numeroProcesso: string; texto: string;
  inicioSessao: string; fimSessao: string; prazoOral: string;
  linkDocumento: string; clienteId: string; clienteNome: string;
  emailStatus: string; createdAt: Date;
};

export type DjenExecucao = {
  id: string; status: string; totalPublicacoes: string;
  processadas: string; comErro: string; ignoradas: string;
  log: string; createdAt: Date;
};

export type Conversation = { id: number; title: string; createdAt: Date };
export type Message = { id: number; conversationId: number; role: string; content: string; createdAt: Date };
