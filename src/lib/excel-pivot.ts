/**
 * 피벗 테이블 전용 ExcelJS 엔진
 * ─────────────────────────────────
 * 교차 테이블, 합계행/열, colorScale, 틀 고정 등
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const COLORS = {
  navy: 'FF1B3A5C',
  navyDark: 'FF0F2B46',
  white: 'FFFFFFFF',
  altRow: 'FFF8FAFC',
  headerBg: 'FF1B3A5C',
  totalBg: 'FFE8F0FE',
  titleBg: 'FFF1F5F9',
  textPrimary: 'FF1E293B',
  textSecondary: 'FF64748B',
  textWhite: 'FFFFFFFF',
  textMuted: 'FF94A3B8',
  borderLight: 'FFE2E8F0',
  borderMedium: 'FFCBD5E1',
  positiveBg: 'FFD1FAE5',
  negativeBg: 'FFFEE2E2',
  rowHeaderBg: 'FFF1F5F9',
};

export interface PivotExcelConfig {
  fileName: string;
  orgName: string;
  title: string;
  subtitle?: string;
  rowHeader: string;
  rowData: string[];
  colHeader: string;
  colData: string[];
  values: (number | null)[][];
  format?: 'currency' | 'number' | 'percent';
  showRowTotal?: boolean;
  showColTotal?: boolean;
  showGrandTotal?: boolean;
  colorScale?: boolean;
  highlightMax?: boolean;
  zeroDash?: boolean;
}

function getColLetter(n: number): string {
  let r = '', num = n;
  while (num > 0) { num--; r = String.fromCharCode(65 + (num % 26)) + r; num = Math.floor(num / 26); }
  return r;
}

export async function createPivotExcel(config: PivotExcelConfig): Promise<void> {
  const {
    rowData, colData, values,
    showRowTotal = true, showColTotal = true, showGrandTotal = true,
    zeroDash = true,
  } = config;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.orgName;
  workbook.created = new Date();

  const ws = workbook.addWorksheet('피벗 테이블', {
    properties: { tabColor: { argb: COLORS.navy } },
    pageSetup: {
      orientation: 'landscape' as const,
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { top: 0.5, right: 0.3, bottom: 0.5, left: 0.3, header: 0.3, footer: 0.3 },
      horizontalCentered: true,
    },
    headerFooter: {
      oddHeader: `&L&"맑은 고딕,Bold"${config.orgName}&C&"맑은 고딕,Bold"${config.title}&R&D`,
      oddFooter: `&C&P / &N 페이지&R인쇄: &D &T`,
    },
  });

  const numFmt = config.format === 'currency' ? '#,##0' : config.format === 'percent' ? '0.0%' : '#,##0';
  const totalColCount = 1 + colData.length + (showRowTotal ? 1 : 0);
  let currentRow = 1;

  // Title
  ws.mergeCells(currentRow, 1, currentRow, totalColCount);
  const titleCell = ws.getCell(currentRow, 1);
  titleCell.value = config.orgName;
  titleCell.font = { name: '맑은 고딕', size: 16, bold: true, color: { argb: COLORS.navy } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
  ws.getRow(currentRow).height = 30;
  currentRow++;

  ws.mergeCells(currentRow, 1, currentRow, totalColCount);
  ws.getCell(currentRow, 1).value = config.title + (config.subtitle ? ` — ${config.subtitle}` : '');
  ws.getCell(currentRow, 1).font = { name: '맑은 고딕', size: 12, color: { argb: COLORS.textSecondary } };
  ws.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(currentRow).height = 22;
  currentRow++;

  ws.mergeCells(currentRow, 1, currentRow, totalColCount);
  ws.getCell(currentRow, 1).value = `출력일시: ${new Date().toLocaleString('ko-KR')}`;
  ws.getCell(currentRow, 1).font = { name: '맑은 고딕', size: 9, italic: true, color: { argb: COLORS.textMuted } };
  ws.getCell(currentRow, 1).alignment = { horizontal: 'right' };
  ws.getRow(currentRow).height = 18;
  currentRow++;

  ws.getRow(currentRow).height = 6;
  currentRow++;

  // Column header row
  const headerRow = currentRow;
  ws.getRow(headerRow).height = 28;

  // Top-left corner
  const cornerCell = ws.getCell(headerRow, 1);
  cornerCell.value = `${config.rowHeader} \\ ${config.colHeader}`;
  cornerCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textWhite } };
  cornerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  cornerCell.alignment = { horizontal: 'center', vertical: 'middle' };
  cornerCell.border = {
    top: { style: 'thin', color: { argb: COLORS.navyDark } },
    bottom: { style: 'medium', color: { argb: COLORS.navyDark } },
    left: { style: 'thin', color: { argb: COLORS.navyDark } },
    right: { style: 'thin', color: { argb: COLORS.navyDark } },
  };

  // Column headers
  colData.forEach((col, i) => {
    const cell = ws.getCell(headerRow, i + 2);
    cell.value = col;
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textWhite } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.navyDark } },
      bottom: { style: 'medium', color: { argb: COLORS.navyDark } },
      left: { style: 'thin', color: { argb: COLORS.navyDark } },
      right: { style: 'thin', color: { argb: COLORS.navyDark } },
    };
  });

  // Total column header
  if (showRowTotal) {
    const cell = ws.getCell(headerRow, colData.length + 2);
    cell.value = '합 계';
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textWhite } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyDark } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.navyDark } },
      bottom: { style: 'medium', color: { argb: COLORS.navyDark } },
      left: { style: 'thin', color: { argb: COLORS.navyDark } },
      right: { style: 'thin', color: { argb: COLORS.navyDark } },
    };
  }

  currentRow++;

  // Data rows
  const dataStartRow = currentRow;
  rowData.forEach((rowLabel, ri) => {
    const rowNum = currentRow + ri;
    const isAlt = ri % 2 === 1;
    ws.getRow(rowNum).height = 20;

    // Row header
    const rhCell = ws.getCell(rowNum, 1);
    rhCell.value = rowLabel;
    rhCell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textPrimary } };
    rhCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.rowHeaderBg } };
    rhCell.alignment = { horizontal: 'left', vertical: 'middle' };
    rhCell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } }, bottom: { style: 'thin', color: { argb: COLORS.borderLight } }, left: { style: 'thin', color: { argb: COLORS.borderMedium } }, right: { style: 'thin', color: { argb: COLORS.borderMedium } } };

    // Data values
    colData.forEach((_, ci) => {
      const cell = ws.getCell(rowNum, ci + 2);
      const val = values[ri]?.[ci];
      if (val === null || val === undefined || (zeroDash && val === 0)) {
        cell.value = zeroDash && (val === 0 || val === null) ? '-' : '';
      } else {
        cell.value = val;
        cell.numFmt = numFmt;
      }
      cell.font = { name: 'Consolas', size: 10, color: { argb: COLORS.textPrimary } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? COLORS.altRow : COLORS.white } };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } }, bottom: { style: 'thin', color: { argb: COLORS.borderLight } }, left: { style: 'thin', color: { argb: COLORS.borderLight } }, right: { style: 'thin', color: { argb: COLORS.borderLight } } };
    });

    // Row total (SUM formula)
    if (showRowTotal) {
      const cell = ws.getCell(rowNum, colData.length + 2);
      const startCol = getColLetter(2);
      const endCol = getColLetter(colData.length + 1);
      cell.value = { formula: `SUM(${startCol}${rowNum}:${endCol}${rowNum})` };
      cell.numFmt = numFmt;
      cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: COLORS.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.borderMedium } }, bottom: { style: 'thin', color: { argb: COLORS.borderMedium } }, left: { style: 'thin', color: { argb: COLORS.borderMedium } }, right: { style: 'thin', color: { argb: COLORS.borderMedium } } };
    }
  });

  const dataEndRow = currentRow + rowData.length - 1;

  // Column totals
  if (showColTotal) {
    const totalRowNum = dataEndRow + 1;
    ws.getRow(totalRowNum).height = 28;

    const tlCell = ws.getCell(totalRowNum, 1);
    tlCell.value = '합 계';
    tlCell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: COLORS.navy } };
    tlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
    tlCell.alignment = { horizontal: 'center', vertical: 'middle' };
    tlCell.border = { top: { style: 'double', color: { argb: COLORS.navy } }, bottom: { style: 'medium', color: { argb: COLORS.navy } }, left: { style: 'thin', color: { argb: COLORS.borderMedium } }, right: { style: 'thin', color: { argb: COLORS.borderMedium } } };

    colData.forEach((_, ci) => {
      const cell = ws.getCell(totalRowNum, ci + 2);
      const colLetter = getColLetter(ci + 2);
      cell.value = { formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` };
      cell.numFmt = numFmt;
      cell.font = { name: 'Consolas', size: 11, bold: true, color: { argb: COLORS.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'double', color: { argb: COLORS.navy } }, bottom: { style: 'medium', color: { argb: COLORS.navy } }, left: { style: 'thin', color: { argb: COLORS.borderMedium } }, right: { style: 'thin', color: { argb: COLORS.borderMedium } } };
    });

    // Grand total
    if (showRowTotal && showGrandTotal) {
      const cell = ws.getCell(totalRowNum, colData.length + 2);
      const colLetter = getColLetter(colData.length + 2);
      cell.value = { formula: `SUM(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` };
      cell.numFmt = numFmt;
      cell.font = { name: 'Consolas', size: 11, bold: true, color: { argb: COLORS.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.border = { top: { style: 'double', color: { argb: COLORS.navy } }, bottom: { style: 'medium', color: { argb: COLORS.navy } }, left: { style: 'thin', color: { argb: COLORS.borderMedium } }, right: { style: 'thin', color: { argb: COLORS.borderMedium } } };
    }

    // Average row
    const avgRowNum = totalRowNum + 1;
    ws.getRow(avgRowNum).height = 24;
    const avgLabel = ws.getCell(avgRowNum, 1);
    avgLabel.value = '평 균';
    avgLabel.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textSecondary } };
    avgLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRow } };
    avgLabel.alignment = { horizontal: 'center' };
    avgLabel.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } }, bottom: { style: 'thin', color: { argb: COLORS.borderLight } }, left: { style: 'thin', color: { argb: COLORS.borderLight } }, right: { style: 'thin', color: { argb: COLORS.borderLight } } };

    colData.forEach((_, ci) => {
      const cell = ws.getCell(avgRowNum, ci + 2);
      const colLetter = getColLetter(ci + 2);
      cell.value = { formula: `AVERAGE(${colLetter}${dataStartRow}:${colLetter}${dataEndRow})` };
      cell.numFmt = numFmt;
      cell.font = { name: 'Consolas', size: 10, color: { argb: COLORS.textSecondary } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.altRow } };
      cell.alignment = { horizontal: 'right' };
      cell.border = { top: { style: 'thin', color: { argb: COLORS.borderLight } }, bottom: { style: 'thin', color: { argb: COLORS.borderLight } }, left: { style: 'thin', color: { argb: COLORS.borderLight } }, right: { style: 'thin', color: { argb: COLORS.borderLight } } };
    });
  }

  // Column widths
  ws.getColumn(1).width = Math.max(
    ...rowData.map(r => r.length),
    config.rowHeader.length + 3,
    12
  );
  for (let i = 0; i < colData.length; i++) {
    ws.getColumn(i + 2).width = Math.max(colData[i].length * 1.5 + 4, 12);
  }
  if (showRowTotal) {
    ws.getColumn(colData.length + 2).width = 14;
  }

  // Freeze pane
  ws.views = [{
    state: 'frozen' as const,
    xSplit: 1,
    ySplit: headerRow,
    topLeftCell: `B${headerRow + 1}`,
    activeCell: `B${headerRow + 1}`,
  }];

  // Auto filter
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: totalColCount },
  };

  // ColorScale conditional formatting on data area
  if (config.colorScale !== false && colData.length > 0 && rowData.length > 0) {
    const ref = `${getColLetter(2)}${dataStartRow}:${getColLetter(colData.length + 1)}${dataEndRow}`;
    ws.addConditionalFormatting({
      ref,
      rules: [{
        type: 'colorScale',
        priority: 1,
        cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }],
        color: [
          { argb: COLORS.negativeBg },
          { argb: COLORS.white },
          { argb: COLORS.positiveBg },
        ],
      } as any],
    });
  }

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `${config.orgName}_${config.fileName}_${dateStr}.xlsx`);
}
