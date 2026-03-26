import type { AssignmentQuestionView, StudentAnswerDraft } from "@/types/assignment";
import type { GradingResult } from "@/types/grading";

type GradeInput = {
  assignmentTitle: string;
  questions: AssignmentQuestionView[];
  answers: Array<
    StudentAnswerDraft & {
      imagePath?: string | null;
    }
  >;
};

function scoreTextAnswer(answer: string, maxScore: number) {
  const trimmed = answer.trim();
  if (!trimmed) {
    return {
      score: 0,
      comment: "未填写文本答案，建议补充关键概念、推理过程和结论。"
    };
  }
  const ratio = Math.min(0.92, 0.45 + trimmed.length / 120);
  return {
    score: Math.max(1, Math.round(maxScore * ratio)),
    comment: trimmed.length > 40 ? "文字作答较完整，建议进一步强化逻辑严谨性。" : "已作答，但论证略简，可增加中间推理步骤。"
  };
}

function scoreChoiceAnswer(selected: string | undefined, reference: string | null | undefined, maxScore: number) {
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
    comment: "当前选择与参考答案不一致，建议复习相关概念。"
  };
}

function scoreImageAnswer(imagePath: string | null | undefined, maxScore: number) {
  if (!imagePath) {
    return {
      score: 0,
      comment: "未上传图片，无法进行该题评分。"
    };
  }
  const seed = imagePath.length % 5;
  return {
    score: Math.max(1, maxScore - seed),
    comment: "已收到图片作答。当前为演示性评分结果，建议教师后续复核手写证明细节。"
  };
}

export async function gradeHomework(input: GradeInput): Promise<GradingResult> {
  const checks = input.questions.map((question) => {
    const answer = input.answers.find((item) => item.questionId === question.id);
    let result: { score: number; comment: string };

    if (question.type === "CHOICE") {
      result = scoreChoiceAnswer(answer?.selectedOption, question.referenceAnswer, question.maxScore);
    } else if (question.type === "IMAGE") {
      result = scoreImageAnswer(answer?.imagePath, question.maxScore);
    } else {
      result = scoreTextAnswer(answer?.textAnswer || "", question.maxScore);
    }

    return {
      item: question.title || `第${question.orderIndex}题`,
      score: result.score,
      maxScore: question.maxScore,
      comment: result.comment
    };
  });

  const overallScore = checks.reduce((sum, item) => sum + item.score, 0);
  const maxScore = input.questions.reduce((sum, item) => sum + item.maxScore, 0);

  return {
    overallScore,
    maxScore,
    summary:
      overallScore >= Math.round(maxScore * 0.8)
        ? `《${input.assignmentTitle}》整体完成情况较好，建议继续保持规范表达。`
        : `《${input.assignmentTitle}》已完成提交，建议结合各题反馈继续完善思路和书写。`,
    checks,
    suggestions: [
      "优先检查逻辑表达是否完整，尤其是定义、条件和结论之间的连接。",
      "证明题尽量写出关键中间步骤，避免只给结果。",
      "提交图片题时请保持页面清晰、边缘完整。"
    ]
  };
}
