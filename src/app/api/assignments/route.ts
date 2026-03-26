import { NextRequest, NextResponse } from "next/server";
import { mapQuestionInput } from "@/lib/assignment-format";
import { requireAuth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";
import { uploadTeacherImage } from "@/lib/upload-assets";
import type { AssignmentQuestionInput } from "@/types/assignment";

function parseQuestions(value: string) {
  return JSON.parse(value) as AssignmentQuestionInput[];
}

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

    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" }
        },
        template: {
          select: { id: true, title: true }
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
        latestSubmission: null,
        template: assignment.template
      }))
    });
  }

  const membership = await prisma.classMember.findFirst({
    where: { classId, studentId: auth.user.id }
  });
  if (!membership) {
    return NextResponse.json({ error: "无权查看该班级。" }, { status: 403 });
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
      },
      template: {
        select: { id: true, title: true }
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
      latestSubmission: assignment.submissions[0] || null,
      template: assignment.template
    }))
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const formData = await req.formData();
  const classId = String(formData.get("classId") || "");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const dueDateStr = String(formData.get("dueDate") || "").trim();
  const allowResubmission = String(formData.get("allowResubmission") || "true") !== "false";
  const templateId = String(formData.get("templateId") || "").trim() || null;
  const questions = parseQuestions(String(formData.get("questions") || "[]"));

  if (!classId || !title) {
    return NextResponse.json({ error: "班级和作业总标题不能为空。" }, { status: 400 });
  }
  if (questions.length === 0) {
    return NextResponse.json({ error: "请至少添加一道题目。" }, { status: 400 });
  }

  const ownClass = await prisma.class.findFirst({
    where: { id: classId, teacherId: auth.user.id }
  });
  if (!ownClass) {
    return NextResponse.json({ error: "无权在该班级发布作业。" }, { status: 403 });
  }

  const normalizedQuestions = await Promise.all(
    questions.map(async (question, index) => {
      const promptImageFile = formData.get(`promptImage_${index}`);
      const referenceImageFile = formData.get(`referenceImage_${index}`);

      let promptImagePath = question.promptImagePath || null;
      let referenceImagePath = question.referenceImagePath || null;

      if (promptImageFile instanceof File && promptImageFile.size > 0) {
        promptImagePath = await uploadTeacherImage(promptImageFile, auth.user.id, `assignment-prompt-${classId}-${index + 1}`);
      }
      if (referenceImageFile instanceof File && referenceImageFile.size > 0) {
        referenceImagePath = await uploadTeacherImage(referenceImageFile, auth.user.id, `assignment-reference-${classId}-${index + 1}`);
      }

      return {
        ...question,
        promptImagePath,
        referenceImagePath
      };
    })
  );

  const assignment = await prisma.assignment.create({
    data: {
      classId,
      templateId,
      title,
      description: description || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      allowResubmission,
      totalScore: normalizedQuestions.reduce((sum, item) => sum + Number(item.maxScore || 0), 0),
      questions: {
        create: normalizedQuestions.map(mapQuestionInput)
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
