"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { AssignmentQuestionView, StudentAnswerDraft } from "@/types/assignment";

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
  totalScore: number;
  allowResubmission: boolean;
  class: { id: string; name: string };
  questions: AssignmentQuestionView[];
};

type SubmissionAnswerView = {
  id: string;
  questionId: string;
  questionTitle: string;
  questionType: string;
  prompt: string;
  textAnswer?: string | null;
  selectedOption?: string | null;
  imagePath?: string | null;
  score: number;
  maxScore: number;
  feedback: string;
};

type SubmissionView = {
  id: string;
  attemptNumber: number;
  overallScore: number;
  maxScore: number;
  summary: string;
  createdAt: string;
  student?: { name: string; email: string };
  answers: SubmissionAnswerView[];
};

export default function AssignmentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assignmentId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<SubmissionView | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<SubmissionView[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionView[]>([]);
  const [draftAnswers, setDraftAnswers] = useState<Record<string, StudentAnswerDraft>>({});
  const [draftFiles, setDraftFiles] = useState<Record<string, File | null>>({});
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
        setLatestSubmission(submissionsData.latestSubmission || null);
        setSubmissionHistory(submissionsData.submissionHistory || []);
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

  const isExpired = useMemo(() => {
    if (!assignment?.dueDate) {
      return false;
    }
    return new Date(assignment.dueDate).getTime() < Date.now();
  }, [assignment?.dueDate]);

  function updateTextAnswer(questionId: string, textAnswer: string) {
    setDraftAnswers((current) => ({
      ...current,
      [questionId]: {
        questionId,
        type: assignment?.questions.find((item) => item.id === questionId)?.type || "TEXT",
        textAnswer
      }
    }));
  }

  function updateChoiceAnswer(questionId: string, selectedOption: string) {
    setDraftAnswers((current) => ({
      ...current,
      [questionId]: {
        questionId,
        type: assignment?.questions.find((item) => item.id === questionId)?.type || "CHOICE",
        selectedOption
      }
    }));
  }

  function updateFile(questionId: string, e: ChangeEvent<HTMLInputElement>) {
    setDraftFiles((current) => ({
      ...current,
      [questionId]: e.target.files?.[0] || null
    }));
  }

  async function uploadSubmission(e: FormEvent) {
    e.preventDefault();
    if (!assignment) {
      return;
    }

    setPending(true);
    setError("");

    const formData = new FormData();
    formData.set("assignmentId", assignmentId);
    formData.set("answers", JSON.stringify(Object.values(draftAnswers)));

    Object.entries(draftFiles).forEach(([questionId, file]) => {
      if (file) {
        formData.set(`image_${questionId}`, file);
      }
    });

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
      setLatestSubmission(data.submission);
      setSubmissionHistory((current) => [data.submission, ...current]);
      setDraftFiles({});
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
            所属班级：{assignment?.class.name} ｜ 总分：{assignment?.totalScore} ｜ 截止时间：
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

      {user?.role === "STUDENT" && assignment ? (
        <>
          <section className="portal-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">作答与提交</h2>
              <div className="text-sm text-slate-600">
                {isExpired ? "状态：已截止" : `状态：${assignment.allowResubmission ? "允许重复提交" : "仅允许提交一次"}`}
              </div>
            </div>

            <form onSubmit={uploadSubmission} className="space-y-4">
              {assignment.questions.map((question, index) => (
                <article key={question.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="font-medium text-slate-900">
                      第 {index + 1} 题：{question.title}
                    </h3>
                    <span className="text-sm text-slate-500">{question.maxScore} 分</span>
                  </div>
                  <p className="mb-3 text-sm leading-6 text-slate-600">{question.prompt}</p>

                  {question.type === "TEXT" ? (
                    <textarea
                      className="w-full rounded-md border border-slate-300 px-3 py-2"
                      placeholder="请输入文本答案"
                      value={draftAnswers[question.id]?.textAnswer || ""}
                      onChange={(e) => updateTextAnswer(question.id, e.target.value)}
                    />
                  ) : null}

                  {question.type === "CHOICE" ? (
                    <div className="space-y-2">
                      {question.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name={`choice-${question.id}`}
                            value={option}
                            checked={draftAnswers[question.id]?.selectedOption === option}
                            onChange={(e) => updateChoiceAnswer(question.id, e.target.value)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {question.type === "IMAGE" ? (
                    <input type="file" accept="image/*" onChange={(e) => updateFile(question.id, e)} />
                  ) : null}
                </article>
              ))}

              <button
                type="submit"
                className="portal-button-primary"
                disabled={pending || isExpired}
              >
                {pending ? "提交中..." : latestSubmission ? "再次提交并生成新记录" : "提交作业"}
              </button>
            </form>
          </section>

          {latestSubmission ? (
            <section className="portal-card p-5">
              <h2 className="mb-3 text-xl font-semibold">最近一次成绩详情</h2>
              <p className="text-sm text-slate-600">
                第 {latestSubmission.attemptNumber} 次提交 ｜ 得分 {latestSubmission.overallScore}/{latestSubmission.maxScore}
              </p>
              <p className="mt-2 text-sm text-slate-700">{latestSubmission.summary}</p>
              <div className="mt-4 space-y-3">
                {latestSubmission.answers.map((answer) => (
                  <article key={answer.id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-medium text-slate-900">{answer.questionTitle}</p>
                    <p className="mt-1 text-sm text-slate-600">{answer.prompt}</p>
                    <p className="mt-2 text-sm text-slate-700">
                      得分：{answer.score}/{answer.maxScore}
                    </p>
                    {answer.textAnswer ? <p className="mt-2 text-sm text-slate-700">文本答案：{answer.textAnswer}</p> : null}
                    {answer.selectedOption ? <p className="mt-2 text-sm text-slate-700">选择答案：{answer.selectedOption}</p> : null}
                    {answer.imagePath ? (
                      <img src={answer.imagePath} alt="submission" className="mt-3 max-h-56 rounded border" />
                    ) : null}
                    <p className="mt-2 text-sm text-slate-600">反馈：{answer.feedback}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="portal-card p-5">
            <h2 className="mb-3 text-xl font-semibold">历史提交记录</h2>
            <div className="space-y-3">
              {submissionHistory.length === 0 ? <p className="text-sm text-slate-500">暂无提交记录。</p> : null}
              {submissionHistory.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">
                    第 {item.attemptNumber} 次提交 ｜ 得分 {item.overallScore}/{item.maxScore}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    提交时间：{new Date(item.createdAt).toLocaleString("zh-CN")}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{item.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {user?.role === "TEACHER" ? (
        <section className="portal-card p-5">
          <h2 className="mb-3 text-xl font-semibold">教师端成绩详情</h2>
          <div className="space-y-4">
            {submissions.length === 0 ? <p className="text-sm text-slate-500">暂时还没有学生提交。</p> : null}
            {submissions.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {item.student?.name}（{item.student?.email}）
                    </p>
                    <p className="text-sm text-slate-600">
                      第 {item.attemptNumber} 次提交 ｜ 得分 {item.overallScore}/{item.maxScore}
                    </p>
                  </div>
                  <span className="text-sm text-slate-500">
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {item.answers.map((answer) => (
                    <div key={answer.id} className="rounded-xl bg-slate-50 p-4">
                      <p className="font-medium text-slate-900">{answer.questionTitle}</p>
                      <p className="mt-1 text-sm text-slate-600">{answer.prompt}</p>
                      <p className="mt-2 text-sm text-slate-700">
                        得分：{answer.score}/{answer.maxScore}
                      </p>
                      {answer.textAnswer ? <p className="mt-2 text-sm text-slate-700">文本答案：{answer.textAnswer}</p> : null}
                      {answer.selectedOption ? <p className="mt-2 text-sm text-slate-700">选择答案：{answer.selectedOption}</p> : null}
                      {answer.imagePath ? (
                        <img src={answer.imagePath} alt="submission" className="mt-3 max-h-56 rounded border" />
                      ) : null}
                      <p className="mt-2 text-sm text-slate-600">反馈：{answer.feedback}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
