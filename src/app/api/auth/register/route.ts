import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions, createSessionToken, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const role = String(body.role || "");

  if (!email || !password || !name || !isRole(role)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      name,
      role
    }
  });

  const token = await createSessionToken(user);
  const response = NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  });
  response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions);
  return response;
}
