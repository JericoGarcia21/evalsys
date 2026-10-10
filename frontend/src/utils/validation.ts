import { SCORE_RANGES, type ScoreLevel } from '../types/rubric';

type CategoryKey = keyof typeof SCORE_RANGES;

/**
 * Validates if a score is within the allowed range for a category
 */
export function validateScore(category: CategoryKey, score: number): boolean {
  if (!Number.isInteger(score)) return false;
  if (score < 0) return false;
  if (score > SCORE_RANGES[category].maxScore) return false;
  return true;
}

/**
 * Auto-clamps score to valid range
 */
export function clampScore(category: CategoryKey, score: number): number {
  const maxScore = SCORE_RANGES[category].maxScore;
  
  // Reject negative values
  if (score < 0) return 0;
  
  // Clamp to max
  if (score > maxScore) return maxScore;
  
  // Round to integer
  return Math.floor(score);
}

/**
 * Determines the score level based on the score value
 */
export function getScoreLevel(category: CategoryKey, score: number): ScoreLevel | null {
  const ranges = SCORE_RANGES[category];
  
  if (score >= ranges.Excellent.min && score <= ranges.Excellent.max) return 'Excellent';
  if (score >= ranges.Good.min && score <= ranges.Good.max) return 'Good';
  if (score >= ranges.Fair.min && score <= ranges.Fair.max) return 'Fair';
  if (score >= ranges.Poor.min && score <= ranges.Poor.max) return 'Poor';
  
  return null;
}

/**
 * Validates if score matches the selected level
 */
export function validateScoreLevel(
  category: CategoryKey,
  score: number,
  level: ScoreLevel
): boolean {
  const range = SCORE_RANGES[category][level];
  return score >= range.min && score <= range.max;
}

/**
 * Calculates total score from category scores
 */
export function calculateTotal(scores: {
  systemFunctionality: number;
  apiIntegration: number;
  presentation: number;
  uiUx: number;
  questionAnswer: number;
}): number {
  return (
    scores.systemFunctionality +
    scores.apiIntegration +
    scores.presentation +
    scores.uiUx +
    scores.questionAnswer
  );
}

/**
 * Calculates average score from multiple judges
 */
export function calculateAverageScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, score) => acc + score, 0);
  return Math.round((sum / scores.length) * 100) / 100; // Round to 2 decimal places
}

/**
 * Validates all category scores
 */
export function validateAllScores(scores: {
  systemFunctionality: number;
  apiIntegration: number;
  presentation: number;
  uiUx: number;
  questionAnswer: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!validateScore('systemFunctionality', scores.systemFunctionality)) {
    errors.push('System Functionality score is invalid');
  }
  if (!validateScore('apiIntegration', scores.apiIntegration)) {
    errors.push('API Integration score is invalid');
  }
  if (!validateScore('presentation', scores.presentation)) {
    errors.push('Presentation score is invalid');
  }
  if (!validateScore('uiUx', scores.uiUx)) {
    errors.push('UI/UX score is invalid');
  }
  if (!validateScore('questionAnswer', scores.questionAnswer)) {
    errors.push('Q&A score is invalid');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
