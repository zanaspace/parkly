export declare function securityHeaders(options: {
  isDev: boolean;
  connectSrc?: string[];
  /** Extra image hosts, e.g. Supabase Storage for signed photo links. */
  imgSrc?: string[];
  /** Allow Cloudflare Turnstile (ADR 0019); pass true when a site key is set. */
  captcha?: boolean;
}): { source: string; headers: { key: string; value: string }[] }[];
