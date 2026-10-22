import { z } from 'zod';

/** FR-LOT-101: `GET /v1/places/autocomplete?q=` (ADR 0014). */
export const PlacesQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export const PlaceSuggestionSchema = z.object({
  id: z.string(),
  /** Main line, e.g. "Eko Hotel". */
  label: z.string(),
  /** Second line, e.g. "Adetokunbo Ademola Street, Victoria Island". */
  detail: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export const PlacesResponseSchema = z.object({ items: z.array(PlaceSuggestionSchema) });

export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;
export type PlacesResponse = z.infer<typeof PlacesResponseSchema>;
