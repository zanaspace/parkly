import { BookingSchema, type Booking } from '@parkly/contracts';
import type { KeyValueStore } from './chunked-storage';

const MAX_TICKETS = 10;
const key = (userId: string) => `parkly.tickets.${userId}`;
const TicketsSchema = BookingSchema.array();

/**
 * Paid upcoming bookings kept on the phone (doc 03 D-17 "works offline"), so
 * the QR and code open at a gate with no signal. Secure storage only (doc 05
 * §11.1): bookings carry the plate and the signed ticket.
 */
export function offlineTickets(store: KeyValueStore) {
  return {
    async save(userId: string, bookings: Booking[]): Promise<void> {
      const tickets = bookings.filter((b) => b.qrToken).slice(0, MAX_TICKETS);
      await store.setItem(key(userId), JSON.stringify(tickets));
    },
    /** Adds or replaces one ticket, keeping the newest first. */
    async put(userId: string, booking: Booking): Promise<void> {
      if (!booking.qrToken) return;
      const rest = (await this.all(userId)).filter((b) => b.id !== booking.id);
      await this.save(userId, [booking, ...rest]);
    },
    async all(userId: string): Promise<Booking[]> {
      const raw = await store.getItem(key(userId));
      if (!raw) return [];
      try {
        const parsed = TicketsSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : [];
      } catch {
        return [];
      }
    },
    async find(userId: string, id: string): Promise<Booking | null> {
      return (await this.all(userId)).find((b) => b.id === id) ?? null;
    },
    clear: (userId: string) => store.removeItem(key(userId)),
  };
}
