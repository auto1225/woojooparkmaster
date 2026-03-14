/** P6-8: 전문가급 엑셀 엔진 (ExcelJS 기반) */
import ExcelJS from 'exceljs';

// ── 타입 정의 ──
export interface ExcelColumnDef {
  key: string;
  label: string;
  width?: number;
  format?: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'datetime';
  align?: 'left' | 'center' | 'right';
  subTotal?: 'sum' | 'avg' | 'count' | 'max' | 'min';
  hidden?: boolean;
}

export interface ExcelSummaryRow {
  type: 'subtotal' | 'total' | 'average';
  label: string;
  labelColumn: number;
  style: 'bold' | 'bold_border' | 'highlight';
}

export interface ExcelConditionalFormat {
  range: string;
  type: 'greaterThan' | 'lessThan' | 'between' | 'text' | 'colorScale';
  value?: number | string;
  value2?: number;
  style: { fill?: string; font?: string; bold?: boolean };
}

export interface ExcelPageSetup {
  orientation: 'portrait' | 'landscape';
  paperSize: 'A4' | 'Letter';
  fitToPage?: boolean;
  fitToWidth?: number;
  fitToHeight?: number;
  margins?: { top: number; right: number; bottom: number; left: number };
  header?: string;
  footer?: string;
  repeatRows?: string;
}

export interface ExcelSheetConfig {
  name: string;
  type: 'data' | 'summary' | 'pivot' | 'chart_data';
  headers: ExcelColumnDef[];
  data: Record<string, any>[];
  freezePane?: { row: number; col: number };
  autoFilter?: boolean;
  summaryRows?: ExcelSummaryRow[];
  conditionalFormats?: ExcelConditionalFormat[];
  mergedCells?: string[];
  pageSetup?: ExcelPageSetup;
  protection?: boolean;
}

export interface ExcelWorkbookConfig {
  fileName: string;
  orgName: string;
  title: string;
  subtitle?: string;
  exportDate?: boolean;
  sheets: ExcelSheetConfig[];
  metadata?: { author?: string; department?: string };
}

// ── 스타일 상수 ──
const STYLES = {
  headerFill: '1B3A5C',
  headerFont: { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  titleFont: { name: '맑은 고딕', size: 16, bold: true, color: { argb: 'FF1B3A5C' } },
  subtitleFont: { name: '맑은 고딕', size: 11, color: { argb: 'FF64748B' } },
  dateFont: { name: '맑은 고딕', size: 10, color: { argb: 'FF94A3B8' } },
  dataFont: { name: '맑은 고딕', size: 10 },
  totalFill: 'E8F0FE',
  totalFont: { name: '맑은 고딕', size: 11, bold: true },
  subtotalFill: 'F0F4FF',
  altRowFill: 'F8FAFC',
  borderThin: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  borderMedium: { style: 'medium' as const, color: { argb: 'FF1B3A5C' } },
};

function getNumberFormat(format?: string): string {
  switch (format) {
    case 'currency': return '#,##0"원"';
    case 'percent': return '0.0%';
    case 'number': return '#,##0';
    case 'date': return 'YYYY-MM-DD';
    case 'datetime': return 'YYYY-MM-DD HH:mm';
    default: return '@';
  }
}

function getAlignment(col: ExcelColumnDef): Partial<ExcelJS.Alignment> {
  if (col.align) return { horizontal: col.align, vertical: 'middle' };
  switch (col.format) {
    case 'currency': case 'number': return { horizontal: 'right', vertical: 'middle' };
    case 'percent': case 'date': case 'datetime': return { horizontal: 'center', vertical: 'middle' };
    default: return { horizontal: 'left', vertical: 'middle' };
  }
}

export async function createExcelWorkbook(config: ExcelWorkbookConfig): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.metadata?.author || '시스템';
  wb.created = new Date();

  for (const sheetConfig of config.sheets) {
    const ws = wb.addWorksheet(sheetConfig.name.slice(0, 31));
    let currentRow = 1;

    // ── 상단 헤더 영역 ──
    if (config.orgName) {
      const row = ws.getRow(currentRow);
      row.getCell(1).value = config.orgName;
      row.getCell(1).font = STYLES.titleFont as any;
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheetConfig.headers.length, 4));
      currentRow++;
    }

    if (config.title) {
      const row = ws.getRow(currentRow);
      row.getCell(1).value = config.title;
      row.getCell(1).font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FF1E40AF' } };
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheetConfig.headers.length, 4));
      currentRow++;
    }

    if (config.subtitle) {
      const row = ws.getRow(currentRow);
      row.getCell(1).value = config.subtitle;
      row.getCell(1).font = STYLES.subtitleFont as any;
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheetConfig.headers.length, 4));
      currentRow++;
    }

    if (config.exportDate !== false) {
      const row = ws.getRow(currentRow);
      row.getCell(1).value = `출력일시: ${new Date().toLocaleString('ko-KR')}`;
      row.getCell(1).font = STYLES.dateFont as any;
      ws.mergeCells(currentRow, 1, currentRow, Math.max(sheetConfig.headers.length, 4));
      currentRow++;
    }

    currentRow++; // blank row

    // ── 컬럼 헤더 ──
    const headerRowNum = currentRow;
    const headerRow = ws.getRow(currentRow);
    sheetConfig.headers.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.label;
      cell.font = STYLES.headerFont as any;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + STYLES.headerFill } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: STYLES.borderThin, bottom: STYLES.borderThin,
        left: STYLES.borderThin, right: STYLES.borderThin,
      };
    });
    headerRow.height = 28;
    currentRow++;

    // ── 데이터 행 ──
    const dataStartRow = currentRow;
    sheetConfig.data.forEach((record, rowIdx) => {
      const row = ws.getRow(currentRow);
      sheetConfig.headers.forEach((col, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        let val = record[col.key];

        if (col.format === 'currency' || col.format === 'number') {
          val = typeof val === 'number' ? val : Number(val) || 0;
        } else if (col.format === 'percent') {
          val = typeof val === 'number' ? val : Number(val) || 0;
        } else if (col.format === 'date' && val) {
          val = typeof val === 'string' ? val.split('T')[0] : val;
        } else {
          val = val != null ? String(val) : '';
        }

        cell.value = val;
        cell.font = (col.format === 'currency' || col.format === 'number')
          ? { name: 'Consolas', size: 10 }
          : STYLES.dataFont as any;
        cell.numFmt = getNumberFormat(col.format);
        cell.alignment = getAlignment(col);
        cell.border = {
          top: STYLES.borderThin, bottom: STYLES.borderThin,
          left: STYLES.borderThin, right: STYLES.borderThin,
        };

        // 교대 행 배경
        if (rowIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + STYLES.altRowFill } };
        }
      });
      currentRow++;
    });
    const dataEndRow = currentRow - 1;

    // ── 합계행 ──
    if (sheetConfig.summaryRows?.length) {
      for (const sr of sheetConfig.summaryRows) {
        const row = ws.getRow(currentRow);
        sheetConfig.headers.forEach((col, colIdx) => {
          const cell = row.getCell(colIdx + 1);
          if (colIdx === sr.labelColumn) {
            cell.value = sr.label;
          } else if (col.subTotal && dataStartRow <= dataEndRow) {
            const colLetter = String.fromCharCode(65 + colIdx);
            const fn = col.subTotal === 'sum' ? 'SUM' : col.subTotal === 'avg' ? 'AVERAGE' : col.subTotal === 'count' ? 'COUNTA' : col.subTotal === 'max' ? 'MAX' : 'MIN';
            cell.value = { formula: `${fn}(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` } as any;
            cell.numFmt = getNumberFormat(col.format);
          }
          cell.font = STYLES.totalFont as any;
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FF' + (sr.type === 'total' ? STYLES.totalFill : STYLES.subtotalFill) },
          };
          cell.alignment = getAlignment(col);
          cell.border = {
            top: STYLES.borderMedium, bottom: STYLES.borderThin,
            left: STYLES.borderThin, right: STYLES.borderThin,
          };
        });
        currentRow++;
      }
    }

    // ── 열 너비 자동 조절 ──
    sheetConfig.headers.forEach((col, i) => {
      const column = ws.getColumn(i + 1);
      const maxLen = Math.max(
        col.label.length * 2,
        ...sheetConfig.data.slice(0, 100).map(r => String(r[col.key] ?? '').length)
      );
      column.width = col.width || Math.max(10, Math.min(40, maxLen + 2));
      if (col.hidden) column.hidden = true;
    });

    // ── 자동 필터 ──
    if (sheetConfig.autoFilter) {
      ws.autoFilter = {
        from: { row: headerRowNum, column: 1 },
        to: { row: dataEndRow || headerRowNum, column: sheetConfig.headers.length },
      };
    }

    // ── 틀 고정 ──
    if (sheetConfig.freezePane) {
      ws.views = [{ state: 'frozen', xSplit: sheetConfig.freezePane.col, ySplit: sheetConfig.freezePane.row + headerRowNum - 1 }];
    }

    // ── 인쇄 설정 ──
    if (sheetConfig.pageSetup) {
      const ps = sheetConfig.pageSetup;
      ws.pageSetup = {
        orientation: ps.orientation,
        paperSize: ps.paperSize === 'A4' ? 9 : 1,
        fitToPage: ps.fitToPage,
        fitToWidth: ps.fitToWidth,
        fitToHeight: ps.fitToHeight || 0,
        margins: ps.margins ? { left: ps.margins.left, right: ps.margins.right, top: ps.margins.top, bottom: ps.margins.bottom, header: 0.3, footer: 0.3 } : undefined,
      };
      if (ps.header) ws.headerFooter = { ...ws.headerFooter, oddHeader: ps.header };
      if (ps.footer) ws.headerFooter = { ...ws.headerFooter, oddFooter: ps.footer };
    }

    // ── 병합 셀 ──
    sheetConfig.mergedCells?.forEach(range => ws.mergeCells(range));

    // ── 시트 보호 ──
    if (sheetConfig.protection) {
      ws.protect('', { selectLockedCells: true, selectUnlockedCells: true });
    }
  }

  // ── 다운로드 ──
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = config.orgName ? `${config.orgName}_` : '';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}${config.fileName}_${dateStr}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── 하위 호환 래퍼 (기존 exportToExcel 대체) ──
interface LegacyExportOptions {
  fileName: string;
  sheetName?: string;
  headers: { key: string; label: string; width?: number; format?: 'number' | 'currency' | 'date' | 'percent' }[];
  data: Record<string, any>[];
  orgName?: string;
  title?: string;
  exportDate?: boolean;
  summaryRow?: boolean;
}

export function exportToExcelPro(options: LegacyExportOptions): void {
  createExcelWorkbook({
    fileName: options.fileName,
    orgName: options.orgName || '',
    title: options.title || options.fileName,
    exportDate: options.exportDate,
    sheets: [{
      name: options.sheetName || 'Data',
      type: 'data',
      headers: options.headers.map(h => ({
        key: h.key, label: h.label, width: h.width,
        format: h.format as any,
        subTotal: (h.format === 'currency' || h.format === 'number') ? 'sum' as const : undefined,
      })),
      data: options.data,
      autoFilter: true,
      freezePane: { row: 1, col: 0 },
      summaryRows: options.summaryRow ? [{ type: 'total', label: '합 계', labelColumn: 0, style: 'bold_border' }] : [],
      pageSetup: {
        orientation: options.headers.length > 8 ? 'landscape' : 'portrait',
        paperSize: 'A4', fitToPage: true, fitToWidth: 1,
        header: `&L${options.orgName || ''}&R&D`,
        footer: '&C&P / &N 페이지',
      },
    }],
  });
}
