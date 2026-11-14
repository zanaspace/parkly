import React from 'react';

export type CorporateBrandHeaderProps = {
  legalName: string;
  portalTitle: string;
  logoUrl?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  welcomeMessage?: string | null;
};

export function CorporateBrandHeader({
  legalName,
  portalTitle,
  logoUrl,
  primaryColor = '#E31837',
  secondaryColor = '#1E1E1E',
  welcomeMessage,
}: CorporateBrandHeaderProps) {
  return (
    <header
      className="w-full border-b border-zinc-800 bg-zinc-950 py-4 px-6"
      style={
        {
          '--corp-primary': primaryColor,
          '--corp-secondary': secondaryColor,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-4">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt={`${legalName} Logo`}
              className="h-10 max-w-[160px] object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {legalName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white tracking-tight">{legalName}</span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                Verified B2B
              </span>
            </div>
            <p className="text-xs text-zinc-400">{portalTitle}</p>
          </div>
        </div>

        {welcomeMessage && (
          <div className="hidden md:block max-w-md text-right text-xs text-zinc-400">
            {welcomeMessage}
          </div>
        )}
      </div>
    </header>
  );
}
