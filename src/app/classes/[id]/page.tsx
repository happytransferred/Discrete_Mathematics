"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type User = {
  id: string;
  role: "TEACHER" | "STUDENT";
};

type ClassEntity = {
  id: string;
  name: string;
  code: string;
  teacher: { id: string; name: string; email: string };
  _count: { members: number; assignments: number };
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  createdAt: string;
};

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const classId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [classInfo, setClassInfo] = useState<ClassEntity | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [meRes, classRes, assignmentRes] = await Promise.all([
        fetch(`/api/auth/me`),
        fetch(`/api/classes/${classId}`),
        fetch(`/api/assignments?classId=${classId}`)
      ]);

      if (!meRes.ok) {
        router.replace("/login");
        return;
      }
      const me = await meRes.json();
      setUser(me);

      const classData = await classRes.json();
      if (!classRes.ok) {
        setError(classData.error || "加载班级信息失败。");
        return;
      }
      setClassInfo(classData.class);

      const assignmentData = await assignmentRes.json();
      if (!assignmentRes.ok) {
        setError(assignmentData.error || "加载作业列表失败。");
        return;
      }
      setAssignments(assignmentData.assignments || []);
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (classId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "发布作业失败。");
      return;
    }
    setTitle("");
    setDescription("");
    setDueDate("");
    loadData();
  }

  if (loading) {
    return <main className="portal-shell p-6">正在加载班级信息...</main>;
  }

  return (
    <main className="portal-shell space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{classInfo?.name}</h1>
          <p className="text-sm text-slate-600">
            班级码：{classInfo?.code} ｜ 任课教师：{classInfo?.teacher.name}
          </p>
        </div>
        <Link href="/dashboard" className="text-blue-600">
          返回工作台
        </Link>
      </div>

      {user?.role === "TEACHER" ? (
        <section className="portal-card p-4">
          <h2 className="mb-3 font-semibold">发布课程作业</h2>
          <form className="space-y-2" onSubmit={createAssignment}>
            <input
              className="w-full"
              placeholder="作业标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="作业说明"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <button type="submit" className="bg-teal-700 text-white">
              发布
            </button>
          </form>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="portal-card p-4">
        <h2 className="mb-3 font-semibold">班级作业</h2>
        <div className="space-y-2">
          {assignments.length === 0 ? <p className="text-sm text-slate-500">暂时还没有发布作业。</p> : null}
          {assignments.map((item) => (
            <Link
              key={item.id}
              href={`/assignments/${item.id}`}
              className="block rounded-md border p-3 hover:bg-slate-50"
            >
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-slate-600">
                截止日期：{item.dueDate ? new Date(item.dueDate).toLocaleDateString("zh-CN") : "未设置"}
              </p>
              {item.description ? <p className="mt-1 text-sm">{item.description}</p> : null}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
