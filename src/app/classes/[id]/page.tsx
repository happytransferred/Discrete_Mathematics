"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
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

const emptyQuestion: DraftQuestion = {
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

function formatDateTime(dateString: string | null) {
  if (!dateString) {
    return "未设置";
  }
  return new Date(dateString).toLocaleString("zh-CN");
}

function reindexFiles(
  files: Record<number, File | null>,
  removedIndex: number
): Record<number, File | null> {
  return Object.entries(files).reduce<Record<number, File | null>>((acc, [index, file]) => {
    const numericIndex = Number(index);
    if (numericIndex === removedIndex || !file) {
      return acc;
    }
    acc[numericIndex > removedIndex ? numericIndex - 1 : numericIndex] = file;
    return acc;
  }, {});
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
  const [questions, setQuestions] = useState<DraftQuestion[]>([{ ...emptyQuestion }]);
  const [promptImageFiles, setPromptImageFiles] = useState<Record<number, File | null>>({});
  const [referenceImageFiles, setReferenceImageFiles] = useState<Record<number, File | null>>({});
  const [templateDueDates, setTemplateDueDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [publishingAssignment, setPublishingAssignment] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

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
    setQuestions([{ ...emptyQuestion }]);
    setPromptImageFiles({});
    setReferenceImageFiles({});
  }

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
    setQuestions((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
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
      const endpoint = editingTemplateId
        ? `/api/assignment-templates/${editingTemplateId}`
        : "/api/assignment-templates";
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
        setTemplates((current) =>
          current.map((item) => (item.id === data.template.id ? data.template : item))
        );
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
        : [{ ...emptyQuestion }]
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
    const publishDueDate = templateDueDates[templateId] || "";

    try {
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
    }
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
            班级码：{classInfo?.code} | 任课教师：{classInfo?.teacher.name}
          </p>
        </div>
        <Link href="/dashboard" className="text-blue-600">
          返回工作台
        </Link>
      </div>

      {user?.role === "TEACHER" ? (
        <>
          <section className="portal-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">备课编辑区</h2>
                <p className="mt-1 text-sm text-slate-600">
                  可以直接发布到当前班级，也可以先保存到作业库，后续重复使用。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {editingTemplateId ? (
                  <span className="rounded-full bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    正在编辑作业库条目
                  </span>
                ) : null}
                <button type="button" className="portal-button-secondary" onClick={resetEditor}>
                  清空编辑器
                </button>
              </div>
            </div>

            <form className="space-y-4" onSubmit={createAssignment}>
              <input
                className="w-full"
                placeholder="作业总标题"
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
                      <label className="space-y-2 text-sm text-slate-700">
                        <span>题面图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updatePromptImage(index, e.target.files?.[0] || null)}
                        />
                        {question.promptImagePath ? (
                          <a
                            href={question.promptImagePath}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600"
                          >
                            查看已上传题面图片
                          </a>
                        ) : null}
                      </label>

                      <label className="space-y-2 text-sm text-slate-700">
                        <span>参考答案图片</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => updateReferenceImage(index, e.target.files?.[0] || null)}
                        />
                        {question.referenceImagePath ? (
                          <a
                            href={question.referenceImagePath}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600"
                          >
                            查看已上传参考答案图片
                          </a>
                        ) : null}
                      </label>
                    </div>

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

                    <textarea
                      className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
                      placeholder="评分 rubric，例如：定义是否准确、推理是否完整、结论是否规范。"
                      value={question.gradingRubric}
                      onChange={(e) => updateQuestion(index, "gradingRubric", e.target.value)}
                    />

                    {question.type === QUESTION_TYPES.CHOICE ? (
                      <textarea
                        className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2"
                        placeholder={"每行一个选项，例如：\nA. 命题恒真\nB. 命题可满足"}
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
                <button
                  type="button"
                  className="portal-button-secondary"
                  disabled={savingTemplate}
                  onClick={saveTemplate}
                >
                  {savingTemplate ? "保存中..." : editingTemplateId ? "更新作业库条目" : "保存到作业库"}
                </button>
                <button type="submit" className="portal-button-primary" disabled={publishingAssignment}>
                  {publishingAssignment ? "发布中..." : "发布到当前班级"}
                </button>
              </div>
            </form>
          </section>

          <section className="portal-card p-5">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">教师作业库</h2>
              <p className="mt-1 text-sm text-slate-600">
                已保存的作业可以再次载入编辑、删除，或直接发布到当前班级。
              </p>
            </div>

            <div className="space-y-4">
              {templates.length === 0 ? <p className="text-sm text-slate-500">当前还没有作业库内容。</p> : null}

              {templates.map((template) => (
                <article key={template.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="font-medium text-slate-900">{template.title}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        题目数：{template.questions.length} | 总分：{template.totalScore} | 允许重复提交：
                        {template.allowResubmission ? "是" : "否"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">最近保存：{formatDateTime(template.createdAt)}</p>
                      {template.description ? <p className="mt-2 text-sm text-slate-600">{template.description}</p> : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="portal-button-secondary"
                        onClick={() => loadTemplateToEditor(template)}
                      >
                        编辑已有条目
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                        onClick={() => deleteTemplate(template.id)}
                        disabled={deletingTemplateId === template.id}
                      >
                        {deletingTemplateId === template.id ? "删除中..." : "删除条目"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                    <label className="space-y-2 text-sm text-slate-700">
                      <span>发布到当前班级的截止时间</span>
                      <input
                        type="datetime-local"
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
                      className="portal-button-primary"
                      onClick={() => publishTemplate(template.id)}
                    >
                      从作业库发布到本班
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {template.questions.map((question) => (
                      <div key={question.id} className="rounded-xl bg-slate-50 p-4">
                        <p className="font-medium text-slate-900">{question.title}</p>
                        <p className="mt-1 text-sm text-slate-600">{question.prompt}</p>
                        <p className="mt-2 text-sm text-slate-500">
                          类型：{question.type} | 分值：{question.maxScore}
                        </p>
                        {question.gradingRubric ? (
                          <p className="mt-2 text-sm text-slate-500">评分标准：{question.gradingRubric}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
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
                    题目数：{item.questionCount} | 总分：{item.totalScore} | 允许重复提交：
                    {item.allowResubmission ? "是" : "否"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">截止日期：{formatDateTime(item.dueDate)}</p>
                  {item.template ? <p className="mt-1 text-sm text-teal-700">来源作业库：{item.template.title}</p> : null}
                </div>

                {item.latestSubmission ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    最近提交：第 {item.latestSubmission.attemptNumber} 次 | 得分 {item.latestSubmission.overallScore}
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
