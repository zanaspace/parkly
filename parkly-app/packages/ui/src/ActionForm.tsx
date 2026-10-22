'use client';

import { startTransition, type FormEvent, type FormHTMLAttributes } from 'react';

export type ActionFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'> & {
  /** The dispatch from `useActionState` (or any action taking the form data). */
  action: (formData: FormData) => void;
};

/**
 * A form for server actions that never loses what was typed. React resets a
 * `<form action={fn}>` after every submit, even when the server answers with
 * an error, so people had to fill the form in again. This one submits the
 * same data through a transition instead: fields keep their values, and the
 * pressed button's name/value is still sent. Pending state from
 * `useActionState` works as before.
 */
export function ActionForm({ action, children, ...rest }: ActionFormProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const data = new FormData(event.currentTarget, submitter);
    startTransition(() => action(data));
  }
  return (
    <form {...rest} onSubmit={submit}>
      {children}
    </form>
  );
}
