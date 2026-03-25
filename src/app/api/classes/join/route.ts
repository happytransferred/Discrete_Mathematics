import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.STUDENT);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const code = String(body.code || "").trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Class code is required" }, { status: 400 });
  }

  const classEntity = await prisma.class.findUnique({ where: { code } });
  if (!classEntity) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  await prisma.classMember.upsert({
    where: {
      classId_studentId: {
        classId: classEntity.id,
        studentId: auth.user.id
      }
    },
    update: {},
    create: {
      classId: classEntity.id,
      studentId: auth.user.id
    }
  });

  return NextResponse.json({ class: classEntity });
}
