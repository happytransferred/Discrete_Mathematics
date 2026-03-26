"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  announcements,
  courseMeta,
  courseModules,
  learningResources,
  portalStats
} from "@/lib/course-content";

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        setIsLoggedIn(res.ok);
      })
      .catch(() => setIsLoggedIn(false))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="portal-shell space-y-8">
      <header className="portal-card overflow-hidden">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.3fr_0.9fr] lg:px-10 lg:py-10">
          <section className="space-y-6">
            <div className="space-y-3">
              <span className="portal-chip">{courseMeta.term}</span>
              <h1 className="portal-title">{courseMeta.title}</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-700">{courseMeta.subtitle}</p>
              <p className="portal-muted">{courseMeta.department}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={isLoggedIn ? "/dashboard" : "/login"} className="portal-button-primary">
                {loading ? "正在检测登录状态..." : isLoggedIn ? "进入课程工作台" : "登录 / 注册"}
              </Link>
              <button type="button" className="portal-button-secondary" onClick={() => router.push("/dashboard")}>
                教师与学生入口
              </button>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {portalStats.map((item) => (
              <article key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/90 p-5">
                <p className="text-sm text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">{item.value}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
              </article>
            ))}
          </section>
        </div>
      </header>

      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="portal-card p-6 lg:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="portal-section-title">课程模块导览</h2>
            <span className="portal-chip">课程门户</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {courseModules.map((item) => (
              <article key={item.name} className="rounded-2xl border border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{item.summary}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="portal-card p-6 lg:p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="portal-section-title">最新公告</h2>
            <span className="text-sm text-slate-500">最近更新</span>
          </div>
          <div className="space-y-4">
            {announcements.map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-medium text-slate-900">{item.title}</h3>
                  <span className="text-xs font-medium text-slate-400">{item.date}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.content}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <section className="portal-card p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="portal-section-title">学习资源入口</h2>
          <span className="portal-chip">第一阶段</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {learningResources.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 p-5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">{item.badge}</span>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
