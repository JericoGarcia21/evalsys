import { useState, useEffect } from 'react';
import type { JudgeScore, EvaluationResult } from '../types/rubric';
import { calculateAverageScore } from '../utils/validation';
import { saveEvaluation } from '../utils/storage';
import JudgeEvaluationForm from './JudgeEvaluationForm';

interface Judge {
  id: string;
  name: string;
}

interface MultiJudgeEvaluationProps {
  prefilledStudent?: {
    studentId: string;
    name: string;
  };
  onComplete?: () => void;
}

export default function MultiJudgeEvaluation({ prefilledStudent, onComplete }: MultiJudgeEvaluationProps = {}) {
  const [studentName, setStudentName] = useState(prefilledStudent?.name || '');
  const [studentId, setStudentId] = useState(prefilledStudent?.studentId || '');
  const [judges, setJudges] = useState<Judge[]>([
    { id: '1', name: 'Judge 1' },
    { id: '2', name: 'Judge 2' },
    { id: '3', name: 'Judge 3' }
  ]);
  const [judgeScores, setJudgeScores] = useState<Map<string, JudgeScore>>(new Map());
  const [finalScore, setFinalScore] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Calculate final score whenever judge scores change
  useEffect(() => {
    if (judgeScores.size === 0) {
      setFinalScore(0);
      return;
    }

    const scores = Array.from(judgeScores.values()).map(js => js.totalScore);
    const average = calculateAverageScore(scores);
    setFinalScore(average);
  }, [judgeScores]);

  const handleJudgeScoreChange = (judgeScore: JudgeScore) => {
    setJudgeScores(prev => {
      const newMap = new Map(prev);
      newMap.set(judgeScore.judgeId, judgeScore);
      return newMap;
    });
  };

  const addJudge = () => {
    const newId = (judges.length + 1).toString();
    setJudges([...judges, { id: newId, name: `Judge ${newId}` }]);
  };

  const removeJudge = (judgeId: string) => {
    if (judges.length <= 1) {
      alert('At least one judge is required');
      return;
    }
    setJudges(judges.filter(j => j.id !== judgeId));
    setJudgeScores(prev => {
      const newMap = new Map(prev);
      newMap.delete(judgeId);
      return newMap;
    });
  };

  const updateJudgeName = (judgeId: string, newName: string) => {
    setJudges(judges.map(j => j.id === judgeId ? { ...j, name: newName } : j));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!studentName || !studentId) {
      alert('Please enter student name and ID');
      return;
    }

    if (judgeScores.size !== judges.length) {
      alert('All judges must complete their evaluation');
      return;
    }

    const result: EvaluationResult = {
      studentId,
      studentName,
      judges: Array.from(judgeScores.values()),
      finalScore,
      timestamp: new Date()
    };

    console.log('Evaluation Result:', result);
    
    // Store using storage utility
    saveEvaluation(result);

    setIsSubmitted(true);
    alert(`Evaluation submitted successfully!\nFinal Score: ${finalScore}/100`);
    
    if (onComplete) {
      setTimeout(() => onComplete(), 1500);
    }
  };

  const handleReset = () => {
    setStudentName('');
    setStudentId('');
    setJudgeScores(new Map());
    setIsSubmitted(false);
  };

  return (
    <div className="multi-judge-evaluation">
      <header className="eval-header">
        <h1>Automated Rubric System</h1>
        <p>Multi-Judge Evaluation Platform</p>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="student-info">
          <h2>Student Information</h2>
          <div className="form-group">
            <label htmlFor="studentId">Student ID:</label>
            <input
              id="studentId"
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              disabled={isSubmitted || !!prefilledStudent}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="studentName">Student Name:</label>
            <input
              id="studentName"
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              disabled={isSubmitted || !!prefilledStudent}
              required
            />
          </div>
        </div>

        <div className="judges-section">
          <div className="judges-header">
            <h2>Judges ({judges.length})</h2>
            {!isSubmitted && (
              <button type="button" onClick={addJudge} className="add-judge-btn">
                + Add Judge
              </button>
            )}
          </div>

          {judges.map((judge) => (
            <div key={judge.id} className="judge-card">
              <div className="judge-card-header">
                <input
                  type="text"
                  value={judge.name}
                  onChange={(e) => updateJudgeName(judge.id, e.target.value)}
                  disabled={isSubmitted}
                  className="judge-name-input"
                />
                {!isSubmitted && judges.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeJudge(judge.id)}
                    className="remove-judge-btn"
                  >
                    Remove
                  </button>
                )}
              </div>
              <JudgeEvaluationForm
                judgeId={judge.id}
                judgeName={judge.name}
                onScoreChange={handleJudgeScoreChange}
                disabled={isSubmitted}
              />
            </div>
          ))}
        </div>

        <div className="final-score-section">
          <h2>Final Evaluation</h2>
          <div className="score-summary">
            <div className="summary-item">
              <span className="label">Number of Judges:</span>
              <span className="value">{judges.length}</span>
            </div>
            <div className="summary-item">
              <span className="label">Completed Evaluations:</span>
              <span className="value">{judgeScores.size} / {judges.length}</span>
            </div>
            <div className="summary-item final">
              <span className="label">Final Score (Average):</span>
              <span className="value">{finalScore.toFixed(2)} / 100</span>
            </div>
          </div>

          {judgeScores.size > 0 && (
            <div className="individual-scores">
              <h3>Individual Judge Scores:</h3>
              <ul>
                {Array.from(judgeScores.values()).map((js) => (
                  <li key={js.judgeId}>
                    {js.judgeName}: <strong>{js.totalScore}</strong> / 100
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="form-actions">
          {!isSubmitted ? (
            <button type="submit" className="submit-btn" disabled={judgeScores.size !== judges.length}>
              Submit Evaluation
            </button>
          ) : (
            <button type="button" onClick={handleReset} className="reset-btn">
              New Evaluation
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
