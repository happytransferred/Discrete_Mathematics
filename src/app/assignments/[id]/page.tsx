"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GradingResult } from "@/types/grading";

type User = {
  id: string;
  role: "TEACHER" | "STUDENT";
  name: string;
};

type Assignment = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  classId: string;
  class: { id: string; name: string };
};

type Submission = {
  id: string;
  studentId: string;
  imagePath: string;
  gradingResult: GradingResult;
  createdAt: string;
  student?: { name: string; email: string };
};

export default function AssignmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [meRes, assignmentRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch(`/api/assignments/${assignmentId}`)
      ]);

      if (!meRes.ok) {
        router.replace("/login");
        return;
      }

      const meData = await meRes.json();
      setUser(meData);

      const assignmentData = await assignmentRes.json();
      if (!assignmentRes.ok) {
        setError(assignmentData.error || "加载作业详情失败。");
        return;
      }
      setAssignment(assignmentData.assignment);

      const submissionsRes = await fetch(`/api/submissions?assignmentId=${assignmentId}`);
      const submissionsData = await submissionsRes.json();
      if (!submissionsRes.ok) {
        setError(submissionsData.error || "加载提交记录失败。");
        return;
      }

      if (meData.role === "TEACHER") {
        setSubmissions(submissionsData.submissions || []);
      } else {
        setSubmission(submissionsData.submission || null);
      }
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] || null);
  }

  async function uploadSubmission(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请先选择作业图片。");
      return;
    }

    setPending(true);
    setError("");
    const formData = new FormData();
    formData.set("assignmentId", assignmentId);
    formData.set("image", file);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "提交失败，请稍后再试。");
        return;
      }
      setSubmission(data.submission);
      setFile(null);
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return <main className="portal-shell p-6">正在加载作业详情...</main>;
  }

  return (
    <main className="portal-shell space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{assignment?.title}</h1>
          <p className="text-sm text-slate-600">
            所属班级：{assignment?.class.name} ｜ 截止时间：
            {assignment?.dueDate ? ` ${new Date(assignment.dueDate).toLocaleString("zh-CN")}` : " 未设置"}
          </p>
        </div>
        <Link href={assignment ? `/classes/${assignment.classId}` : "/dashboard"} className="text-blue-600">
          返回班级
        </Link>
      </div>

      {assignment?.description ? (
        <section className="portal-card p-4">
          <h2 className="mb-2 font-semibold">作业说明</h2>
          <p className="whitespace-pre-wrap text-sm">{assignment.description}</p>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {user?.role === "STUDENT" ? (
        <>
          <section className="portal-card p-4">
            <h2 className="mb-3 font-semibold">上传作业图片</h2>
            <form onSubmit={uploadSubmission} className="space-y-2">
              <input type="file" accept="image/*" onChange={handleFileChange} required={!submission} />
              <button type="submit" className="bg-teal-700 text-white disabled:opacity-50" disabled={pending}>
                {pending ? "上传中..." : submission ? "重新提交并评分" : "提交并查看反馈"}
              </button>
            </form>
          </section>

          {submission ? (
            <section className="portal-card p-4 space-y-3">
              <h2 className="font-semibold">我的评分结果</h2>
              <img src={submission.imagePath} alt="submission" className="max-h-64 rounded border" />
              <p className="font-medium">
                得分：{submission.gradingResult.overallScore}/{submission.gradingResult.maxScore}
              </p>
              <p className="text-sm">{submission.gradingResult.summary}</p>
              <div className="space-y-2">
                {submission.gradingResult.checks.map((check) => (
                  <div key={check.item} className="rounded border p-2 text-sm">
                    <p className="font-medium">
                      {check.item}：{check.score}/{check.maxScore}
                    </p>
                    <p>{check.comment}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-medium">改进建议</p>
                <ul className="ml-5 list-disc text-sm">
                  {submission.gradingResult.suggestions.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {user?.role === "TEACHER" ? (
        <section className="portal-card p-4">
          <h2 className="mb-3 font-semibold">班级提交情况</h2>
          <div className="space-y-3">
            {submissions.length === 0 ? <p className="text-sm text-slate-500">暂时还没有学生提交。</p> : null}
            {submissions.map((item) => (
              <article key={item.id} className="rounded border p-3">
                <p className="font-medium">
                  {item.student?.name} ({item.student?.email})
                </p>
                <p className="mb-2 text-sm">
                  得分：{item.gradingResult.overallScore}/{item.gradingResult.maxScore} ｜ 提交时间：
                  {` ${new Date(item.createdAt).toLocaleString("zh-CN")}`}
                </p>
                <img src={item.imagePath} alt="submission" className="mb-2 max-h-56 rounded border" />
                <p className="text-sm">{item.gradingResult.summary}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
