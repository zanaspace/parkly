import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'brand'
  | 'brand-subtle'
  | 'verified'
  | 'confirmed'
  | 'checkedin'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

/**
 * Design system Badge component (doc 15 §3.18).
 * Renders small semantic indicators for status, verification, and tags.
 */
export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  const classes = ['pk-badge', `pk-badge--${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Waiting for payment',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Parked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Not paid in time',
  NO_SHOW: 'Missed',
};

/** Maps booking/lot status strings to the design system badge variant. */
export function bookingStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'CONFIRMED':
      return 'confirmed';
    case 'CHECKED_IN':
      return 'checkedin';
    case 'PENDING_PAYMENT':
      return 'pending';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
    case 'EXPIRED':
    case 'NO_SHOW':
      return 'cancelled';
    default:
      return 'neutral';
  }
}

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: string;
  label?: string;
}

/**
 * StatusBadge (doc 15 §3.19).
 * Renders a color-coded status badge with accessible label for bookings and lots.
 */
export function StatusBadge({ status, label, className, ...rest }: StatusBadgeProps) {
  const variant = bookingStatusVariant(status);
  const text = label || STATUS_LABELS[status] || status;
  return (
    <Badge variant={variant} className={className} {...rest}>
      {text}
    </Badge>
  );
}
