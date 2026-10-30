import { describe, expect, it } from 'vitest';
import { inviteLink, invitePageCopy, teamMessage, whatsappShare } from './copy';

describe('team copy', () => {
  it('maps API codes to plain messages with a safe fallback', () => {
    expect(teamMessage('MEMBER_EXISTS')).toMatch(/already on your team/);
    expect(teamMessage('INVITE_EXPIRED')).toMatch(/expired/);
    expect(teamMessage('SOMETHING_NEW')).toBe('Something went wrong. Please try again.');
    expect(teamMessage(undefined)).toBe('Something went wrong. Please try again.');
  });

  it('builds the invite link and a WhatsApp share link', () => {
    const link = inviteLink('https://parkly-portal.vercel.app', 'abc_-123');
    expect(link).toBe('https://parkly-portal.vercel.app/invite/abc_-123');
    const share = whatsappShare(link, 'Eko Hotel');
    expect(share.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(share)).toContain(link);
  });

  it('tells invitees who invited them, as what, and what to do', () => {
    const open = {
      state: 'OPEN',
      businessName: 'Eko Hotel',
      expiresAt: '2026-10-24T10:00:00.000Z',
    } as const;
    expect(invitePageCopy({ ...open, role: 'MANAGER' })).toMatchObject({
      title: 'Eko Hotel has invited you as a manager',
      mode: 'manager',
    });
    const attendant = invitePageCopy({ ...open, role: 'ATTENDANT' });
    expect(attendant).toMatchObject({
      title: 'Eko Hotel has invited you as an attendant',
      mode: 'attendant',
    });
    expect(attendant.body).toMatch(/email address or phone number/);
    expect(attendant.body).toMatch(/no password needed/);
    expect(invitePageCopy({ state: 'EXPIRED', businessName: 'Eko Hotel' })).toMatchObject({
      title: 'Your invite to Eko Hotel has expired',
      mode: 'closed',
    });
    expect(invitePageCopy({ state: 'INVALID' }).mode).toBe('closed');
  });
});
