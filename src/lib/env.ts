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

export function getOpenAiApiKey() {
  return optionalEnv("OPENAI_API_KEY");
}

export function getOpenAiModel() {
  return optionalEnv("OPENAI_MODEL") || "gpt-5.2";
}
