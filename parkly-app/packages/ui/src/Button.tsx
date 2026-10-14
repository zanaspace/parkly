'use client';

import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Keeps width, shows a spinner, announces "Loading" and ignores presses (doc 15 §3.1). */
  loading?: boolean;
  /** Uses aria-disabled so the button stays focusable and can explain why. */
  disabled?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className,
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const inactive = disabled || loading;
  const classes = [
    'pk-button',
    `pk-button--${variant}`,
    size !== 'md' && `pk-button--${size}`,
    fullWidth && 'pk-button--full',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (inactive) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      {...rest}
      type={type}
      className={classes}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      onClick={handleClick}
    >
      {loading ? (
        <>
          <span className="pk-spinner" aria-hidden="true" />
          <span className="pk-visually-hidden">Loading</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
