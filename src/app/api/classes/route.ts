import { NextRequest, NextResponse } from "next/server";
import { generateClassCode } from "@/lib/class-code";
import { requireAuth, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.user.role === Role.TEACHER) {
    const classes = await prisma.class.findMany({
      where: { teacherId: auth.user.id },
      include: { _count: { select: { members: true, assignments: true } } },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({ classes });
  }

  const memberships = await prisma.classMember.findMany({
    where: { studentId: auth.user.id },
    include: {
      class: {
        include: {
          teacher: { select: { name: true } },
          _count: { select: { assignments: true } }
        }
      }
    },
    orderBy: { joinedAt: "desc" }
  });

  return NextResponse.json({
    classes: memberships.map((m) => m.class)
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, Role.TEACHER);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Class name is required" }, { status: 400 });
  }

  let code = generateClassCode();
  // Retry to avoid rare unique conflict on class code.
  for (let i = 0; i < 5; i += 1) {
    const exists = await prisma.class.findUnique({ where: { code } });
    if (!exists) {
      break;
    }
    code = generateClassCode();
  }

  const classEntity = await prisma.class.create({
    data: {
      name,
      code,
      teacherId: auth.user.id
    }
  });

  return NextResponse.json({ class: classEntity }, { status: 201 });
}
