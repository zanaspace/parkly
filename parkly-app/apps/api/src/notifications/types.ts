export type NotificationChannel = 'SMS' | 'PUSH' | 'EMAIL';

export type NotificationEvent =
  | {
      key: 'booking.confirmed';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      startAt: string;
      endAt: string;
      totalKobo: number;
    }
  | {
      key: 'booking.reminder_start';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      startAt: string;
      minutesUntil: number;
    }
  | {
      key: 'booking.reminder_end';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      endAt: string;
      minutesLeft: number;
    }
  | {
      key: 'booking.extended';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      newEndAt: string;
      addedMinutes: number;
    }
  | {
      key: 'booking.cancelled';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      refundKobo: number;
    }
  | {
      key: 'booking.no_show';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
    }
  | {
      key: 'session.overstay_due';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      overstayMinutes: number;
      amountKobo: number;
    }
  | {
      key: 'session.checked_in';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      checkInAt: string;
    }
  | {
      key: 'session.checked_out';
      driverId: string;
      bookingId: string;
      bookingCode: string;
      lotName: string;
      checkOutAt: string;
    };

export type SmsMessage = {
  to: string;
  body: string;
};

export type PushMessage = {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type DispatchResult = {
  eventId: string;
  deliveredChannels: NotificationChannel[];
  failedChannels: NotificationChannel[];
};
