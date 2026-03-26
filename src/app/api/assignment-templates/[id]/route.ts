import { NextRequest, NextResponse } from "next/server";
import type { AssignmentTemplate, AssignmentTemplateQuestion } from "@prisma/client";
import { formatQuestion, mapQuestionInput } from "@/lib/assignment-format";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { uploadTeacherImage } from "@/lib/upload-assets";
import type { AssignmentQuestionInput } from "@/types/assignment";

function parseQuestions(value: string) {
  return JSON.parse(value) as AssignmentQuestionInput[];
}

async function normalizeQuestions(
  questions: AssignmentQuestionInput[],
  formData: FormData,
  userId: string,
  scopePrefix: string
) {
  return Promise.all(
    questions.map(async (question, index) => {
      const promptImageFile = formData.get(`promptImage_${index}`);
      const referenceImageFile = formData.get(`referenceImage_${index}`);

      let promptImagePath = question.promptImagePath || null;
      let referenceImagePath = question.referenceImagePath || null;

      if (promptImageFile instanceof File && promptImageFile.size > 0) {
        promptImagePath = await uploadTeacherImage(
          promptImageFile,
          userId,
          `${scopePrefix}-prompt-${index + 1}`
        );
      }
      if (referenceImageFile instanceof File && referenceImageFile.size > 0) {
        referenceImagePath = await uploadTeacherImage(
          referenceImageFile,
          userId,
          `${scopePrefix}-reference-${index + 1}`
        );
      }

      return {
        ...question,
        promptImagePath,
        referenceImagePath
      };
    })
  );
}

function serializeTemplate(
  template: AssignmentTemplate & { questions: AssignmentTemplateQuestion[] }
) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    allowResubmission: template.allowResubmission,
    totalScore: template.totalScore,
    createdAt: template.createdAt,
    questions: template.questions.map((question) => formatQuestion(question))
  };
}

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const template = await prisma.assignmentTemplate.findFirst({
    where: { id: context.params.id, teacherId: auth.user.id },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });

  if (!template) {
    return NextResponse.json({ error: "作业库条目不存在。" }, { status: 404 });
  }

  return NextResponse.json({ template: serializeTemplate(template) });
}

export async function PATCH(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templateId = context.params.id;
  const formData = await req.formData();
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const allowResubmission = String(formData.get("allowResubmission") || "true") !== "false";
  const rawQuestions = String(formData.get("questions") || "[]");
  const questions = parseQuestions(rawQuestions);

  if (!title) {
    return NextResponse.json({ error: "作业总标题不能为空。" }, { status: 400 });
  }
  if (questions.length === 0) {
    return NextResponse.json({ error: "请至少添加一道题目。" }, { status: 400 });
  }

  const existing = await prisma.assignmentTemplate.findFirst({
    where: { id: templateId, teacherId: auth.user.id }
  });
  if (!existing) {
    return NextResponse.json({ error: "作业库条目不存在。" }, { status: 404 });
  }

  const normalizedQuestions = await normalizeQuestions(
    questions,
    formData,
    auth.user.id,
    `template-update-${templateId}`
  );

  const template = await prisma.assignmentTemplate.update({
    where: { id: templateId },
    data: {
      title,
      description: description || null,
      allowResubmission,
      totalScore: normalizedQuestions.reduce((sum, item) => sum + Number(item.maxScore || 0), 0),
      questions: {
        deleteMany: {},
        create: normalizedQuestions.map(mapQuestionInput)
      }
    },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });

  return NextResponse.json({ template: serializeTemplate(template) });
}

export async function DELETE(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templateId = context.params.id;
  const existing = await prisma.assignmentTemplate.findFirst({
    where: { id: templateId, teacherId: auth.user.id }
  });
  if (!existing) {
    return NextResponse.json({ error: "作业库条目不存在。" }, { status: 404 });
  }

  await prisma.assignmentTemplate.delete({
    where: { id: templateId }
  });

  return NextResponse.json({ success: true });
}
