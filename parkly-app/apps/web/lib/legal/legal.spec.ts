import { describe, expect, it } from 'vitest';
import { entity, fill, LEGAL_ENTITY, missingEntityFields } from './entity';
import { PRIVACY } from './privacy';
import { TERMS } from './terms';
import type { Block, LegalDoc } from './types';

const DOCS: LegalDoc[] = [PRIVACY, TERMS];

function textOf(doc: LegalDoc): string {
  const parts: string[] = [doc.title, doc.summary];
  const fromBlock = (b: Block) => {
    if (b.kind === 'p' || b.kind === 'note') parts.push(b.text);
    else if (b.kind === 'ul') parts.push(...b.items);
    else parts.push(...(b.caption ? [b.caption] : []), ...b.head, ...b.rows.flat());
  };
  for (const s of doc.sections) {
    parts.push(s.title);
    s.blocks.forEach(fromBlock);
  }
  return parts.join('\n');
}

describe('legal documents', () => {
  it('have a version, a date and sections with unique ids', () => {
    for (const d of DOCS) {
      expect(d.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.sections.length).toBeGreaterThan(5);
      const ids = d.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of d.sections) expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it('stay drafts until counsel signs them off, and say so', () => {
    for (const d of DOCS) expect(d.draft).toBe(true);
  });

  it('only use placeholders that exist, so none reaches a page unfilled', () => {
    const known = new Set([...Object.keys(LEGAL_ENTITY), 'version']);
    for (const d of DOCS) {
      for (const m of textOf(d).matchAll(/\{\{(\w+)\}\}/g))
        expect(known.has(m[1] ?? ''), m[0]).toBe(true);
    }
  });

  it('table rows have as many cells as the header', () => {
    for (const d of DOCS)
      for (const s of d.sections)
        for (const b of s.blocks)
          if (b.kind === 'table')
            for (const r of b.rows) expect(r, `${d.slug} ${s.id}`).toHaveLength(b.head.length);
  });
});

describe('who we are', () => {
  it('shows a visible marker, not an invented name, while a value is missing', () => {
    expect(entity('companyName')).toBe('[company legal name: to be completed]');
    expect(fill('Run by {{companyName}} at {{address}}.')).toBe(
      'Run by [company legal name: to be completed] at [registered address: to be completed].',
    );
    expect(fill('Version {{unknown}}')).toBe('Version {{unknown}}');
  });

  it('lists what still has to be filled in before launch', () => {
    expect(missingEntityFields()).toEqual([
      'company legal name',
      'CAC registration number',
      'registered address',
      'privacy email address',
      'support email address',
      'Data Protection Officer',
    ]);
  });
});

describe('Privacy Notice says what is collected and used', () => {
  const text = textOf(PRIVACY);

  it('names every kind of data we collect', () => {
    for (const what of [
      'phone number',
      'name',
      'email',
      'plate',
      'make, model and colour',
      'device identifier',
      'push-notification token',
      'IP address',
      'payment reference',
      'check',
    ])
      expect(text.toLowerCase(), what).toContain(what.toLowerCase());
  });

  it('says how each reaches us: given, created by use, or from another service', () => {
    for (const heading of [
      'Information you give us',
      'Information created when you use Parkly',
      'Where you are',
      'Information from other services',
    ])
      expect(text).toContain(heading);
  });

  it('says how it is used, with a lawful basis for each purpose', () => {
    expect(text).toContain('Our reason under the NDPA');
    for (const basis of ['Contract', 'legal obligation', 'Legitimate interest', 'consent'])
      expect(text.toLowerCase()).toContain(basis.toLowerCase());
  });

  it('lists every company that processes data for us', () => {
    for (const name of [
      'Supabase',
      'Vercel',
      'Paystack',
      'Termii',
      'Resend',
      'Expo',
      'Cloudflare',
      'Upstash',
      'LocationIQ',
      'OpenFreeMap',
      'Sentry',
    ])
      expect(text, name).toContain(name);
  });

  it('is honest about what we do not do', () => {
    expect(text).toContain('We never see or keep your card number');
    expect(text).toContain('do not store it');
    expect(text).toContain('We do not sell your personal data');
    expect(text).toContain('Advertising or analytics trackers');
  });

  it('gives retention periods and the ways to use each right', () => {
    for (const period of ['6 years', '90 days', '7 days', '30-day', '3 years'])
      expect(text, period).toContain(period);
    for (const right of [
      'Download my data',
      'Delete my account',
      'Nigeria Data Protection Commission',
      'See what we hold',
      'Have it erased',
    ])
      expect(text, right).toContain(right);
  });

  it('does not promise anything the app cannot do yet', () => {
    // There is no analytics, no marketing sender and no in-app marketing switch today.
    expect(text).not.toContain('Turn off marketing messages in Account');
    expect(text).not.toMatch(/we use (google|facebook) analytics/i);
  });
});

describe('Driver Terms describe the rules the product enforces', () => {
  const text = textOf(TERMS);

  it('covers booking, arriving, staying longer, cancelling and refunds', () => {
    for (const heading of [
      'Booking and paying',
      'Arriving and checking in',
      'Staying longer than you booked',
      'Cancelling and refunds',
    ])
      expect(text).toContain(heading);
  });

  it('matches the current rules: 30 minutes, no stored value, refund to the way you paid', () => {
    expect(text).toContain('at least 30 minutes before it starts');
    expect(text).toContain('There are no wallets, credits or stored balances');
    expect(text).toContain('Refunds go back to the card or account you paid with');
    expect(text).toContain('The first 60 minutes of holding are free');
  });

  it('marks the parts that need a lawyer instead of guessing', () => {
    expect(text.match(/DRAFT FOR COUNSEL/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
