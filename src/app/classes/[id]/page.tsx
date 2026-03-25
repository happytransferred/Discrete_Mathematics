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
        fetch("/api/auth/me"),
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
        setError(classData.error || "Failed to load class");
        return;
      }
      setClassInfo(classData.class);

      const assignmentData = await assignmentRes.json();
      if (!assignmentRes.ok) {
        setError(assignmentData.error || "Failed to load assignments");
        return;
      }
      setAssignments(assignmentData.assignments || []);
    } catch {
      setError("Network error");
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
      setError(data.error || "Create assignment failed");
      return;
    }
    setTitle("");
    setDescription("");
    setDueDate("");
    loadData();
  }

  if (loading) {
    return <main className="p-6">Loading...</main>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{classInfo?.name}</h1>
          <p className="text-sm text-slate-600">
            Class Code: {classInfo?.code} | Teacher: {classInfo?.teacher.name}
          </p>
        </div>
        <Link href="/dashboard" className="text-blue-600">
          Back to Dashboard
        </Link>
      </div>

      {user?.role === "TEACHER" ? (
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold mb-3">Publish Assignment</h2>
          <form className="space-y-2" onSubmit={createAssignment}>
            <input
              className="w-full"
              placeholder="Assignment title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <textarea
              className="w-full border border-slate-300 rounded-md px-3 py-2"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <button type="submit" className="bg-blue-600 text-white">
              Publish
            </button>
          </form>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-xl border bg-white p-4">
        <h2 className="font-semibold mb-3">Assignments</h2>
        <div className="space-y-2">
          {assignments.length === 0 ? <p className="text-sm text-slate-500">No assignments yet</p> : null}
          {assignments.map((item) => (
            <Link
              key={item.id}
              href={`/assignments/${item.id}`}
              className="block rounded-md border p-3 hover:bg-slate-50"
            >
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-slate-600">
                Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not set"}
              </p>
              {item.description ? <p className="text-sm mt-1">{item.description}</p> : null}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
