export declare function securityHeaders(options: {
  isDev: boolean;
  connectSrc?: string[];
  /** Extra image hosts, e.g. Supabase Storage for signed photo links. */
  imgSrc?: string[];
}): { source: string; headers: { key: string; value: string }[] }[];
