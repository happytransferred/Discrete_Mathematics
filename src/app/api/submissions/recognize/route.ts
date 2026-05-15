import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { Role } from "@/lib/roles";
import { recognizeAnswerImage } from "@/services/grading-service";

export const runtime = "nodejs";

function fileToDataUrl(file: File, bytes: Buffer) {
  const mimeType = file.type || "image/png";
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.STUDENT);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await req.formData();
  const image = formData.get("image");
  const questionTitle = String(formData.get("questionTitle") || "图片题");
  const questionPrompt = String(formData.get("questionPrompt") || "");

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "请先上传答案图片。" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await image.arrayBuffer());
    const text = await recognizeAnswerImage({
      questionTitle,
      questionPrompt,
      imageDataUrl: fileToDataUrl(image, bytes)
    });

    return NextResponse.json({ text });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Current AI provider does not support image recognition"
        ? "当前配置的 AI 模型暂不支持图片识别，请切换到支持视觉的模型后再试。"
        : "图片识别失败，请稍后重试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
