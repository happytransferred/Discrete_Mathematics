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
};

export type AssignmentQuestionView = {
  id: string;
  orderIndex: number;
  title: string;
  prompt: string;
  type: QuestionType;
  maxScore: number;
  options: string[];
  referenceAnswer?: string | null;
};

export type StudentAnswerDraft = {
  questionId: string;
  type: QuestionType;
  textAnswer?: string;
  selectedOption?: string;
};
