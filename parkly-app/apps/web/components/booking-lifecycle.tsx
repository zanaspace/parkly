'use client';

import type { Booking, ExtensionOptions } from '@parkly/contracts';
import { formatNaira } from '@parkly/domain/money';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  cancelBooking,
  extendBooking,
  getExtensionOptions,
  payOverstay,
  type CancelBookingResult,
  type ExtendBookingResult,
  type PayOverstayResult,
} from '../lib/booking-actions';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  ExternalLinkIcon,
} from './icons';

const DURATION_OPTIONS = [
  { label: '+15 min', minutes: 15 },
  { label: '+30 min', minutes: 30 },
  { label: '+45 min', minutes: 45 },
  { label: '+1 hour', minutes: 60 },
  { label: '+2 hours', minutes: 120 },
  { label: '+3 hours', minutes: 180 },
];

const CANCELLATION_REASONS = [
  { id: 'CHANGE_OF_PLANS', label: 'Change of plans / trip cancelled' },
  { id: 'FOUND_ALTERNATIVE', label: 'Found other parking space' },
  { id: 'EMERGENCY', label: 'Vehicle breakdown or emergency' },
  { id: 'BOOKED_BY_MISTAKE', label: 'Booked wrong time or location by mistake' },
  { id: 'OTHER', label: 'Other reason' },
];

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos',
    });
  } catch {
    return iso;
  }
}

export function BookingLifecycleActions({ booking }: { booking: Booking }) {
  const router = useRouter();

  // Extend Modal State
  const [extendOpen, setExtendOpen] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [extensionOptions, setExtensionOptions] = useState<ExtensionOptions | null>(null);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  useEffect(() => {
    if (extendOpen) {
      getExtensionOptions(booking.id)
        .then((opts) => {
          setExtensionOptions(opts);
          if (opts?.extendableUntil) {
            const maxMs = new Date(opts.extendableUntil).getTime();
            const curEndMs = new Date(booking.endAt).getTime();
            const allowed = DURATION_OPTIONS.filter(
              (o) => curEndMs + o.minutes * 60_000 <= maxMs,
            );
            const first = allowed[0];
            if (first && !allowed.some((a) => a.minutes === selectedMinutes)) {
              setSelectedMinutes(first.minutes);
            }
          }
        })
        .catch(() => undefined);
    }
  }, [extendOpen, booking.id, booking.endAt]);

  // Cancel Modal State
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('CHANGE_OF_PLANS');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<string | null>(null);

  // Overstay State
  const [payingOverstay, setPayingOverstay] = useState(false);
  const [overstayError, setOverstayError] = useState<string | null>(null);

  const canExtend =
    (booking.status === 'CONFIRMED' || booking.status === 'CHECKED_IN') &&
    !booking.stay?.checkedOutAt;

  const canCancel = booking.status === 'CONFIRMED' && !booking.stay?.checkedInAt;

  const overstayKobo = booking.stay?.overstayKobo ?? 0;
  const overstayMinutes = booking.stay?.overstayMinutes ?? 0;
  const hasOverstay = overstayKobo > 0;

  // Calculate new end time for extension
  const currentEnd = new Date(booking.endAt);
  const projectedEnd = new Date(currentEnd.getTime() + selectedMinutes * 60_000);

  // Check cancellation policy eligibility (>= 30 mins before start)
  const msToStart = new Date(booking.startAt).getTime() - Date.now();
  const minutesToStart = Math.round(msToStart / 60_000);
  const isFreeCancellation = minutesToStart >= 30;

  async function handleExtendSubmit() {
    setExtending(true);
    setExtendError(null);
    try {
      const res: ExtendBookingResult = await extendBooking(
        booking.id,
        projectedEnd.toISOString(),
      );
      if (!res.ok) {
        setExtendError(res.message || 'Could not extend stay. Please try again.');
        setExtending(false);
        return;
      }
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        setExtendOpen(false);
        router.refresh();
      }
    } catch {
      setExtendError('Something went wrong. Please try again.');
      setExtending(false);
    }
  }

  async function handleCancelSubmit() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res: CancelBookingResult = await cancelBooking(booking.id, cancelReason);
      if (!res.ok) {
        setCancelError(res.message || 'Could not cancel booking.');
        setCancelling(false);
        return;
      }
      setCancelOpen(false);
      setCancelSuccess(
        res.isFreeCancellation && (res.refundKobo ?? 0) > 0
          ? `Booking cancelled. A full refund of ${formatNaira(res.refundKobo!)} has been initiated.`
          : 'Booking has been cancelled.',
      );
      router.refresh();
    } catch {
      setCancelError('Something went wrong. Please try again.');
      setCancelling(false);
    }
  }

  async function handlePayOverstay() {
    setPayingOverstay(true);
    setOverstayError(null);
    try {
      const res: PayOverstayResult = await payOverstay(booking.id);
      if (!res.ok) {
        setOverstayError(res.message || 'Could not start overstay payment.');
        setPayingOverstay(false);
        return;
      }
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      } else {
        router.refresh();
      }
    } catch {
      setOverstayError('Something went wrong. Please try again.');
      setPayingOverstay(false);
    }
  }

  return (
    <>
      {/* Overstay Due Alert Banner */}
      {hasOverstay && (
        <div className="pk-overstay-banner" role="alert">
          <div className="pk-overstay-banner-header">
            <div className="pk-overstay-banner-icon">
              <ClockIcon size={22} />
            </div>
            <div>
              <h3 className="pk-overstay-banner-title">
                Unpaid Overstay Due · {formatNaira(overstayKobo)}
              </h3>
              <p className="pk-overstay-banner-sub">
                Your vehicle has exceeded the booked window by {overstayMinutes} minutes. Please
                settle your overstay charge before barrier exit.
              </p>
            </div>
          </div>
          {overstayError && <p className="pk-error-text">{overstayError}</p>}
          <div className="pk-overstay-banner-actions">
            <button
              type="button"
              className="pk-btn-primary pk-btn-sm"
              onClick={handlePayOverstay}
              disabled={payingOverstay}
            >
              <CreditCardIcon size={16} />
              <span>{payingOverstay ? 'Connecting...' : `Pay Overstay (${formatNaira(overstayKobo)})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Cancellation Success Feedback */}
      {cancelSuccess && (
        <div className="pk-status-banner pk-status-banner--info" style={{ marginTop: '0.75rem' }}>
          <div style={{ color: '#10b981' }}>
            <CheckCircleIcon size={20} />
          </div>
          <div className="pk-status-banner-body">
            <p className="pk-status-banner-text" style={{ color: '#ffffff', fontWeight: 600 }}>
              {cancelSuccess}
            </p>
          </div>
        </div>
      )}

      {/* Lifecycle Action Bar */}
      <div className="pk-lifecycle-bar">
        {canExtend && (
          <button
            type="button"
            className="pk-btn-primary pk-btn-sm pk-lifecycle-btn"
            onClick={() => {
              setExtendError(null);
              setExtendOpen(true);
            }}
          >
            <ClockIcon size={16} />
            <span>Extend Stay</span>
          </button>
        )}

        {canCancel && (
          <button
            type="button"
            className="pk-btn-secondary pk-btn-sm pk-lifecycle-btn"
            onClick={() => {
              setCancelError(null);
              setCancelOpen(true);
            }}
          >
            <span>Cancel Booking</span>
          </button>
        )}

        <a
          href={`/bookings/${booking.id}/receipt`}
          target="_blank"
          rel="noopener noreferrer"
          className="pk-btn-secondary pk-btn-sm pk-lifecycle-btn"
          style={{ textDecoration: 'none' }}
        >
          <ExternalLinkIcon size={14} />
          <span>View Official Receipt</span>
        </a>
      </div>

      {/* Extend Stay Modal */}
      {extendOpen && (
        <div className="pk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="extend-title">
          <div className="pk-modal-sheet">
            <div className="pk-modal-header">
              <div>
                <h3 id="extend-title" className="pk-modal-title">
                  Extend Your Parking Stay
                </h3>
                <p className="pk-modal-sub">
                  Select additional time to stay parked at {booking.lot.name}.
                </p>
              </div>
              <button
                type="button"
                className="pk-modal-close"
                onClick={() => setExtendOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="pk-modal-body">
              <div className="pk-schedule-compare">
                <div className="pk-schedule-compare-item">
                  <span className="pk-schedule-label">Current Exit</span>
                  <span className="pk-schedule-val">{formatTime(booking.endAt)}</span>
                </div>
                <div className="pk-schedule-arrow">→</div>
                <div className="pk-schedule-compare-item pk-schedule-compare-item--active">
                  <span className="pk-schedule-label">New Exit Time</span>
                  <span className="pk-schedule-val">{formatTime(projectedEnd.toISOString())}</span>
                </div>
              </div>

              {extensionOptions && extensionOptions.extendableUntil === null ? (
                <div className="pk-policy-banner pk-policy-banner--amber">
                  <div style={{ color: '#f59e0b', flexShrink: 0 }}>
                    <AlertCircleIcon size={18} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#f59e0b' }}>
                      Car Park Closing
                    </strong>
                    <span style={{ fontSize: '0.825rem', color: '#9da8b3' }}>
                      {extensionOptions.closesAt
                        ? `The car park closes at ${formatTime(extensionOptions.closesAt)}${extensionOptions.reopensAt ? ` and reopens ${formatTime(extensionOptions.reopensAt)}` : ''}. No extension is available.`
                        : 'The car park is closed during the extension window.'}
                    </span>
                  </div>
                </div>
              ) : null}

              <div>
                <label className="pk-input-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Select Extension Duration
                </label>
                <div className="pk-chips-grid">
                  {DURATION_OPTIONS.map((opt) => {
                    const isPastClosing = Boolean(
                      extensionOptions &&
                        (extensionOptions.extendableUntil === null ||
                          new Date(booking.endAt).getTime() + opt.minutes * 60_000 >
                            new Date(extensionOptions.extendableUntil).getTime()),
                    );
                    return (
                      <button
                        key={opt.minutes}
                        type="button"
                        disabled={isPastClosing}
                        className={`pk-chip ${selectedMinutes === opt.minutes ? 'pk-chip--active' : ''}`}
                        style={isPastClosing ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
                        onClick={() => setSelectedMinutes(opt.minutes)}
                        title={isPastClosing ? 'Past car park closing time' : undefined}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {booking.overstay && (
                <div className="pk-tip-box">
                  <ClockIcon size={14} />
                  <span>
                    Rates are charged per standard car park hourly rate. Extending prevents overstay fees.
                  </span>
                </div>
              )}

              {extendError && (
                <div className="pk-error-banner" role="alert">
                  <AlertCircleIcon size={16} />
                  <span>{extendError}</span>
                </div>
              )}
            </div>

            <div className="pk-modal-footer">
              <button
                type="button"
                className="pk-btn-secondary"
                onClick={() => setExtendOpen(false)}
                disabled={extending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="pk-btn-primary"
                onClick={handleExtendSubmit}
                disabled={
                  extending ||
                  Boolean(
                    extensionOptions &&
                      (extensionOptions.extendableUntil === null ||
                        new Date(booking.endAt).getTime() + selectedMinutes * 60_000 >
                          new Date(extensionOptions.extendableUntil).getTime()),
                  )
                }
              >
                {extending ? 'Processing...' : `Confirm +${selectedMinutes} Mins`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Booking Modal */}
      {cancelOpen && (
        <div className="pk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-title">
          <div className="pk-modal-sheet">
            <div className="pk-modal-header">
              <div>
                <h3 id="cancel-title" className="pk-modal-title">
                  Cancel Reservation
                </h3>
                <p className="pk-modal-sub">Pass #{booking.code} at {booking.lot.name}</p>
              </div>
              <button
                type="button"
                className="pk-modal-close"
                onClick={() => setCancelOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="pk-modal-body">
              {/* Cancellation Policy Banner */}
              {isFreeCancellation ? (
                <div className="pk-policy-banner pk-policy-banner--green">
                  <div style={{ color: '#10b981', flexShrink: 0 }}>
                    <CheckCircleIcon size={18} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#10b981' }}>
                      Free Cancellation (100% Refund)
                    </strong>
                    <span style={{ fontSize: '0.825rem', color: '#9da8b3' }}>
                      You are cancelling more than 30 minutes before your booked start time ({formatTime(booking.startAt)}). Full refund of {formatNaira(booking.totalKobo)} will be returned to your payment method.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="pk-policy-banner pk-policy-banner--amber">
                  <div style={{ color: '#f59e0b', flexShrink: 0 }}>
                    <AlertCircleIcon size={18} />
                  </div>
                  <div>
                    <strong style={{ display: 'block', fontSize: '0.9rem', color: '#f59e0b' }}>
                      Late Cancellation (No Refund)
                    </strong>
                    <span style={{ fontSize: '0.825rem', color: '#9da8b3' }}>
                      Per car park policy, bookings cancelled within 30 minutes of reservation start time are not eligible for a refund.
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="cancel-reason-select" className="pk-input-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Reason for Cancellation
                </label>
                <select
                  id="cancel-reason-select"
                  className="pk-select"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                >
                  {CANCELLATION_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {cancelError && (
                <div className="pk-error-banner" role="alert">
                  <AlertCircleIcon size={16} />
                  <span>{cancelError}</span>
                </div>
              )}
            </div>

            <div className="pk-modal-footer">
              <button
                type="button"
                className="pk-btn-secondary"
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
              >
                Keep Booking
              </button>
              <button
                type="button"
                className="pk-btn-danger"
                onClick={handleCancelSubmit}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
