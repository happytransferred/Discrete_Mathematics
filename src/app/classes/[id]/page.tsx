"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  QUESTION_TYPES,
  type AssignmentQuestionInput,
  type AssignmentTemplateView,
  type QuestionType
} from "@/types/assignment";

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
  template?: { id: string; title: string } | null;
  latestSubmission?: {
    overallScore: number;
    attemptNumber: number;
    createdAt: string;
  } | null;
};

type DraftQuestion = {
  clientKey: string;
  title: string;
  prompt: string;
  type: QuestionType;
  maxScore: number;
  optionsText: string;
  referenceAnswer: string;
  gradingRubric: string;
  promptImagePath?: string | null;
  referenceImagePath?: string | null;
};

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string; helper: string }> = [
  { value: QUESTION_TYPES.CHOICE, label: "单选题", helper: "学生从选项中选择一个答案。" },
  { value: QUESTION_TYPES.MULTIPLE_CHOICE, label: "多选题", helper: "学生可选择多个答案。" },
  { value: QUESTION_TYPES.FILL_BLANK, label: "填空题", helper: "学生在线填写简短答案。" },
  { value: QUESTION_TYPES.TEXT, label: "简答题", helper: "学生提交自由文本回答。" },
  { value: QUESTION_TYPES.PROOF, label: "证明题", helper: "学生按步骤在线填写证明过程。" },
  { value: QUESTION_TYPES.IMAGE, label: "图片补充题", helper: "允许学生上传图片作为补充答案。" }
];

const emptyQuestion: DraftQuestion = {
  clientKey: "",
  title: "",
  prompt: "",
  type: QUESTION_TYPES.TEXT,
  maxScore: 20,
  optionsText: "",
  referenceAnswer: "",
  gradingRubric: "",
  promptImagePath: null,
  referenceImagePath: null
};

function createDraftQuestion(overrides?: Partial<DraftQuestion>): DraftQuestion {
  return {
    ...emptyQuestion,
    clientKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    ...overrides
  };
}

function formatDateTime(dateString: string | null) {
  if (!dateString) {
    return "未设置";
  }
  return new Date(dateString).toLocaleString("zh-CN");
}

function reindexFiles(files: Record<number, File | null>, removedIndex: number) {
  return Object.entries(files).reduce<Record<number, File | null>>((acc, [index, file]) => {
    const numericIndex = Number(index);
    if (numericIndex === removedIndex || !file) {
      return acc;
    }
    acc[numericIndex > removedIndex ? numericIndex - 1 : numericIndex] = file;
    return acc;
  }, {});
}

function normalizeOptions(text: string) {
  return text
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function needsOptions(type: QuestionType) {
  return type === QUESTION_TYPES.CHOICE || type === QUESTION_TYPES.MULTIPLE_CHOICE;
}

function questionTypeLabel(type: QuestionType) {
  return QUESTION_TYPE_OPTIONS.find((item) => item.value === type)?.label || type;
}

export default function ClassDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const classId = params.id;

  const [user, setUser] = useState<User | null>(null);
  const [classInfo, setClassInfo] = useState<ClassEntity | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [templates, setTemplates] = useState<AssignmentTemplateView[]>([]);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [allowResubmission, setAllowResubmission] = useState(true);
  const [questions, setQuestions] = useState<DraftQuestion[]>([createDraftQuestion()]);
  const [promptImageFiles, setPromptImageFiles] = useState<Record<number, File | null>>({});
  const [referenceImageFiles, setReferenceImageFiles] = useState<Record<number, File | null>>({});
  const [templateDueDates, setTemplateDueDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [publishingAssignment, setPublishingAssignment] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [publishingTemplateId, setPublishingTemplateId] = useState<string | null>(null);

  const totalScore = useMemo(
    () => questions.reduce((sum, item) => sum + Number(item.maxScore || 0), 0),
    [questions]
  );

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

      if (me.role === "TEACHER") {
        const templateRes = await fetch("/api/assignment-templates");
        const templateData = await templateRes.json();
        if (!templateRes.ok) {
          setError(templateData.error || "加载作业库失败。");
          return;
        }
        setTemplates(templateData.templates || []);
      }
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

  function resetEditor() {
    setEditingTemplateId(null);
    setTitle("");
    setDescription("");
    setDueDate("");
    setAllowResubmission(true);
    setQuestions([createDraftQuestion()]);
    setPromptImageFiles({});
    setReferenceImageFiles({});
  }

  function updateQuestion(index: number, field: keyof DraftQuestion, value: string | number | QuestionType) {
    setQuestions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
              optionsText:
                field === "type" && !needsOptions(value as QuestionType) ? "" : item.optionsText
            }
          : item
      )
    );
  }

  function addQuestion() {
    setQuestions((current) => [...current, createDraftQuestion()]);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => (current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index)));
    setPromptImageFiles((current) => reindexFiles(current, index));
    setReferenceImageFiles((current) => reindexFiles(current, index));
  }

  function updatePromptImage(index: number, file: File | null) {
    setPromptImageFiles((current) => ({ ...current, [index]: file }));
  }

  function updateReferenceImage(index: number, file: File | null) {
    setReferenceImageFiles((current) => ({ ...current, [index]: file }));
  }

  function buildQuestionPayload(): AssignmentQuestionInput[] {
    return questions.map((question, index) => ({
      title: question.title.trim() || `第 ${index + 1} 题`,
      prompt: question.prompt.trim(),
      type: question.type,
      maxScore: Number(question.maxScore),
      options: needsOptions(question.type) ? normalizeOptions(question.optionsText) : [],
      referenceAnswer: question.referenceAnswer.trim(),
      gradingRubric: question.gradingRubric.trim(),
      promptImagePath: question.promptImagePath || null,
      referenceImagePath: question.referenceImagePath || null
    }));
  }

  function appendQuestionFiles(formData: FormData) {
    Object.entries(promptImageFiles).forEach(([index, file]) => {
      if (file) {
        formData.set(`promptImage_${index}`, file);
      }
    });
    Object.entries(referenceImageFiles).forEach(([index, file]) => {
      if (file) {
        formData.set(`referenceImage_${index}`, file);
      }
    });
  }

  async function saveTemplate() {
    setError("");
    setSavingTemplate(true);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("allowResubmission", String(allowResubmission));
    formData.set("questions", JSON.stringify(buildQuestionPayload()));
    appendQuestionFiles(formData);

    try {
      const endpoint = editingTemplateId ? `/api/assignment-templates/${editingTemplateId}` : "/api/assignment-templates";
      const method = editingTemplateId ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "保存到作业库失败。");
        return;
      }

      if (editingTemplateId) {
        setTemplates((current) => current.map((item) => (item.id === data.template.id ? data.template : item)));
      } else {
        setTemplates((current) => [data.template, ...current]);
      }

      resetEditor();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPublishingAssignment(true);

    const formData = new FormData();
    formData.set("classId", classId);
    formData.set("title", title);
    formData.set("description", description);
    formData.set("dueDate", dueDate ? new Date(dueDate).toISOString() : "");
    formData.set("allowResubmission", String(allowResubmission));
    formData.set("templateId", editingTemplateId || "");
    formData.set("questions", JSON.stringify(buildQuestionPayload()));
    appendQuestionFiles(formData);

    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "发布作业失败。");
        return;
      }

      resetEditor();
      await loadData();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPublishingAssignment(false);
    }
  }

  function loadTemplateToEditor(template: AssignmentTemplateView) {
    setEditingTemplateId(template.id);
    setTitle(template.title);
    setDescription(template.description || "");
    setDueDate("");
    setAllowResubmission(template.allowResubmission);
    setQuestions(
      template.questions.length > 0
        ? template.questions.map((question) => ({
            clientKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            title: question.title,
            prompt: question.prompt,
            type: question.type,
            maxScore: question.maxScore,
            optionsText: question.options.join("\n"),
            referenceAnswer: question.referenceAnswer || "",
            gradingRubric: question.gradingRubric || "",
            promptImagePath: question.promptImagePath || null,
            referenceImagePath: question.referenceImagePath || null
          }))
        : [createDraftQuestion()]
    );
    setPromptImageFiles({});
    setReferenceImageFiles({});
  }

  async function deleteTemplate(templateId: string) {
    if (!window.confirm("删除后该作业库条目将不可恢复，确认继续吗？")) {
      return;
    }

    setDeletingTemplateId(templateId);
    setError("");

    try {
      const res = await fetch(`/api/assignment-templates/${templateId}`, {
        method: "DELETE"
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "删除作业库条目失败。");
        return;
      }

      setTemplates((current) => current.filter((item) => item.id !== templateId));
      if (editingTemplateId === templateId) {
        resetEditor();
      }
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setDeletingTemplateId(null);
    }
  }

  async function publishTemplate(templateId: string) {
    setError("");
    setPublishingTemplateId(templateId);

    try {
      const publishDueDate = templateDueDates[templateId] || "";
      const res = await fetch(`/api/assignment-templates/${templateId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          dueDate: publishDueDate ? new Date(publishDueDate).toISOString() : ""
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "从作业库发布失败。");
        return;
      }

      await loadData();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setPublishingTemplateId(null);
    }
  }

  if (loading) {
    return <main className="portal-shell p-6">正在加载班级信息...</main>;
  }

  return (
    <main className="portal-shell space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{classInfo?.name}</h1>
          <p className="text-sm text-slate-600">
            班级码：{classInfo?.code} | 任课教师：{classInfo?.teacher.name}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-blue-600">
          返回工作台
        </Link>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">班级人数</p>
          <p className="mt-2 text-3xl font-semibold">{classInfo?._count.members || 0}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">已发布作业</p>
          <p className="mt-2 text-3xl font-semibold">{classInfo?._count.assignments || 0}</p>
        </div>
        <div className="portal-card p-5">
          <p className="text-sm text-slate-500">当前编辑总分</p>
          <p className="mt-2 text-3xl font-semibold">{totalScore}</p>
        </div>
      </section>

      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p> : null}

      {user?.role === "TEACHER" ? (
        <>
          <section className="portal-card space-y-5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">教师备课与作业发布</h2>
                <p className="mt-1 text-sm text-slate-600">
                  先设计结构化题目，再保存到作业库或直接发布到当前班级。
                </p>
              </div>
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
              >
                新建空白作业
              </button>
            </div>

            <form onSubmit={createAssignment} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">作业总标题</span>
                  <input
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="例如：第 4 周离散数学在线作业"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-slate-700">截止时间</span>
                  <input
                    type="datetime-local"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-700">作业说明</span>
                <textarea
                  className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="可以写本次作业的要求、提交说明与答题建议。"
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allowResubmission}
                  onChange={(e) => setAllowResubmission(e.target.checked)}
                />
                允许重复提交
              </label>

              <div className="space-y-5">
                {questions.map((question, index) => (
                  <article key={question.clientKey} className="rounded-3xl border border-slate-200 p-5">
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold">题目 {index + 1}</h3>
                      {questions.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeQuestion(index)}
                          className="text-sm text-red-600"
                        >
                          删除
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-3"
                        value={question.title}
                        onChange={(e) => updateQuestion(index, "title", e.target.value)}
                        placeholder="题目标题"
                      />
                      <select
                        className="rounded-2xl border border-slate-200 px-4 py-3"
                        value={question.type}
                        onChange={(e) => updateQuestion(index, "type", e.target.value as QuestionType)}
                      >
                        {QUESTION_TYPE_OPTIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {QUESTION_TYPE_OPTIONS.find((item) => item.value === question.type)?.helper}
                    </p>

                    <textarea
                      className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                      value={question.prompt}
                      onChange={(e) => updateQuestion(index, "prompt", e.target.value)}
                      placeholder="题目内容"
                    />

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">题面图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updatePromptImage(index, e.target.files?.[0] || null)}
                        />
                        {question.promptImagePath ? (
                          <p className="text-xs text-slate-500">已保存题面图片，将在不重新上传时继续沿用。</p>
                        ) : null}
                      </label>

                      <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-700">参考答案图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updateReferenceImage(index, e.target.files?.[0] || null)}
                        />
                        {question.referenceImagePath ? (
                          <p className="text-xs text-slate-500">已保存参考答案图片，将在不重新上传时继续沿用。</p>
                        ) : null}
                      </label>
                    </div>

                    {needsOptions(question.type) ? (
                      <textarea
                        className="mt-4 min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                        value={question.optionsText}
                        onChange={(e) => updateQuestion(index, "optionsText", e.target.value)}
                        placeholder={"每行一个选项，例如：\nA. 命题 p\nB. 命题 q"}
                      />
                    ) : null}

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-3"
                        type="number"
                        min={0}
                        value={question.maxScore}
                        onChange={(e) => updateQuestion(index, "maxScore", Number(e.target.value))}
                        placeholder="分值"
                      />
                      <input
                        className="rounded-2xl border border-slate-200 px-4 py-3"
                        value={question.referenceAnswer}
                        onChange={(e) => updateQuestion(index, "referenceAnswer", e.target.value)}
                        placeholder="参考答案 / 正确选项"
                      />
                    </div>

                    <textarea
                      className="mt-4 min-h-[100px] w-full rounded-2xl border border-slate-200 px-4 py-3"
                      value={question.gradingRubric}
                      onChange={(e) => updateQuestion(index, "gradingRubric", e.target.value)}
                      placeholder="评分 rubric，例如：定义完整 5 分、推理准确 10 分、结论清晰 5 分。"
                    />
                  </article>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={addQuestion}
                  className="rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700"
                >
                  新增题目
                </button>
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={savingTemplate}
                  className="rounded-full border border-slate-900 px-5 py-3 text-sm font-medium text-slate-900 disabled:opacity-60"
                >
                  {savingTemplate ? "保存中..." : editingTemplateId ? "更新作业库条目" : "保存到作业库"}
                </button>
                <button
                  type="submit"
                  disabled={publishingAssignment}
                  className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {publishingAssignment ? "发布中..." : "发布作业"}
                </button>
              </div>
            </form>
          </section>

          <section className="portal-card p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">教师作业库</h2>
              <p className="mt-1 text-sm text-slate-600">可以复用往年题目，也可以先编辑后再发布到当前班级。</p>
            </div>

            {templates.length === 0 ? (
              <p className="text-sm text-slate-500">当前还没有保存的作业库条目。</p>
            ) : (
              <div className="space-y-4">
                {templates.map((template) => (
                  <article key={template.id} className="rounded-3xl border border-slate-200 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold">{template.title}</h3>
                        <p className="mt-1 text-sm text-slate-600">
                          题目数：{template.questions.length} | 总分：{template.totalScore} | 创建时间：
                          {formatDateTime(template.createdAt)}
                        </p>
                        {template.description ? (
                          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{template.description}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => loadTemplateToEditor(template)}
                          className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700"
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTemplate(template.id)}
                          disabled={deletingTemplateId === template.id}
                          className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-60"
                        >
                          {deletingTemplateId === template.id ? "删除中..." : "删除"}
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {template.questions.map((question) => (
                        <div key={question.id} className="rounded-2xl bg-slate-50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-slate-900">{question.title}</p>
                            <span className="text-xs text-slate-500">
                              {questionTypeLabel(question.type)} | {question.maxScore} 分
                            </span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{question.prompt}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="space-y-2">
                        <span className="text-sm text-slate-600">发布到本班时的截止时间</span>
                        <input
                          type="datetime-local"
                          className="rounded-2xl border border-slate-200 px-4 py-3"
                          value={templateDueDates[template.id] || ""}
                          onChange={(e) =>
                            setTemplateDueDates((current) => ({
                              ...current,
                              [template.id]: e.target.value
                            }))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => publishTemplate(template.id)}
                        disabled={publishingTemplateId === template.id}
                        className="rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                      >
                        {publishingTemplateId === template.id ? "发布中..." : "从作业库发布到本班"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className="portal-card p-6">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">已发布作业</h2>
          <p className="mt-1 text-sm text-slate-600">学生将在线填写答案，教师可在作业详情页查看 AI 建议与人工复核结果。</p>
        </div>

        {assignments.length === 0 ? (
          <p className="text-sm text-slate-500">当前班级还没有发布作业。</p>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <article key={assignment.id} className="rounded-3xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold">{assignment.title}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      截止时间：{formatDateTime(assignment.dueDate)} | 题目数：{assignment.questionCount} | 总分：
                      {assignment.totalScore}
                    </p>
                    {assignment.template ? (
                      <p className="mt-1 text-xs text-slate-500">来源作业库：{assignment.template.title}</p>
                    ) : null}
                    {assignment.description ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{assignment.description}</p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    {user?.role === "STUDENT" && assignment.latestSubmission ? (
                      <p className="text-sm text-slate-600">
                        最近提交：第 {assignment.latestSubmission.attemptNumber} 次，得分
                        {" "}
                        {assignment.latestSubmission.overallScore} 分
                      </p>
                    ) : null}
                    <Link href={`/assignments/${assignment.id}`} className="mt-3 inline-block text-sm font-medium text-blue-600">
                      查看作业详情
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
