import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Turnstile } from './Turnstile.js';

afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.useRealTimers();
});

describe('Turnstile', () => {
  it('renders nothing without a site key, so captcha stays off until configured', () => {
    const { container } = render(<Turnstile siteKey={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the widget with the site key and resets it after each submit', async () => {
    const api = { render: vi.fn(() => 'w1'), reset: vi.fn(), remove: vi.fn() };
    window.turnstile = api;
    vi.useFakeTimers();
    const { container, unmount } = render(
      <form onSubmit={(e) => e.preventDefault()}>
        <Turnstile siteKey="site-key" />
      </form>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.render).toHaveBeenCalledWith(
      container.querySelector('.pk-captcha'),
      expect.objectContaining({ sitekey: 'site-key' }),
    );

    const form = container.querySelector('form');
    if (!form) throw new Error('form not rendered');
    fireEvent.submit(form);
    expect(api.reset).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(api.reset).toHaveBeenCalledWith('w1');

    unmount();
    expect(api.remove).toHaveBeenCalledWith('w1');
  });
});
