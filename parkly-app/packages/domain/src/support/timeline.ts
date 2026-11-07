/** One line of a booking's story for support (FR-ADM-002, doc 03 §4.4 X-07). */
export type TimelineEvent = {
  at: Date | null;
  type: 'STATUS' | 'PAYMENT' | 'REFUND' | 'CHECK_IN' | 'CHECK_OUT' | 'OVERSTAY';
  label: string;
  amountKobo: number | null;
  detail: string | null;
};

export type TimelineParts = {
  history: {
    from: string | null;
    to: string;
    actor: string;
    reason: string | null;
    at: Date | null;
  }[];
  payments: {
    kind: string;
    status: string;
    amountKobo: number;
    createdAt: Date;
    paidAt: Date | null;
    failureCode: string | null;
  }[];
  refunds: { amountKobo: number; status: string; reason: string; createdAt: Date | null }[];
  session: {
    checkInAt: Date | null;
    checkOutAt: Date | null;
    overstayMinutes: number;
    overstayAmountKobo: number;
    overstayStatus: string;
  } | null;
};

const words = (s: string) => s.toLowerCase().replace(/_/g, ' ');
const sentence = (s: string) => {
  const w = words(s);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/**
 * Status changes, payments, refunds and the stay, oldest first; undated lines
 * (old rows) go last in the order they came. Pure, so both stores and the
 * admin page tell the same story.
 */
export function buildTimeline(parts: TimelineParts): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const h of parts.history)
    out.push({
      at: h.at,
      type: 'STATUS',
      label: h.from ? `${sentence(h.from)} → ${words(h.to)}` : sentence(h.to),
      amountKobo: null,
      detail: [words(h.actor), h.reason].filter(Boolean).join(': ') || null,
    });
  for (const p of parts.payments) {
    out.push({
      at: p.createdAt,
      type: 'PAYMENT',
      label: `${sentence(p.kind)} checkout started`,
      amountKobo: p.amountKobo,
      detail: null,
    });
    if (p.paidAt)
      out.push({
        at: p.paidAt,
        type: 'PAYMENT',
        label: `${sentence(p.kind)} paid`,
        amountKobo: p.amountKobo,
        detail: p.status === 'SUCCEEDED' ? null : words(p.status),
      });
    else if (p.status === 'FAILED' || p.status === 'ABANDONED')
      out.push({
        at: null,
        type: 'PAYMENT',
        label: `${sentence(p.kind)} ${words(p.status)}`,
        amountKobo: p.amountKobo,
        detail: p.failureCode ? words(p.failureCode) : null,
      });
  }
  for (const r of parts.refunds)
    out.push({
      at: r.createdAt,
      type: 'REFUND',
      label: `Refund ${words(r.status)}`,
      amountKobo: r.amountKobo,
      detail: words(r.reason),
    });
  const s = parts.session;
  if (s?.checkInAt)
    out.push({
      at: s.checkInAt,
      type: 'CHECK_IN',
      label: 'Checked in',
      amountKobo: null,
      detail: null,
    });
  if (s?.checkOutAt)
    out.push({
      at: s.checkOutAt,
      type: 'CHECK_OUT',
      label: 'Checked out',
      amountKobo: null,
      detail: null,
    });
  if (s && s.overstayStatus !== 'NONE' && s.overstayAmountKobo > 0)
    out.push({
      at: s.checkOutAt,
      type: 'OVERSTAY',
      label: `Overstay ${words(s.overstayStatus)}`,
      amountKobo: s.overstayAmountKobo,
      detail: `${s.overstayMinutes} min over`,
    });
  const dated = out
    .filter((e) => e.at)
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
  return [...dated, ...out.filter((e) => !e.at)];
}
