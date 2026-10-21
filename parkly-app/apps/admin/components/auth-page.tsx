import { Text } from '@parkly/ui';
import type { ReactNode } from 'react';

/** Centred single-column layout for sign-in, MFA and password pages. */
export function AuthPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main className="pk-page">
      <Text variant="overline" tone="brand">
        Parkly Admin
      </Text>
      <Text variant="heading-xl">{title}</Text>
      {intro && <Text tone="secondary">{intro}</Text>}
      {children}
    </main>
  );
}
