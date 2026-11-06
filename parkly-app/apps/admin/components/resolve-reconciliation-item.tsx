'use client';

import type { ReconciliationItem } from '@parkly/contracts';
import { Button, Text } from '@parkly/ui';
import { useState } from 'react';
import { resolveReconciliationItemAction } from '../lib/finance/actions';

const lagosTime = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Lagos',
});

export function ResolveReconciliationItem({
  item,
  runId,
}: {
  item: ReconciliationItem;
  runId: string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (item.resolvedAt) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="pk-badge pk-badge--approved">Resolved</span>
          <Text variant="caption" tone="tertiary" style={{ fontSize: '0.75rem' }}>
            {lagosTime.format(new Date(item.resolvedAt))}
          </Text>
        </div>
        {item.resolutionNotes && (
          <Text
            variant="body-sm"
            tone="secondary"
            style={{ fontStyle: 'italic', maxWidth: '24rem', wordBreak: 'break-word' }}
          >
            "{item.resolutionNotes}"
          </Text>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Resolve Exception
      </Button>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (notes.trim().length < 5) {
      setError('Please provide at least 5 characters explaining the resolution.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await resolveReconciliationItemAction({
        itemId: item.id,
        runId,
        notes: notes.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
      } else {
        setOpen(false);
        setLoading(false);
      }
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : 'Failed to resolve exception');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="pk-card"
      style={{ padding: '0.75rem', maxWidth: '22rem', gap: '0.5rem', background: '#fafafa' }}
    >
      <Text variant="label-md" style={{ fontWeight: 600 }}>
        Resolve Discrepancy
      </Text>
      <Text variant="caption" tone="secondary">
        Document audit reason (e.g. manual bank adjustment, chargeback reversal).
      </Text>
      <textarea
        className="pk-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Enter explanation for resolution..."
        rows={3}
        style={{
          width: '100%',
          padding: '0.5rem',
          fontSize: '0.875rem',
          borderRadius: 'var(--pk-radius-sm, 4px)',
          border: '1px solid var(--pk-color-border-default, #ccc)',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
        disabled={loading}
      />
      {error && (
        <Text variant="caption" style={{ color: '#b91c1c' }}>
          {error}
        </Text>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={loading || notes.trim().length < 5}>
          {loading ? 'Resolving…' : 'Confirm'}
        </Button>
      </div>
    </form>
  );
}
