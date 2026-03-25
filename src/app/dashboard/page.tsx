"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  name: string;
  email: string;
  role: "TEACHER" | "STUDENT";
};

type ClassEntity = {
  id: string;
  name: string;
  code: string;
  _count?: { members?: number; assignments?: number };
  teacher?: { name: string };
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData);

      const classRes = await fetch("/api/classes");
      const classData = await classRes.json();
      if (!classRes.ok) {
        setError(classData.error || "Failed to load classes");
        return;
      }
      setClasses(classData.classes || []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateClass(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: className })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Create class failed");
      return;
    }
    setClassName("");
    loadData();
  }

  async function handleJoinClass(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Join class failed");
      return;
    }
    setJoinCode("");
    loadData();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) {
    return <main className="p-8">Loading...</main>;
  }

  if (!user) {
    return null;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-600">
            {user.name} ({user.role}) - {user.email}
          </p>
        </div>
        <button type="button" className="bg-slate-900 text-white" onClick={logout}>
          Logout
        </button>
      </header>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">{user.role === "TEACHER" ? "Create Class" : "Join Class"}</h2>
        {user.role === "TEACHER" ? (
          <form className="flex gap-2" onSubmit={handleCreateClass}>
            <input
              className="flex-1"
              placeholder="Class name"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              required
            />
            <button className="bg-blue-600 text-white" type="submit">
              Create
            </button>
          </form>
        ) : (
          <form className="flex gap-2" onSubmit={handleJoinClass}>
            <input
              className="flex-1"
              placeholder="Class code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              required
            />
            <button className="bg-blue-600 text-white" type="submit">
              Join
            </button>
          </form>
        )}
        {error ? <p className="text-sm text-red-600 mt-2">{error}</p> : null}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">My Classes</h2>
        <div className="space-y-2">
          {classes.length === 0 ? <p className="text-sm text-slate-500">No classes yet</p> : null}
          {classes.map((item) => (
            <Link
              key={item.id}
              href={`/classes/${item.id}`}
              className="block rounded-md border p-3 hover:bg-slate-50"
            >
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-slate-600">
                Code: {item.code}
                {item._count ? ` | Assignments: ${item._count.assignments || 0}` : ""}
                {item._count ? ` | Students: ${item._count.members || 0}` : ""}
                {item.teacher ? ` | Teacher: ${item.teacher.name}` : ""}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
