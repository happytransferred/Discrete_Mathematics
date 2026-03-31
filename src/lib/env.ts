function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function optionalEnv(name: string) {
  return process.env[name] || null;
}

export function getJwtSecret() {
  return requireEnv("JWT_SECRET");
}

export function getSupabaseUrl() {
  return requireEnv("SUPABASE_URL");
}

export function getSupabaseAnonKey() {
  return requireEnv("SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey() {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function getSupabaseStorageBucket() {
  return requireEnv("SUPABASE_STORAGE_BUCKET");
}

export function getAiProvider() {
  const explicit = optionalEnv("AI_PROVIDER")?.toLowerCase();
  if (explicit) {
    return explicit;
  }
  if (optionalEnv("DEEPSEEK_API_KEY")) {
    return "deepseek";
  }
  if (optionalEnv("KIMI_API_KEY") || optionalEnv("MOONSHOT_API_KEY")) {
    return "kimi";
  }
  if (optionalEnv("OPENAI_API_KEY")) {
    return "openai";
  }
  return null;
}

export function getAiApiKey(provider?: string | null) {
  const target = provider || getAiProvider();
  if (!target) {
    return null;
  }

  if (optionalEnv("AI_API_KEY")) {
    return optionalEnv("AI_API_KEY");
  }

  if (target === "deepseek") {
    return optionalEnv("DEEPSEEK_API_KEY");
  }
  if (target === "kimi") {
    return optionalEnv("KIMI_API_KEY") || optionalEnv("MOONSHOT_API_KEY");
  }
  return optionalEnv("OPENAI_API_KEY");
}

export function getAiModel(provider?: string | null) {
  if (optionalEnv("AI_MODEL")) {
    return optionalEnv("AI_MODEL");
  }

  const target = provider || getAiProvider();
  if (target === "deepseek") {
    return "deepseek-chat";
  }
  if (target === "kimi") {
    return "kimi-k2.5";
  }
  return optionalEnv("OPENAI_MODEL") || "gpt-5.2";
}

export function getAiBaseUrl(provider?: string | null) {
  if (optionalEnv("AI_BASE_URL")) {
    return optionalEnv("AI_BASE_URL");
  }

  const target = provider || getAiProvider();
  if (target === "deepseek") {
    return "https://api.deepseek.com/v1";
  }
  if (target === "kimi") {
    return "https://api.moonshot.ai/v1";
  }
  return "https://api.openai.com/v1";
}
