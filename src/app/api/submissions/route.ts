import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { parseGradingResult, serializeGradingResult } from "@/lib/grading-result";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import {
  buildSubmissionObjectKey,
  getStorageBucket,
  getSupabaseAdmin
} from "@/lib/supabase-server";
import { gradeHomework } from "@/services/grading-service";

export const runtime = "nodejs";

function formatSubmission<T extends { gradingResult: string }>(submission: T) {
  return {
    ...submission,
    gradingResult: parseGradingResult(submission.gradingResult)
  };
}

function extFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

async function uploadSubmissionImage(file: File, userId: string, assignmentId: string) {
  const ext = extFromMimeType(file.type);
  const objectKey = buildSubmissionObjectKey(userId, assignmentId, ext);
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectKey, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectKey);
  return data.publicUrl;
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { class: true }
  });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (auth.user.role === Role.TEACHER) {
    if (assignment.class.teacherId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ submissions: submissions.map(formatSubmission) });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId: assignment.classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submission = await prisma.submission.findUnique({
    where: {
      assignmentId_studentId: {
        assignmentId,
        studentId: auth.user.id
      }
    }
  });

  return NextResponse.json({
    submission: submission ? formatSubmission(submission) : null
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.STUDENT);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await req.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const file = formData.get("image");

  if (!assignmentId || !(file instanceof File)) {
    return NextResponse.json({ error: "assignmentId and image are required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { class: true }
  });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId: assignment.classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const imagePath = await uploadSubmissionImage(file, auth.user.id, assignmentId);
  const gradingResult = await gradeHomework({
    assignmentTitle: assignment.title,
    imagePath
  });
  const serializedGradingResult = serializeGradingResult(gradingResult);

  const submission = await prisma.submission.upsert({
    where: {
      assignmentId_studentId: {
        assignmentId,
        studentId: auth.user.id
      }
    },
    update: {
      imagePath,
      gradingResult: serializedGradingResult
    },
    create: {
      assignmentId,
      studentId: auth.user.id,
      imagePath,
      gradingResult: serializedGradingResult
    }
  });

  return NextResponse.json({ submission: formatSubmission(submission) }, { status: 201 });
}
