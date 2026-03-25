import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const classId = req.nextUrl.searchParams.get("classId");
  if (!classId) {
    return NextResponse.json({ error: "classId is required" }, { status: 400 });
  }

  if (auth.user.role === Role.TEACHER) {
    const ownClass = await prisma.class.findFirst({
      where: { id: classId, teacherId: auth.user.id }
    });
    if (!ownClass) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const membership = await prisma.classMember.findFirst({
      where: { classId, studentId: auth.user.id }
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const assignments = await prisma.assignment.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ assignments });
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

  if (!classId || !title) {
    return NextResponse.json({ error: "classId and title are required" }, { status: 400 });
  }

  const ownClass = await prisma.class.findFirst({
    where: { id: classId, teacherId: auth.user.id }
  });
  if (!ownClass) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignment = await prisma.assignment.create({
    data: {
      classId,
      title,
      description: description || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null
    }
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
