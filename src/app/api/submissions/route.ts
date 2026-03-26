import { NextRequest, NextResponse } from "next/server";
import { formatQuestion, formatSubmissionAnswer } from "@/lib/assignment-format";
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
import type { AssignmentQuestionView, StudentAnswerDraft } from "@/types/assignment";

export const runtime = "nodejs";

function extFromMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }
  if (mimeType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

async function uploadSubmissionImage(file: File, userId: string, assignmentId: string, questionId: string) {
  const ext = extFromMimeType(file.type);
  const objectKey = buildSubmissionObjectKey(userId, `${assignmentId}-${questionId}`, ext);
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

function formatSubmission(
  submission: {
    id: string;
    attemptNumber: number;
    overallScore: number;
    maxScore: number;
    summary: string;
    gradingResult: string;
    createdAt: Date;
    student?: { id: string; name: string; email: string } | null;
    answers?: Array<{
      id: string;
      questionId: string;
      textAnswer: string | null;
      selectedOption: string | null;
      imagePath: string | null;
      score: number;
      maxScore: number;
      feedback: string;
      question: {
        id: string;
        title: string;
        prompt: string;
        type: string;
        orderIndex: number;
        maxScore: number;
        options: string | null;
        referenceAnswer: string | null;
      };
    }>;
  }
) {
  return {
    id: submission.id,
    attemptNumber: submission.attemptNumber,
    overallScore: submission.overallScore,
    maxScore: submission.maxScore,
    summary: submission.summary,
    gradingResult: parseGradingResult(submission.gradingResult),
    createdAt: submission.createdAt,
    student: submission.student || undefined,
    answers: submission.answers?.map((answer) =>
      formatSubmissionAnswer({
        ...answer,
        question: answer.question
      })
    )
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const assignmentId = req.nextUrl.searchParams.get("assignmentId");
  if (!assignmentId) {
    return NextResponse.json({ error: "缺少作业编号。" }, { status: 400 });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: true,
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });
  if (!assignment) {
    return NextResponse.json({ error: "作业不存在。" }, { status: 404 });
  }

  if (auth.user.role === Role.TEACHER) {
    if (assignment.class.teacherId !== auth.user.id) {
      return NextResponse.json({ error: "无权查看该作业提交。" }, { status: 403 });
    }
    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      include: {
        student: { select: { id: true, name: true, email: true } },
        answers: {
          include: {
            question: true
          },
          orderBy: {
            question: { orderIndex: "asc" }
          }
        }
      },
      orderBy: [{ createdAt: "desc" }]
    });
    return NextResponse.json({
      assignment: {
        id: assignment.id,
        questions: assignment.questions.map(formatQuestion)
      },
      submissions: submissions.map(formatSubmission)
    });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId: assignment.classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "无权查看该作业提交。" }, { status: 403 });
  }

  const submissions = await prisma.submission.findMany({
    where: { assignmentId, studentId: auth.user.id },
    include: {
      answers: {
        include: {
          question: true
        },
        orderBy: {
          question: { orderIndex: "asc" }
        }
      }
    },
    orderBy: [{ attemptNumber: "desc" }]
  });

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      questions: assignment.questions.map(formatQuestion)
    },
    latestSubmission: submissions[0] ? formatSubmission(submissions[0]) : null,
    submissionHistory: submissions.map(formatSubmission)
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.STUDENT);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await req.formData();
  const assignmentId = String(formData.get("assignmentId") || "");
  const answersRaw = String(formData.get("answers") || "[]");

  if (!assignmentId) {
    return NextResponse.json({ error: "缺少作业编号。" }, { status: 400 });
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: true,
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });
  if (!assignment) {
    return NextResponse.json({ error: "作业不存在。" }, { status: 404 });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId: assignment.classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "无权提交该作业。" }, { status: 403 });
  }

  if (assignment.dueDate && new Date(assignment.dueDate).getTime() < Date.now()) {
    return NextResponse.json({ error: "该作业已截止提交。" }, { status: 400 });
  }

  const previousAttempts = await prisma.submission.count({
    where: { assignmentId, studentId: auth.user.id }
  });
  if (!assignment.allowResubmission && previousAttempts > 0) {
    return NextResponse.json({ error: "该作业不允许重复提交。" }, { status: 400 });
  }

  const draftAnswers = JSON.parse(answersRaw) as StudentAnswerDraft[];
  const questionMap = new Map(assignment.questions.map((question) => [question.id, question]));

  const enrichedAnswers = await Promise.all(
    assignment.questions.map(async (question) => {
      const draft = draftAnswers.find((item) => item.questionId === question.id);
      const imageFile = formData.get(`image_${question.id}`);
      let imagePath: string | null = null;

      if (imageFile instanceof File && imageFile.size > 0) {
        imagePath = await uploadSubmissionImage(imageFile, auth.user.id, assignmentId, question.id);
      }

      return {
        questionId: question.id,
        type: question.type as AssignmentQuestionView["type"],
        textAnswer: draft?.textAnswer || "",
        selectedOption: draft?.selectedOption || "",
        imagePath
      };
    })
  );

  const gradingResult = await gradeHomework({
    assignmentTitle: assignment.title,
    questions: assignment.questions.map(formatQuestion),
    answers: enrichedAnswers
  });
  const serializedGradingResult = serializeGradingResult(gradingResult);
  const checkMap = new Map(gradingResult.checks.map((item) => [item.item, item]));

  const submission = await prisma.submission.create({
    data: {
      assignmentId,
      studentId: auth.user.id,
      attemptNumber: previousAttempts + 1,
      overallScore: gradingResult.overallScore,
      maxScore: gradingResult.maxScore,
      summary: gradingResult.summary,
      gradingResult: serializedGradingResult,
      answers: {
        create: enrichedAnswers.map((answer) => {
          const question = questionMap.get(answer.questionId)!;
          const detail = checkMap.get(question.title || `第${question.orderIndex}题`);
          return {
            questionId: question.id,
            textAnswer: answer.textAnswer || null,
            selectedOption: answer.selectedOption || null,
            imagePath: answer.imagePath,
            score: detail?.score || 0,
            maxScore: question.maxScore,
            feedback: detail?.comment || "已提交。"
          };
        })
      }
    },
    include: {
      answers: {
        include: {
          question: true
        },
        orderBy: {
          question: { orderIndex: "asc" }
        }
      }
    }
  });

  return NextResponse.json({ submission: formatSubmission(submission) }, { status: 201 });
}
