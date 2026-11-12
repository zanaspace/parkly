/**
 * Legal documents as data (S8 task 8): the text lives here, one place, so counsel can review
 * it as plain text and the pages, the app and the review pack all show the same words.
 */

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { kind: 'note'; text: string };

export type Section = { id: string; title: string; blocks: Block[] };

export type LegalDoc = {
  slug: 'privacy' | 'terms';
  title: string;
  /** What the person is told in one line, under the title. */
  summary: string;
  /** The version people accept. Bump it, and the matching `legal.*_version` platform setting, on a material change. */
  version: string;
  /** When the words last changed. */
  updated: string;
  /** True until counsel has approved the text. Shown on the page. */
  draft: boolean;
  sections: Section[];
};
