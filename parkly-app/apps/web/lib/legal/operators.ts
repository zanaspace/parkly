import type { LegalDoc } from './types';

/**
 * Operator Terms: the agreement between Parkly and a car park operator, with a section on the
 * data Parkly holds about the business and its team (doc 05 section 18.6, doc 06 section 3.5).
 * Written from what the platform does today (KYB, permits, site visit, price approval, Paystack
 * split settlement, attendants). Anything that decides who bears risk or who is controller of
 * which data is marked for counsel: see docs/23.
 */
export const OPERATORS: LegalDoc = {
  slug: 'operators',
  audience: 'operators',
  title: 'Operator Terms',
  summary:
    'The agreement for car parks that list on Parkly: what we check, how prices and commission work, how you are paid, what you must do, and how we handle data about your business and your team.',
  version: '2026-11-12',
  updated: '12 November 2026',
  draft: true,
  sections: [
    {
      id: 'about',
      title: 'About these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'These Terms are an agreement between the business that signs up (“you”, “the operator”) and {{companyName}} (“Parkly”, “we”, “us”), {{registration}}, of {{address}}. They apply when you register on the Parkly operator portal, list a car park, or take bookings through Parkly. The person who accepts them confirms they have the authority to bind the business.',
        },
        {
          kind: 'p',
          text: 'Parkly is a marketplace. We show your car park to drivers, take their booking and payment, and pass your share to you. You provide the parking. Drivers’ rights and Parkly’s duties to them are in the Driver Terms.',
        },
      ],
    },
    {
      id: 'joining',
      title: 'Joining and being checked',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You sign up with an email address and a password, and set up two-step verification. The business owner is the first member of the team.',
            'We check your business before you can take bookings (we call this KYB). You give us your registered business name, CAC registration number, address, and the documents we ask for, such as your CAC certificate, a director’s ID and a proof of address.',
            'Everything you give us must be true and kept up to date. Tell us if it changes.',
            'We do not list a car park until it has a current LASPA permit that we have reviewed and we have visited the site. We may ask for further approvals where the law requires them, such as for hotels or event centres. We can refuse or remove a listing that does not pass.',
            'Approval by Parkly is not a guarantee about your car park to anyone, and does not replace your own legal duties.',
          ],
        },
      ],
    },
    {
      id: 'listing',
      title: 'Listing, prices and capacity',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You set your prices and limits: the hourly or daily rate, an optional overstay price, and how many spaces Parkly can sell. Parkly reviews every price change before it goes live, and a change applies only to bookings made after it.',
            'The overstay price cannot be more than a limit Parkly sets (today, twice the usual price for each 15 minutes, which is a quarter of the hourly rate). The app shows the overstay price to drivers before they pay.',
            'Keep your opening hours, capacity and photos accurate. You can pause a car park at any time to stop new bookings; bookings already made stay.',
            'If you allow drivers to check themselves in at your entrance, you turn that on for each car park. It is off until you do.',
          ],
        },
      ],
    },
    {
      id: 'money',
      title: 'Commission, fees and getting paid',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Parkly takes a commission on each booking’s parking charge. It is between 10% and 15%, and your rate is shown in your portal. The rate that applied when a booking was made is the one used for that booking, even if the rate changes later.',
            'Drivers also pay Parkly a service fee. It belongs to Parkly, not to you.',
            'Payments are made through Paystack. When a driver pays, the payment is split at once: your share goes to your payout account and Parkly’s share to Parkly. We do not hold your money in a Parkly wallet.',
            'Paystack pays your share into your bank account on its settlement schedule. Parkly imports those payouts so your portal shows what was paid and what is still to come, with a statement for each month.',
            'When a driver is refunded, your share of that refund is taken back from the same booking. This includes refunds Parkly gives because a car park could not honour a booking.',
            'Your bank account is held by Paystack. Parkly keeps only a reference to it and a masked version of the number.',
          ],
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, first payout: [Whether and on what terms Parkly may delay the first payout to a new operator, and the settlement timing the agreement promises (Paystack’s schedule or a fixed period), are to be settled by counsel. See docs/23, item 9.]',
        },
      ],
    },
    {
      id: 'your-duties',
      title: 'What you must do',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Honour every confirmed booking and let the driver in during their booking, with the space they paid for.',
            'Keep a valid LASPA permit. If it expires, Parkly hides the car park and stops new bookings until you upload a renewed permit, and we tell you before that happens.',
            'Use the Parkly attendant app at the gate to check drivers in and out. Do not take cash, transfers or any other payment from a driver for a booking made through Parkly.',
            'Do not charge drivers more than the price shown for a booking, or add charges that were not shown.',
            'Look after vehicles and keep the car park safe and lit, as the law and your own duty of care require.',
            'Tell us promptly about incidents, damage, theft or safety problems at your car park, and help us look into them.',
            'Train your attendants and keep them to these Terms. You are responsible for what your team does.',
          ],
        },
      ],
    },
    {
      id: 'team',
      title: 'Your team and attendants',
      blocks: [
        {
          kind: 'ul',
          items: [
            'The owner can add managers and attendants. Managers can add attendants. Each person signs in with their own details; do not share them.',
            'An attendant’s phone has to be approved by a manager before it can check drivers in. You can remove a person or block a phone at any time, and should do so as soon as someone leaves.',
            'Owners and managers can see your bookings, revenue and statements. Attendants see only what they need at the gate.',
          ],
        },
      ],
    },
    {
      id: 'suspension',
      title: 'Suspension and ending the agreement',
      blocks: [
        {
          kind: 'ul',
          items: [
            'We can suspend a car park, or your account, if a permit expires, if there is a safety or fraud concern, if you break these Terms, or if the law requires it. We tell you why. Existing bookings are normally honoured. If they cannot be, Parkly cancels them and refunds the drivers, and your share of those bookings is not paid.',
            'You can stop at any time by pausing your car parks and asking us to close your account. Bookings already made must be honoured or cancelled with a refund.',
            'When the agreement ends, we keep the records the law requires, and we finish any payouts that are due.',
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Data: what we hold about your business and team, and about drivers',
      blocks: [
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, roles: [The wording on who is the data controller or processor for which data (below), and whether a separate data processing agreement is needed, is to be settled by counsel. See docs/23, item 2.]',
        },
        {
          kind: 'table',
          caption: 'What we collect about your business and team, and why',
          head: ['What', 'Why we need it', 'Who sees it'],
          rows: [
            [
              'Business name, CAC number, address, and your CAC certificate',
              'To check your business is real and to keep the records the law requires.',
              'Parkly’s operations and compliance team, and you.',
            ],
            [
              'A director’s ID and a proof of address (ID numbers are encrypted)',
              'To check who is behind the business.',
              'Only Parkly’s operations and compliance staff.',
            ],
            [
              'Your LASPA permit and other approvals, and the records of our site visit and its photos',
              'To list your car park lawfully and show drivers it is verified.',
              'Parkly’s operations and compliance team, and you.',
            ],
            [
              'Bank details for payout',
              'To pay you. They go to Paystack, which holds them; we keep a reference and a masked account number.',
              'Paystack, Parkly’s finance team, and you.',
            ],
            [
              'The name, email address, phone number and role of each member of your team, and attendants’ phone identifiers',
              'To let them sign in, to approve devices, and to message them.',
              'You, and Parkly’s operations team.',
            ],
            [
              'Your agreement to these Terms: version, who accepted, and when',
              'To prove what was agreed.',
              'Parkly’s operations and legal team.',
            ],
            [
              'What your team does in the portal and what our staff do to your account',
              'Security and accountability.',
              'Parkly’s compliance team.',
            ],
          ],
        },
        {
          kind: 'table',
          caption: 'What you see about drivers',
          head: ['Who', 'What they see'],
          rows: [
            [
              'Attendants',
              'A driver’s first name, plate, and booking time and status, to let the right car in. Not their phone or email.',
            ],
            [
              'Owners and managers',
              'The bookings at your car parks, with the driver’s first name, plate and the amounts paid. Not their phone or email.',
            ],
          ],
        },
        {
          kind: 'ul',
          items: [
            'Use what you see about drivers only to run the booking: letting them in, charging what they owe, handling a problem. Do not use it for marketing, sell it, or share it with anyone else.',
            'Keep it secure: only people who need it, on their own accounts, and no copies on paper or in chats.',
            'If you export a bookings list, it is marked with your name and the export is recorded. Treat it the same way.',
            'Tell us at once if data about a driver is lost or seen by someone who should not have it.',
            'We keep records about your business for as long as you are with us and for 6 years after, because the law requires financial records. Our Privacy Notice for drivers describes how we handle drivers’ data.',
          ],
        },
      ],
    },
    {
      id: 'responsibility',
      title: 'Responsibility',
      blocks: [
        {
          kind: 'p',
          text: 'You are responsible for your car park, your staff, and the vehicles in your care. We take reasonable care in running Parkly, but we cannot promise it will never be interrupted. Nothing here limits a duty that cannot be limited by Nigerian law.',
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, liability and indemnity: [What each side is liable for, any limit on it, and any indemnity from the operator for loss to drivers’ vehicles, are to be settled by counsel. See docs/23, item 6.]',
        },
      ],
    },
    {
      id: 'disputes',
      title: 'Disputes and governing law',
      blocks: [
        {
          kind: 'p',
          text: 'Contact us first at {{supportEmail}} and we will try to settle it. These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State can hear any dispute we cannot settle.',
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, governing law and dispute process: [Confirm the governing law, the courts, and whether to add mediation or arbitration. See docs/23, item 6.]',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'If we change these Terms in a way that matters, we will update the version and ask the owner to accept them again before you carry on. Changes to commission apply to bookings made after the change. This is version {{version}}.',
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      blocks: [
        {
          kind: 'p',
          text: 'Help with your account or payouts: {{supportEmail}}. Privacy questions: {{privacyEmail}}. Our address is {{address}}.',
        },
      ],
    },
  ],
};
