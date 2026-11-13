import { LegalDocument } from '../../../components/legal-document';
import { PRIVACY } from '../../../lib/legal/privacy';

export const metadata = { title: 'Privacy Notice · Parkly' };

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY} />;
}
