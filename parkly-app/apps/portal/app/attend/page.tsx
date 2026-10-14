import { Button, Text } from '@parkly/ui';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Parkly Attendant' };

// The offline-first attendant PWA (QR scan, manifest sync) arrives in Sprint 5 (doc 20).
export default function AttendPage() {
  return (
    <main className="pk-page" data-density="large">
      <Text variant="heading-xl">Attendant check-in</Text>
      <Text tone="secondary">
        Coming in Sprint 5: scan tickets and check cars in, even with no network.
      </Text>
      <Button size="lg" fullWidth disabled>
        Scan ticket
      </Button>
    </main>
  );
}
