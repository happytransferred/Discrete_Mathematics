function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
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
