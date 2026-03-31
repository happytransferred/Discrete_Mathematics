import { getAiApiKey, getAiBaseUrl, getAiModel, getAiProvider } from "@/lib/env";
import type { AssignmentQuestionView, StudentAnswerDraft } from "@/types/assignment";
import type { GradingResult } from "@/types/grading";

type GradeInput = {
  assignmentTitle: string;
  assignmentDescription?: string | null;
  questions: AssignmentQuestionView[];
  answers: Array<
    StudentAnswerDraft & {
      imagePath?: string | null;
    }
  >;
};

type QuestionGrade = {
  questionId?: string;
  item: string;
  score: number;
  maxScore: number;
  comment: string;
  rubric?: string | null;
  source: "AI" | "RULE" | "TEACHER";
};

type AiQuestionResult = {
  score: number;
  comment: string;
  suggestions?: string[];
};

type ProviderConfig = {
  provider: "openai" | "deepseek" | "kimi";
  apiKey: string;
  model: string;
  baseUrl: string;
  supportsVision: boolean;
};

function scoreTextAnswerFallback(answer: string, maxScore: number) {
  const trimmed = answer.trim();
  if (!trimmed) {
    return {
      score: 0,
      comment: "未填写文本答案，建议补充关键概念、推理步骤和结论。"
    };
  }

  const ratio = Math.min(0.92, 0.45 + trimmed.length / 120);
  return {
    score: Math.max(1, Math.round(maxScore * ratio)),
    comment:
      trimmed.length > 40
        ? "文字作答较完整，建议进一步强化逻辑严谨性。"
        : "已作答，但论证略简，可增加中间推理步骤。"
  };
}

function scoreChoiceAnswer(
  selected: string | undefined,
  reference: string | null | undefined,
  maxScore: number
) {
  if (!selected) {
    return {
      score: 0,
      comment: "未选择选项。"
    };
  }

  if (reference && selected === reference) {
    return {
      score: maxScore,
      comment: "客观题答案正确。"
    };
  }

  return {
    score: Math.max(0, Math.round(maxScore * 0.2)),
    comment: "当前选择与参考答案不一致，建议复习相关知识点。"
  };
}

function scoreImageAnswerFallback(imagePath: string | null | undefined, maxScore: number) {
  if (!imagePath) {
    return {
      score: 0,
      comment: "未上传图片，无法进行该题评分。"
    };
  }

  const seed = imagePath.length % 5;
  return {
    score: Math.max(1, maxScore - seed),
    comment: "已收到图片作答。当前为回退评分结果，建议教师复核书写细节。"
  };
}

function parseJsonObject(text: string) {
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("AI response is not valid JSON");
  }
  return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as AiQuestionResult;
}

function getProviderConfig(): ProviderConfig | null {
  const provider = getAiProvider();
  const apiKey = getAiApiKey(provider);
  if (!provider || !apiKey) {
    return null;
  }

  const normalized = provider === "deepseek" || provider === "kimi" ? provider : "openai";
  return {
    provider: normalized,
    apiKey,
    model: getAiModel(normalized) || "gpt-5.2",
    baseUrl: getAiBaseUrl(normalized) || "https://api.openai.com/v1",
    supportsVision: normalized !== "deepseek"
  };
}

function buildScoringPrompt(args: {
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: StudentAnswerDraft & { imagePath?: string | null };
  supportsVision: boolean;
}) {
  return [
    `课程任务：${args.assignmentTitle}`,
    args.assignmentDescription ? `作业说明：${args.assignmentDescription}` : null,
    `题目标题：${args.question.title}`,
    `题目类型：${args.question.type}`,
    `题目内容：${args.question.prompt}`,
    `分值上限：${args.question.maxScore}`,
    args.question.gradingRubric ? `评分标准：${args.question.gradingRubric}` : null,
    args.question.referenceAnswer ? `参考答案：${args.question.referenceAnswer}` : null,
    args.answer.textAnswer ? `学生文本答案：${args.answer.textAnswer}` : null,
    args.answer.selectedOption ? `学生选择答案：${args.answer.selectedOption}` : null,
    !args.supportsVision && args.question.promptImagePath
      ? `题面图片链接：${args.question.promptImagePath}`
      : null,
    !args.supportsVision && args.question.referenceImagePath
      ? `参考答案图片链接：${args.question.referenceImagePath}`
      : null,
    !args.supportsVision && args.answer.imagePath
      ? `学生图片答案链接：${args.answer.imagePath}`
      : null,
    !args.supportsVision && (args.question.promptImagePath || args.question.referenceImagePath || args.answer.imagePath)
      ? "当前模型未启用图片理解，请仅依据可读文本和链接上下文给出保守评分，并提示教师复核。"
      : null,
    "请返回格式：{\"score\": number, \"comment\": string, \"suggestions\": [string]}",
    `要求：score 必须在 0 到 ${args.question.maxScore} 之间，comment 用中文，指出得分依据。`
  ]
    .filter(Boolean)
    .join("\n");
}

async function callCompatibleChatCompletion(args: {
  config: ProviderConfig;
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: StudentAnswerDraft & { imagePath?: string | null };
}) {
  const systemPrompt =
    "你是一名中国高校离散数学助教。请根据题面、评分标准、参考答案和学生作答给出严格但鼓励式的评分。只输出 JSON。";

  const userText = buildScoringPrompt({
    assignmentTitle: args.assignmentTitle,
    assignmentDescription: args.assignmentDescription,
    question: args.question,
    answer: args.answer,
    supportsVision: args.config.supportsVision
  });

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: userText
    }
  ];

  if (args.config.supportsVision) {
    if (args.question.promptImagePath) {
      userContent.push({
        type: "image_url",
        image_url: { url: args.question.promptImagePath }
      });
    }
    if (args.question.referenceImagePath) {
      userContent.push({
        type: "image_url",
        image_url: { url: args.question.referenceImagePath }
      });
    }
    if (args.answer.imagePath) {
      userContent.push({
        type: "image_url",
        image_url: { url: args.answer.imagePath }
      });
    }
  }

  const response = await fetch(`${args.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.config.apiKey}`
    },
    body: JSON.stringify({
      model: args.config.model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userContent
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((item) => item.text || "").join("")
        : "";

  if (!text) {
    throw new Error("AI response missing content");
  }

  const parsed = parseJsonObject(text);
  return {
    score: Math.max(0, Math.min(args.question.maxScore, Math.round(parsed.score || 0))),
    comment: parsed.comment || "AI 已完成评分，但未返回详细评语。",
    suggestions: parsed.suggestions || [],
    model: args.config.model
  };
}

async function callOpenAiResponses(args: {
  config: ProviderConfig;
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: StudentAnswerDraft & { imagePath?: string | null };
}) {
  const systemPrompt =
    "你是一名中国高校离散数学助教。请根据题面、评分标准、参考答案和学生作答给出严格但鼓励式的评分。只输出 JSON。";

  const userText = buildScoringPrompt({
    assignmentTitle: args.assignmentTitle,
    assignmentDescription: args.assignmentDescription,
    question: args.question,
    answer: args.answer,
    supportsVision: true
  });

  const inputContent: Array<Record<string, string>> = [{ type: "input_text", text: userText }];

  if (args.question.promptImagePath) {
    inputContent.push({ type: "input_image", image_url: args.question.promptImagePath });
  }
  if (args.question.referenceImagePath) {
    inputContent.push({ type: "input_image", image_url: args.question.referenceImagePath });
  }
  if (args.answer.imagePath) {
    inputContent.push({ type: "input_image", image_url: args.answer.imagePath });
  }

  const response = await fetch(`${args.config.baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.config.apiKey}`
    },
    body: JSON.stringify({
      model: args.config.model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: inputContent
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { output_text?: string };
  if (!payload.output_text) {
    throw new Error("OpenAI response missing output_text");
  }

  const parsed = parseJsonObject(payload.output_text);
  return {
    score: Math.max(0, Math.min(args.question.maxScore, Math.round(parsed.score || 0))),
    comment: parsed.comment || "AI 已完成评分，但未返回详细评语。",
    suggestions: parsed.suggestions || [],
    model: args.config.model
  };
}

async function callAiForQuestion(args: {
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: StudentAnswerDraft & { imagePath?: string | null };
}) {
  const config = getProviderConfig();
  if (!config) {
    return null;
  }

  if (
    !config.supportsVision &&
    args.question.type === "IMAGE" &&
    (args.answer.imagePath || args.question.promptImagePath || args.question.referenceImagePath)
  ) {
    return null;
  }

  if (config.provider === "openai") {
    return callOpenAiResponses({
      config,
      assignmentTitle: args.assignmentTitle,
      assignmentDescription: args.assignmentDescription,
      question: args.question,
      answer: args.answer
    });
  }

  return callCompatibleChatCompletion({
    config,
    assignmentTitle: args.assignmentTitle,
    assignmentDescription: args.assignmentDescription,
    question: args.question,
    answer: args.answer
  });
}

async function gradeQuestion(
  assignmentTitle: string,
  assignmentDescription: string | null | undefined,
  question: AssignmentQuestionView,
  answer: (StudentAnswerDraft & { imagePath?: string | null }) | undefined
) {
  if (question.type === "CHOICE") {
    const deterministic = scoreChoiceAnswer(answer?.selectedOption, question.referenceAnswer, question.maxScore);
    return {
      check: {
        questionId: question.id,
        item: question.title || `第${question.orderIndex}题`,
        score: deterministic.score,
        maxScore: question.maxScore,
        comment: deterministic.comment,
        rubric: question.gradingRubric || null,
        source: "RULE" as const
      },
      suggestions: [] as string[],
      model: null as string | null,
      graderType: "RULE" as const
    };
  }

  try {
    const aiResult = await callAiForQuestion({
      assignmentTitle,
      assignmentDescription,
      question,
      answer: answer || { questionId: question.id, type: question.type }
    });

    if (aiResult) {
      return {
        check: {
          questionId: question.id,
          item: question.title || `第${question.orderIndex}题`,
          score: aiResult.score,
          maxScore: question.maxScore,
          comment: aiResult.comment,
          rubric: question.gradingRubric || null,
          source: "AI" as const
        },
        suggestions: aiResult.suggestions || [],
        model: aiResult.model,
        graderType: "AI" as const
      };
    }
  } catch {
    // fall through to rule-based fallback
  }

  const fallback =
    question.type === "IMAGE"
      ? scoreImageAnswerFallback(answer?.imagePath, question.maxScore)
      : scoreTextAnswerFallback(answer?.textAnswer || "", question.maxScore);

  return {
    check: {
      questionId: question.id,
      item: question.title || `第${question.orderIndex}题`,
      score: fallback.score,
      maxScore: question.maxScore,
      comment: fallback.comment,
      rubric: question.gradingRubric || null,
      source: "RULE" as const
    },
    suggestions: [] as string[],
    model: null as string | null,
    graderType: "RULE" as const
  };
}

export async function gradeHomework(input: GradeInput): Promise<GradingResult> {
  const allSuggestions = new Set<string>();
  let hasAiCheck = false;
  let model: string | null = null;

  const checks: QuestionGrade[] = [];
  for (const question of input.questions) {
    const answer = input.answers.find((item) => item.questionId === question.id);
    const result = await gradeQuestion(
      input.assignmentTitle,
      input.assignmentDescription,
      question,
      answer
    );
    checks.push(result.check);
    result.suggestions.forEach((item) => allSuggestions.add(item));
    if (result.graderType === "AI") {
      hasAiCheck = true;
      model = result.model;
    }
  }

  const overallScore = checks.reduce((sum, item) => sum + item.score, 0);
  const maxScore = input.questions.reduce((sum, item) => sum + item.maxScore, 0);

  return {
    overallScore,
    maxScore,
    summary:
      overallScore >= Math.round(maxScore * 0.8)
        ? `《${input.assignmentTitle}》整体完成情况较好，建议继续保持规范表达。`
        : `《${input.assignmentTitle}》已完成提交，建议结合各题反馈继续完善思路和书写。`,
    graderType: hasAiCheck ? "AI" : "RULE",
    model,
    checks,
    suggestions:
      allSuggestions.size > 0
        ? Array.from(allSuggestions)
        : [
            "优先检查逻辑表达是否完整，尤其是定义、条件和结论之间的连接。",
            "证明题尽量写出关键中间步骤，避免只给结果。",
            "图片答案建议保持页面清晰、边缘完整，便于教师复核。"
          ]
  };
}
