import type { Me } from '@parkly/contracts';

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
