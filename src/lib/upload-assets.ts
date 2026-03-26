import {
  buildTeacherAssetKey,
  getStorageBucket,
  getSupabaseAdmin
} from "@/lib/supabase-server";

function extFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  if (mimeType === "image/gif") {
    return "gif";
  }
  return "jpg";
}

export async function uploadTeacherImage(file: File, userId: string, scope: string) {
  const ext = extFromMimeType(file.type);
  const objectKey = buildTeacherAssetKey(userId, scope, ext);
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(objectKey, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  return data.publicUrl;
}
