import { Button, Text } from '@parkly/ui';

export default function Home() {
  return (
    <main className="pk-page">
      <Text variant="overline" tone="brand">
        Parkly for Operators
      </Text>
      <Text variant="heading-xl">Operator portal</Text>
      <Text tone="secondary">Manage lots, bookings, attendants and daily settlements.</Text>
      <Button>Sign in</Button>
    </main>
  );
}
