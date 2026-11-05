/**
 * The one Parkly email look (brand teal from packages/tokens, colour.teal.600).
 * Every email we send, auth codes and notifications alike, is wrapped here so
 * they all look the same. Email clients ignore <style> blocks and CSS variables,
 * so the brand values are inlined literals; this file is the only place they live.
 */

const BRAND = '#137066';
const BRAND_DARK = '#0f5a53';
const BRAND_TINT = '#eef8f6';
const INK = '#171b1a';
const MUTED = '#4e5654';
const SUBTLE = '#8a9290';
const PAGE = '#fafaf9';
const LINE = '#e9ebea';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
/** Anything typed by a person (lot names, business names, emails) is escaped before it goes in HTML. */
export const esc = (s: string | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (ch) => ENTITIES[ch] ?? ch);

/** A paragraph of body copy. `html` must already be escaped. */
export const paragraph = (html: string) =>
  `<p style="margin: 0 0 16px 0; font-size: 15px; line-height: 24px; color: ${MUTED}">${html}</p>`;

/** Small print under the main content. `html` must already be escaped. */
export const note = (html: string) =>
  `<p style="margin: 0 0 8px 0; font-size: 13px; line-height: 20px; color: ${SUBTLE}">${html}</p>`;

/** The big call to action. */
export const button = (label: string, href: string) => `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 8px 0 24px 0">
  <tr>
    <td style="background-color: ${BRAND}; border-radius: 8px">
      <a href="${esc(href)}" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none">${esc(label)}</a>
    </td>
  </tr>
</table>
<p style="margin: 0 0 24px 0; font-size: 12px; line-height: 18px; color: ${SUBTLE}; word-break: break-all">If the button doesn't work, copy this link into your browser:<br><a href="${esc(href)}" style="color: ${BRAND}">${esc(href)}</a></p>`;

/** A one-time code in a tinted card. */
export const codeCard = (label: string, code: string) => `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0">
  <tr>
    <td align="center" style="background-color: ${BRAND_TINT}; border: 1.5px solid ${BRAND}; border-radius: 8px; padding: 18px 24px">
      <span style="display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: ${BRAND_DARK}; margin-bottom: 6px">${esc(label)}</span>
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: ${BRAND}; font-family: 'SF Mono', Consolas, Monaco, monospace">${esc(code)}</span>
    </td>
  </tr>
</table>`;

/** Label/value rows (booking details and the like). Values must already be escaped. */
export const detailsCard = (rows: [label: string, valueHtml: string][]) => `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0; background-color: ${PAGE}; border: 1px solid ${LINE}; border-radius: 8px">
  ${rows
    .map(
      ([label, value]) => `<tr>
    <td style="padding: 8px 16px; font-size: 13px; color: ${SUBTLE}; width: 40%">${esc(label)}</td>
    <td style="padding: 8px 16px; font-size: 14px; color: ${INK}; font-weight: 600">${value}</td>
  </tr>`,
    )
    .join('')}
</table>`;

/**
 * Wraps content in the branded shell. `heading` is plain text (escaped here);
 * `body` is HTML built from the helpers above. `preheader` is the grey preview
 * line inboxes show next to the subject.
 */
export function brandedEmail(input: {
  title: string;
  preheader?: string;
  heading: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(input.title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${PAGE}; font-family: ${FONT}; color: ${INK}">
  ${input.preheader ? `<div style="display: none; max-height: 0; overflow: hidden; opacity: 0">${esc(input.preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${PAGE}; padding: 40px 16px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; border: 1px solid ${LINE}; overflow: hidden">
          <tr>
            <td style="background-color: ${BRAND}; padding: 24px 32px">
              <span style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px">Parkly</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px 28px 32px">
              <h1 style="margin: 0 0 16px 0; font-size: 20px; line-height: 28px; font-weight: 600; color: ${INK}">${esc(input.heading)}</h1>
              ${input.body}
            </td>
          </tr>
          <tr>
            <td style="background-color: ${PAGE}; padding: 20px 32px; border-top: 1px solid ${LINE}; text-align: center">
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${SUBTLE}">Parkly · Verified off-street parking for Lagos</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
