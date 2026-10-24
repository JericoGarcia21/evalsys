import { useId, useState } from 'react';

function EyeIcon({ hidden }: { hidden: boolean }) {
  const common = {
    className: 'w-4 h-4',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (hidden) {
    return (
      <svg {...common}>
        <path d="M3 3l18 18" />
        <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
        <path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 9 5 9 8a9.7 9.7 0 0 1-2 3.8" />
        <path d="M6.6 6.6C4.4 8.1 3 10.5 3 12c0 3 4 8 9 8a10.8 10.8 0 0 0 4.3-.9" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

interface PasswordFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  required?: boolean;
  autoComplete?: string;
  defaultVisible?: boolean;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  className = '',
  inputClassName = '',
  required = true,
  autoComplete,
  defaultVisible = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(defaultVisible);
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={className}>
      {label && <label className="evl-label" htmlFor={inputId}>{label}</label>}
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`evl-input pr-12 ${inputClassName}`}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md flex items-center justify-center text-text/65 hover:text-primary hover:bg-primary/5 transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          <EyeIcon hidden={!visible} />
        </button>
      </div>
    </div>
  );
}

