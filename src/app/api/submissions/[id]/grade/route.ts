import { NextRequest, NextResponse } from "next/server";
import { formatQuestion } from "@/lib/assignment-format";
import { requireAuth } from "@/lib/auth";
import { serializeGradingResult } from "@/lib/grading-result";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { gradeHomework } from "@/services/grading-service";
import type { AssignmentQuestionView } from "@/types/assignment";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const submission = await prisma.submission.findUnique({
    where: { id: context.params.id },
    include: {
      assignment: {
        include: {
          class: true,
          questions: {
            orderBy: { orderIndex: "asc" }
          }
        }
      },
      answers: {
        orderBy: {
          question: { orderIndex: "asc" }
        },
        include: {
          question: true
        }
      }
    }
  });

  if (!submission) {
    return NextResponse.json({ error: "提交记录不存在。" }, { status: 404 });
  }

  const canTrigger =
    auth.user.role === Role.TEACHER
      ? submission.assignment.class.teacherId === auth.user.id
      : submission.studentId === auth.user.id;

  if (!canTrigger) {
    return NextResponse.json({ error: "无权处理该提交。" }, { status: 403 });
  }

  if (submission.gradingStatus !== "PENDING") {
    return NextResponse.json({ success: true, gradingStatus: submission.gradingStatus });
  }

  const formattedQuestions = submission.assignment.questions.map((question) => formatQuestion(question));
  const answerMap = new Map(submission.answers.map((answer) => [answer.questionId, answer]));

  const gradingResult = await gradeHomework({
    assignmentTitle: submission.assignment.title,
    assignmentDescription: submission.assignment.description,
    questions: formattedQuestions,
    answers: formattedQuestions.map((question) => {
      const answer = answerMap.get(question.id);
      return {
        questionId: question.id,
        type: question.type as AssignmentQuestionView["type"],
        textAnswer: answer?.textAnswer || "",
        selectedOption: answer?.selectedOption || "",
        selectedOptions: answer?.selectedOptions ? (JSON.parse(answer.selectedOptions) as string[]) : [],
        stepAnswers: answer?.stepAnswerJson ? (JSON.parse(answer.stepAnswerJson) as string[]) : [],
        imagePath: answer?.imagePath || null
      };
    })
  });

  const serializedGradingResult = serializeGradingResult(gradingResult);
  const checkMap = new Map(gradingResult.checks.map((item) => [item.questionId || item.item, item]));

  await prisma.$transaction([
    prisma.submission.update({
      where: { id: submission.id },
      data: {
        gradingStatus: "AI_GRADED",
        aiSummary: gradingResult.summary,
        overallScore: gradingResult.overallScore,
        maxScore: gradingResult.maxScore,
        summary: gradingResult.summary,
        aiGradingResult: serializedGradingResult,
        gradingResult: serializedGradingResult
      }
    }),
    ...submission.answers.map((answer) => {
      const detail = checkMap.get(answer.questionId) || checkMap.get(answer.question.title);
      return prisma.submissionAnswer.update({
        where: { id: answer.id },
        data: {
          aiScore: detail?.score || 0,
          aiFeedback: detail?.comment || "AI 已完成评分。",
          score: detail?.score || 0,
          feedback: detail?.comment || "AI 已完成评分。"
        }
      });
    })
  ]);

  return NextResponse.json({ success: true, gradingStatus: "AI_GRADED" });
}
