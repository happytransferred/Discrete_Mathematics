import type { AssignmentQuestion } from "@prisma/client";
import type { AssignmentQuestionInput, AssignmentQuestionView } from "@/types/assignment";

export function serializeQuestionOptions(options?: string[]) {
  return JSON.stringify(options || []);
}

export function parseQuestionOptions(value?: string | null) {
  if (!value) {
    return [] as string[];
  }
  return JSON.parse(value) as string[];
}

export function mapQuestionInput(question: AssignmentQuestionInput, index: number) {
  return {
    orderIndex: index + 1,
    title: question.title.trim() || `第${index + 1}题`,
    prompt: question.prompt.trim(),
    type: question.type,
    maxScore: Number(question.maxScore) || 0,
    options: serializeQuestionOptions(question.options),
    referenceAnswer: question.referenceAnswer?.trim() || null
  };
}

export function formatQuestion(question: AssignmentQuestion): AssignmentQuestionView {
  return {
    id: question.id,
    orderIndex: question.orderIndex,
    title: question.title,
    prompt: question.prompt,
    type: question.type as AssignmentQuestionView["type"],
    maxScore: question.maxScore,
    options: parseQuestionOptions(question.options),
    referenceAnswer: question.referenceAnswer
  };
}

export function formatSubmissionAnswer(answer: {
  id: string;
  questionId: string;
  textAnswer: string | null;
  selectedOption: string | null;
  imagePath: string | null;
  score: number;
  maxScore: number;
  feedback: string;
  question: {
    title: string;
    prompt: string;
    type: string;
  };
}) {
  return {
    id: answer.id,
    questionId: answer.questionId,
    questionTitle: answer.question.title,
    questionType: answer.question.type,
    prompt: answer.question.prompt,
    textAnswer: answer.textAnswer,
    selectedOption: answer.selectedOption,
    imagePath: answer.imagePath,
    score: answer.score,
    maxScore: answer.maxScore,
    feedback: answer.feedback
  };
}
