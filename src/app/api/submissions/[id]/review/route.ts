import { NextRequest, NextResponse } from "next/server";
import { serializeGradingResult } from "@/lib/grading-result";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import type { GradingResult } from "@/types/grading";

type ReviewPayload = {
  summary: string;
  answers: Array<{
    answerId: string;
    score: number;
    feedback: string;
  }>;
};

function buildTeacherResult(
  answers: Array<{
    answerId: string;
    questionId: string;
    score: number;
    maxScore: number;
    feedback: string;
    question: {
      id: string;
      title: string;
      gradingRubric: string | null;
    };
  }>,
  summary: string
): GradingResult {
  return {
    overallScore: answers.reduce((sum, item) => sum + item.score, 0),
    maxScore: answers.reduce((sum, item) => sum + item.maxScore, 0),
    summary,
    graderType: "TEACHER",
    model: null,
    checks: answers.map((answer) => ({
      questionId: answer.questionId,
      item: answer.question.title,
      score: answer.score,
      maxScore: answer.maxScore,
      comment: answer.feedback,
      rubric: answer.question.gradingRubric,
      source: "TEACHER"
    })),
    suggestions: []
  };
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const submissionId = context.params.id;
  const body = (await req.json()) as ReviewPayload;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      assignment: {
        include: {
          class: true
        }
      },
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

  if (!submission) {
    return NextResponse.json({ error: "提交记录不存在。" }, { status: 404 });
  }

  if (submission.assignment.class.teacherId !== auth.user.id) {
    return NextResponse.json({ error: "无权批改该提交。" }, { status: 403 });
  }

  const reviewMap = new Map(body.answers.map((item) => [item.answerId, item]));
  const reviewedAnswers = submission.answers.map((answer) => {
    const review = reviewMap.get(answer.id);
    return {
      answerId: answer.id,
      questionId: answer.questionId,
      score: Math.max(0, Math.min(answer.maxScore, Math.round(review?.score ?? answer.score))),
      maxScore: answer.maxScore,
      feedback: (review?.feedback || answer.feedback || "").trim() || "教师已复核。",
      question: {
        id: answer.question.id,
        title: answer.question.title,
        gradingRubric: answer.question.gradingRubric
      }
    };
  });

  const gradingResult = buildTeacherResult(reviewedAnswers, body.summary?.trim() || submission.summary);

  await prisma.$transaction([
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        gradingStatus: "TEACHER_REVIEWED",
        overallScore: gradingResult.overallScore,
        maxScore: gradingResult.maxScore,
        summary: gradingResult.summary,
        gradingResult: serializeGradingResult(gradingResult),
        reviewedAt: new Date()
      }
    }),
    ...reviewedAnswers.map((answer) =>
      prisma.submissionAnswer.update({
        where: { id: answer.answerId },
        data: {
          teacherScore: answer.score,
          teacherFeedback: answer.feedback,
          score: answer.score,
          feedback: answer.feedback
        }
      })
    )
  ]);

  return NextResponse.json({ success: true });
}
