import type { HTMLAttributes } from 'react';

export interface PriceBreakdownLine {
  label: string;
  amount: string;
}

export interface PriceBreakdownProps extends HTMLAttributes<HTMLTableElement> {
  lines: PriceBreakdownLine[];
  totalLabel?: string;
  totalAmount: string;
  caption?: string;
}

/**
 * PriceBreakdown pattern (doc 14 P9 / doc 15 §3.27).
 * Itemised receipt and price quote table.
 */
export function PriceBreakdown({
  lines,
  totalLabel = 'Total',
  totalAmount,
  caption,
  className,
  ...rest
}: PriceBreakdownProps) {
  const classes = ['pk-breakdown', className].filter(Boolean).join(' ');
  return (
    <table className={classes} {...rest}>
      {caption && <caption className="pk-visually-hidden">{caption}</caption>}
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td>{l.label}</td>
            <td className="pk-text--tabular">{l.amount}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{totalLabel}</th>
          <td className="pk-text--tabular">{totalAmount}</td>
        </tr>
      </tfoot>
    </table>
  );
}
