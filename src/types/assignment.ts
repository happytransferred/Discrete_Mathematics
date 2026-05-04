export const QUESTION_TYPES = {
  TEXT: "TEXT",
  CHOICE: "CHOICE",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  FILL_BLANK: "FILL_BLANK",
  PROOF: "PROOF",
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
  gradingRubric?: string;
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
  gradingRubric?: string | null;
};

export type StudentAnswerDraft = {
  questionId: string;
  type: QuestionType;
  textAnswer?: string;
  selectedOption?: string;
  selectedOptions?: string[];
  stepAnswers?: string[];
};

export type SubmissionAnswerView = {
  id: string;
  questionId: string;
  questionTitle: string;
  questionType: QuestionType;
  prompt: string;
  textAnswer?: string | null;
  selectedOption?: string | null;
  selectedOptions?: string[];
  stepAnswers?: string[];
  imagePath?: string | null;
  aiScore?: number | null;
  aiFeedback?: string | null;
  teacherScore?: number | null;
  teacherFeedback?: string | null;
  score: number;
  maxScore: number;
  feedback: string;
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
