import { ReactNode } from 'react';

interface ScoreTableProps {
  headers: string[];
  rows: { key: string; cells: ReactNode[] }[];
  emptyMessage?: string;
}

export function ScoreTable({ headers, rows, emptyMessage }: ScoreTableProps) {
  return (
    <table className="scores">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            {row.cells.map((cell, i) => (
              <td key={i}>{cell}</td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && emptyMessage && (
          <tr>
            <td colSpan={headers.length}>{emptyMessage}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
