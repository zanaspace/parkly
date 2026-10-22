import { Text } from '@parkly/ui';
import { AuthPage } from '../../../components/auth-page';

export const metadata = { title: 'You’ve joined · Parkly for Operators' };

/** Attendants don't use the portal; they check cars in with the gate app at /attend. */
export default function JoinedPage() {
  return (
    <AuthPage title="You’ve joined the team">
      <Text>You’re now an attendant. You check cars in and out with the Parkly gate app.</Text>
      <Text tone="secondary">
        Open it on the phone you will use at the gate. The first time, your manager approves that
        phone. Tip: in Chrome, use “Add to Home screen” so it opens like an app.
      </Text>
      <a className="pk-button pk-button--primary pk-button--lg pk-button--full" href="/attend">
        Open the gate app
      </a>
    </AuthPage>
  );
}
