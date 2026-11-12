import { LegalDocument } from '../../../components/legal-document';
import { OPERATORS } from '../../../lib/legal/operators';

export const metadata = { title: 'Operator Terms · Parkly' };

export default function OperatorTermsPage() {
  return <LegalDocument doc={OPERATORS} />;
}
