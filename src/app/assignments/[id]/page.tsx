"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  QUESTION_TYPES,
  type AssignmentQuestionView,
  type StudentAnswerDraft,
  type SubmissionAnswerView
} from "@/types/assignment";
import type { GradingResult } from "@/types/grading";

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

type SubmissionView = {
  id: string;
  attemptNumber: number;
  gradingStatus: string;
  aiSummary?: string | null;
  overallScore: number;
  maxScore: number;
  summary: string;
  aiGradingResult?: GradingResult | null;
  gradingResult: GradingResult;
  reviewedAt?: string | null;
  createdAt: string;
  student?: { id?: string; name: string; email: string };
  answers: SubmissionAnswerView[];
};

type ReviewState = {
  summary: string;
  answers: Record<string, { score: number; feedback: string }>;
};

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) {
    return "未设置";
  }
  return new Date(dateString).toLocaleString("zh-CN");
}

function gradingStatusLabel(status: string) {
  if (status === "TEACHER_REVIEWED") {
    return "教师已复核";
  }
  if (status === "AI_GRADED") {
    return "AI 已评分";
  }
  return status;
}

function buildInitialReview(submission: SubmissionView): ReviewState {
  return {
    summary: submission.summary,
    answers: submission.answers.reduce<Record<string, { score: number; feedback: string }>>((acc, answer) => {
      acc[answer.id] = {
        score: answer.teacherScore ?? answer.score,
        feedback: answer.teacherFeedback ?? answer.feedback
      };
      return acc;
    }, {})
  };
}

function questionTypeLabel(type: string) {
  switch (type) {
    case QUESTION_TYPES.CHOICE:
      return "单选题";
    case QUESTION_TYPES.MULTIPLE_CHOICE:
      return "多选题";
    case QUESTION_TYPES.FILL_BLANK:
      return "填空题";
    case QUESTION_TYPES.TEXT:
      return "简答题";
    case QUESTION_TYPES.PROOF:
      return "证明题";
    case QUESTION_TYPES.IMAGE:
      return "图片补充题";
    default:
      return type;
  }
}

function buildEmptyDraft(question: AssignmentQuestionView): StudentAnswerDraft {
  return {
    questionId: question.id,
    type: question.type,
    textAnswer: "",
    selectedOption: "",
    selectedOptions: [],
    stepAnswers: question.type === QUESTION_TYPES.PROOF ? [""] : []
  };
}

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
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewState>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [meRes, assignmentRes] = await Promise.all([fetch("/api/auth/me"), fetch(`/api/assignments/${assignmentId}`)]);

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
        const nextSubmissions = (submissionsData.submissions || []) as SubmissionView[];
        setSubmissions(nextSubmissions);
        setReviewDrafts(
          nextSubmissions.reduce<Record<string, ReviewState>>((acc, item) => {
            acc[item.id] = buildInitialReview(item);
            return acc;
          }, {})
        );
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

  useEffect(() => {
    if (!assignment || user?.role !== "STUDENT") {
      return;
    }

    setDraftAnswers((current) => {
      const next = { ...current };
      for (const question of assignment.questions) {
        if (!next[question.id]) {
          next[question.id] = buildEmptyDraft(question);
        }
      }
      return next;
    });
  }, [assignment, user?.role]);

  const isExpired = useMemo(() => {
    if (!assignment?.dueDate) {
      return false;
    }
    return new Date(assignment.dueDate).getTime() < Date.now();
  }, [assignment?.dueDate]);

  function updateDraft(questionId: string, patch: Partial<StudentAnswerDraft>) {
    setDraftAnswers((current) => {
      const base = current[questionId] || buildEmptyDraft(assignment!.questions.find((item) => item.id === questionId)!);
      return {
        ...current,
        [questionId]: {
          ...base,
          ...patch
        }
      };
    });
  }

  function updateFile(questionId: string, e: ChangeEvent<HTMLInputElement>) {
    setDraftFiles((current) => ({
      ...current,
      [questionId]: e.target.files?.[0] || null
    }));
  }

  function toggleMultipleChoice(questionId: string, option: string, checked: boolean) {
    const existing = draftAnswers[questionId]?.selectedOptions || [];
    const next = checked ? [...new Set([...existing, option])] : existing.filter((item) => item !== option);
    updateDraft(questionId, { selectedOptions: next });
  }

  function updateProofStep(questionId: string, index: number, value: string) {
    const existing = [...(draftAnswers[questionId]?.stepAnswers || [""])];
    existing[index] = value;
    updateDraft(questionId, { stepAnswers: existing });
  }

  function addProofStep(questionId: string) {
    const existing = [...(draftAnswers[questionId]?.stepAnswers || [""])];
    existing.push("");
    updateDraft(questionId, { stepAnswers: existing });
  }

  function removeProofStep(questionId: string, index: number) {
    const existing = [...(draftAnswers[questionId]?.stepAnswers || [""])];
    if (existing.length === 1) {
      existing[0] = "";
    } else {
      existing.splice(index, 1);
    }
    updateDraft(questionId, { stepAnswers: existing });
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

  function updateReviewSummary(submissionId: string, value: string) {
    setReviewDrafts((current) => ({
      ...current,
      [submissionId]: {
        ...(current[submissionId] || { summary: "", answers: {} }),
        summary: value,
        answers: current[submissionId]?.answers || {}
      }
    }));
  }

  function updateReviewAnswer(submissionId: string, answerId: string, field: "score" | "feedback", value: string) {
    setReviewDrafts((current) => {
      const base = current[submissionId] || { summary: "", answers: {} };
      const existing = base.answers[answerId] || { score: 0, feedback: "" };
      return {
        ...current,
        [submissionId]: {
          ...base,
          answers: {
            ...base.answers,
            [answerId]: {
              ...existing,
              [field]: field === "score" ? Number(value) : value
            }
          }
        }
      };
    });
  }

  async function saveReview(submissionId: string) {
    const draft = reviewDrafts[submissionId];
    if (!draft) {
      return;
    }

    setReviewingId(submissionId);
    setError("");
    try {
      const res = await fetch(`/api/submissions/${submissionId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: draft.summary,
          answers: Object.entries(draft.answers).map(([answerId, item]) => ({
            answerId,
            score: Number(item.score),
            feedback: item.feedback
          }))
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "保存批改结果失败。");
        return;
      }
      await loadData();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setReviewingId(null);
    }
  }

  function renderStudentInput(question: AssignmentQuestionView) {
    const draft = draftAnswers[question.id] || buildEmptyDraft(question);

    switch (question.type) {
      case QUESTION_TYPES.CHOICE:
        return (
          <div className="space-y-2">
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name={`choice-${question.id}`}
                  checked={draft.selectedOption === option}
                  onChange={() => updateDraft(question.id, { selectedOption: option })}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      case QUESTION_TYPES.MULTIPLE_CHOICE:
        return (
          <div className="space-y-2">
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={(draft.selectedOptions || []).includes(option)}
                  onChange={(e) => toggleMultipleChoice(question.id, option, e.target.checked)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );
      case QUESTION_TYPES.FILL_BLANK:
        return (
          <input
            className="w-full rounded-2xl border border-slate-200 px-4 py-3"
            value={draft.textAnswer || ""}
            onChange={(e) => updateDraft(question.id, { textAnswer: e.target.value })}
            placeholder="请输入答案"
          />
        );
      case QUESTION_TYPES.PROOF:
        return (
          <div className="space-y-3">
            {(draft.stepAnswers || [""]).map((step, index) => (
              <div key={`${question.id}-${index}`} className="rounded-2xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">步骤 {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeProofStep(question.id, index)}
                    className="text-xs text-red-600"
                  >
                    删除步骤
                  </button>
                </div>
                <textarea
                  className="min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={step}
                  onChange={(e) => updateProofStep(question.id, index, e.target.value)}
                  placeholder="请输入这一证明步骤。"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => addProofStep(question.id)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              新增步骤
            </button>
          </div>
        );
      case QUESTION_TYPES.IMAGE:
        return (
          <div className="space-y-3">
            <input type="file" accept="image/*" onChange={(e) => updateFile(question.id, e)} />
            <textarea
              className="min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3"
              value={draft.textAnswer || ""}
              onChange={(e) => updateDraft(question.id, { textAnswer: e.target.value })}
              placeholder="可选：补充文字说明，帮助教师理解你的图片答案。"
            />
          </div>
        );
      case QUESTION_TYPES.TEXT:
      default:
        return (
          <textarea
            className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3"
            value={draft.textAnswer || ""}
            onChange={(e) => updateDraft(question.id, { textAnswer: e.target.value })}
            placeholder="请输入文本答案"
          />
        );
    }
  }

  function renderAnswerContent(answer: SubmissionAnswerView) {
    switch (answer.questionType) {
      case QUESTION_TYPES.CHOICE:
        return <p className="text-sm text-slate-700">学生选择：{answer.selectedOption || "未作答"}</p>;
      case QUESTION_TYPES.MULTIPLE_CHOICE:
        return <p className="text-sm text-slate-700">学生选择：{answer.selectedOptions?.join("、") || "未作答"}</p>;
      case QUESTION_TYPES.FILL_BLANK:
      case QUESTION_TYPES.TEXT:
        return <p className="whitespace-pre-wrap text-sm text-slate-700">{answer.textAnswer || "未作答"}</p>;
      case QUESTION_TYPES.PROOF:
        return (
          <div className="space-y-2">
            {(answer.stepAnswers || []).length > 0 ? (
              answer.stepAnswers?.map((item, index) => (
                <div key={`${answer.id}-${index}`} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <span className="font-medium">步骤 {index + 1}：</span>
                  {item}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">未填写证明步骤。</p>
            )}
          </div>
        );
      case QUESTION_TYPES.IMAGE:
        return (
          <div className="space-y-3">
            {answer.textAnswer ? <p className="whitespace-pre-wrap text-sm text-slate-700">{answer.textAnswer}</p> : null}
            {answer.imagePath ? (
              <img src={answer.imagePath} alt={`${answer.questionTitle} 学生作答图片`} className="max-h-72 rounded-2xl border border-slate-200" />
            ) : (
              <p className="text-sm text-slate-500">未上传图片。</p>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  if (loading) {
    return <main className="portal-shell p-6">正在加载作业详情...</main>;
  }

  return (
    <main className="portal-shell space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{assignment?.title}</h1>
          <p className="text-sm text-slate-600">
            所属班级：{assignment?.class.name} | 总分：{assignment?.totalScore} | 截止时间：
            {assignment?.dueDate ? ` ${formatDateTime(assignment.dueDate)}` : " 未设置"}
          </p>
        </div>
        <Link href={assignment ? `/classes/${assignment.classId}` : "/dashboard"} className="text-sm font-medium text-blue-600">
          返回班级
        </Link>
      </div>

      {assignment?.description ? (
        <section className="portal-card p-5">
          <h2 className="mb-2 text-lg font-semibold">作业说明</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{assignment.description}</p>
        </section>
      ) : null}

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

      {assignment ? (
        <section className="portal-card p-5">
          <h2 className="mb-4 text-lg font-semibold">题目结构</h2>
          <div className="space-y-4">
            {assignment.questions.map((question, index) => (
              <article key={question.id} className="rounded-3xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">
                    第 {index + 1} 题：{question.title}
                  </h3>
                  <span className="text-sm text-slate-500">
                    {questionTypeLabel(question.type)} | {question.maxScore} 分
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{question.prompt}</p>
                {question.promptImagePath ? (
                  <img src={question.promptImagePath} alt={`${question.title} 题面图片`} className="mt-4 max-h-72 rounded-2xl border border-slate-200" />
                ) : null}
                {user?.role === "TEACHER" && question.gradingRubric ? (
                  <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    评分 rubric：{question.gradingRubric}
                  </p>
                ) : null}
                {user?.role === "TEACHER" && (question.referenceAnswer || question.referenceImagePath) ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    {question.referenceAnswer ? (
                      <p className="whitespace-pre-wrap text-sm text-slate-700">参考答案：{question.referenceAnswer}</p>
                    ) : null}
                    {question.referenceImagePath ? (
                      <img
                        src={question.referenceImagePath}
                        alt={`${question.title} 参考答案图片`}
                        className="mt-4 max-h-72 rounded-2xl border border-slate-200"
                      />
                    ) : null}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {user?.role === "STUDENT" && assignment ? (
        <>
          <section className="portal-card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">在线作答</h2>
                <p className="mt-1 text-sm text-slate-600">
                  当前状态：{isExpired ? "已截止" : assignment.allowResubmission ? "允许重复提交" : "仅允许提交一次"}
                </p>
              </div>
            </div>

            <form onSubmit={uploadSubmission} className="space-y-5">
              {assignment.questions.map((question, index) => (
                <article key={question.id} className="rounded-3xl border border-slate-200 p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      第 {index + 1} 题：{question.title}
                    </h3>
                    <span className="text-sm text-slate-500">{question.maxScore} 分</span>
                  </div>
                  <p className="mb-4 whitespace-pre-wrap text-sm text-slate-700">{question.prompt}</p>
                  {question.promptImagePath ? (
                    <img src={question.promptImagePath} alt={`${question.title} 题面图片`} className="mb-4 max-h-72 rounded-2xl border border-slate-200" />
                  ) : null}
                  {renderStudentInput(question)}
                </article>
              ))}

              <button
                type="submit"
                disabled={pending || isExpired}
                className="rounded-full bg-emerald-700 px-6 py-3 text-sm font-medium text-white disabled:opacity-60"
              >
                {pending ? "提交中..." : "提交在线作答"}
              </button>
            </form>
          </section>

          <section className="portal-card p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">成绩详情</h2>
              <p className="mt-1 text-sm text-slate-600">这里会显示 AI 评分、教师复核状态和历史提交记录。</p>
            </div>

            {latestSubmission ? (
              <div className="space-y-4">
                <article className="rounded-3xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold">最近一次提交</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        第 {latestSubmission.attemptNumber} 次提交 | 提交时间：{formatDateTime(latestSubmission.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold">{latestSubmission.overallScore}/{latestSubmission.maxScore}</p>
                      <p className="text-sm text-slate-500">{gradingStatusLabel(latestSubmission.gradingStatus)}</p>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{latestSubmission.summary}</p>
                  <div className="mt-4 space-y-4">
                    {latestSubmission.answers.map((answer) => (
                      <article key={answer.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-900">{answer.questionTitle}</p>
                          <span className="text-sm text-slate-500">{answer.score}/{answer.maxScore}</span>
                        </div>
                        <div className="mt-3">{renderAnswerContent(answer)}</div>
                        <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                          <p>AI 建议：{answer.aiFeedback || "暂无"}</p>
                          {answer.teacherFeedback ? <p className="mt-2">教师反馈：{answer.teacherFeedback}</p> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                {submissionHistory.length > 1 ? (
                  <article className="rounded-3xl border border-slate-200 p-5">
                    <h3 className="text-lg font-semibold">历史提交</h3>
                    <div className="mt-4 space-y-3">
                      {submissionHistory.slice(1).map((submission) => (
                        <div key={submission.id} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                          第 {submission.attemptNumber} 次 | {submission.overallScore}/{submission.maxScore} 分 |{" "}
                          {formatDateTime(submission.createdAt)}
                        </div>
                      ))}
                    </div>
                  </article>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">你还没有提交这份作业。</p>
            )}
          </section>
        </>
      ) : null}

      {user?.role === "TEACHER" ? (
        <section className="portal-card p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">教师批改台</h2>
            <p className="mt-1 text-sm text-slate-600">按题查看学生结构化答案，结合 AI 建议分完成最终复核。</p>
          </div>

          {submissions.length === 0 ? (
            <p className="text-sm text-slate-500">当前还没有学生提交。</p>
          ) : (
            <div className="space-y-6">
              {submissions.map((submission) => {
                const reviewDraft = reviewDrafts[submission.id] || buildInitialReview(submission);
                return (
                  <article key={submission.id} className="rounded-3xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          {submission.student?.name || "匿名学生"} | 第 {submission.attemptNumber} 次提交
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          提交时间：{formatDateTime(submission.createdAt)} | 当前状态：{gradingStatusLabel(submission.gradingStatus)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-semibold">{submission.overallScore}/{submission.maxScore}</p>
                        {submission.reviewedAt ? (
                          <p className="text-sm text-slate-500">复核时间：{formatDateTime(submission.reviewedAt)}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 space-y-4">
                      {submission.answers.map((answer) => (
                        <article key={answer.id} className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="font-medium text-slate-900">{answer.questionTitle}</h4>
                              <p className="text-xs text-slate-500">{questionTypeLabel(answer.questionType)}</p>
                            </div>
                            <span className="text-sm text-slate-500">满分 {answer.maxScore}</span>
                          </div>
                          <div className="mt-3">{renderAnswerContent(answer)}</div>
                          <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                            <p>AI 建议分：{answer.aiScore ?? answer.score} / {answer.maxScore}</p>
                            <p className="mt-2">AI 评语：{answer.aiFeedback || answer.feedback}</p>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
                            <input
                              type="number"
                              min={0}
                              max={answer.maxScore}
                              className="rounded-2xl border border-slate-200 px-4 py-3"
                              value={reviewDraft.answers[answer.id]?.score ?? answer.score}
                              onChange={(e) => updateReviewAnswer(submission.id, answer.id, "score", e.target.value)}
                            />
                            <textarea
                              className="min-h-[90px] rounded-2xl border border-slate-200 px-4 py-3"
                              value={reviewDraft.answers[answer.id]?.feedback ?? answer.feedback}
                              onChange={(e) => updateReviewAnswer(submission.id, answer.id, "feedback", e.target.value)}
                              placeholder="教师反馈"
                            />
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="mt-5 space-y-3">
                      <textarea
                        className="min-h-[110px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                        value={reviewDraft.summary}
                        onChange={(e) => updateReviewSummary(submission.id, e.target.value)}
                        placeholder="教师总评"
                      />
                      <button
                        type="button"
                        onClick={() => saveReview(submission.id)}
                        disabled={reviewingId === submission.id}
                        className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {reviewingId === submission.id ? "保存中..." : "保存教师复核结果"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
