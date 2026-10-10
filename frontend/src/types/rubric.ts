// Rubric scoring types and ranges

export type ScoreLevel = 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface ScoreRange {
  min: number;
  max: number;
}

export const SCORE_RANGES = {
  systemFunctionality: {
    Excellent: { min: 21, max: 25 },
    Good: { min: 16, max: 20 },
    Fair: { min: 11, max: 15 },
    Poor: { min: 0, max: 10 },
    maxScore: 25
  },
  apiIntegration: {
    Excellent: { min: 21, max: 25 },
    Good: { min: 16, max: 20 },
    Fair: { min: 11, max: 15 },
    Poor: { min: 0, max: 10 },
    maxScore: 25
  },
  presentation: {
    Excellent: { min: 13, max: 15 },
    Good: { min: 10, max: 12 },
    Fair: { min: 6, max: 9 },
    Poor: { min: 0, max: 5 },
    maxScore: 15
  },
  uiUx: {
    Excellent: { min: 9, max: 10 },
    Good: { min: 7, max: 8 },
    Fair: { min: 4, max: 6 },
    Poor: { min: 0, max: 3 },
    maxScore: 10
  },
  questionAnswer: {
    Excellent: { min: 21, max: 25 },
    Good: { min: 16, max: 20 },
    Fair: { min: 11, max: 15 },
    Poor: { min: 0, max: 10 },
    maxScore: 25
  }
} as const;

export interface CategoryScore {
  systemFunctionality: number;
  apiIntegration: number;
  presentation: number;
  uiUx: number;
  questionAnswer: number;
}

export interface JudgeScore {
  judgeId: string;
  judgeName: string;
  scores: CategoryScore;
  totalScore: number;
}

export interface EvaluationResult {
  studentId: string;
  studentName: string;
  judges: JudgeScore[];
  finalScore: number;
  timestamp: Date;
}
