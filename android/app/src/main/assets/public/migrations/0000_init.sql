CREATE TABLE "ai_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"input_preview" text DEFAULT '' NOT NULL,
	"result" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_actions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prompt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "djen_clientes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome_completo" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"tratamento" text DEFAULT '' NOT NULL,
	"nome_caso" text DEFAULT '' NOT NULL,
	"numero_processo" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "djen_execucoes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT 'executando' NOT NULL,
	"total_publicacoes" text DEFAULT '0' NOT NULL,
	"processadas" text DEFAULT '0' NOT NULL,
	"com_erro" text DEFAULT '0' NOT NULL,
	"ignoradas" text DEFAULT '0' NOT NULL,
	"log" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "djen_publicacoes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execucao_id" text DEFAULT '' NOT NULL,
	"numero_processo" text NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"inicio_sessao" text DEFAULT '' NOT NULL,
	"fim_sessao" text DEFAULT '' NOT NULL,
	"prazo_oral" text DEFAULT '' NOT NULL,
	"link_documento" text DEFAULT '' NOT NULL,
	"cliente_id" text DEFAULT '' NOT NULL,
	"cliente_nome" text DEFAULT '' NOT NULL,
	"email_status" text DEFAULT 'nao_enviado' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"categoria" text DEFAULT 'Geral' NOT NULL,
	"conteudo" text NOT NULL,
	"docx_base64" text,
	"docx_filename" text
);
--> statement-breakpoint
CREATE TABLE "ementas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"categoria" text DEFAULT 'Geral' NOT NULL,
	"texto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processos_monitorados" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" text NOT NULL,
	"tribunal" text NOT NULL,
	"apelido" text DEFAULT '' NOT NULL,
	"classe" text DEFAULT '' NOT NULL,
	"orgao_julgador" text DEFAULT '' NOT NULL,
	"data_ajuizamento" text DEFAULT '' NOT NULL,
	"ultima_movimentacao" text DEFAULT '' NOT NULL,
	"ultima_movimentacao_data" text DEFAULT '' NOT NULL,
	"assuntos" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"categoria" text DEFAULT 'Geral' NOT NULL,
	"texto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_pareceres" (
	"id" varchar PRIMARY KEY NOT NULL,
	"html" text NOT NULL,
	"processo" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snippets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"html" text DEFAULT '' NOT NULL,
	"css" text DEFAULT '' NOT NULL,
	"js" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'html' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tramitacao_publicacoes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ext_id" text NOT NULL,
	"idempotency_key" text,
	"numero_processo" text DEFAULT '' NOT NULL,
	"numero_processo_mascara" text DEFAULT '' NOT NULL,
	"tribunal" text DEFAULT '' NOT NULL,
	"orgao" text DEFAULT '' NOT NULL,
	"classe" text DEFAULT '' NOT NULL,
	"texto" text DEFAULT '' NOT NULL,
	"disponibilizacao_date" text DEFAULT '' NOT NULL,
	"publicacao_date" text DEFAULT '' NOT NULL,
	"inicio_prazo_date" text DEFAULT '' NOT NULL,
	"link_tramitacao" text DEFAULT '' NOT NULL,
	"link_tribunal" text DEFAULT '' NOT NULL,
	"destinatarios" text DEFAULT '[]' NOT NULL,
	"advogados" text DEFAULT '[]' NOT NULL,
	"lida" text DEFAULT 'nao' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tramitacao_publicacoes_ext_id_unique" UNIQUE("ext_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
