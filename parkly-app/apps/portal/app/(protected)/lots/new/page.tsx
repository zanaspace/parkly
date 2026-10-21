import { Text } from '@parkly/ui';
import Link from 'next/link';
import { LotForm } from '../../../../components/lots';
import { requireAccess } from '../../../../lib/auth/session';
import { lotOperatorId } from '../operator';

export const metadata = { title: 'Add a lot · Parkly for Operators' };

/** O-11 steps 1–3; hours and photos follow on the lot's page. */
export default async function NewLotPage() {
  const { me } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  return (
    <main className="pk-page">
      <Link className="pk-link" href="/lots">
        ← Your lots
      </Link>
      <Text variant="heading-xl">Add a lot</Text>
      <Text tone="secondary">
        Start with the basics. Next you’ll add opening hours and photos; prices and the LASPA permit
        come after that.
      </Text>
      <LotForm operatorId={operatorId} editable />
    </main>
  );
}
