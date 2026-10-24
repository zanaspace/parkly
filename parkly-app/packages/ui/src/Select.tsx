'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type SelectHTMLAttributes,
} from 'react';

export type SelectOption = { value: string; label: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'value'> & {
  label?: string;
  options: readonly SelectOption[];
  /** Shown as a disabled first option when nothing is selected yet. */
  placeholder?: string;
  helper?: string;
  error?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  containerClassName?: string;
  onValueChange?: (value: string) => void;
};

/**
 * Enterprise Custom Dropdown (doc 15 §3.2).
 * Glassmorphic floating menu with custom keyboard navigation, check indicators,
 * and full backward compatibility with native form submission and accessibility.
 */
export function Select({
  label,
  options,
  placeholder,
  helper,
  error,
  id,
  className,
  containerClassName,
  value,
  defaultValue,
  disabled = false,
  required = false,
  name,
  onChange,
  onValueChange,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id ?? `pk-select-${autoId}`;
  const listboxId = `${selectId}-listbox`;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;
  const describedBy =
    [error ? errorId : null, helper ? helperId : null].filter(Boolean).join(' ') || undefined;

  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(
    value ?? defaultValue ?? (placeholder ? '' : (options[0]?.value ?? '')),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeSelectRef = useRef<HTMLSelectElement>(null);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  useEffect(() => {
    if (isControlled) {
      setInternalValue(value);
    }
  }, [isControlled, value]);

  // Sync with form resets
  useEffect(() => {
    const form = nativeSelectRef.current?.form;
    if (!form) return;
    const handleReset = () => {
      setInternalValue(defaultValue ?? (placeholder ? '' : (options[0]?.value ?? '')));
    };
    form.addEventListener('reset', handleReset);
    return () => form.removeEventListener('reset', handleReset);
  }, [defaultValue, placeholder, options]);

  // Close dropdown on outside click or escape key
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectedOption = options.find((o) => o.value === currentValue);

  const handleSelect = (val: string) => {
    if (disabled) return;
    if (!isControlled) {
      setInternalValue(val);
    }
    setOpen(false);

    // Synchronize native select value and dispatch change event for forms / onChange listeners
    if (nativeSelectRef.current) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      )?.set;
      nativeSetter?.call(nativeSelectRef.current, val);
      const event = new Event('change', { bubbles: true });
      nativeSelectRef.current.dispatchEvent(event);
    }

    if (onChange) {
      onChange({
        target: { value: val, name: name || '' },
        currentTarget: { value: val, name: name || '' },
      } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }

    onValueChange?.(val);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentIndex = options.findIndex((o) => o.value === currentValue);
      const nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      if (options[nextIndex]) handleSelect(options[nextIndex].value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = options.findIndex((o) => o.value === currentValue);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      if (options[prevIndex]) handleSelect(options[prevIndex].value);
    }
  };

  return (
    <div className={['pk-field', containerClassName].filter(Boolean).join(' ')} ref={containerRef}>
      {label && (
        <label
          className="pk-field__label"
          htmlFor={selectId}
          onClick={() => !disabled && setOpen((o) => !o)}
        >
          {label}
        </label>
      )}

      <div
        className={`pk-custom-select ${open ? 'pk-custom-select--open' : ''} ${
          disabled ? 'pk-custom-select--disabled' : ''
        } ${error ? 'pk-custom-select--error' : ''}`}
      >
        {/* Enterprise Dropdown Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          className={['pk-input', 'pk-custom-select-trigger', className].filter(Boolean).join(' ')}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={handleTriggerKeyDown}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <span
            className={
              selectedOption ? 'pk-custom-select-value' : 'pk-custom-select-placeholder'
            }
          >
            {selectedOption ? selectedOption.label : (placeholder ?? 'Choose one')}
          </span>
          <svg
            className={`pk-custom-select-chevron ${
              open ? 'pk-custom-select-chevron--open' : ''
            }`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Floating Enterprise Dropdown Menu */}
        {open && (
          <div
            id={listboxId}
            className="pk-custom-select-menu"
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            aria-label={label ?? placeholder ?? 'Select option'}
          >
            {placeholder && (
              <div
                role="option"
                aria-selected={currentValue === ''}
                aria-disabled="true"
                className="pk-custom-select-option pk-custom-select-option--placeholder"
              >
                <span className="pk-custom-select-option-label">{placeholder}</span>
              </div>
            )}
            {options.map((opt) => {
              const isSelected = opt.value === currentValue;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`pk-custom-select-option ${
                    isSelected ? 'pk-custom-select-option--selected' : ''
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  <span className="pk-custom-select-option-label">{opt.label}</span>
                  {isSelected && (
                    <svg
                      className="pk-custom-select-check"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Native Select for 100% standard HTML form compatibility and a11y testing */}
        <select
          {...rest}
          ref={nativeSelectRef}
          id={selectId}
          name={name}
          value={currentValue}
          onChange={onChange ?? (() => {})}
          disabled={disabled}
          required={required}
          className="pk-visually-hidden-select"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          tabIndex={-1}
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
      </div>

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
