import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getJwtSecret } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { isRole, type Role } from "@/lib/roles";

export const AUTH_COOKIE_NAME = "dm_token";

type SessionPayload = {
  sub: string;
  role: Role;
  email: string;
};

function getSecret() {
  return new TextEncoder().encode(getJwtSecret());
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: Pick<User, "id" | "role" | "email">) {
  if (!isRole(user.role)) {
    throw new Error("Invalid user role");
  }
  const payload: SessionPayload = { sub: user.id, role: user.role, email: user.email };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const result = await jwtVerify(token, getSecret());
    return result.payload as SessionPayload;
  } catch {
    return null;
  }
}

export const authCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7
};

export async function getCurrentUserFromRequest(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }
  return prisma.user.findUnique({ where: { id: payload.sub } });
}

export async function getCurrentUserFromCookieStore() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }
  return prisma.user.findUnique({ where: { id: payload.sub } });
}

export async function requireAuth(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return { error: "Unauthorized", status: 401 } as const;
  }
  return { user } as const;
}

export async function requireRole(req: NextRequest, role: Role) {
  const auth = await requireAuth(req);
  if ("error" in auth) {
    return auth;
  }
  if (auth.user.role !== role) {
    return { error: "Forbidden", status: 403 } as const;
  }
  return auth;
}
