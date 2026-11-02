import type { ReactElement } from 'react';

/** Chart numbers for screen readers. Visually clipped so it cannot widen the page. */
export function HiddenTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}): ReactElement {
  return (
    <table className="progress-sr">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {headers.map((header, index) => <th key={index} scope="col">{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={`${index}-${row[0] ?? ''}`}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
