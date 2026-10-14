export declare function securityHeaders(options: {
  isDev: boolean;
  connectSrc?: string[];
}): { source: string; headers: { key: string; value: string }[] }[];
