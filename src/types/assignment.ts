export const QUESTION_TYPES = {
  TEXT: "TEXT",
  CHOICE: "CHOICE",
  IMAGE: "IMAGE"
} as const;

export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES];

export type AssignmentQuestionInput = {
  title: string;
  prompt: string;
  type: QuestionType;
  maxScore: number;
  options?: string[];
  referenceAnswer?: string;
  promptImagePath?: string | null;
  referenceImagePath?: string | null;
};

export type AssignmentQuestionView = {
  id: string;
  orderIndex: number;
  title: string;
  prompt: string;
  promptImagePath?: string | null;
  type: QuestionType;
  maxScore: number;
  options: string[];
  referenceAnswer?: string | null;
  referenceImagePath?: string | null;
};

export type StudentAnswerDraft = {
  questionId: string;
  type: QuestionType;
  textAnswer?: string;
  selectedOption?: string;
};

export type AssignmentTemplateView = {
  id: string;
  title: string;
  description: string | null;
  allowResubmission: boolean;
  totalScore: number;
  createdAt: string;
  questions: AssignmentQuestionView[];
};
