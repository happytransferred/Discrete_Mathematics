import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function POST(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const templateId = context.params.id;
  const body = await req.json();
  const classId = String(body.classId || "");
  const dueDateStr = String(body.dueDate || "").trim();

  if (!classId) {
    return NextResponse.json({ error: "请选择要发布到的班级。" }, { status: 400 });
  }

  const ownClass = await prisma.class.findFirst({
    where: { id: classId, teacherId: auth.user.id }
  });
  if (!ownClass) {
    return NextResponse.json({ error: "无权在该班级发布作业。" }, { status: 403 });
  }

  const template = await prisma.assignmentTemplate.findFirst({
    where: { id: templateId, teacherId: auth.user.id },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });
  if (!template) {
    return NextResponse.json({ error: "作业库条目不存在。" }, { status: 404 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      classId,
      templateId: template.id,
      title: template.title,
      description: template.description,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      allowResubmission: template.allowResubmission,
      totalScore: template.totalScore,
      questions: {
        create: template.questions.map((question) => ({
          orderIndex: question.orderIndex,
          title: question.title,
          prompt: question.prompt,
          promptImagePath: question.promptImagePath,
          type: question.type,
          options: question.options,
          referenceAnswer: question.referenceAnswer,
          referenceImagePath: question.referenceImagePath,
          gradingRubric: question.gradingRubric,
          maxScore: question.maxScore
        }))
      }
    }
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
