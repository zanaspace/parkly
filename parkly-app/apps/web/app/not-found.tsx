import { Text } from '@parkly/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="pk-page">
      <Text variant="heading-lg" as="h1">
        We couldn’t find that car park
      </Text>
      <Text tone="secondary">
        It may no longer be listed. Parkly only shows car parks that are verified right now.
      </Text>
      <Link className="pk-link" href="/search">
        Find parking nearby
      </Link>
    </main>
  );
}
