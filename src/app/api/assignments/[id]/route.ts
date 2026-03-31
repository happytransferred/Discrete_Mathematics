import { NextRequest, NextResponse } from "next/server";
import { formatQuestion } from "@/lib/assignment-format";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function GET(req: NextRequest, context: { params: { id: string } }) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const assignmentId = context.params.id;
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: { include: { teacher: { select: { id: true, name: true } } } },
      questions: {
        orderBy: { orderIndex: "asc" }
      },
      template: {
        select: { id: true, title: true }
      }
    }
  });

  if (!assignment) {
    return NextResponse.json({ error: "作业不存在。" }, { status: 404 });
  }

  const includeReference = auth.user.role === Role.TEACHER;

  if (auth.user.role === Role.TEACHER) {
    if (assignment.class.teacherId !== auth.user.id) {
      return NextResponse.json({ error: "无权查看该作业。" }, { status: 403 });
    }
  } else {
    const membership = await prisma.classMember.findFirst({
      where: { classId: assignment.classId, studentId: auth.user.id }
    });
    if (!membership) {
      return NextResponse.json({ error: "无权查看该作业。" }, { status: 403 });
    }
  }

  return NextResponse.json({
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      classId: assignment.classId,
      totalScore: assignment.totalScore,
      allowResubmission: assignment.allowResubmission,
      class: { id: assignment.class.id, name: assignment.class.name },
      template: assignment.template,
      questions: assignment.questions.map((question) => formatQuestion(question, includeReference))
    }
  });
}
