'use client';

import React, { useMemo, useState } from 'react';
import type { CorporateBookingItem } from '@parkly/contracts';

function formatNaira(kobo: number): string {
  const naira = (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₦${naira}`;
}

export function CorporateBookingsTable({
  bookings,
  primaryColor = '#0284c7',
}: {
  bookings: CorporateBookingItem[];
  primaryColor?: string;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACCRUED' | 'INVOICED' | 'PAID'>('ALL');
  const [selectedBooking, setSelectedBooking] = useState<CorporateBookingItem | null>(null);

  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        b.bookingCode?.toLowerCase().includes(q) ||
        b.driverName?.toLowerCase().includes(q) ||
        b.workEmail?.toLowerCase().includes(q) ||
        b.vehiclePlate?.toLowerCase().includes(q) ||
        b.lotName?.toLowerCase().includes(q) ||
        b.costCenterName?.toLowerCase().includes(q)
      );
    });
  }, [bookings, searchTerm, statusFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              margin: 0,
              color: 'var(--pk-color-text-primary)',
            }}
          >
            Corporate Bookings & Sessions
          </h1>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.875rem',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            Real-time audit log of corporate-subsidized employee parking stays and fleet dispatches.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="search"
            placeholder="Search plate, code, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid var(--pk-color-border-subtle)',
              background: 'var(--pk-color-bg-surface)',
              color: 'var(--pk-color-text-primary)',
              fontSize: '0.85rem',
              minWidth: '220px',
            }}
          />

          <div
            style={{
              display: 'flex',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--pk-color-border-subtle)',
            }}
          >
            {(['ALL', 'ACCRUED', 'INVOICED', 'PAID'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.45rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: statusFilter === st ? primaryColor : 'var(--pk-color-bg-surface)',
                  color: statusFilter === st ? '#ffffff' : 'var(--pk-color-text-secondary)',
                  transition: 'background 0.15s ease',
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div
        style={{
          background: 'var(--pk-color-bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--pk-color-border-subtle)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚗</div>
            <h3
              style={{
                margin: '0 0 0.5rem',
                fontSize: '1.1rem',
                color: 'var(--pk-color-text-primary)',
              }}
            >
              No corporate bookings found
            </h3>
            <p style={{ margin: '0 auto', maxWidth: '420px', fontSize: '0.875rem' }}>
              When staff book parking using their linked corporate profile, active sessions, bay
              codes, and departmental charges appear here automatically.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.85rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--pk-color-border-subtle)',
                    background: 'rgba(0,0,0,0.02)',
                  }}
                >
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Date / Code
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Driver / Work Email
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Vehicle Plate
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Location
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Cost Center
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Amount + 7.5% VAT
                  </th>
                  <th
                    style={{
                      padding: '0.75rem 1rem',
                      fontWeight: 600,
                      color: 'var(--pk-color-text-secondary)',
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const totalWithVat = b.amountKobo + b.vatKobo;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setSelectedBooking(b)}
                      style={{
                        borderBottom: '1px solid var(--pk-color-border-subtle)',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(0,0,0,0.015)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--pk-color-text-primary)' }}>
                          {b.bookingCode ?? b.id.slice(0, 8)}
                        </div>
                        <div
                          style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}
                        >
                          {new Date(b.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 500, color: 'var(--pk-color-text-primary)' }}>
                          {b.driverName}
                        </div>
                        <div
                          style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}
                        >
                          {b.workEmail ?? '—'}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            background: 'rgba(0,0,0,0.05)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--pk-color-border-subtle)',
                          }}
                        >
                          {b.vehiclePlate ?? 'FIELD-CAR'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ color: 'var(--pk-color-text-primary)' }}>{b.lotName}</div>
                        <div
                          style={{ fontSize: '0.72rem', color: 'var(--pk-color-text-secondary)' }}
                        >
                          {b.product ?? 'HOURLY'}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '6px',
                            background: 'rgba(2, 132, 199, 0.08)',
                            color: primaryColor,
                            fontWeight: 500,
                          }}
                        >
                          {b.costCenterName ?? 'General Operations'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--pk-color-text-primary)' }}>
                          {formatNaira(totalWithVat)}
                        </div>
                        <div
                          style={{ fontSize: '0.72rem', color: 'var(--pk-color-text-secondary)' }}
                        >
                          {formatNaira(b.amountKobo)} + {formatNaira(b.vatKobo)} VAT
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.2rem 0.5rem',
                            borderRadius: '9999px',
                            backgroundColor:
                              b.status === 'PAID'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : b.status === 'INVOICED'
                                  ? 'rgba(59, 130, 246, 0.15)'
                                  : 'rgba(245, 158, 11, 0.15)',
                            color:
                              b.status === 'PAID'
                                ? '#059669'
                                : b.status === 'INVOICED'
                                  ? '#2563eb'
                                  : '#d97706',
                          }}
                        >
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Booking Drawer / Modal */}
      {selectedBooking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setSelectedBooking(null)}
        >
          <div
            style={{
              background: 'var(--pk-color-bg-surface)',
              borderRadius: '16px',
              padding: '1.75rem',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--pk-color-text-primary)' }}>
                Session Details · {selectedBooking.bookingCode}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--pk-color-text-secondary)',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                fontSize: '0.875rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>Status</span>
                <strong
                  style={{ color: selectedBooking.status === 'PAID' ? '#059669' : '#d97706' }}
                >
                  {selectedBooking.status}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>Driver</span>
                <span style={{ color: 'var(--pk-color-text-primary)' }}>
                  {selectedBooking.driverName} ({selectedBooking.workEmail})
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>Vehicle Plate</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {selectedBooking.vehiclePlate ?? 'FIELD-CAR'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>Location</span>
                <span style={{ color: 'var(--pk-color-text-primary)' }}>
                  {selectedBooking.lotName}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>
                  Department Cost Center
                </span>
                <span>{selectedBooking.costCenterName}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>
                  Subtotal (Parking Stay)
                </span>
                <span>{formatNaira(selectedBooking.amountKobo)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--pk-color-border-subtle)',
                  paddingBottom: '0.5rem',
                }}
              >
                <span style={{ color: 'var(--pk-color-text-secondary)' }}>FIRS VAT (7.5%)</span>
                <span>{formatNaira(selectedBooking.vatKobo)}</span>
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.25rem' }}
              >
                <strong style={{ color: 'var(--pk-color-text-primary)' }}>
                  Total Employer Charge
                </strong>
                <strong style={{ fontSize: '1.1rem', color: primaryColor }}>
                  {formatNaira(selectedBooking.amountKobo + selectedBooking.vatKobo)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
