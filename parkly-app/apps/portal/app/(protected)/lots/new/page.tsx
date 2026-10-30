import { Text } from '@parkly/ui';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CameraIcon,
  ClockIcon,
  FileTextIcon,
  LotsIcon,
  MapPinIcon,
  SendIcon,
  TagIcon,
} from '../../../../components/icons';
import { LotForm } from '../../../../components/lots';
import { requireAccess } from '../../../../lib/auth/session';
import { lotOperatorId } from '../operator';

export const metadata = { title: 'Add a lot · Parkly for Operators' };

/** The full listing journey (doc 02 §3.3); only step 1 happens on this page. */
const ROADMAP = [
  { icon: LotsIcon, title: 'Lot details', note: 'Name, entrance, capacity, amenities' },
  { icon: CameraIcon, title: 'Photos', note: 'At least 3 clear photos of the lot' },
  { icon: ClockIcon, title: 'Opening hours', note: 'One window per day; overnight is fine' },
  { icon: TagIcon, title: 'Prices', note: 'Hourly and daily rates in naira' },
  { icon: FileTextIcon, title: 'LASPA permit', note: 'Upload your current permit' },
  { icon: SendIcon, title: 'Submit for review', note: 'Parkly checks and visits the site' },
] as const;

const CHECKLIST = [
  'Stand at the entrance to capture the exact GPS pin',
  'Know your total spaces and how many to sell',
  'Have your LASPA permit and 3+ photos ready for the next steps',
];

/** O-11 steps 1–3; hours and photos follow on the lot's page. */
export default async function NewLotPage() {
  const { me } = await requireAccess();
  const operatorId = lotOperatorId(me);
  if (!operatorId) return null;
  return (
    <main className="pk-page pk-page--wide">
      <Link className="pk-back-link" href="/lots">
        <ArrowLeftIcon size={16} />
        <span>Back to lots</span>
      </Link>

      <div className="pk-page-header">
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.25rem',
            }}
          >
            <LotsIcon size={22} style={{ color: 'var(--pk-color-text-brand)' }} />
            <Text variant="heading-xl" as="h1">
              Add a new car park
            </Text>
          </div>
          <Text variant="body-sm" tone="secondary">
            Start with the basics. Photos, opening hours, prices and the LASPA permit come next on
            the lot’s page.
          </Text>
        </div>
        <span
          className="pk-badge pk-badge--draft"
          style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
        >
          Step 1 of 6
        </span>
      </div>

      <div className="pk-lot-grid">
        <LotForm operatorId={operatorId} editable />

        <aside className="pk-lot-aside" aria-label="Listing steps">
          <div className="pk-card" style={{ padding: '1.5rem', gap: '1rem' }}>
            <Text variant="label-lg" as="h2">
              Listing roadmap
            </Text>
            <ol className="pk-roadmap">
              {ROADMAP.map(({ icon: Icon, title, note }, i) => (
                <li
                  key={title}
                  className={`pk-roadmap__item${i === 0 ? ' pk-roadmap__item--current' : ''}`}
                  aria-current={i === 0 ? 'step' : undefined}
                >
                  <span className="pk-roadmap__icon">
                    <Icon size={16} />
                  </span>
                  <span>
                    <strong className="pk-roadmap__title">{title}</strong>
                    <span className="pk-roadmap__note">{note}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="pk-tip-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <MapPinIcon size={18} style={{ color: 'var(--pk-color-text-brand)' }} />
              <strong style={{ fontSize: '0.875rem' }}>Before you start</strong>
            </div>
            <ul className="pk-tip-card__list">
              {CHECKLIST.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
