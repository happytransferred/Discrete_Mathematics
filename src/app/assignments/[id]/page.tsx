"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SymbolToolbar } from "@/components/symbol-toolbar";
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
  gradingStatus: "PENDING" | "AI_GRADED" | "TEACHER_REVIEWED" | string;
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
  if (status === "PENDING") {
    return "评分处理中";
  }
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
      return "图片识别题";
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
  const [imageAnswerDrafts, setImageAnswerDrafts] = useState<Record<string, string>>({});
  const [imageAnswerConfirmed, setImageAnswerConfirmed] = useState<Record<string, boolean>>({});
  const [recognizingQuestionId, setRecognizingQuestionId] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewState>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  const activeInputKeyRef = useRef<string | null>(null);

  function setInputRef(key: string, element: HTMLInputElement | HTMLTextAreaElement | null) {
    inputRefs.current[key] = element;
  }

  function markActiveInput(key: string) {
    activeInputKeyRef.current = key;
  }

  function insertIntoControlledValue(
    currentValue: string,
    symbol: string,
    key: string,
    applyValue: (nextValue: string) => void
  ) {
    const target = inputRefs.current[key];
    const start = target?.selectionStart ?? currentValue.length;
    const end = target?.selectionEnd ?? currentValue.length;
    const nextValue = `${currentValue.slice(0, start)}${symbol}${currentValue.slice(end)}`;
    const nextCaret = start + symbol.length;

    applyValue(nextValue);

    requestAnimationFrame(() => {
      const nextTarget = inputRefs.current[key];
      nextTarget?.focus();
      nextTarget?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function insertSymbolIntoActiveAnswer(symbol: string) {
    const activeKey = activeInputKeyRef.current;
    if (!activeKey || !assignment) {
      return;
    }

    const [questionId, mode, indexText] = activeKey.split(":");
    const question = assignment.questions.find((item) => item.id === questionId);
    if (!question) {
      return;
    }

    const draft = draftAnswers[questionId] || buildEmptyDraft(question);

    if (mode === "text") {
      if (question.type === QUESTION_TYPES.IMAGE) {
        const currentValue = imageAnswerDrafts[questionId] ?? draft.textAnswer ?? "";
        insertIntoControlledValue(currentValue, symbol, activeKey, (nextValue) => {
          updateImageAnswerDraft(questionId, nextValue);
        });
      } else {
        insertIntoControlledValue(draft.textAnswer || "", symbol, activeKey, (nextValue) => {
          updateDraft(questionId, { textAnswer: nextValue });
        });
      }
      return;
    }

    if (mode === "step") {
      const index = Number(indexText);
      const steps = [...(draft.stepAnswers || [""])];
      const currentValue = steps[index] || "";
      insertIntoControlledValue(currentValue, symbol, activeKey, (nextValue) => {
        steps[index] = nextValue;
        updateDraft(questionId, { stepAnswers: steps });
      });
    }
  }

  const refreshStudentSubmissions = useCallback(async () => {
    const submissionsRes = await fetch(`/api/submissions?assignmentId=${assignmentId}`);
    const submissionsData = await submissionsRes.json();
    if (!submissionsRes.ok) {
      throw new Error(submissionsData.error || "加载提交记录失败。");
    }

    setLatestSubmission(submissionsData.latestSubmission || null);
    setSubmissionHistory(submissionsData.submissionHistory || []);
  }, [assignmentId]);

  async function triggerBackgroundGrading(submissionId: string) {
    try {
      await fetch(`/api/submissions/${submissionId}/grade`, { method: "POST" });
      await refreshStudentSubmissions();
    } catch {
      // 交给前端轮询继续刷新
    }
  }

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

  useEffect(() => {
    if (!assignment || user?.role !== "STUDENT") {
      return;
    }

    setImageAnswerDrafts((current) => {
      const next = { ...current };
      for (const question of assignment.questions) {
        if (question.type === QUESTION_TYPES.IMAGE && !(question.id in next)) {
          next[question.id] = draftAnswers[question.id]?.textAnswer || "";
        }
      }
      return next;
    });

    setImageAnswerConfirmed((current) => {
      const next = { ...current };
      for (const question of assignment.questions) {
        if (question.type === QUESTION_TYPES.IMAGE && !(question.id in next)) {
          next[question.id] = Boolean(draftAnswers[question.id]?.textAnswer?.trim());
        }
      }
      return next;
    });
  }, [assignment, draftAnswers, user?.role]);

  useEffect(() => {
    if (user?.role !== "STUDENT" || !latestSubmission || latestSubmission.gradingStatus !== "PENDING") {
      return;
    }

    const timer = window.setInterval(() => {
      refreshStudentSubmissions().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [latestSubmission, refreshStudentSubmissions, user?.role]);

  const isExpired = useMemo(() => {
    if (!assignment?.dueDate) {
      return false;
    }
    return new Date(assignment.dueDate).getTime() < Date.now();
  }, [assignment?.dueDate]);

  function updateDraft(questionId: string, patch: Partial<StudentAnswerDraft>) {
    setDraftAnswers((current) => {
      const question = assignment?.questions.find((item) => item.id === questionId);
      const base = current[questionId] || (question ? buildEmptyDraft(question) : { questionId, type: QUESTION_TYPES.TEXT });
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
    setImageAnswerConfirmed((current) => ({
      ...current,
      [questionId]: false
    }));
  }

  function updateImageAnswerDraft(questionId: string, value: string) {
    setImageAnswerDrafts((current) => ({
      ...current,
      [questionId]: value
    }));
    setImageAnswerConfirmed((current) => ({
      ...current,
      [questionId]: false
    }));
  }

  function confirmImageAnswer(questionId: string) {
    const value = (imageAnswerDrafts[questionId] ?? "").trim();
    updateDraft(questionId, { textAnswer: value });
    setImageAnswerConfirmed((current) => ({
      ...current,
      [questionId]: true
    }));
  }

  async function recognizeImageAnswer(question: AssignmentQuestionView) {
    const file = draftFiles[question.id];
    if (!file) {
      setError("请先为该题上传答案图片。");
      return;
    }

    setRecognizingQuestionId(question.id);
    setError("");
    try {
      const formData = new FormData();
      formData.set("questionTitle", question.title);
      formData.set("questionPrompt", question.prompt);
      formData.set("image", file);

      const res = await fetch("/api/submissions/recognize", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "图片识别失败，请稍后重试。");
        return;
      }

      setImageAnswerDrafts((current) => ({
        ...current,
        [question.id]: data.text || ""
      }));
      setImageAnswerConfirmed((current) => ({
        ...current,
        [question.id]: false
      }));
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setRecognizingQuestionId(null);
    }
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

    const unconfirmedImageQuestion = assignment.questions.find((question) => {
      if (question.type !== QUESTION_TYPES.IMAGE) {
        return false;
      }
      const workingDraft = (imageAnswerDrafts[question.id] ?? "").trim();
      const finalAnswer = (draftAnswers[question.id]?.textAnswer || "").trim();
      return workingDraft.length > 0 && workingDraft !== finalAnswer;
    });

    if (unconfirmedImageQuestion) {
      setError(`请先确认“${unconfirmedImageQuestion.title}”的识别文本，再提交作业。`);
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
      setImageAnswerConfirmed({});
      void triggerBackgroundGrading(data.submission.id);
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
          <div className="space-y-3">
            <SymbolToolbar onInsert={insertSymbolIntoActiveAnswer} />
            <input
              ref={(element) => setInputRef(`${question.id}:text`, element)}
              onFocus={() => markActiveInput(`${question.id}:text`)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3"
              value={draft.textAnswer || ""}
              onChange={(e) => updateDraft(question.id, { textAnswer: e.target.value })}
              placeholder="请输入答案"
            />
          </div>
        );
      case QUESTION_TYPES.PROOF:
        return (
          <div className="space-y-3">
            <SymbolToolbar onInsert={insertSymbolIntoActiveAnswer} />
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
                  ref={(element) => setInputRef(`${question.id}:step:${index}`, element)}
                  onFocus={() => markActiveInput(`${question.id}:step:${index}`)}
                  className="min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={step}
                  onChange={(e) => updateProofStep(question.id, index, e.target.value)}
                  placeholder="请输入这一步证明内容。"
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
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => recognizeImageAnswer(question)}
                disabled={recognizingQuestionId === question.id || !draftFiles[question.id]}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-60"
              >
                {recognizingQuestionId === question.id ? "识别中..." : "识别图片答案"}
              </button>
              {imageAnswerConfirmed[question.id] ? (
                <span className="text-sm text-emerald-700">已确认，这版文字会作为最终答案提交。</span>
              ) : (
                <span className="text-sm text-slate-500">识别后可手动修改，再点击“确认识别为答案”。</span>
              )}
            </div>
            <SymbolToolbar onInsert={insertSymbolIntoActiveAnswer} />
            <textarea
              ref={(element) => setInputRef(`${question.id}:text`, element)}
              onFocus={() => markActiveInput(`${question.id}:text`)}
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3"
              value={imageAnswerDrafts[question.id] ?? draft.textAnswer ?? ""}
              onChange={(e) => updateImageAnswerDraft(question.id, e.target.value)}
              placeholder="先上传图片并识别；如果识别不准确，可在这里手动修改文本。"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => confirmImageAnswer(question.id)}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                确认识别为答案
              </button>
              <span className="text-sm text-slate-500">只有确认后的文字，才会作为最终答案保存并提交。</span>
            </div>
          </div>
        );
      case QUESTION_TYPES.TEXT:
      default:
        return (
          <div className="space-y-3">
            <SymbolToolbar onInsert={insertSymbolIntoActiveAnswer} />
            <textarea
              ref={(element) => setInputRef(`${question.id}:text`, element)}
              onFocus={() => markActiveInput(`${question.id}:text`)}
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3"
              value={draft.textAnswer || ""}
              onChange={(e) => updateDraft(question.id, { textAnswer: e.target.value })}
              placeholder="请输入文本答案"
            />
          </div>
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
              <img src={answer.imagePath} alt={`${answer.questionTitle} 学生答案图片`} className="max-h-72 rounded-2xl border border-slate-200" />
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
                  <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">评分 rubric：{question.gradingRubric}</p>
                ) : null}
                {user?.role === "TEACHER" && (question.referenceAnswer || question.referenceImagePath) ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    {question.referenceAnswer ? (
                      <p className="whitespace-pre-wrap text-sm text-slate-700">参考答案：{question.referenceAnswer}</p>
                    ) : null}
                    {question.referenceImagePath ? (
                      <img src={question.referenceImagePath} alt={`${question.title} 参考答案图片`} className="mt-4 max-h-72 rounded-2xl border border-slate-200" />
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
                      <p className="text-2xl font-semibold">
                        {latestSubmission.gradingStatus === "PENDING"
                          ? `-- / ${latestSubmission.maxScore}`
                          : `${latestSubmission.overallScore}/${latestSubmission.maxScore}`}
                      </p>
                      <p className="text-sm text-slate-500">{gradingStatusLabel(latestSubmission.gradingStatus)}</p>
                    </div>
                  </div>
                  <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{latestSubmission.summary}</p>
                  <div className="mt-4 space-y-4">
                    {latestSubmission.answers.map((answer) => (
                      <article key={answer.id} className="rounded-2xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-900">{answer.questionTitle}</p>
                          <span className="text-sm text-slate-500">
                            {latestSubmission.gradingStatus === "PENDING" ? "评分中" : `${answer.score}/${answer.maxScore}`}
                          </span>
                        </div>
                        <div className="mt-3">{renderAnswerContent(answer)}</div>
                        <div className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                          <p>
                            {latestSubmission.gradingStatus === "PENDING"
                              ? "系统正在后台调用 AI 评分，请稍后自动刷新查看结果。"
                              : `AI 建议：${answer.aiFeedback || "暂无"}`}
                          </p>
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
                          第 {submission.attemptNumber} 次 |
                          {" "}
                          {submission.gradingStatus === "PENDING" ? "评分中" : `${submission.overallScore}/${submission.maxScore} 分`}
                          {" "}
                          | {formatDateTime(submission.createdAt)}
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
                        <p className="text-2xl font-semibold">
                          {submission.gradingStatus === "PENDING" ? `-- / ${submission.maxScore}` : `${submission.overallScore}/${submission.maxScore}`}
                        </p>
                        {submission.reviewedAt ? <p className="text-sm text-slate-500">复核时间：{formatDateTime(submission.reviewedAt)}</p> : null}
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
                            <p>
                              {submission.gradingStatus === "PENDING"
                                ? "该提交仍在后台评分中，完成后会显示 AI 建议分。"
                                : `AI 建议分：${answer.aiScore ?? answer.score} / ${answer.maxScore}`}
                            </p>
                            <p className="mt-2">
                              {submission.gradingStatus === "PENDING"
                                ? "请稍后刷新页面查看 AI 结果。"
                                : `AI 评语：${answer.aiFeedback || answer.feedback}`}
                            </p>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
                            <input
                              type="number"
                              min={0}
                              max={answer.maxScore}
                              className="rounded-2xl border border-slate-200 px-4 py-3"
                              value={reviewDraft.answers[answer.id]?.score ?? answer.score}
                              onChange={(e) => updateReviewAnswer(submission.id, answer.id, "score", e.target.value)}
                              disabled={submission.gradingStatus === "PENDING"}
                            />
                            <textarea
                              className="min-h-[90px] rounded-2xl border border-slate-200 px-4 py-3"
                              value={reviewDraft.answers[answer.id]?.feedback ?? answer.feedback}
                              onChange={(e) => updateReviewAnswer(submission.id, answer.id, "feedback", e.target.value)}
                              placeholder="教师反馈"
                              disabled={submission.gradingStatus === "PENDING"}
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
                        disabled={submission.gradingStatus === "PENDING"}
                      />
                      <button
                        type="button"
                        onClick={() => saveReview(submission.id)}
                        disabled={reviewingId === submission.id || submission.gradingStatus === "PENDING"}
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
