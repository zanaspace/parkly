import Link from 'next/link';
import { AuthPage } from '../../components/auth-page';
import { SignOutButtons } from '../../components/sign-out';

export const metadata = { title: 'No access · Parkly for Operators' };

export default function NoAccessPage() {
  return (
    <AuthPage
      title="This account can’t use the operator portal"
      intro="The portal is for lot owners and managers. Attendants check cars in from the attendant app. If you think this is wrong, ask your lot owner to invite you."
    >
      <Link className="pk-link" href="/attend">
        Go to the attendant app
      </Link>
      <SignOutButtons />
    </AuthPage>
  );
}
