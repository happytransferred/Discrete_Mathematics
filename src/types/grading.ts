export type GradingResult = {
  overallScore: number;
  maxScore: number;
  summary: string;
  checks: Array<{
    item: string;
    score: number;
    maxScore: number;
    comment: string;
  }>;
  suggestions: string[];
};
