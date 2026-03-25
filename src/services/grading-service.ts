import { GradingResult } from "@/types/grading";

type GradeInput = {
  assignmentTitle: string;
  imagePath: string;
};

// Mock implementation for MVP. Replace this function with real LLM API call later.
export async function gradeHomework(input: GradeInput): Promise<GradingResult> {
  const seed = input.assignmentTitle.length + input.imagePath.length;
  const partA = 25 + (seed % 11);
  const partB = 22 + (seed % 9);
  const partC = 20 + (seed % 13);
  const total = partA + partB + partC;

  return {
    overallScore: total,
    maxScore: 100,
    summary: "Overall proof approach is correct. Set and relation parts are solid, induction can be more rigorous.",
    checks: [
      {
        item: "Propositional logic",
        score: partA,
        maxScore: 35,
        comment: "Equivalent transformations are clear and notation usage is correct."
      },
      {
        item: "Sets and relations",
        score: partB,
        maxScore: 30,
        comment: "Explanation of transitivity is complete; edge cases can be added."
      },
      {
        item: "Mathematical induction",
        score: partC,
        maxScore: 35,
        comment: "Connection between hypothesis and induction step is weak; add a transition sentence."
      }
    ],
    suggestions: [
      "Check whether quantifier scopes are consistent.",
      "Add one sentence of reasoning for each key conclusion.",
      "Use the notation style agreed in this course."
    ]
  };
}
