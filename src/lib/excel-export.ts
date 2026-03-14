import * as XLSX from 'xlsx';

interface ExcelExportOptions {
  fileName: string;
  sheetName?: string;
  headers: { key: string; label: string; width?: number; format?: 'number' | 'currency' | 'date' | 'percent' }[];
  data: Record<string, any>[];
  orgName?: string;
  title?: string;
  exportDate?: boolean;
  summaryRow?: boolean;
}

export function exportToExcel(options: ExcelExportOptions): void {
  const {
    fileName, sheetName = 'Data', headers, data,
    orgName, title, exportDate = true, summaryRow = false,
  } = options;

  const wsData: any[][] = [];

  // Header rows
  if (orgName) wsData.push([orgName]);
  if (title) wsData.push([title]);
  if (exportDate) wsData.push([`출력일시: ${new Date().toLocaleString('ko-KR')}`]);
  if (orgName || title || exportDate) wsData.push([]); // blank row

  // Column headers
  wsData.push(headers.map((h) => h.label));

  // Data rows
  data.forEach((row) => {
    wsData.push(
      headers.map((h) => {
        const val = row[h.key];
        if (val == null) return '';
        if (h.format === 'currency' || h.format === 'number') {
          return typeof val === 'number' ? val : Number(val) || 0;
        }
        if (h.format === 'percent') {
          return typeof val === 'number' ? val : Number(val) || 0;
        }
        if (h.format === 'date' && val) {
          return typeof val === 'string' ? val.split('T')[0] : val;
        }
        return String(val);
      })
    );
  });

  // Summary row
  if (summaryRow) {
    const sumRow = headers.map((h, i) => {
      if (i === 0) return '합계';
      if (h.format === 'currency' || h.format === 'number') {
        return data.reduce((acc, row) => acc + (Number(row[h.key]) || 0), 0);
      }
      return '';
    });
    wsData.push(sumRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = headers.map((h) => ({
    wch: Math.max(h.width || Math.max(h.label.length * 2, 10), 10),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = orgName ? `${orgName}_` : '';
  XLSX.writeFile(wb, `${prefix}${fileName}_${dateStr}.xlsx`);
}
