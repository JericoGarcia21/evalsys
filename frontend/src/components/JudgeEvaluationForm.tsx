import { useState, useEffect } from 'react';
import type { CategoryScore, JudgeScore } from '../types/rubric';
import { SCORE_RANGES } from '../types/rubric';
import { calculateTotal, validateAllScores } from '../utils/validation';
import ScoreInput from './ScoreInput';

interface JudgeEvaluationFormProps {
  judgeId: string;
  judgeName: string;
  onScoreChange: (judgeScore: JudgeScore) => void;
  disabled?: boolean;
}

export default function JudgeEvaluationForm({
  judgeId,
  judgeName,
  onScoreChange,
  disabled = false
}: JudgeEvaluationFormProps) {
  const [scores, setScores] = useState<CategoryScore>({
    systemFunctionality: 0,
    apiIntegration: 0,
    presentation: 0,
    uiUx: 0,
    questionAnswer: 0
  });

  const [totalScore, setTotalScore] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Auto-compute total whenever scores change
  useEffect(() => {
    const total = calculateTotal(scores);
    setTotalScore(total);

    // Validate scores
    const validation = validateAllScores(scores);
    setValidationErrors(validation.errors);

    // Notify parent component
    onScoreChange({
      judgeId,
      judgeName,
      scores,
      totalScore: total
    });
  }, [scores, judgeId, judgeName, onScoreChange]);

  const updateScore = (category: keyof CategoryScore, value: number) => {
    setScores(prev => ({
      ...prev,
      [category]: value
    }));
  };

  return (
    <div className="judge-evaluation-form">
      <div className="judge-header">
        <h2>Judge: {judgeName}</h2>
        <div className="total-score-display">
          <span className="label">Total Score:</span>
          <span className="score">{totalScore}</span>
          <span className="max-total">/100</span>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          {validationErrors.map((error, idx) => (
            <div key={idx} className="error-item">{error}</div>
          ))}
        </div>
      )}

      <div className="scoring-sections">
        <ScoreInput
          category="systemFunctionality"
          label="1. System Functionality"
          maxScore={SCORE_RANGES.systemFunctionality.maxScore}
          ranges={SCORE_RANGES.systemFunctionality}
          value={scores.systemFunctionality}
          onChange={(value) => updateScore('systemFunctionality', value)}
          disabled={disabled}
        />

        <ScoreInput
          category="apiIntegration"
          label="2. API Integration and Database"
          maxScore={SCORE_RANGES.apiIntegration.maxScore}
          ranges={SCORE_RANGES.apiIntegration}
          value={scores.apiIntegration}
          onChange={(value) => updateScore('apiIntegration', value)}
          disabled={disabled}
        />

        <ScoreInput
          category="presentation"
          label="3. Presentation and System Demonstration"
          maxScore={SCORE_RANGES.presentation.maxScore}
          ranges={SCORE_RANGES.presentation}
          value={scores.presentation}
          onChange={(value) => updateScore('presentation', value)}
          disabled={disabled}
        />

        <ScoreInput
          category="uiUx"
          label="4. User Interface and User Experience"
          maxScore={SCORE_RANGES.uiUx.maxScore}
          ranges={SCORE_RANGES.uiUx}
          value={scores.uiUx}
          onChange={(value) => updateScore('uiUx', value)}
          disabled={disabled}
        />

        <ScoreInput
          category="questionAnswer"
          label="5. Question and Answer"
          maxScore={SCORE_RANGES.questionAnswer.maxScore}
          ranges={SCORE_RANGES.questionAnswer}
          value={scores.questionAnswer}
          onChange={(value) => updateScore('questionAnswer', value)}
          disabled={disabled}
        />
      </div>

      <div className="score-breakdown">
        <h4>Score Breakdown:</h4>
        <table>
          <tbody>
            <tr>
              <td>System Functionality:</td>
              <td>{scores.systemFunctionality} / 25</td>
            </tr>
            <tr>
              <td>API Integration & Database:</td>
              <td>{scores.apiIntegration} / 25</td>
            </tr>
            <tr>
              <td>Presentation:</td>
              <td>{scores.presentation} / 15</td>
            </tr>
            <tr>
              <td>UI/UX:</td>
              <td>{scores.uiUx} / 10</td>
            </tr>
            <tr>
              <td>Q&A:</td>
              <td>{scores.questionAnswer} / 25</td>
            </tr>
            <tr className="total-row">
              <td><strong>Total:</strong></td>
              <td><strong>{totalScore} / 100</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
