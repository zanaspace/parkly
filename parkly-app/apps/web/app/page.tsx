import { Button, Text } from '@parkly/ui';

export default function Home() {
  return (
    <main className="pk-page">
      <Text variant="overline" tone="brand">
        Parkly
      </Text>
      <Text variant="heading-xl">Safe, verified parking in Lagos</Text>
      <Text tone="secondary">
        Book a space at a verified lot before you leave home. Pay cashless, park without touts.
      </Text>
      <Button>Find parking</Button>
    </main>
  );
}
