import { NextRequest, NextResponse } from "next/server";
import { formatQuestion, formatSubmissionAnswer } from "@/lib/assignment-format";
import { requireAuth, requireRole } from "@/lib/auth";
import { parseGradingResult, serializeGradingResult } from "@/lib/grading-result";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { buildSubmissionObjectKey, getStorageBucket, getSupabaseAdmin } from "@/lib/supabase-server";
import { QUESTION_TYPES, type AssignmentQuestionView, type StudentAnswerDraft } from "@/types/assignment";
import type { GradingResult } from "@/types/grading";

export const runtime = "nodejs";

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

async function uploadSubmissionImage(file: File, userId: string, assignmentId: string, questionId: string) {
  const ext = extFromMimeType(file.type);
  const objectKey = buildSubmissionObjectKey(userId, `${assignmentId}-${questionId}`, ext);
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();

  const { error } = await supabase.storage.from(bucket).upload(objectKey, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: true
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return supabase.storage.from(bucket).getPublicUrl(objectKey).data.publicUrl;
}

function parseDraftAnswers(value: string) {
  try {
    return JSON.parse(value) as StudentAnswerDraft[];
  } catch {
    return [];
  }
}

function serializeStringArray(value: string[] | undefined) {
  const normalized = (value || []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? JSON.stringify(normalized) : null;
}

function normalizeTextForStorage(questionType: string, draft: StudentAnswerDraft | undefined) {
  if (!draft) {
    return null;
  }

  if (questionType === QUESTION_TYPES.PROOF) {
    const steps = (draft.stepAnswers || []).map((item) => item.trim()).filter(Boolean);
    return steps.length > 0 ? steps.join("\n") : null;
  }

  return draft.textAnswer?.trim() || null;
}

function buildPendingGradingResult(questions: AssignmentQuestionView[]): GradingResult {
  return {
    overallScore: 0,
    maxScore: questions.reduce((sum, item) => sum + item.maxScore, 0),
    summary: "作业已提交，AI 正在后台评分，请稍后刷新查看结果。",
    graderType: "RULE",
    model: null,
    checks: questions.map((question) => ({
      questionId: question.id,
      item: question.title,
      score: 0,
      maxScore: question.maxScore,
      comment: "等待 AI 评分中。",
      rubric: question.gradingRubric || null,
      source: "RULE"
    })),
    suggestions: []
  };
}

function formatSubmission(
  submission: {
    id: string;
    attemptNumber: number;
    gradingStatus: string;
    aiSummary: string | null;
    overallScore: number;
    maxScore: number;
    summary: string;
    aiGradingResult: string | null;
    gradingResult: string;
    reviewedAt: Date | null;
    createdAt: Date;
    student?: { id: string; name: string; email: string } | null;
    answers?: Array<{
      id: string;
      questionId: string;
      textAnswer: string | null;
      selectedOption: string | null;
      selectedOptions: string | null;
      stepAnswerJson: string | null;
      imagePath: string | null;
      aiScore: number | null;
      aiFeedback: string | null;
      teacherScore: number | null;
      teacherFeedback: string | null;
      score: number;
      maxScore: number;
      feedback: string;
      question: {
        id: string;
        title: string;
        prompt: string;
        type: string;
      };
    }>;
  }
) {
  return {
    id: submission.id,
    attemptNumber: submission.attemptNumber,
    gradingStatus: submission.gradingStatus,
    aiSummary: submission.aiSummary,
    overallScore: submission.overallScore,
    maxScore: submission.maxScore,
    summary: submission.summary,
    aiGradingResult: submission.aiGradingResult ? parseGradingResult(submission.aiGradingResult) : null,
    gradingResult: parseGradingResult(submission.gradingResult),
    reviewedAt: submission.reviewedAt,
    createdAt: submission.createdAt,
    student: submission.student || undefined,
    answers:
      submission.answers?.map((answer) => ({
        ...formatSubmissionAnswer(answer),
        aiScore: answer.aiScore,
        aiFeedback: answer.aiFeedback,
        teacherScore: answer.teacherScore,
        teacherFeedback: answer.teacherFeedback
      })) || []
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
      return NextResponse.json({ error: "无权查看该作业的提交记录。" }, { status: 403 });
    }

    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      include: {
        student: { select: { id: true, name: true, email: true } },
        answers: {
          include: { question: true },
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
        questions: assignment.questions.map((question) => formatQuestion(question))
      },
      submissions: submissions.map(formatSubmission)
    });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId: assignment.classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "无权查看该作业的提交记录。" }, { status: 403 });
  }

  const submissions = await prisma.submission.findMany({
    where: { assignmentId, studentId: auth.user.id },
    include: {
      answers: {
        include: { question: true },
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
      questions: assignment.questions.map((question) => formatQuestion(question, false))
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

  const draftAnswers = parseDraftAnswers(answersRaw);
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
        selectedOptions: question.type === QUESTION_TYPES.MULTIPLE_CHOICE ? draft?.selectedOptions || [] : [],
        stepAnswers: question.type === QUESTION_TYPES.PROOF ? draft?.stepAnswers || [] : [],
        imagePath
      };
    })
  );

  const formattedQuestions = assignment.questions.map((question) => formatQuestion(question));
  const pendingResult = buildPendingGradingResult(formattedQuestions);
  const serializedPending = serializeGradingResult(pendingResult);

  const submission = await prisma.submission.create({
    data: {
      assignmentId,
      studentId: auth.user.id,
      attemptNumber: previousAttempts + 1,
      gradingStatus: "PENDING",
      aiSummary: null,
      overallScore: 0,
      maxScore: pendingResult.maxScore,
      summary: pendingResult.summary,
      aiGradingResult: null,
      gradingResult: serializedPending,
      answers: {
        create: enrichedAnswers.map((answer) => {
          const question = questionMap.get(answer.questionId)!;
          return {
            questionId: question.id,
            textAnswer: normalizeTextForStorage(question.type, answer),
            selectedOption: answer.selectedOption || null,
            selectedOptions: serializeStringArray(answer.selectedOptions),
            stepAnswerJson: serializeStringArray(answer.stepAnswers),
            imagePath: answer.imagePath || null,
            aiScore: null,
            aiFeedback: null,
            score: 0,
            maxScore: question.maxScore,
            feedback: "等待 AI 评分中。"
          };
        })
      }
    },
    include: {
      answers: {
        include: { question: true },
        orderBy: {
          question: { orderIndex: "asc" }
        }
      }
    }
  });

  return NextResponse.json({ submission: formatSubmission(submission) }, { status: 201 });
}
