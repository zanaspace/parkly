import { Button, Text } from '@parkly/ui';

export default function Home() {
  return (
    <main className="pk-page">
      <Text variant="overline" tone="brand">
        Parkly Admin
      </Text>
      <Text variant="heading-xl">Parkly operations console</Text>
      <Text tone="secondary">
        Internal use only. Verification, support, refunds and compliance.
      </Text>
      <Button>Sign in</Button>
    </main>
  );
}
