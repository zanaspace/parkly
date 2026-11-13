import { LegalDocument } from '../../../components/legal-document';
import { TERMS } from '../../../lib/legal/terms';

export const metadata = { title: 'Driver Terms · Parkly' };

export default function TermsPage() {
  return <LegalDocument doc={TERMS} />;
}
