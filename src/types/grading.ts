export type GradingResult = {
  overallScore: number;
  maxScore: number;
  summary: string;
  graderType: "AI" | "RULE" | "TEACHER";
  model?: string | null;
  checks: Array<{
    questionId?: string;
    item: string;
    score: number;
    maxScore: number;
    comment: string;
    rubric?: string | null;
    source?: "AI" | "RULE" | "TEACHER";
  }>;
  suggestions: string[];
};
