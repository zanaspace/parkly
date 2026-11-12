import type { LegalDoc } from './types';

/**
 * Driver Terms of Service (doc 05 section 18.6). The rules here are the ones the product enforces
 * today (ADR 0004, 0016, 0023, 0024 and the platform settings). Numbers that Parkly can change
 * (the cancellation window, grace periods, fees) are described as "shown in the app" with today's
 * value, so the text does not go stale when a setting changes. Wording that decides who bears
 * risk (liability, bailment, governing law) is a draft for counsel: see docs/23.
 */
export const TERMS: LegalDoc = {
  slug: 'terms',
  audience: 'drivers',
  title: 'Driver Terms',
  summary:
    'The rules for booking and using parking through Parkly: what you pay, what happens if you are late or cancel, and what we are and are not responsible for.',
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
          text: 'These Terms are an agreement between you and {{companyName}} (“Parkly”, “we”, “us”), {{registration}}, of {{address}}. They apply when you use the Parkly app or website to find, book and pay for parking. By creating an account and ticking the box to accept them, you agree to them. How we use your personal data is in our Privacy Notice.',
        },
        {
          kind: 'p',
          text: 'Parkly is a marketplace. We list car parks, take your booking and payment, and pass the parking payment to the car park. The parking itself is provided by the car park operator, not by Parkly. We list only car parks that hold a current LASPA permit and that we have visited, but we do not run them or control the people who work there.',
        },
      ],
    },
    {
      id: 'account',
      title: 'Your account',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You must be 18 or older and able to make a binding agreement.',
            'You sign in with your mobile phone number and a one-time code we text you. Keep your phone and code private. You are responsible for what happens under your account.',
            'Give us true details, including the correct plate for the vehicle you book with. A booking is tied to that plate.',
            'One account is for one person. Do not let someone else use yours.',
            'You can close your account in the app at any time (Account, then Delete my account). See the Privacy Notice for what happens to your data.',
          ],
        },
      ],
    },
    {
      id: 'booking',
      title: 'Booking and paying',
      blocks: [
        {
          kind: 'p',
          text: 'There are two ways to book. Both are priced by our servers and shown to you in full before you pay.',
        },
        {
          kind: 'ul',
          items: [
            'Reserve for later: you choose the car park and the times you want. Your space is held for that window.',
            'Park now: you pay for a minimum stay and a space is held for you straight away until you arrive. Your parking time starts when you check in, not when you book. The first 60 minutes of holding are free. After that, a holding fee applies for each 15 minutes the space is held, and the hold ends if you have not arrived within the maximum hold time shown in the app. The holding fee is added when you leave, together with anything else you owe. A car park can limit how many Park now holds it takes at once, so Park now is not always available.',
          ],
        },
        {
          kind: 'ul',
          items: [
            'The price shown includes the car park’s charge and a Parkly service fee. You pay in naira through Paystack. We never see your card details.',
            'Your booking is confirmed only when your payment is confirmed. If you start a booking and do not pay, the space is held for a short time (currently 10 minutes) and then released.',
            'After you pay you receive a ticket with a QR code and a booking code. Keep it available on your phone. The QR code works without a data connection.',
            'We do not hold money for you. There are no wallets, credits or stored balances. A refund always goes back to the way you paid.',
          ],
        },
      ],
    },
    {
      id: 'arriving',
      title: 'Arriving and checking in',
      blocks: [
        {
          kind: 'ul',
          items: [
            'Check in at the gate with your QR code, booking code or your plate, or by scanning the car park’s Parkly code in the app where the car park offers it. Self check-in only works near the car park and during your booking.',
            'You can check in up to 30 minutes before a Reserve for later booking starts, if there is space. If the car park is full, the app tells you the time you can come in. If you want to start earlier than that and there is space, the app may offer a paid early start. You pay only if you accept it.',
            'If you do not arrive within the grace period after your start time (currently 30 minutes), your booking is treated as a no-show. We release the space, and the booking is not refunded.',
            'The attendant may ask to see your ticket and confirm your plate. Follow the car park’s rules and the attendant’s reasonable instructions.',
          ],
        },
      ],
    },
    {
      id: 'staying',
      title: 'Staying longer than you booked',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You can extend your stay in the app while there is space. You pay for the extra time before it starts.',
            'If you stay past your end time and past a short grace period (currently 10 minutes, and some car parks give more), you owe an overstay charge. It is counted for every 15 minutes you stay and uses the car park’s overstay price, which is shown on its page, when you pay, and on your ticket.',
            'Pay an overstay in the app. If it is still unpaid 24 hours after you leave, you cannot make new bookings until it is paid. Our team can waive an overstay in a fair case.',
            'Leaving before your end time does not give a refund of the unused time.',
          ],
        },
      ],
    },
    {
      id: 'cancel',
      title: 'Cancelling and refunds',
      blocks: [
        {
          kind: 'ul',
          items: [
            'You can cancel a booking in the app. If you cancel at least 30 minutes before it starts (this window may change; the app shows the current one), you are refunded the full price, including our service fee. If you cancel later, there is no refund.',
            'If the car park cannot honour your booking, for example it closes or is suspended, we cancel your booking and refund you in full.',
            'In a fair case, such as a duplicate charge or a problem at the car park, our team can refund part or all of what you paid. You can ask support, and we will look at it.',
            'Refunds go back to the card or account you paid with. Your bank usually takes 5 to 10 working days to show it.',
          ],
        },
      ],
    },
    {
      id: 'car-parks',
      title: 'Using a car park',
      blocks: [
        {
          kind: 'p',
          text: 'Each car park has its own rules (height limits, opening hours, where to park, and so on). You must follow them. The car park is responsible for its premises and for how it looks after vehicles while they are parked there.',
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, risk of loss: [Wording on whether Parkly or the car park is responsible for loss of or damage to a vehicle or its contents, and whether parking is at the owner’s risk, is to be settled by Nigerian counsel. See docs/23, item 6.]',
        },
        {
          kind: 'p',
          text: 'If something goes wrong at a car park (damage, theft, a safety problem, being overcharged), tell us as soon as you can through Parkly support, with your booking code. We record it, look into it, and talk to the car park. Parkly does not run an insurance scheme for vehicles at this time.',
        },
      ],
    },
    {
      id: 'conduct',
      title: 'How you must behave',
      blocks: [
        {
          kind: 'p',
          text: 'You agree not to:',
        },
        {
          kind: 'ul',
          items: [
            'give false information, or book with a plate that is not yours to use;',
            'make bookings you do not mean to use, to block spaces from other drivers;',
            'share your ticket so that someone else uses your booking;',
            'pay an attendant or car park in cash or by transfer to avoid paying through Parkly for a booking made through Parkly;',
            'abuse, threaten or harm our staff, car park attendants or other drivers;',
            'interfere with the app, website or our systems, or try to get around security checks; or',
            'use Parkly for anything unlawful.',
          ],
        },
      ],
    },
    {
      id: 'suspension',
      title: 'If we need to stop your account',
      blocks: [
        {
          kind: 'p',
          text: 'We may suspend or close an account if you break these Terms, if we believe it is used for fraud or abuse, or if the law requires it. We will tell you why when we can. If we close your account for a reason that is not your fault, we will refund any booking we could not honour.',
        },
      ],
    },
    {
      id: 'liability',
      title: 'Our responsibility to you',
      blocks: [
        {
          kind: 'p',
          text: 'We take reasonable care in running Parkly and we work to keep it available, but we cannot promise it will never be interrupted or free of faults. Nothing in these Terms limits any right you have under Nigerian law that cannot be limited, including for death or personal injury caused by negligence, or for fraud.',
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, limits on liability: [The extent to which Parkly’s liability is limited (for example, to the amount paid for the booking in question) is to be settled by Nigerian counsel. See docs/23, item 6.]',
        },
      ],
    },
    {
      id: 'disputes',
      title: 'Problems and disputes',
      blocks: [
        {
          kind: 'p',
          text: 'If you have a problem, contact us first at {{supportEmail}} or through the app, with your booking code. We will try to put it right. These Terms are governed by the laws of the Federal Republic of Nigeria, and the courts of Lagos State can hear any dispute that we cannot settle between us.',
        },
        {
          kind: 'note',
          text: 'DRAFT FOR COUNSEL, governing law and dispute process: [Confirm the governing law, the courts, and whether to add mediation or arbitration. See docs/23, item 6.]',
        },
      ],
    },
    {
      id: 'changes',
      title: 'Changes to the service and these Terms',
      blocks: [
        {
          kind: 'p',
          text: 'Prices, fees and time limits can change, and each change applies to bookings made after it, never to a booking you have already paid for. If we change these Terms in a way that matters, we will update the version number and ask you to accept them again before you carry on. This is version {{version}}.',
        },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      blocks: [
        {
          kind: 'p',
          text: 'Help with a booking: {{supportEmail}}. Privacy questions: {{privacyEmail}}. Our address is {{address}}.',
        },
      ],
    },
  ],
};
