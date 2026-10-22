import {
  BookingListSchema,
  BookingSchema,
  BootstrapResponseSchema,
  CreateBookingResponseSchema,
  SelfCheckResultSchema,
  type SelfCheckRequest,
  type SelfCheckResult,
  VerifyPaymentResponseSchema,
  type Booking,
  type CreateBookingRequest,
  type CreateBookingResponse,
  type VerifyPaymentResponse,
  DeletionRequestResponseSchema,
  LotAvailabilitySchema,
  LotSearchResponseSchema,
  PlacesResponseSchema,
  MeSchema,
  PublicLotSchema,
  QuoteSchema,
  VehicleListSchema,
  VehicleSchema,
  type LotAvailability,
  type LotSearchResponse,
  type Me,
  type PlaceSuggestion,
  type PublicLot,
  type Quote,
  type Vehicle,
} from '@parkly/contracts';
import { retryAfterSeconds } from '../logic/countdown';
import { messageForCode, NETWORK_ERROR_MESSAGE } from '../logic/errors';

/** An API failure with friendly copy ready to show (problem+json `code` mapped). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly retryAfterSec: number | null = null,
    readonly fieldErrors: { path: string; message: string }[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Parser<T> = { parse(data: unknown): T };

export type ApiClientOptions = {
  baseUrl: string;
  /** Current Supabase access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof fetch;
  now?: () => Date;
};

export type LotSearchParams = {
  lat: number;
  lng: number;
  radiusM: number;
  startAt: string;
  endAt: string;
  product: 'HOURLY' | 'DAILY';
  sort: 'distance' | 'price';
};

export type BootstrapResponse = { user: Me; isNewUser: boolean };
export type VehicleInput = {
  plate: string;
  make?: string;
  model?: string;
  colour?: string;
  isDefault?: boolean;
};

export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const base = options.baseUrl.replace(/\/$/, '');

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    parser?: Parser<T>,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...extraHeaders };
    const token = await options.getAccessToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new ApiError(0, undefined, NETWORK_ERROR_MESSAGE);
    }

    const text = await res.text();
    const data: unknown = text ? safeJson(text) : null;

    if (!res.ok) {
      const problem = (data ?? {}) as {
        code?: string;
        errors?: { path: string; message: string }[];
      };
      const retry =
        res.status === 429 ? retryAfterSeconds(res.headers.get('retry-after'), now()) : null;
      throw new ApiError(
        res.status,
        problem.code,
        messageForCode(problem.code),
        retry,
        problem.errors ?? [],
      );
    }
    return parser ? parser.parse(data) : (undefined as T);
  }

  return {
    precheckOtp: (phone: string, deviceId: string) =>
      request<undefined>('POST', '/v1/auth/otp/precheck', { phone, deviceId }),
    bootstrap: (input: {
      deviceId: string;
      platform: 'ANDROID' | 'IOS' | 'WEB';
      appVersion?: string;
      asDriver?: boolean;
    }) => request<BootstrapResponse>('POST', '/v1/auth/bootstrap', input, BootstrapResponseSchema),
    me: () => request<Me>('GET', '/v1/me', undefined, MeSchema),
    updateMe: (patch: { firstName?: string; lastName?: string }) =>
      request<Me>('PATCH', '/v1/me', patch, MeSchema),
    recordConsent: (consent: {
      type: 'TERMS' | 'PRIVACY' | 'MARKETING';
      version: string;
      granted: boolean;
    }) => request<Me>('POST', '/v1/me/consents', consent, MeSchema),
    vehicles: async (): Promise<Vehicle[]> =>
      (await request('GET', '/v1/me/vehicles', undefined, VehicleListSchema)).items,
    addVehicle: (input: VehicleInput) =>
      request<Vehicle>('POST', '/v1/me/vehicles', input, VehicleSchema),
    setDefaultVehicle: (id: string) =>
      request<Vehicle>(
        'PATCH',
        `/v1/me/vehicles/${encodeURIComponent(id)}`,
        { isDefault: true },
        VehicleSchema,
      ),
    removeVehicle: (id: string) =>
      request<undefined>('DELETE', `/v1/me/vehicles/${encodeURIComponent(id)}`),
    revokeSessions: (scope: 'device' | 'all') =>
      request<undefined>('POST', '/v1/auth/sessions/revoke', { scope }),
    requestDeletion: () => request('DELETE', '/v1/me', undefined, DeletionRequestResponseSchema),

    // Driver discovery (doc 02 §6.3): public endpoints, prices always from the server.
    searchLots: (q: LotSearchParams) => {
      const query = new URLSearchParams(
        Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])),
      );
      return request<LotSearchResponse>(
        'GET',
        `/v1/lots/search?${query.toString()}`,
        undefined,
        LotSearchResponseSchema,
      );
    },
    lot: (idOrSlug: string) =>
      request<PublicLot>(
        'GET',
        `/v1/lots/${encodeURIComponent(idOrSlug)}`,
        undefined,
        PublicLotSchema,
      ),
    quote: (
      lotId: string,
      body: { product: 'HOURLY' | 'DAILY' | 'MONTHLY'; startAt: string; endAt: string },
    ) => request<Quote>('POST', `/v1/lots/${encodeURIComponent(lotId)}/quote`, body, QuoteSchema),
    /** D-11 destination search (ADR 0014); the provider key stays on the server. */
    places: async (q: string): Promise<PlaceSuggestion[]> =>
      (
        await request(
          'GET',
          '/v1/places/autocomplete?' + new URLSearchParams({ q }).toString(),
          undefined,
          PlacesResponseSchema,
        )
      ).items,
    availability: (
      lotId: string,
      w: { startAt: string; endAt: string; product: 'HOURLY' | 'DAILY' },
    ) =>
      request<LotAvailability>(
        'GET',
        `/v1/lots/${encodeURIComponent(lotId)}/availability?${new URLSearchParams(w).toString()}`,
        undefined,
        LotAvailabilitySchema,
      ),

    // Bookings (doc 02 §6.4). The key makes a retried tap safe: same key, same booking.
    createBooking: (body: CreateBookingRequest, idempotencyKey: string) =>
      request<CreateBookingResponse>('POST', '/v1/bookings', body, CreateBookingResponseSchema, {
        'idempotency-key': idempotencyKey,
      }),
    bookings: async (status: 'upcoming' | 'past'): Promise<Booking[]> =>
      (await request('GET', `/v1/bookings?status=${status}`, undefined, BookingListSchema)).items,
    booking: (id: string) =>
      request<Booking>('GET', `/v1/bookings/${encodeURIComponent(id)}`, undefined, BookingSchema),
    /** ADR 0016: the driver scanned the entrance poster; the server checks place and time. */
    selfCheck: (id: string, kind: 'in' | 'out', body: SelfCheckRequest) =>
      request<SelfCheckResult>(
        'POST',
        `/v1/bookings/${encodeURIComponent(id)}/self-check-${kind}`,
        body,
        SelfCheckResultSchema,
      ),
    /** Asks the server to check the payment with Paystack; never trusts the app's word. */
    verifyPayment: (reference: string) =>
      request<VerifyPaymentResponse>(
        'POST',
        `/v1/payments/${encodeURIComponent(reference)}/verify`,
        undefined,
        VerifyPaymentResponseSchema,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
