import { useId } from 'react';

interface Level {
  label: string;
  range: string;
  description?: string;
}

interface Props {
  description?: string;
  percentage?: boolean;
  label: string;
  max: number;
  value: number | '';
  onChange: (val: number) => void;
  levels: Level[];
  disabled?: boolean;
}

export default function ScoreInput({ label, max, value, onChange, levels, disabled = false, description, percentage = false }: Props) {
  const descriptionId = useId();
  const getLevel = (v: number) =>
    levels.find((l) => {
      const [min, lmax] = l.range.split('–').map(Number);
      return v >= min && v <= lmax;
    });

  const level = typeof value === 'number' ? getLevel(value) : null;

  return (
    <div className="evl-card !rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-text text-base leading-relaxed">{label}</h4>
        </div>
        <label className="shrink-0 w-28">
          <span className="block text-[10px] text-primary font-semibold mb-1">{percentage ? 'Earned points' : 'Score'}</span>
          <span className="relative block">
            <input
              type="number" min={0} max={max} step={percentage ? '0.01' : '1'}
              readOnly={percentage} aria-label={`${label} score`} value={value} disabled={disabled}
              aria-describedby={description ? descriptionId : undefined}
              onChange={event => onChange(Math.min(Math.max(Math.round(Number(event.target.value)), 0), max))}
              className={`evl-input !bg-primary/5 !border-primary/20 !text-primary !py-2 !pl-2 !pr-10 !text-base font-bold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="--"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-text/50">/ {max}</span>
          </span>
        </label>
      </div>
      {description && <p id={descriptionId} className="text-text/90 text-base leading-7 mt-3 whitespace-pre-line break-words">{description}</p>}

      <div role="group" aria-label={`Performance rating for ${label}`} aria-describedby={description ? descriptionId : undefined} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-4">
        {levels.map((l) => (
          <button
            key={l.label}
            type="button"
            title={l.description}
            aria-label={l.label}
            aria-pressed={level?.label === l.label}
            disabled={disabled}
            onClick={() => {
              const [min] = l.range.split('–').map(Number);
              onChange(min);
            }}
            className={`min-h-14 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed ${level?.label === l.label ? 'bg-primary border-primary text-white ring-1 ring-primary' : 'bg-primary/[0.02] border-primary/15 text-text/80 hover:border-primary/40 hover:bg-primary/5'}`}
          >
            <span className="flex items-start justify-between gap-2 text-xs font-semibold leading-snug">
              {l.label}
              {level?.label === l.label && <span aria-hidden="true" className="shrink-0 font-bold">✓</span>}
            </span>
            <span aria-hidden="true" className={`block text-[11px] mt-1 ${level?.label === l.label ? 'text-white' : 'text-text/65'}`}>
              {percentage ? `${l.range.split('–')[0]} pts` : `${l.range} pts`}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-text/60" aria-live="polite">
        {level ? <><span className="font-semibold text-primary">{level.label}.</span> {level.description}</> : percentage ? 'Choose a performance rating to calculate earned points.' : 'Choose a rating or enter a score within the allowed range.'}
      </p>
    </div>
  );
}
