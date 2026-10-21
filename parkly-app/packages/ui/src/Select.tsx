'use client';

import { useId, type SelectHTMLAttributes } from 'react';

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  options: readonly { value: string; label: string }[];
  /** Shown as a disabled first option when nothing is selected yet. */
  placeholder?: string;
  helper?: string;
  error?: string;
  id?: string;
};

/** Native select with the same label/helper/error wiring as Input (doc 15 §3.2). */
export function Select({
  label,
  options,
  placeholder,
  helper,
  error,
  id,
  className,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? `pk-select-${autoId}`;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;
  const describedBy =
    [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="pk-field">
      <label className="pk-field__label" htmlFor={selectId}>
        {label}
      </label>
      <select
        {...rest}
        id={selectId}
        className={['pk-input', 'pk-select', className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
