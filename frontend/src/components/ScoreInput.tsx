import { useState, useEffect } from 'react';
import type { ScoreLevel } from '../types/rubric';
import { clampScore, getScoreLevel, validateScoreLevel } from '../utils/validation';

interface ScoreInputProps {
  category: 'systemFunctionality' | 'apiIntegration' | 'presentation' | 'uiUx' | 'questionAnswer';
  label: string;
  maxScore: number;
  ranges: {
    Excellent: { min: number; max: number };
    Good: { min: number; max: number };
    Fair: { min: number; max: number };
    Poor: { min: number; max: number };
  };
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export default function ScoreInput({
  category,
  label,
  maxScore,
  ranges,
  value,
  onChange,
  disabled = false
}: ScoreInputProps) {
  const [inputValue, setInputValue] = useState(value.toString());
  const [selectedLevel, setSelectedLevel] = useState<ScoreLevel | null>(
    getScoreLevel(category, value)
  );
  const [error, setError] = useState<string>('');

  useEffect(() => {
    setInputValue(value.toString());
    setSelectedLevel(getScoreLevel(category, value));
  }, [value, category]);

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);

    if (rawValue === '') {
      setError('Score is required');
      return;
    }

    const numValue = parseInt(rawValue, 10);

    if (isNaN(numValue)) {
      setError('Please enter a valid number');
      return;
    }

    // Auto-clamp the value
    const clampedValue = clampScore(category, numValue);
    
    if (clampedValue !== numValue) {
      setInputValue(clampedValue.toString());
      setError(`Score auto-clamped to valid range (0-${maxScore})`);
      setTimeout(() => setError(''), 2000);
    } else {
      setError('');
    }

    // Validate against selected level
    if (selectedLevel && !validateScoreLevel(category, clampedValue, selectedLevel)) {
      setError(`Score doesn't match ${selectedLevel} range`);
    }

    const detectedLevel = getScoreLevel(category, clampedValue);
    setSelectedLevel(detectedLevel);
    onChange(clampedValue);
  };

  const handleLevelSelect = (level: ScoreLevel) => {
    setSelectedLevel(level);
    // Set to minimum of the range by default
    const minScore = ranges[level].min;
    setInputValue(minScore.toString());
    onChange(minScore);
    setError('');
  };

  return (
    <div className="score-input-container">
      <div className="score-header">
        <h3>{label}</h3>
        <span className="max-score">Max: {maxScore} pts</span>
      </div>

      <div className="level-buttons">
        {(['Excellent', 'Good', 'Fair', 'Poor'] as ScoreLevel[]).map((level) => (
          <button
            key={level}
            type="button"
            className={`level-btn ${selectedLevel === level ? 'active' : ''}`}
            onClick={() => handleLevelSelect(level)}
            disabled={disabled}
          >
            {level}
            <span className="range">
              ({ranges[level].min}-{ranges[level].max})
            </span>
          </button>
        ))}
      </div>

      <div className="score-input-group">
        <label htmlFor={`score-${category}`}>Score:</label>
        <input
          id={`score-${category}`}
          type="number"
          min="0"
          max={maxScore}
          value={inputValue}
          onChange={handleScoreChange}
          disabled={disabled}
          className={error ? 'error' : ''}
        />
        {error && <span className="error-message">{error}</span>}
      </div>

      {selectedLevel && (
        <div className={`level-indicator ${selectedLevel.toLowerCase()}`}>
          Current Level: {selectedLevel}
        </div>
      )}
    </div>
  );
}
