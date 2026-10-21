import { describe, expect, it } from 'vitest';
import { inviteLink, teamMessage, whatsappShare } from './copy';

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
});
