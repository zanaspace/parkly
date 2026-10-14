'use client';

import { useId, type InputHTMLAttributes } from 'react';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  helper?: string;
  error?: string;
  id?: string;
};

/** Label always rendered; helper/error wired via aria-describedby (doc 15 §3.2). */
export function Input({ label, helper, error, id, className, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? `pk-input-${autoId}`;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="pk-field">
      <label className="pk-field__label" htmlFor={inputId}>
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        className={['pk-input', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {helper && (
        <span id={helperId} className="pk-field__helper">
          {helper}
        </span>
      )}
      {error && (
        <span id={errorId} className="pk-field__error" role="alert">
          <span className="pk-visually-hidden">Error: </span>
          {error}
        </span>
      )}
    </div>
  );
}
