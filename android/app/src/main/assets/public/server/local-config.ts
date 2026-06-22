import fs from "fs";
import path from "path";

const CONFIG_FILE = path.join(process.cwd(), "config.local.json");

export type LocalConfig = {
  database_url?: string;
  gemini_api_key?: string;
  openai_api_key?: string;
  perplexity_api_key?: string;
  demo_api_key?: string;
  demo_api_url?: string;
  demo_api_model?: string;
  app_password?: string;
  session_secret?: string;
};

const AI_KEYS: (keyof LocalConfig)[] = [
  "gemini_api_key",
  "openai_api_key",
  "perplexity_api_key",
  "demo_api_key",
  "demo_api_url",
  "demo_api_model",
  "database_url",
  "app_password",
  "session_secret",
];

export function readLocalConfig(): LocalConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

export function writeLocalConfig(config: LocalConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.warn("[local-config] Erro ao salvar config:", e);
  }
}

export function getLocalConfig(key: keyof LocalConfig): string | null {
  return readLocalConfig()[key] || null;
}

export function setLocalConfig(key: keyof LocalConfig, value: string): void {
  const config = readLocalConfig();
  config[key] = value;
  writeLocalConfig(config);
}

export function isAiKey(key: string): key is keyof LocalConfig {
  return AI_KEYS.includes(key as keyof LocalConfig);
}

export function applyLocalConfigToEnv(): void {
  const cfg = readLocalConfig();
  if (cfg.database_url) process.env.DATABASE_URL = cfg.database_url;
  if (cfg.app_password) process.env.APP_PASSWORD = cfg.app_password;
  if (cfg.session_secret) process.env.SESSION_SECRET = cfg.session_secret;
}
