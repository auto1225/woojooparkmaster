import { useEffect } from "react";
import type { MasterColumn } from "./MasterDataView";
import { useSystemConfig } from "@/hooks/useSystemConfig";

interface MasterPrintViewProps {
  title: string;
  columns: MasterColumn[];
  data: Record<string, any>[];
  orientation?: 'portrait' | 'landscape';
}

export function MasterPrintView({ title, columns, data, orientation = 'landscape' }: MasterPrintViewProps) {
  const { data: config } = useSystemConfig();
  const orgName = config?.org_name || '';

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  // Group columns into pages if too many
  const MAX_COLS_PER_PAGE = orientation === 'landscape' ? 15 : 10;
  const pages: MasterColumn[][] = [];
  const baseInfoCols = columns.filter(c => c.sticky || c.group === '기본정보').slice(0, 3);

  let remaining = columns.filter(c => !baseInfoCols.includes(c));
  while (remaining.length > 0) {
    const chunk = remaining.slice(0, MAX_COLS_PER_PAGE - baseInfoCols.length);
    pages.push([...baseInfoCols, ...chunk]);
    remaining = remaining.slice(MAX_COLS_PER_PAGE - baseInfoCols.length);
  }
  if (pages.length === 0) pages.push(columns);

  const formatVal = (val: any, col: MasterColumn) => {
    if (val == null || val === '') return '-';
    if (col.format === 'currency') return Number(val).toLocaleString();
    if (col.format === 'number') return typeof val === 'number' ? val.toLocaleString() : val;
    if (col.format === 'percent') return typeof val === 'number' ? `${val.toFixed(1)}%` : val;
    if (col.format === 'boolean') {
      const labels = col.booleanLabels || { true: '○', false: '×' };
      return (val === true || val === 'true' || val === 1) ? labels.true : labels.false;
    }
    if (col.format === 'badge' && col.badgeMap?.[val]) return col.badgeMap[val].label;
    if (col.format === 'date' && typeof val === 'string') return val.split('T')[0];
    return String(val);
  };

  return (
    <div className="print-only" style={{ fontSize: '10pt' }}>
      <style>{`
        @media print {
          @page { size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4'}; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
        .print-table th, .print-table td { border: 1px solid #ccc; padding: 3px 6px; }
        .print-table th { background: #f0f0f0; font-weight: 600; text-align: center; }
        .print-footer { display: flex; justify-content: space-between; margin-top: 10px; font-size: 8pt; color: #666; }
      `}</style>
      {pages.map((pageCols, pi) => (
        <div key={pi} style={{ pageBreakAfter: pi < pages.length - 1 ? 'always' : undefined }}>
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: '12pt', fontWeight: 'bold' }}>{orgName}</p>
            <p style={{ fontSize: '14pt', fontWeight: 'bold', margin: '4px 0' }}>{title}</p>
            <p style={{ fontSize: '9pt', color: '#666' }}>기준일: {new Date().toLocaleDateString('ko-KR')} {pages.length > 1 && `(${pi + 1}/${pages.length})`}</p>
          </div>
          <table className="print-table">
            <thead>
              <tr>
                {pageCols.map(c => (
                  <th key={c.key} style={{ textAlign: c.align || 'center', minWidth: 40 }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 1 ? '#f8f8f8' : undefined }}>
                  {pageCols.map(c => (
                    <td key={c.key} style={{
                      textAlign: c.align || (c.format === 'currency' || c.format === 'number' ? 'right' : c.format === 'boolean' || c.format === 'badge' ? 'center' : 'left'),
                    }}>
                      {formatVal(row[c.key], c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="print-footer">
            <span>출력일: {new Date().toLocaleString('ko-KR')}</span>
            <span>{pi + 1} / {pages.length}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
