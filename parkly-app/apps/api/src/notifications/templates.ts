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

function truncateSms(text: string): string {
  if (text.length <= 160) return text;
  return `${text.slice(0, 157)}...`;
}

export function renderSms(event: NotificationEvent, phone: string): SmsMessage | null {
  let body = '';
  switch (event.key) {
    case 'booking.confirmed': {
      const time = formatLagosTime(event.startAt);
      body = `Parkly: Booking ${event.bookingCode} at ${event.lotName} confirmed for ${time}. View pass: https://parkly.ng/b/${event.bookingId}`;
      break;
    }
    case 'booking.reminder_start': {
      body = `Parkly: Your parking at ${event.lotName} starts in ${event.minutesUntil} mins (${event.bookingCode}). Have a safe trip!`;
      break;
    }
    case 'booking.reminder_end': {
      body = `Parkly: Parking at ${event.lotName} ends in ${event.minutesLeft} mins. Extend now: https://parkly.ng/b/${event.bookingId}/extend`;
      break;
    }
    case 'booking.extended': {
      const newTime = formatLagosTime(event.newEndAt);
      body = `Parkly: Booking ${event.bookingCode} at ${event.lotName} extended to ${newTime}. Thank you!`;
      break;
    }
    case 'booking.cancelled': {
      const refundStr =
        event.refundKobo > 0 ? ` Refund of ${formatNaira(event.refundKobo)} initiated.` : '';
      body = `Parkly: Booking ${event.bookingCode} at ${event.lotName} has been cancelled.${refundStr}`;
      break;
    }
    case 'session.overstay_due': {
      body = `Parkly: Unpaid overstay of ${event.overstayMinutes}m (${formatNaira(event.amountKobo)}) at ${event.lotName}. Pay: https://parkly.ng/b/${event.bookingId}/pay`;
      break;
    }
    default:
      return null;
  }
  return { to: phone, body: truncateSms(body) };
}

export function renderPush(event: NotificationEvent, tokens: string[]): PushMessage | null {
  if (!tokens.length) return null;

  let title = '';
  let body = '';
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

export function renderEmail(event: NotificationEvent, email: string): EmailMessage | null {
  let subject = '';
  let heading = '';
  let content = '';

  switch (event.key) {
    case 'booking.confirmed':
      subject = `Booking Confirmed: ${event.bookingCode} at ${event.lotName}`;
      heading = 'Your Parking Space is Confirmed';
      content = `
        <p>Your parking booking at <strong>${event.lotName}</strong> is confirmed.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px;"><strong>Booking Reference:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 16px;">${event.bookingCode}</span></p>
          <p style="margin: 0 0 8px;"><strong>Location:</strong> ${event.lotName}</p>
          <p style="margin: 0 0 8px;"><strong>Starts:</strong> ${formatLagosTime(event.startAt)}</p>
          <p style="margin: 0 0 8px;"><strong>Ends:</strong> ${formatLagosTime(event.endAt)}</p>
          <p style="margin: 0;"><strong>Total Paid:</strong> ${formatNaira(event.totalKobo)}</p>
        </div>
        <p>Show your digital QR code or booking code to the attendant when arriving at the car park.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://parkly.ng/bookings/${event.bookingId}" style="background: #008080; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">View Booking & Ticket</a>
        </div>
      `;
      break;

    case 'booking.cancelled':
      subject = `Booking Cancelled: ${event.bookingCode}`;
      heading = 'Booking Cancellation';
      content = `
        <p>Your booking <strong>${event.bookingCode}</strong> at <strong>${event.lotName}</strong> has been cancelled.</p>
        ${
          event.refundKobo > 0
            ? `<p style="color: #065f46; font-weight: bold;">A refund of ${formatNaira(event.refundKobo)} has been initiated to your original payment method.</p>`
            : '<p>In accordance with our cancellation policy, no refund is due for late cancellation.</p>'
        }
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://parkly.ng/bookings/${event.bookingId}/receipt" style="background: #008080; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold; display: inline-block;">View Receipt</a>
        </div>
      `;
      break;

    default:
      return null;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #f8fafc; color: #111827; margin: 0; padding: 24px; }
    .card { background: #ffffff; max-width: 580px; margin: 0 auto; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #008080; color: #ffffff; padding: 24px; text-align: center; }
    .content { padding: 28px; line-height: 1.6; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px;">Parkly</h1>
      <p style="margin: 4px 0 0; opacity: 0.85; font-size: 13px;">Smart Cashless Parking</p>
    </div>
    <div class="content">
      <h2 style="color: #008080; font-size: 20px; margin-top: 0;">${heading}</h2>
      ${content}
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px;">Parkly Technologies Ltd • Lagos, Nigeria</p>
      <p style="margin: 0;">Need help? Email <a href="mailto:support@parkly.ng" style="color: #008080;">support@parkly.ng</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = `${heading}\n\nBooking: ${event.bookingCode}\nLocation: ${event.lotName}\n\nParkly Technologies Ltd • support@parkly.ng`;

  return { to: email, subject, text, html };
}
