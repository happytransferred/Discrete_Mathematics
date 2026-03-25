import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, authCookieOptions, createSessionToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

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
