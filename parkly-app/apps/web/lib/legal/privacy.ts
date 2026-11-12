import type { LegalDoc } from './types';

/**
 * Privacy Notice (NDPA 2023, doc 05 section 18.1, doc 06). Written from what Parkly does today,
 * checked against the code, not from the plan: where doc 06 lists something that is not built
 * (analytics, ratings, saved places, driver ID checks), it is left out until it ships, and the
 * notice says it will ask first. Lines marked in docs/23 need counsel before launch.
 */
export const PRIVACY: LegalDoc = {
  slug: 'privacy',
  audience: 'drivers',
  title: 'Privacy Notice',
  summary:
    'What Parkly collects about you, how we collect it, what we use it for, who sees it, how long we keep it, and what you can do about it.',
  version: '2026-11-12',
  updated: '12 November 2026',
  draft: true,
  sections: [
    {
      id: 'who-we-are',
      title: 'Who we are',
      blocks: [
        {
          kind: 'p',
          text: '{{companyName}} (“Parkly”, “we”, “us”), {{registration}}, of {{address}}, runs the Parkly app and website that let drivers in Lagos find, book and pay for parking at verified car parks. For the personal data in this notice, Parkly is the data controller under the Nigeria Data Protection Act 2023 (NDPA).',
        },
        {
          kind: 'p',
          text: 'Our Data Protection Officer is {{dpoName}}. You can reach us about anything in this notice at {{privacyEmail}}.',
        },
        {
          kind: 'note',
          text: 'This notice is for drivers. Car park operators and their staff have their own agreement with us, which covers the data about their business and team.',
        },
      ],
    },
    {
      id: 'what-we-collect',
      title: 'What we collect, and how',
      blocks: [
        {
          kind: 'p',
          text: 'We collect only what we need to run parking bookings. It reaches us in three ways: you give it to us, it is created when you use Parkly, or it comes from a service we use.',
        },
        {
          kind: 'table',
          caption: 'Information you give us',
          head: ['What', 'When you give it', 'Why we need it'],
          rows: [
            [
              'Your mobile phone number',
              'When you sign up or sign in. We text you a one-time code.',
              'To sign you in, send booking messages, and let support find your booking.',
            ],
            [
              'Your name (first and last)',
              'When you set up your profile.',
              'To greet you, put it on receipts, and let the attendant see your first name.',
            ],
            [
              'Your email address (optional)',
              'When you add it, or sign in with it.',
              'To send receipts and sign-in links, and to recover your account.',
            ],
            [
              'Your vehicles: plate number, and make, model and colour if you add them',
              'When you add a vehicle.',
              'To match your car at the gate and let the attendant recognise it.',
            ],
            [
              'Your choices: that you accept the Terms and this notice, and whether you want marketing messages',
              'When you sign up, and when you change them.',
              'To keep a record of what you agreed to and when.',
            ],
            [
              'What you type to Parkly support or in an incident report',
              'When you contact us.',
              'To sort out your problem.',
            ],
          ],
        },
        {
          kind: 'table',
          caption: 'Information created when you use Parkly',
          head: ['What', 'Details'],
          rows: [
            [
              'Bookings',
              'The car park, the times, the price, your booking code, the vehicle and plate you booked with, and the status (booked, checked in, finished, cancelled, no-show).',
            ],
            [
              'Parking sessions',
              'When your car was checked in and out, how (QR code, code or plate), and which attendant or device did it.',
            ],
            [
              'Payments and refunds',
              'The amount, the status, the payment reference and when it was paid. We never see or keep your card number, expiry date or PIN: Paystack, our payment provider, handles those.',
            ],
            [
              'Receipts',
              'A copy of what you paid for: the car park, plate, your name, the last four digits of your phone number, charges and refunds.',
            ],
            [
              'Messages we send you',
              'A log of the booking messages we sent (reminders, confirmations, receipts), when, and whether they arrived. Not the full text.',
            ],
            [
              'Your device',
              'A device identifier, whether it is Android, iPhone or a web browser, the app version, and the push-notification token, so we can send you alerts and tell your devices apart.',
            ],
            [
              'Security and technical records',
              'Your IP address and request details when you use Parkly, kept to protect accounts, stop abuse and fix faults. In some security records the IP address is stored only as a one-way code.',
            ],
            [
              'Activity by our staff',
              'When a Parkly staff member looks at or changes something about you or your booking, we record who, what and when. Staff see your phone number and email masked unless they have a recorded reason to reveal them.',
            ],
          ],
        },
        {
          kind: 'table',
          caption: 'Where you are',
          head: ['When', 'What happens'],
          rows: [
            [
              'You search for parking “near me”',
              'If you allow location on your phone or browser, your position is sent with the search to find car parks nearby. We use it for that search and do not store it. Search works without it: you can type a place instead.',
            ],
            [
              'You check yourself in at a car park (where the car park allows it)',
              'If you allow location, your position is sent once to confirm you are at the car park. We compare it with the car park’s position and do not store your coordinates.',
            ],
            [
              'You type a destination',
              'The text you type is sent to our address-search provider (LocationIQ) to suggest places in Lagos. It is not linked to your name or phone number.',
            ],
          ],
        },
        {
          kind: 'table',
          caption: 'Information from other services',
          head: ['From', 'What we receive'],
          rows: [
            [
              'Paystack',
              'Whether your payment succeeded or failed, the amount and the reference, and a refund’s status.',
            ],
            ['Our SMS and email providers', 'Whether a message was delivered.'],
          ],
        },
      ],
    },
    {
      id: 'what-we-do-not-collect',
      title: 'What we do not collect',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Your card number, expiry date, CVV or PIN. These stay with Paystack.',
            'Photos of you or your car, and your driving licence or ID number. (If we ever add identity checks, for example for monthly passes, we will tell you first and ask for your agreement.)',
            'CCTV footage. Car parks keep their own; we may ask for a clip only to deal with an incident you raise.',
            'Phone call recordings.',
            'Advertising or analytics trackers. At the moment Parkly does not use them. If we add analytics later, we will ask for your consent first.',
            'A history of where you have been. Your position is used for the moment it is needed and then dropped.',
          ],
        },
      ],
    },
    {
      id: 'how-we-use-it',
      title: 'What we use it for, and our reason',
      blocks: [
        {
          kind: 'p',
          text: 'The law lets us use personal data only when we have a valid reason. These are ours.',
        },
        {
          kind: 'table',
          head: ['What we do with it', 'Our reason under the NDPA'],
          rows: [
            [
              'Create and secure your account, sign you in, take and confirm bookings, check you in, send tickets, reminders and receipts, and run extensions, overstay and cancellations',
              'Contract: we need it to do what you asked us to.',
            ],
            [
              'Take payments, make refunds, pay car parks, reconcile accounts and keep tax and accounting records',
              'Contract, and legal obligation: the law requires us to keep financial records.',
            ],
            [
              'Prevent fraud and abuse, keep our systems secure, keep logs and audit records, and investigate incidents',
              'Legitimate interest: protecting you, car parks and Parkly. We have weighed this against your rights.',
            ],
            [
              'Deal with incidents and disputes, and with claims or legal requests',
              'Contract and legitimate interest, and where needed to establish or defend a legal claim.',
            ],
            [
              'Check that a car park has a valid permit and has been visited by us before we show it to you',
              'Legal obligation and legitimate interest. This concerns the car park, not you.',
            ],
            [
              'Send you marketing messages (we do not send any today, and will not until you have opted in)',
              'Your consent, which you can withdraw at any time.',
            ],
            [
              'Use your location for “near me” search and self check-in',
              'Your consent, given through your phone or browser’s location permission.',
            ],
            ['Answer your privacy requests and keep proof that we did', 'Legal obligation.'],
          ],
        },
        {
          kind: 'p',
          text: 'We do not sell your personal data. We do not use it to decide anything about you automatically in a way that significantly affects you. Prices, fees and refund amounts are worked out by fixed rules, and a member of staff can review them if you ask.',
        },
      ],
    },
    {
      id: 'who-sees-it',
      title: 'Who sees your data',
      blocks: [
        {
          kind: 'p',
          text: 'Inside Parkly, only the staff who need it for their job can see your data, through an admin system that requires two-step sign-in and records what they do.',
        },
        {
          kind: 'table',
          caption: 'Car parks you book',
          head: ['Who', 'What they see'],
          rows: [
            [
              'The car park’s attendants',
              'Your first name, your plate, and your booking time and status, so they can let you in. Phone and email are not shown.',
            ],
            [
              'The car park operator (owner and managers)',
              'Your bookings at their car park, with your first name, plate and the amounts paid. They do not see your phone number or email.',
            ],
          ],
        },
        {
          kind: 'p',
          text: 'We also share data with companies that process it for us. We use only the ones listed here, give each only what it needs, and require them to protect it.',
        },
        {
          kind: 'table',
          caption: 'Companies that process data for us',
          head: ['Company', 'What it does for us', 'What it receives', 'Where'],
          rows: [
            [
              'Supabase',
              'Stores our database and files, and runs sign-in.',
              'All the account, booking and payment-record data described above.',
              'Ireland',
            ],
            [
              'Vercel',
              'Hosts the website, admin systems and our servers.',
              'Requests you make to Parkly, including your IP address, and technical logs.',
              'Ireland for our servers; its network is global',
            ],
            [
              'Paystack',
              'Takes payments and sends refunds.',
              'Your payment details (which you give to Paystack directly), the amount and the reference. It may also hold your email or phone for the receipt.',
              'Nigeria',
            ],
            [
              'Termii',
              'Sends text messages (sign-in codes and booking messages).',
              'Your phone number and the message.',
              'Nigeria',
            ],
            [
              'Resend',
              'Sends email (receipts, sign-in links, statements).',
              'Your email address, name and the receipt or message content.',
              'To be confirmed before launch',
            ],
            [
              'Expo',
              'Delivers push notifications to the app.',
              'Your push-notification token and the notification text.',
              'United States',
            ],
            [
              'Cloudflare (Turnstile)',
              'The “security check” on sign-in that stops automated attacks.',
              'Your IP address and browser details when you sign in.',
              'Global',
            ],
            [
              'Upstash',
              'Limits how fast anyone can request sign-in codes, to stop abuse.',
              'A one-way code made from your IP address or phone number, kept briefly.',
              'European Union',
            ],
            [
              'LocationIQ',
              'Suggests addresses as you type a destination.',
              'The destination text you type, without your name or phone number.',
              'Global',
            ],
            [
              'OpenFreeMap',
              'Provides the map pictures on our website and app.',
              'Your browser or phone asks it for map tiles, so it sees your IP address and the area you are looking at.',
              'Global',
            ],
            [
              'Sentry',
              'Tells our engineers when our servers hit an error.',
              'Error details with personal data removed.',
              'European Union',
            ],
          ],
        },
        {
          kind: 'p',
          text: 'We may also share data when the law requires it, with regulators, courts or the police, and with advisers (lawyers, auditors) who are bound to keep it confidential. If Parkly is sold or merged, your data may pass to the new owner, who must follow this notice.',
        },
        {
          kind: 'note',
          text: 'We keep this list current. If we add a company that handles your data, we update this notice first.',
        },
      ],
    },
    {
      id: 'transfers',
      title: 'Data leaving Nigeria',
      blocks: [
        {
          kind: 'p',
          text: 'Most of your data is stored in Ireland. Some of the companies above process data in other countries. Where they do, we rely on the safeguards the NDPA allows, such as written contracts that require them to protect your data to the same standard. You can ask us for details of the safeguards for any company.',
        },
      ],
    },
    {
      id: 'how-long',
      title: 'How long we keep it',
      blocks: [
        {
          kind: 'p',
          text: 'We keep data only as long as we need it for the reasons above.',
        },
        {
          kind: 'table',
          head: ['What', 'How long'],
          rows: [
            [
              'Your account details: phone, name, email, vehicles, devices',
              'While your account is open. When you delete your account, we erase them after a 30-day period in which you can change your mind.',
            ],
            [
              'Bookings, payments, refunds, receipts and the accounting records behind them',
              '6 years, because Nigerian tax and company law require us to keep financial records. After your account is erased, your plate on these records is replaced with a code that cannot be turned back into the plate, and your name and phone number are removed.',
            ],
            [
              'The record that you accepted our Terms and this notice, and your marketing choice',
              'While your account is open and for 6 years after, to prove what you agreed to.',
            ],
            ['The log of booking messages we sent you', '90 days.'],
            [
              'A copy of your data that you asked for',
              'The download file is deleted after 7 days.',
            ],
            [
              'Incident reports',
              '3 years after the incident is closed, longer if a legal claim needs them.',
            ],
            ['Records of what our staff did (audit records)', '6 years.'],
            [
              'Security and technical logs (IP addresses and request details)',
              'A short time, from days to a few months, depending on the log. Security records are kept longer than routine ones.',
            ],
            [
              'Your approximate or exact position',
              'Not kept. It is used for the search or check-in and then dropped.',
            ],
          ],
        },
      ],
    },
    {
      id: 'your-rights',
      title: 'Your rights, and how to use them',
      blocks: [
        {
          kind: 'p',
          text: 'You have these rights over your personal data. Most you can use yourself in the app; for the rest, write to {{privacyEmail}}.',
        },
        {
          kind: 'table',
          head: ['Your right', 'How to use it'],
          rows: [
            [
              'See what we hold and get a copy',
              'In the app: Account, then Download my data. You get a file with your profile, vehicles, consents and bookings, with their payments and refunds.',
            ],
            [
              'Correct it',
              'Add, change or remove your vehicles in Account. To correct your name, email or anything else, write to us.',
            ],
            [
              'Have it erased',
              'In the app: Account, then Delete my account. We cannot close an account while you have a booking that has not finished or an unpaid overstay. There is a 30-day period to change your mind. Records we are legally required to keep (see above) stay, with your identity removed.',
            ],
            [
              'Take back a consent you gave',
              'For marketing, write to us and we will switch it off. For location, turn it off in your phone or browser settings. Withdrawing does not change what we did before.',
            ],
            [
              'Object to or limit how we use it',
              'Write to us. If we rely on our legitimate interest, we will stop unless we have a stronger, lawful reason, and we will tell you which.',
            ],
            ['Move your data', 'The download file is a standard JSON file you can take elsewhere.'],
          ],
        },
        {
          kind: 'p',
          text: 'We answer within 30 days. We may need to check it is really you first. We do not charge for this unless a request is clearly unreasonable or repeated.',
        },
        {
          kind: 'p',
          text: 'If you are unhappy with how we handled your data, please tell us first so we can put it right. You also have the right to complain to the Nigeria Data Protection Commission (NDPC).',
        },
      ],
    },
    {
      id: 'security',
      title: 'How we protect it',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Everything travels over encrypted connections, and stored data is encrypted at rest. Phone numbers and email addresses are additionally encrypted inside our database.',
            'Passwords are never stored by us, only by our sign-in provider and only as a one-way hash.',
            'Parkly staff sign in with two-step verification, see your contact details masked unless they record a reason to reveal them, and their actions are logged.',
            'Staff access to the admin console is limited to approved networks and ends after a period of inactivity.',
            'We only keep the minimum, and we delete it on a schedule (see above).',
            'If we ever have a breach that puts your data at risk, we will tell the NDPC and you within the time the law sets.',
          ],
        },
      ],
    },
    {
      id: 'children',
      title: 'Children',
      blocks: [
        {
          kind: 'p',
          text: 'Parkly is for adults who drive. You must be 18 or older to create an account. We do not knowingly collect data from anyone under 18. If you think a child has an account, tell us and we will remove it.',
        },
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and similar technology',
      blocks: [
        {
          kind: 'p',
          text: 'Our website uses only what it needs to work:',
        },
        {
          kind: 'ul',
          items: [
            'Sign-in cookies, which keep you signed in. Without them you could not use your bookings.',
            'The Cloudflare security check on sign-in, which sets what it needs to tell people from bots.',
            'Map pictures loaded from OpenFreeMap, which can see your IP address.',
          ],
        },
        {
          kind: 'p',
          text: 'We do not use advertising or analytics cookies today. If that changes, we will ask for your consent first and update this notice. The mobile app stores your sign-in on your phone in its secure storage and does not use cookies.',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to this notice',
      blocks: [
        {
          kind: 'p',
          text: 'This is version {{version}}. If we change how we use your data in a way that matters, we will update the version and ask you to accept it again before you carry on. Smaller changes, such as fixing a typo or adding a company to the list, will show in the “last updated” date.',
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      blocks: [
        {
          kind: 'p',
          text: 'Privacy questions and requests: {{privacyEmail}}. Our Data Protection Officer is {{dpoName}}. General help with bookings: {{supportEmail}}.',
        },
      ],
    },
  ],
};
