import { AuthPage } from '../../components/auth-page';
import { BusinessForm } from '../../components/operator-forms';
import { SignOutButtons } from '../../components/sign-out';
import { requireNewcomer } from '../../lib/auth/session';

export const metadata = { title: 'Your business · Parkly for Operators' };

/** O-03: a confirmed user with no role yet creates their operator here. */
export default async function OnboardingPage() {
  const { me } = await requireNewcomer();
  return (
    <AuthPage
      title="Tell us about your business"
      intro="We use these details to verify your business (KYB) before your lots go live. You can edit them until you submit KYB."
    >
      <BusinessForm mode="create" agreementVersion={me.currentLegalVersions.operatorAgreement} />
      <SignOutButtons />
    </AuthPage>
  );
}
