import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const assignmentId = context.params.id;
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      class: { include: { teacher: { select: { id: true, name: true } } } }
    }
  });
  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }

  if (auth.user.role === Role.TEACHER) {
    if (assignment.class.teacherId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const membership = await prisma.classMember.findFirst({
      where: { classId: assignment.classId, studentId: auth.user.id }
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ assignment });
}
