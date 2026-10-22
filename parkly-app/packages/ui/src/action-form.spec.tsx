import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useActionState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionForm } from './ActionForm.js';

afterEach(cleanup);

type State = { error?: string; got?: Record<string, string> } | undefined;

/** A form whose action always reports an error, like a failed server check. */
function Failing({ onSubmit }: { onSubmit?: (fd: FormData) => void }) {
  const [state, action] = useActionState(async (_prev: State, fd: FormData): Promise<State> => {
    onSubmit?.(fd);
    return { error: 'Capacity must be at least 1', got: Object.fromEntries(fd) as never };
  }, undefined);
  return (
    <ActionForm action={action}>
      <label>
        Name <input name="name" defaultValue="" />
      </label>
      <label>
        Capacity <input name="capacity" defaultValue="" />
      </label>
      <button type="submit" name="intent" value="save">
        Save
      </button>
      {state?.error && <p role="alert">{state.error}</p>}
    </ActionForm>
  );
}

describe('ActionForm', () => {
  it('keeps what was typed when the action returns an error', async () => {
    render(<Failing />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Eko Hotel Car Park' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '0' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Capacity must be at least 1',
    );
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Eko Hotel Car Park');
    expect((screen.getByLabelText('Capacity') as HTMLInputElement).value).toBe('0');
  });

  it('sends every field and the button that was pressed', async () => {
    let sent: FormData | undefined;
    render(<Failing onSubmit={(fd) => (sent = fd)} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ikoyi Lot' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    await screen.findByRole('alert');
    expect(sent?.get('name')).toBe('Ikoyi Lot');
    expect(sent?.get('intent')).toBe('save');
  });
});
