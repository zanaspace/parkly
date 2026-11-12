import { brandedEmail, button, detailsCard, esc, note, paragraph } from '../emails/layout.js';
import type { EmailMessage, NotificationEvent, PushMessage, SmsMessage } from './types.js';

function formatNaira(kobo: number): string {
  const naira = (kobo / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₦${naira}`;
}

function formatLagosTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/** Where links in messages point: the driver website (WEB_BASE_URL), and the portal for invites. */
export type TemplateLinks = { web: string; portal?: string };
const LOCAL_LINKS: TemplateLinks = { web: 'http://localhost:3000' };

const bookingUrl = (links: TemplateLinks, bookingId: string) =>
  `${links.web.replace(/\/$/, '')}/bookings/${encodeURIComponent(bookingId)}`;

/** One 160-character SMS. A long lot name shortens the text, never the link. */
function sms(text: string, link?: string): string {
  if (!link) return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
  const room = 160 - link.length - 1;
  return `${text.length <= room ? text : `${text.slice(0, room - 3)}...`} ${link}`;
}

export function renderSms(
  event: NotificationEvent,
  phone: string,
  links: TemplateLinks = LOCAL_LINKS,
): SmsMessage | null {
  let body: string;
  const link = bookingUrl(links, event.bookingId);
  switch (event.key) {
    case 'booking.confirmed': {
      const time = formatLagosTime(event.startAt);
      body = sms(
        `Parkly: Booking ${event.bookingCode} at ${event.lotName} confirmed for ${time}. View pass:`,
        link,
      );
      break;
    }
    case 'booking.reminder_start': {
      body = sms(
        `Parkly: Your parking at ${event.lotName} starts in ${event.minutesUntil} mins (${event.bookingCode}). Have a safe trip!`,
      );
      break;
    }
    case 'booking.reminder_end': {
      body = sms(
        `Parkly: Parking at ${event.lotName} ends in ${event.minutesLeft} mins. Extend now:`,
        link,
      );
      break;
    }
    case 'booking.extended': {
      const newTime = formatLagosTime(event.newEndAt);
      body = sms(
        `Parkly: Booking ${event.bookingCode} at ${event.lotName} extended to ${newTime}. Thank you!`,
      );
      break;
    }
    case 'booking.cancelled': {
      const refundStr =
        event.refundKobo > 0 ? ` Refund of ${formatNaira(event.refundKobo)} initiated.` : '';
      body = sms(
        `Parkly: Booking ${event.bookingCode} at ${event.lotName} has been cancelled.${refundStr}`,
      );
      break;
    }
    case 'booking.refunded': {
      body = sms(
        `Parkly: A refund of ${formatNaira(event.refundKobo)} for booking ${event.bookingCode} has been sent to your original payment method.`,
      );
      break;
    }
    case 'booking.lot_unavailable': {
      body = sms(
        `Parkly: ${event.lotName} can't take your booking ${event.bookingCode}, so we cancelled it and are refunding ${formatNaira(event.refundKobo)} in full. Sorry for the trouble.`,
      );
      break;
    }
    case 'session.overstay_due': {
      body = sms(
        `Parkly: Unpaid overstay of ${event.overstayMinutes}m (${formatNaira(event.amountKobo)}) at ${event.lotName}. Pay:`,
        link,
      );
      break;
    }
    default:
      return null;
  }
  return { to: phone, body };
}

export function renderPush(event: NotificationEvent, tokens: string[]): PushMessage | null {
  if (!tokens.length) return null;

  let title: string;
  let body: string;
  const data: Record<string, string> = {
    bookingId: event.bookingId,
    bookingCode: event.bookingCode,
    key: event.key,
  };

  switch (event.key) {
    case 'booking.confirmed':
      title = 'Booking Confirmed';
      body = `Your space at ${event.lotName} is reserved (${event.bookingCode}). Tap to view ticket.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.reminder_start':
      title = 'Parking Starts Soon';
      body = `Your parking at ${event.lotName} starts in ${event.minutesUntil} minutes.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.reminder_end':
      title = 'Stay Expiring Soon';
      body = `Your parking at ${event.lotName} ends in ${event.minutesLeft} mins. Tap to extend now.`;
      data.url = `parkly://bookings/${event.bookingId}/extend`;
      break;
    case 'booking.extended':
      title = 'Stay Extended';
      body = `Your parking at ${event.lotName} has been extended to ${formatLagosTime(event.newEndAt)}.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.cancelled':
      title = 'Booking Cancelled';
      body = `Booking ${event.bookingCode} at ${event.lotName} was cancelled.${event.refundKobo > 0 ? ` Refund: ${formatNaira(event.refundKobo)}.` : ''}`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.refunded':
      title = 'Refund on its way';
      body = `${formatNaira(event.refundKobo)} is being refunded for ${event.bookingCode}.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.lot_unavailable':
      title = 'Booking cancelled, full refund';
      body = `${event.lotName} can't take booking ${event.bookingCode}. We're refunding ${formatNaira(event.refundKobo)} in full.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'booking.no_show':
      title = 'Booking No-Show';
      body = `You did not check in within 30 mins for ${event.bookingCode} at ${event.lotName}. Space released.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'session.overstay_due':
      title = 'Overstay Fee Due';
      body = `Overstay fee of ${formatNaira(event.amountKobo)} due at ${event.lotName}. Tap to pay now.`;
      data.url = `parkly://bookings/${event.bookingId}/overstay`;
      break;
    case 'session.checked_in':
      title = 'Checked In';
      body = `Welcome to ${event.lotName}! You are checked in for ${event.bookingCode}.`;
      data.url = `parkly://bookings/${event.bookingId}`;
      break;
    case 'session.checked_out':
      title = 'Checked Out';
      body = `Thank you for parking at ${event.lotName}. Tap to view your receipt.`;
      data.url = `parkly://bookings/${event.bookingId}/receipt`;
      break;
    default:
      return null;
  }

  return { tokens, title, body, data };
}

export function renderEmail(
  event: NotificationEvent,
  email: string,
  links: TemplateLinks = LOCAL_LINKS,
): EmailMessage | null {
  // Lot names and codes are typed by operators: escaped before they go in HTML.
  const code = esc(event.bookingCode);
  const lot = esc(event.lotName);
  const link = bookingUrl(links, event.bookingId);
  let subject: string;
  let heading: string;
  let body: string;

  switch (event.key) {
    case 'booking.confirmed':
      subject = `Booking confirmed: ${event.bookingCode} at ${event.lotName}`;
      heading = 'Your parking space is confirmed';
      body = [
        paragraph(`Your parking booking at <strong>${lot}</strong> is confirmed.`),
        detailsCard([
          [
            'Booking code',
            `<span style="font-family: 'SF Mono', Consolas, Monaco, monospace">${code}</span>`,
          ],
          ['Car park', lot],
          ['Starts', esc(formatLagosTime(event.startAt))],
          ['Ends', esc(formatLagosTime(event.endAt))],
          ['Total paid', esc(formatNaira(event.totalKobo))],
        ]),
        paragraph('Show your QR code or booking code to the attendant when you arrive.'),
        button('View booking and ticket', link),
      ].join('');
      break;

    case 'booking.cancelled':
      subject = `Booking cancelled: ${event.bookingCode}`;
      heading = 'Your booking was cancelled';
      body = [
        paragraph(
          `Your booking <strong>${code}</strong> at <strong>${lot}</strong> has been cancelled.`,
        ),
        event.refundKobo > 0
          ? paragraph(
              `<strong>A refund of ${esc(formatNaira(event.refundKobo))} has been initiated</strong> to your original payment method.`,
            )
          : paragraph(
              'In accordance with our cancellation policy, no refund is due for late cancellation.',
            ),
        button('View receipt', `${link}/receipt`),
      ].join('');
      break;

    case 'booking.lot_unavailable':
      subject = `Booking ${event.bookingCode} cancelled: full refund`;
      heading = 'We had to cancel your booking';
      body = [
        paragraph(
          `<strong>${lot}</strong> can't take bookings right now, so we cancelled booking <strong>${code}</strong> and are refunding <strong>${esc(formatNaira(event.refundKobo))}</strong> in full.`,
        ),
        paragraph(
          'It goes back to the card or account you paid with. Banks usually take 5 to 10 working days to show it. We are sorry for the trouble; you can book another car park in the app.',
        ),
        button('View booking', link),
      ].join('');
      break;

    case 'booking.refunded':
      subject = `Refund for booking ${event.bookingCode}`;
      heading = 'Your refund is on its way';
      body = [
        paragraph(
          `We have refunded <strong>${esc(formatNaira(event.refundKobo))}</strong> for booking <strong>${code}</strong> at <strong>${lot}</strong>.`,
        ),
        paragraph(
          'It goes back to the card or account you paid with. Banks usually take 5 to 10 working days to show it.',
        ),
        button('View booking', link),
      ].join('');
      break;

    default:
      return null;
  }

  const html = brandedEmail({ title: subject, preheader: subject, heading, body });
  const text = `${heading}

Booking: ${event.bookingCode}
Car park: ${event.lotName}

${link}`;
  return { to: email, subject, text, html };
}

/** FR-OPS-004: the team invite, sent once when it is created. The link is the credential. */
export function renderInviteEmail(input: {
  to: string;
  businessName: string;
  role: 'MANAGER' | 'ATTENDANT';
  link: string;
}): EmailMessage {
  const business = esc(input.businessName);
  const as = input.role === 'MANAGER' ? 'a manager' : 'an attendant';
  const next =
    input.role === 'MANAGER'
      ? 'Open the link, sign in or create an account with this email, then accept.'
      : 'Open the link on the phone you will use at the gate and sign in with the code we send to this email.';
  const html = brandedEmail({
    title: `${input.businessName} invited you to Parkly`,
    preheader: `Join ${input.businessName} on Parkly as ${as}.`,
    heading: `${input.businessName} invited you to Parkly`,
    body: [
      paragraph(`${business} has invited you to join their team as ${as}.`),
      paragraph(esc(next)),
      button('Accept the invite', input.link),
      note(
        'This link works once and expires in 72 hours. If you weren’t expecting it, ignore this email.',
      ),
    ].join(''),
  });
  const text = `${input.businessName} invited you to Parkly as ${as}.\n\n${next}\n\n${input.link}\n\nThis link works once and expires in 72 hours.`;
  return { to: input.to, subject: `${input.businessName} invited you to Parkly`, html, text };
}
