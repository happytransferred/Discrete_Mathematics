import { NextRequest, NextResponse } from "next/server";
import { mapQuestionInput } from "@/lib/assignment-format";
import { requireAuth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import type { AssignmentQuestionInput } from "@/types/assignment";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "缺少班级编号。" }, { status: 400 });
  }

  if (auth.user.role === Role.TEACHER) {
    const ownClass = await prisma.class.findFirst({
      where: { id: classId, teacherId: auth.user.id }
    });
    if (!ownClass) {
      return NextResponse.json({ error: "无权查看该班级。" }, { status: 403 });
    }
  } else {
    const membership = await prisma.classMember.findFirst({
      where: { classId, studentId: auth.user.id }
    });
    if (!membership) {
      return NextResponse.json({ error: "无权查看该班级。" }, { status: 403 });
    }
  }

  if (auth.user.role === Role.TEACHER) {
    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      assignments: assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        dueDate: assignment.dueDate,
        createdAt: assignment.createdAt,
        totalScore: assignment.totalScore,
        allowResubmission: assignment.allowResubmission,
        questionCount: assignment.questions.length,
        latestSubmission: null
      }))
    });
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      },
      submissions: {
        where: { studentId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      dueDate: assignment.dueDate,
      createdAt: assignment.createdAt,
      totalScore: assignment.totalScore,
      allowResubmission: assignment.allowResubmission,
      questionCount: assignment.questions.length,
      latestSubmission: assignment.submissions[0] || null
    }))
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const classId = String(body.classId || "");
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  const dueDateStr = String(body.dueDate || "").trim();
  const allowResubmission = body.allowResubmission !== false;
  const questions = Array.isArray(body.questions) ? (body.questions as AssignmentQuestionInput[]) : [];

  if (!classId || !title) {
    return NextResponse.json({ error: "班级和作业标题不能为空。" }, { status: 400 });
  }
  if (questions.length === 0) {
    return NextResponse.json({ error: "请至少添加一道题目。" }, { status: 400 });
  }
  if (questions.some((question) => !question.prompt?.trim() || !question.maxScore || !question.type)) {
    return NextResponse.json({ error: "题目内容、类型和分值必须填写完整。" }, { status: 400 });
  }

  const ownClass = await prisma.class.findFirst({
    where: { id: classId, teacherId: auth.user.id }
  });
  if (!ownClass) {
    return NextResponse.json({ error: "无权在该班级发布作业。" }, { status: 403 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      classId,
      title,
      description: description || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      allowResubmission,
      totalScore: questions.reduce((sum, item) => sum + Number(item.maxScore || 0), 0),
      questions: {
        create: questions.map(mapQuestionInput)
      }
    },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" }
      }
    }
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
