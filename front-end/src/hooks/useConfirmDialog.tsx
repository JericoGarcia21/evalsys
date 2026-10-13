import { useCallback, useRef, useState } from 'react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Resolver = (value: boolean) => void;

export function useConfirmDialog() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions(nextOptions);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const ConfirmDialog = useCallback(() => {
    if (!options) return null;

    return (
      <div data-app-confirm role="dialog" aria-modal="true" aria-label={options.title} className="fixed inset-0 z-[100] bg-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md evl-card p-6 shadow-2xl">
          <p className={`text-xs font-black uppercase tracking-widest mb-2 ${options.danger ? 'text-danger' : 'text-primary'}`}>
            Confirm Action
          </p>
          <h3 className="text-xl font-black text-text">{options.title}</h3>
          <p className="text-sm text-text/70 mt-3 leading-relaxed whitespace-pre-line">{options.message}</p>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <button type="button" onClick={() => close(false)} className="evl-btn-secondary">
              {options.cancelLabel || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className={options.danger ? 'evl-btn-danger bg-danger text-white hover:bg-red-700 hover:border-danger' : 'evl-btn-primary'}
            >
              {options.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    );
  }, [close, options]);

  return { confirm, ConfirmDialog };
}
