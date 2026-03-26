"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { announcements, courseMeta, dashboardTips } from "@/lib/course-content";

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
        setError(classData.error || "加载班级失败，请稍后重试。");
        return;
      }
      setClasses(classData.classes || []);
    } catch {
      setError("网络异常，请稍后重试。");
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
      setError(data.error || "创建班级失败。");
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
      setError(data.error || "加入班级失败。");
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
    return <main className="portal-shell p-8">正在加载课程工作台...</main>;
  }

  if (!user) {
    return null;
  }

  return (
    <main className="portal-shell space-y-6">
      <header className="portal-card flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
        <div>
          <p className="text-sm font-medium text-teal-700">{courseMeta.term}</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">课程工作台</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {user.name} · {user.role === "TEACHER" ? "教师" : "学生"} · {user.email}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="portal-button-secondary">
            返回课程门户
          </Link>
          <button type="button" className="portal-button-primary" onClick={logout}>
            退出登录
          </button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="portal-card p-6">
          <h2 className="portal-section-title mb-3">{user.role === "TEACHER" ? "创建授课班级" : "加入课程班级"}</h2>
          <p className="mb-4 text-sm leading-6 text-slate-600">
            {user.role === "TEACHER"
              ? "创建班级后，系统会自动生成班级码，便于学生加入。"
              : "请输入教师提供的班级码，加入对应的课程教学空间。"}
          </p>
          {user.role === "TEACHER" ? (
            <form className="flex gap-2" onSubmit={handleCreateClass}>
              <input
                className="flex-1"
                placeholder="请输入班级名称，如：2023级计科1班"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                required
              />
              <button className="bg-teal-700 text-white" type="submit">
                创建
              </button>
            </form>
          ) : (
            <form className="flex gap-2" onSubmit={handleJoinClass}>
              <input
                className="flex-1"
                placeholder="请输入班级码"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                required
              />
              <button className="bg-teal-700 text-white" type="submit">
                加入
              </button>
            </form>
          )}
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </div>

        <aside className="portal-card p-6">
          <h2 className="portal-section-title mb-3">本周提示</h2>
          <div className="space-y-3">
            {(user.role === "TEACHER" ? dashboardTips.teacher : dashboardTips.student).map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="portal-card p-6">
          <h2 className="portal-section-title mb-3">我的班级</h2>
          <div className="space-y-2">
            {classes.length === 0 ? <p className="text-sm text-slate-500">当前还没有班级记录。</p> : null}
            {classes.map((item) => (
              <Link
                key={item.id}
                href={`/classes/${item.id}`}
                className="block rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"
              >
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-slate-600">
                  班级码：{item.code}
                  {item._count ? ` ｜ 作业数：${item._count.assignments || 0}` : ""}
                  {item._count ? ` ｜ 学生数：${item._count.members || 0}` : ""}
                  {item.teacher ? ` ｜ 任课教师：${item.teacher.name}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <aside className="portal-card p-6">
          <h2 className="portal-section-title mb-3">课程公告</h2>
          <div className="space-y-3">
            {announcements.map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-medium text-slate-900">{item.title}</h3>
                  <span className="text-xs text-slate-400">{item.date}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.content}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
