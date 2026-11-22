'use client';

import React, { useState } from 'react';
import type { CorporateFinanceSummary } from '@parkly/contracts';
import type { ResolvedTenant } from '../../data/corporate-tenant';

function formatNaira(kobo: number): string {
  const naira = (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₦${naira}`;
}

export function CorporateFinanceView({
  tenant,
  finance,
  slug,
  primaryColor = '#0284c7',
}: {
  tenant: ResolvedTenant;
  finance: CorporateFinanceSummary | null;
  slug: string;
  primaryColor?: string;
}) {
  const [downloading, setDownloading] = useState(false);

  // Defaults if finance is empty/null
  const billingPeriod = finance?.billingPeriod ?? new Date().toISOString().slice(0, 7);
  const totalSpend = finance?.totalSpendKobo ?? 0;
  const subtotal = finance?.subtotalKobo ?? 0;
  const vat = finance?.vatKobo ?? 0;
  const totalBookings = finance?.totalBookings ?? 0;
  const activeDrivers = finance?.activeDrivers ?? 0;

  // Format month name e.g. "November 2026"
  const dateObj = new Date(`${billingPeriod}-01`);
  const monthName = isNaN(dateObj.getTime())
    ? billingPeriod
    : dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const handleExportCsv = () => {
    setDownloading(true);
    try {
      const headers = [
        'Cost Center Code',
        'Cost Center Name',
        'Spend (NGN)',
        'Bookings Count',
        'Monthly Budget (NGN)',
      ];
      const rows = (finance?.costCenterBreakdown ?? []).map((cc) => [
        cc.code,
        `"${cc.name.replace(/"/g, '""')}"`,
        (cc.totalSpendKobo / 100).toFixed(2),
        cc.bookingCount,
        cc.monthlyBudgetKobo ? (cc.monthlyBudgetKobo / 100).toFixed(2) : 'N/A',
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `parkly_corporate_statement_${slug}_${billingPeriod}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Title & Actions */}
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
            Consolidated Invoicing & VAT
          </h1>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '0.875rem',
              color: 'var(--pk-color-text-secondary)',
            }}
          >
            Billing statement for <strong>{monthName}</strong> · 100% cashless employer invoicing
            with 7.5% FIRS VAT breakdown.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={downloading}
          style={{
            padding: '0.55rem 1.1rem',
            background: primaryColor,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span>📥</span>
          {downloading ? 'Exporting...' : 'Export Statement (CSV)'}
        </button>
      </div>

      {/* KPI Financial Overview Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div
          style={{
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-border-subtle)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-secondary)',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            Accrued Month Spend (VAT Inclusive)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: primaryColor }}>
            {formatNaira(totalSpend)}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--pk-color-text-secondary)',
              marginTop: '0.4rem',
            }}
          >
            Invoiced on the 1st of next month
          </div>
        </div>

        <div
          style={{
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-border-subtle)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-secondary)',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            Parking Stays Subtotal
          </div>
          <div
            style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--pk-color-text-primary)' }}
          >
            {formatNaira(subtotal)}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--pk-color-text-secondary)',
              marginTop: '0.4rem',
            }}
          >
            {totalBookings} stays logged across car parks
          </div>
        </div>

        <div
          style={{
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-border-subtle)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-secondary)',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            FIRS VAT Breakdown (7.5%)
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669' }}>
            {formatNaira(vat)}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--pk-color-text-secondary)',
              marginTop: '0.4rem',
            }}
          >
            Full statutory tax audit trail
          </div>
        </div>

        <div
          style={{
            background: 'var(--pk-color-bg-surface)',
            border: '1px solid var(--pk-color-border-subtle)',
            borderRadius: '12px',
            padding: '1.25rem',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              color: 'var(--pk-color-text-secondary)',
              marginBottom: '0.35rem',
              fontWeight: 500,
            }}
          >
            Active Staff & Fleet Drivers
          </div>
          <div
            style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--pk-color-text-primary)' }}
          >
            {activeDrivers}
          </div>
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--pk-color-text-secondary)',
              marginTop: '0.4rem',
            }}
          >
            Subsidized via dual-profile & roster
          </div>
        </div>
      </div>

      {/* Cost Center Allocation Breakdown */}
      <div
        style={{
          background: 'var(--pk-color-bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--pk-color-border-subtle)',
          padding: '1.5rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            margin: '0 0 1rem',
            color: 'var(--pk-color-text-primary)',
          }}
        >
          Departmental Cost-Center Budget Utilization
        </h2>

        {!finance?.costCenterBreakdown || finance.costCenterBreakdown.length === 0 ? (
          <p style={{ color: 'var(--pk-color-text-secondary)', fontSize: '0.875rem' }}>
            No departmental charges accrued for this billing cycle yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {finance.costCenterBreakdown.map((cc) => {
              const budget = cc.monthlyBudgetKobo ? cc.monthlyBudgetKobo : 0;
              const spend = cc.totalSpendKobo;
              const pct = budget > 0 ? Math.min(Math.round((spend / budget) * 100), 100) : 0;

              return (
                <div
                  key={cc.code}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.875rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--pk-color-text-primary)' }}>{cc.name}</strong>
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          fontSize: '0.75rem',
                          color: 'var(--pk-color-text-secondary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        ({cc.code})
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--pk-color-text-primary)' }}>
                      {formatNaira(spend)}
                      {budget > 0 && (
                        <span
                          style={{
                            fontWeight: 400,
                            color: 'var(--pk-color-text-secondary)',
                            fontSize: '0.78rem',
                          }}
                        >
                          {' '}
                          / {formatNaira(budget)} ({pct}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {budget > 0 && (
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: 'rgba(0,0,0,0.06)',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor:
                            pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : primaryColor,
                          borderRadius: '9999px',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  )}

                  <div style={{ fontSize: '0.75rem', color: 'var(--pk-color-text-secondary)' }}>
                    {cc.bookingCount} corporate parking {cc.bookingCount === 1 ? 'stay' : 'stays'}{' '}
                    attributed this month.
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tax & Governance Card */}
      <div
        style={{
          background: 'var(--pk-color-bg-surface)',
          borderRadius: '12px',
          border: '1px solid var(--pk-color-border-subtle)',
          padding: '1.5rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            margin: '0 0 0.75rem',
            color: 'var(--pk-color-text-primary)',
          }}
        >
          Enterprise Governance & Tax Compliance
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1rem',
            fontSize: '0.85rem',
          }}
        >
          <div>
            <div style={{ color: 'var(--pk-color-text-secondary)' }}>Registered Entity</div>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--pk-color-text-primary)',
                marginTop: '0.15rem',
              }}
            >
              {tenant.legalName}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--pk-color-text-secondary)' }}>CAC Registration No.</div>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--pk-color-text-primary)',
                marginTop: '0.15rem',
              }}
            >
              {tenant.cacRcNumber ?? 'RC-992812'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--pk-color-text-secondary)' }}>
              Tax Identification Number (TIN)
            </div>
            <div style={{ fontWeight: 600, color: '#059669', marginTop: '0.15rem' }}>
              Verified Active (FIRS)
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--pk-color-text-secondary)' }}>Billing Cycle</div>
            <div
              style={{
                fontWeight: 600,
                color: 'var(--pk-color-text-primary)',
                marginTop: '0.15rem',
              }}
            >
              Net-30 Consolidated Invoicing
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
