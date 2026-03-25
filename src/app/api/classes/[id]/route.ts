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

  const classId = context.params.id;
  const classEntity = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      _count: { select: { members: true, assignments: true } }
    }
  });

  if (!classEntity) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  if (auth.user.role === Role.TEACHER) {
    if (classEntity.teacherId !== auth.user.id) {
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

  return NextResponse.json({ class: classEntity });
}
