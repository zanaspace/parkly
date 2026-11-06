import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv (FR-OPS-002 export)', () => {
  it('joins rows with CRLF and leaves plain values alone', () => {
    expect(
      toCsv([
        ['code', 'amount'],
        ['PK-ABC123', 1500],
      ]),
    ).toBe('code,amount\r\nPK-ABC123,1500\r\n');
  });

  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(toCsv([['Eko Hotel, VI', 'say "hi"', 'two\nlines']])).toBe(
      '"Eko Hotel, VI","say ""hi""","two\nlines"\r\n',
    );
  });

  it('writes null and undefined as empty cells', () => {
    expect(toCsv([[null, undefined, 0]])).toBe(',,0\r\n');
  });

  it('defuses spreadsheet formulas typed by people', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx', '\rx']])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),'\tx,"'\rx"\r\n`,
    );
  });

  it('keeps real negative numbers as numbers', () => {
    expect(toCsv([[-2500]])).toBe('-2500\r\n');
  });
});
