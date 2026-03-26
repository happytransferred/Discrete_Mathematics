import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseStorageBucket,
  getSupabaseUrl
} from "@/lib/env";

let adminClient:
  | ReturnType<typeof createClient>
  | undefined;

export function getSupabaseAdmin() {
  if (!adminClient) {
    adminClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }
  return adminClient;
}

export function getStorageBucket() {
  return getSupabaseStorageBucket();
}

export function buildSubmissionObjectKey(userId: string, assignmentId: string, ext: string) {
  return `submissions/${assignmentId}/${userId}-${Date.now()}.${ext}`;
}

export function buildTeacherAssetKey(userId: string, scope: string, ext: string) {
  return `teacher-assets/${userId}/${scope}-${Date.now()}.${ext}`;
}
