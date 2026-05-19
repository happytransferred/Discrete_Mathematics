import { getAiApiKey, getAiBaseUrl, getAiModel, getAiProvider } from "@/lib/env";
import { QUESTION_TYPES, type AssignmentQuestionView, type StudentAnswerDraft } from "@/types/assignment";
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

type EnrichedAnswer = StudentAnswerDraft & {
  imagePath?: string | null;
};

const AI_REQUEST_TIMEOUT_MS = 15000;

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

function normalizeText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function displayText(value: string | null | undefined) {
  return (value || "").trim();
}

function parseReferenceOptions(referenceAnswer: string | null | undefined) {
  return normalizeText(referenceAnswer)
    .split(/[，、,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasTextAnswer(answer: EnrichedAnswer | undefined) {
  return Boolean(displayText(answer?.textAnswer));
}

function hasImageAnswer(answer: EnrichedAnswer | undefined) {
  return Boolean(answer?.imagePath);
}

function hasProofSteps(answer: EnrichedAnswer | undefined) {
  return Boolean((answer?.stepAnswers || []).some((item) => displayText(item)));
}

function inferSingleChoiceFromText(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  const direct = normalizeText(answer?.selectedOption);
  if (direct) {
    return direct;
  }

  const text = normalizeText(answer?.textAnswer);
  if (!text) {
    return "";
  }

  const letterMatch = text.match(/\b([a-z])\b/);
  if (letterMatch) {
    const index = letterMatch[1].charCodeAt(0) - 97;
    if (index >= 0 && index < question.options.length) {
      return normalizeText(question.options[index]);
    }
  }

  const matched = question.options.find((option) => text.includes(normalizeText(option)));
  return matched ? normalizeText(matched) : "";
}

function inferMultipleChoiceFromText(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  const direct = (answer?.selectedOptions || []).map(normalizeText).filter(Boolean);
  if (direct.length > 0) {
    return direct;
  }

  const text = normalizeText(answer?.textAnswer);
  if (!text) {
    return [];
  }

  const letters = Array.from(new Set((text.match(/[a-z]/g) || []).map((item) => item.toLowerCase())));
  const mappedByLetters = letters
    .map((char) => {
      const index = char.charCodeAt(0) - 97;
      return index >= 0 && index < question.options.length ? normalizeText(question.options[index]) : "";
    })
    .filter(Boolean);

  const mappedByText = question.options
    .filter((option) => text.includes(normalizeText(option)))
    .map((option) => normalizeText(option));

  return Array.from(new Set([...mappedByLetters, ...mappedByText]));
}

function scoreSingleChoice(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  const selected = inferSingleChoiceFromText(answer, question);
  const reference = normalizeText(question.referenceAnswer);

  if (!selected) {
    return {
      score: 0,
      comment: "未识别到明确的单选答案。"
    };
  }

  if (reference && selected === reference) {
    return {
      score: question.maxScore,
      comment: "单选题答案正确。"
    };
  }

  return {
    score: 0,
    comment: "单选题答案与参考答案不一致。"
  };
}

function scoreMultipleChoice(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  const selected = inferMultipleChoiceFromText(answer, question);
  const reference = parseReferenceOptions(question.referenceAnswer);

  if (selected.length === 0) {
    return {
      score: 0,
      comment: "未识别到有效的多选答案。"
    };
  }

  if (reference.length === 0) {
    return {
      score: Math.round(question.maxScore * 0.6),
      comment: "该题缺少参考答案，已按保守规则给分，建议教师复核。"
    };
  }

  const referenceSet = new Set(reference);
  const selectedSet = new Set(selected);
  const correctCount = [...selectedSet].filter((item) => referenceSet.has(item)).length;
  const wrongCount = [...selectedSet].filter((item) => !referenceSet.has(item)).length;
  const missingCount = [...referenceSet].filter((item) => !selectedSet.has(item)).length;

  if (wrongCount === 0 && missingCount === 0) {
    return {
      score: question.maxScore,
      comment: "多选题答案完全正确。"
    };
  }

  const ratio = Math.max(0, (correctCount - wrongCount * 0.5) / referenceSet.size);
  return {
    score: Math.max(0, Math.round(question.maxScore * ratio)),
    comment: "多选题部分命中参考答案，建议教师关注漏选或错选情况。"
  };
}

function scoreFillBlank(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  const student = normalizeText(answer?.textAnswer);
  const reference = normalizeText(question.referenceAnswer);

  if (!student) {
    return {
      score: 0,
      comment: "未填写答案。"
    };
  }

  if (reference && student === reference) {
    return {
      score: question.maxScore,
      comment: "填空题答案正确。"
    };
  }

  if (reference && (student.includes(reference) || reference.includes(student))) {
    return {
      score: Math.max(1, Math.round(question.maxScore * 0.6)),
      comment: "答案与参考答案较接近，但表述不够完整。"
    };
  }

  return {
    score: 0,
    comment: "填空题答案与参考答案不一致。"
  };
}

function scoreTextFallback(answerText: string, question: AssignmentQuestionView) {
  const trimmed = answerText.trim();
  if (!trimmed) {
    return {
      score: 0,
      comment: "未填写文本答案。"
    };
  }

  const ratio = Math.min(0.92, 0.4 + trimmed.length / 180);
  return {
    score: Math.max(1, Math.round(question.maxScore * ratio)),
    comment:
      trimmed.length > 80
        ? "答案较完整，建议教师进一步检查关键推理链条。"
        : "已作答，但论证较简略，建议补充关键步骤。"
  };
}

function scoreImageFallback(imagePath: string | null | undefined, question: AssignmentQuestionView) {
  if (!imagePath) {
    return {
      score: 0,
      comment: "未上传图片，无法进行图片题评分。"
    };
  }

  return {
    score: Math.max(1, Math.round(question.maxScore * 0.7)),
    comment: "已收到图片答案，当前为保守评分，建议教师结合原图复核。"
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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildStudentAnswerSummary(answer: EnrichedAnswer | undefined, question: AssignmentQuestionView) {
  if (!answer) {
    return "学生未提交该题答案。";
  }

  const textAnswer = displayText(answer.textAnswer);
  const imageNote = answer.imagePath ? `\n学生还上传了答案图片：${answer.imagePath}` : "";

  switch (question.type) {
    case QUESTION_TYPES.CHOICE:
      return `学生选择：${answer.selectedOption || "未选择"}${textAnswer ? `\n学生确认的文字答案：${textAnswer}` : ""}${imageNote}`;
    case QUESTION_TYPES.MULTIPLE_CHOICE:
      return `学生选择：${(answer.selectedOptions || []).join("、") || "未选择"}${textAnswer ? `\n学生确认的文字答案：${textAnswer}` : ""}${imageNote}`;
    case QUESTION_TYPES.FILL_BLANK:
    case QUESTION_TYPES.TEXT:
      return `学生文本答案：${textAnswer || "未填写"}${imageNote}`;
    case QUESTION_TYPES.PROOF:
      return `学生分步答案：${(answer.stepAnswers || []).map((item, index) => `步骤${index + 1}：${item}`).join("\n") || "未填写"}${textAnswer ? `\n学生确认的图片识别文本：${textAnswer}` : ""}${imageNote}`;
    case QUESTION_TYPES.IMAGE:
      return `${textAnswer ? `学生确认的文字答案：${textAnswer}\n` : ""}${answer.imagePath ? `学生上传了图片：${answer.imagePath}` : "学生未上传图片。"}`;
    default:
      return textAnswer || "学生已提交答案。";
  }
}

function buildScoringPrompt(args: {
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: EnrichedAnswer | undefined;
  supportsVision: boolean;
}) {
  return [
    `课程作业：${args.assignmentTitle}`,
    args.assignmentDescription ? `作业说明：${args.assignmentDescription}` : null,
    `题目标题：${args.question.title}`,
    `题目类型：${args.question.type}`,
    `题目内容：${args.question.prompt}`,
    `分值上限：${args.question.maxScore}`,
    args.question.options.length > 0 ? `题目选项：${args.question.options.join("；")}` : null,
    args.question.gradingRubric ? `评分 rubric：${args.question.gradingRubric}` : null,
    args.question.referenceAnswer ? `参考答案：${args.question.referenceAnswer}` : null,
    buildStudentAnswerSummary(args.answer, args.question),
    !args.supportsVision && (args.question.promptImagePath || args.question.referenceImagePath || args.answer?.imagePath)
      ? "当前模型未启用图片理解，请仅基于可读文本和图片链接上下文给出保守评分，并提醒教师复核。"
      : null,
    '请返回 JSON：{"score": number, "comment": string, "suggestions": [string]}',
    `要求：score 必须在 0 到 ${args.question.maxScore} 之间，comment 使用中文，简明指出得分依据。`
  ]
    .filter(Boolean)
    .join("\n");
}

async function callCompatibleChatCompletion(args: {
  config: ProviderConfig;
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: EnrichedAnswer | undefined;
}) {
  const response = await fetchWithTimeout(`${args.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.config.apiKey}`
    },
    body: JSON.stringify({
      model: args.config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "你是一名中国高校离散数学助教。请根据题面、评分标准、参考答案和学生作答给出严格但鼓励式的评分。只输出 JSON。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildScoringPrompt({
                assignmentTitle: args.assignmentTitle,
                assignmentDescription: args.assignmentDescription,
                question: args.question,
                answer: args.answer,
                supportsVision: args.config.supportsVision
              })
            }
          ]
        }
      ]
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

function extractMessageText(content: string | Array<{ text?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => item.text || "").join("");
  }
  return "";
}

async function callVisionTranscription(args: {
  config: ProviderConfig;
  questionTitle: string;
  questionPrompt?: string | null;
  imageDataUrl: string;
}) {
  const response = await fetchWithTimeout(`${args.config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.config.apiKey}`
    },
    body: JSON.stringify({
      model: args.config.model,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "你是一名离散数学助教。请先识别学生手写或截图中的答案内容，再整理成尽量忠实、清晰的中文文本。保留逻辑符号、集合符号、编号和换行；不要评分；如果某些字句看不清，请用[无法识别]标记。只输出整理后的答案文本。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `题目标题：${args.questionTitle}`,
                args.questionPrompt ? `题目内容：${args.questionPrompt}` : null,
                "请识别这张学生答案图片，并输出一版可编辑文本。"
              ]
                .filter(Boolean)
                .join("\n")
            },
            {
              type: "image_url",
              image_url: {
                url: args.imageDataUrl
              }
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Vision transcription failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const text = extractMessageText(payload.choices?.[0]?.message?.content).trim();
  if (!text) {
    throw new Error("Vision transcription missing content");
  }
  return text;
}

async function callOpenAiResponses(args: {
  config: ProviderConfig;
  assignmentTitle: string;
  assignmentDescription?: string | null;
  question: AssignmentQuestionView;
  answer: EnrichedAnswer | undefined;
}) {
  const inputContent: Array<Record<string, string>> = [
    {
      type: "input_text",
      text: buildScoringPrompt({
        assignmentTitle: args.assignmentTitle,
        assignmentDescription: args.assignmentDescription,
        question: args.question,
        answer: args.answer,
        supportsVision: true
      })
    }
  ];

  if (args.question.promptImagePath) {
    inputContent.push({ type: "input_image", image_url: args.question.promptImagePath });
  }
  if (args.question.referenceImagePath) {
    inputContent.push({ type: "input_image", image_url: args.question.referenceImagePath });
  }
  if (args.answer?.imagePath) {
    inputContent.push({ type: "input_image", image_url: args.answer.imagePath });
  }

  const response = await fetchWithTimeout(`${args.config.baseUrl}/responses`, {
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
          content: [
            {
              type: "input_text",
              text:
                "你是一名中国高校离散数学助教。请根据题面、评分标准、参考答案和学生作答给出严格但鼓励式的评分。只输出 JSON。"
            }
          ]
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
  answer: EnrichedAnswer | undefined;
}) {
  const config = getProviderConfig();
  if (!config) {
    return null;
  }

  if (!config.supportsVision && hasImageAnswer(args.answer)) {
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
  answer: EnrichedAnswer | undefined
) {
  const shouldPreferAi = hasTextAnswer(answer) || hasImageAnswer(answer) || hasProofSteps(answer);

  if (shouldPreferAi) {
    try {
      const aiResult = await callAiForQuestion({
        assignmentTitle,
        assignmentDescription,
        question,
        answer
      });

      if (aiResult) {
        return {
          check: {
            questionId: question.id,
            item: question.title || `第 ${question.orderIndex} 题`,
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
      // 回退到规则评分
    }
  }

  if (question.type === QUESTION_TYPES.CHOICE) {
    const deterministic = scoreSingleChoice(answer, question);
    return {
      check: {
        questionId: question.id,
        item: question.title || `第 ${question.orderIndex} 题`,
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

  if (question.type === QUESTION_TYPES.MULTIPLE_CHOICE) {
    const deterministic = scoreMultipleChoice(answer, question);
    return {
      check: {
        questionId: question.id,
        item: question.title || `第 ${question.orderIndex} 题`,
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

  if (question.type === QUESTION_TYPES.FILL_BLANK) {
    const deterministic = scoreFillBlank(answer, question);
    return {
      check: {
        questionId: question.id,
        item: question.title || `第 ${question.orderIndex} 题`,
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

  const answerText =
    question.type === QUESTION_TYPES.PROOF
      ? (answer?.stepAnswers || []).filter((item) => displayText(item)).join("\n") || answer?.textAnswer || ""
      : answer?.textAnswer || "";

  const fallback =
    question.type === QUESTION_TYPES.IMAGE
      ? scoreImageFallback(answer?.imagePath, question)
      : scoreTextFallback(answerText, question);

  return {
    check: {
      questionId: question.id,
      item: question.title || `第 ${question.orderIndex} 题`,
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
  const results = await Promise.all(
    input.questions.map(async (question) => {
      const answer = input.answers.find((item) => item.questionId === question.id);
      return gradeQuestion(input.assignmentTitle, input.assignmentDescription, question, answer);
    })
  );

  const checks: QuestionGrade[] = results.map((item) => item.check);
  const overallScore = checks.reduce((sum, item) => sum + item.score, 0);
  const maxScore = checks.reduce((sum, item) => sum + item.maxScore, 0);
  const aiUsed = results.some((item) => item.graderType === "AI");
  const model = results.find((item) => item.model)?.model || null;

  return {
    overallScore,
    maxScore,
    summary: aiUsed
      ? "AI 已完成初步评分，建议教师结合 rubric 进行复核。"
      : "当前结果基于规则评分生成，建议教师进行最终确认。",
    graderType: aiUsed ? "AI" : "RULE",
    model,
    checks,
    suggestions: results.flatMap((item) => item.suggestions)
  };
}

export async function recognizeAnswerImage(args: {
  questionTitle: string;
  questionPrompt?: string | null;
  imageDataUrl: string;
}) {
  const config = getProviderConfig();
  if (!config || !config.apiKey) {
    throw new Error("AI service is not configured");
  }
  if (!config.supportsVision) {
    throw new Error("Current AI provider does not support image recognition");
  }

  return callVisionTranscription({
    config,
    questionTitle: args.questionTitle,
    questionPrompt: args.questionPrompt,
    imageDataUrl: args.imageDataUrl
  });
}
