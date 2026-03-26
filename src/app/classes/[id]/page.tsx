"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QUESTION_TYPES, type AssignmentQuestionInput, type QuestionType } from "@/types/assignment";

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
  totalScore: number;
  allowResubmission: boolean;
  questionCount: number;
  latestSubmission?: {
    overallScore: number;
    attemptNumber: number;
    createdAt: string;
  } | null;
};

type DraftQuestion = {
  title: string;
  prompt: string;
  type: QuestionType;
  maxScore: number;
  optionsText: string;
  referenceAnswer: string;
};

const emptyQuestion: DraftQuestion = {
  title: "",
  prompt: "",
  type: QUESTION_TYPES.TEXT,
  maxScore: 20,
  optionsText: "",
  referenceAnswer: ""
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
  const [allowResubmission, setAllowResubmission] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ ...emptyQuestion }]);
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

  function updateQuestion(index: number, field: keyof DraftQuestion, value: string | number | QuestionType) {
    setQuestions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    );
  }

  function addQuestion() {
    setQuestions((current) => [...current, { ...emptyQuestion }]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    setError("");

    const payloadQuestions: AssignmentQuestionInput[] = questions.map((question, index) => ({
      title: question.title.trim() || `第${index + 1}题`,
      prompt: question.prompt.trim(),
      type: question.type,
      maxScore: Number(question.maxScore),
      options:
        question.type === QUESTION_TYPES.CHOICE
          ? question.optionsText
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
      referenceAnswer: question.referenceAnswer.trim()
    }));

    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        allowResubmission,
        questions: payloadQuestions
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
    setAllowResubmission(true);
    setQuestions([{ ...emptyQuestion }]);
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
        <section className="portal-card p-5">
          <h2 className="mb-3 text-xl font-semibold">发布多题型作业</h2>
          <form className="space-y-4" onSubmit={createAssignment}>
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
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>截止时间</span>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allowResubmission}
                  onChange={(e) => setAllowResubmission(e.target.checked)}
                />
                允许重复提交
              </label>
            </div>

            <div className="space-y-4">
              {questions.map((question, index) => (
                <article key={`${index}-${question.type}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-medium text-slate-900">题目 {index + 1}</h3>
                    <button
                      type="button"
                      className="text-sm text-rose-600"
                      onClick={() => removeQuestion(index)}
                    >
                      删除
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      placeholder="题目标题"
                      value={question.title}
                      onChange={(e) => updateQuestion(index, "title", e.target.value)}
                    />
                    <select
                      value={question.type}
                      onChange={(e) => updateQuestion(index, "type", e.target.value as QuestionType)}
                    >
                      <option value={QUESTION_TYPES.TEXT}>文本题</option>
                      <option value={QUESTION_TYPES.CHOICE}>选择题</option>
                      <option value={QUESTION_TYPES.IMAGE}>图片题</option>
                    </select>
                  </div>

                  <textarea
                    className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
                    placeholder="题目内容"
                    value={question.prompt}
                    onChange={(e) => updateQuestion(index, "prompt", e.target.value)}
                  />

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="分值"
                      value={question.maxScore}
                      onChange={(e) => updateQuestion(index, "maxScore", Number(e.target.value))}
                    />
                    <input
                      placeholder="参考答案 / 正确选项"
                      value={question.referenceAnswer}
                      onChange={(e) => updateQuestion(index, "referenceAnswer", e.target.value)}
                    />
                  </div>

                  {question.type === QUESTION_TYPES.CHOICE ? (
                    <textarea
                      className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
                      placeholder={"每行一个选项，例如：\nA. 逻辑等值\nB. 逻辑蕴含"}
                      value={question.optionsText}
                      onChange={(e) => updateQuestion(index, "optionsText", e.target.value)}
                    />
                  ) : null}
                </article>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" className="portal-button-secondary" onClick={addQuestion}>
                新增题目
              </button>
              <button type="submit" className="portal-button-primary">
                发布作业
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="portal-card p-5">
        <h2 className="mb-3 text-xl font-semibold">班级作业</h2>
        <div className="space-y-3">
          {assignments.length === 0 ? <p className="text-sm text-slate-500">暂时还没有发布作业。</p> : null}
          {assignments.map((item) => (
            <Link
              key={item.id}
              href={`/assignments/${item.id}`}
              className="block rounded-2xl border border-slate-200 p-4 transition hover:bg-slate-50"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    题目数：{item.questionCount} ｜ 总分：{item.totalScore} ｜ 是否允许重复提交：
                    {item.allowResubmission ? " 是" : " 否"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    截止日期：{item.dueDate ? new Date(item.dueDate).toLocaleString("zh-CN") : "未设置"}
                  </p>
                </div>
                {item.latestSubmission ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    最近提交：第 {item.latestSubmission.attemptNumber} 次 ｜ 得分 {item.latestSubmission.overallScore}
                  </div>
                ) : null}
              </div>
              {item.description ? <p className="mt-3 text-sm text-slate-600">{item.description}</p> : null}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
