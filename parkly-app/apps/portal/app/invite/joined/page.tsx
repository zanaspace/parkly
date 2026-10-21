import { Text } from '@parkly/ui';
import { AuthPage } from '../../../components/auth-page';

export const metadata = { title: 'You’ve joined · Parkly for Operators' };

/** Attendants don't use the portal; they check cars in with the attendant app (S5). */
export default function JoinedPage() {
  return (
    <AuthPage title="You’ve joined the team">
      <Text>
        You’re now an attendant. You’ll check cars in and out with the Parkly attendant app.
      </Text>
    </AuthPage>
  );
}
