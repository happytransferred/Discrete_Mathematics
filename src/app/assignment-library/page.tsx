"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentTemplateView } from "@/types/assignment";

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
};

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) {
    return "未设置";
  }
  return new Date(dateString).toLocaleString("zh-CN");
}

export default function AssignmentLibraryPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [templates, setTemplates] = useState<AssignmentTemplateView[]>([]);
  const [classSelections, setClassSelections] = useState<Record<string, string>>({});
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const templateCount = templates.length;
  const totalQuestionCount = useMemo(
    () => templates.reduce((sum, item) => sum + item.questions.length, 0),
    [templates]
  );

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [meRes, classRes, templateRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/classes"),
        fetch("/api/assignment-templates")
      ]);

      if (!meRes.ok) {
        router.replace("/login");
        return;
      }

      const me = await meRes.json();
      if (me.role !== "TEACHER") {
        router.replace("/dashboard");
        return;
      }
      setUser(me);

      const classData = await classRes.json();
      if (!classRes.ok) {
        setError(classData.error || "加载班级失败。");
        return;
      }
      setClasses(classData.classes || []);

      const templateData = await templateRes.json();
      if (!templateRes.ok) {
        setError(templateData.error || "加载作业库失败。");
        return;
      }
      setTemplates(templateData.templates || []);

      const defaultClassId = (classData.classes || [])[0]?.id || "";
      setClassSelections((current) => {
        const next = { ...current };
        for (const template of templateData.templates || []) {
          if (!next[template.id] && defaultClassId) {
            next[template.id] = defaultClassId;
          }
        }
        return next;
      });
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

  async function publishTemplate(templateId: string) {
    const classId = classSelections[templateId];
    if (!classId) {
      setError("请先选择要发布到的班级。");
      return;
    }

    setPublishingId(templateId);
    setError("");

    try {
      const res = await fetch(`/api/assignment-templates/${templateId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          dueDate: dueDates[templateId] ? new Date(dueDates[templateId]).toISOString() : ""
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "发布失败。");
        return;
      }

      router.push(`/classes/${classId}`);
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPublishingId(null);
    }
  }

  if (loading) {
    return <main className="portal-shell p-8">正在加载作业库...</main>;
  }

  return (
    <main className="portal-shell space-y-6">
      <header className="portal-card flex flex-col gap-6 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
        <div>
          <p className="portal-chip">教师专用</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">作业库</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {user?.name} 可以在这里统一查看历年作业模板，选择班级后直接发布，并为每次发布设定不同的截止时间。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard" className="portal-button-secondary">
            返回工作台
          </Link>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">作业模板数</p>
          <p className="mt-2 text-3xl font-semibold">{templateCount}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">模板题目总数</p>
          <p className="mt-2 text-3xl font-semibold">{totalQuestionCount}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">可发布班级</p>
          <p className="mt-2 text-3xl font-semibold">{classes.length}</p>
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

      <section className="portal-card p-6">
        <div className="mb-4">
          <h2 className="portal-section-title">全部作业模板</h2>
          <p className="mt-1 text-sm text-slate-600">先选班级和截止时间，再点击发布到班级。</p>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-slate-500">当前作业库还没有模板。请先到班级页创建并保存作业模板。</p>
        ) : (
          <div className="space-y-5">
            {templates.map((template) => (
              <article key={template.id} className="rounded-3xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold">{template.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      创建时间：{formatDateTime(template.createdAt)} | 题目数：{template.questions.length} | 总分：
                      {template.totalScore}
                    </p>
                    {template.description ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{template.description}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {template.questions.map((question, index) => (
                    <div key={question.id} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">
                          第 {index + 1} 题：{question.title}
                        </p>
                        <span className="text-xs text-slate-500">{question.maxScore} 分</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{question.prompt}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">发布到班级</span>
                    <select
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                      value={classSelections[template.id] || ""}
                      onChange={(e) =>
                        setClassSelections((current) => ({
                          ...current,
                          [template.id]: e.target.value
                        }))
                      }
                    >
                      <option value="">请选择班级</option>
                      {classes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}（{item.code}）
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-slate-700">提交截止时间</span>
                    <input
                      type="datetime-local"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                      value={dueDates[template.id] || ""}
                      onChange={(e) =>
                        setDueDates((current) => ({
                          ...current,
                          [template.id]: e.target.value
                        }))
                      }
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => publishTemplate(template.id)}
                    disabled={publishingId === template.id}
                    className="portal-button-primary disabled:opacity-60"
                  >
                    {publishingId === template.id ? "发布中..." : "发布到班级"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
