import type { GradingResult } from "@/types/grading";

export function serializeGradingResult(result: GradingResult) {
  return JSON.stringify(result);
}

export function parseGradingResult(value: string): GradingResult {
  return JSON.parse(value) as GradingResult;
}
