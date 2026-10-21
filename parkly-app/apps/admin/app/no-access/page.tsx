import { AuthPage } from '../../components/auth-page';
import { SignOutButtons } from '../../components/sign-out';

export const metadata = { title: 'No access · Parkly Admin' };

export default function NoAccessPage() {
  return (
    <AuthPage
      title="This account can’t use the admin console"
      intro="The console is for Parkly staff. If you need access, ask a super admin to grant you a role."
    >
      <SignOutButtons />
    </AuthPage>
  );
}
