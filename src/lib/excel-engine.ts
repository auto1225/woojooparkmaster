import type { CellObject, Row, Sheet } from 'write-excel-file/browser';

const COLORS = {
  navy: '#1B3A5C',
  navyDark: '#0F2B46',
  navyLight: '#2A5580',
  white: '#FFFFFF',
  altRow: '#F8FAFC',
  totalBg: '#E8F0FE',
  subtotalBg: '#F0F4FF',
  titleBg: '#F1F5F9',
  textPrimary: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  borderLight: '#E2E8F0',
  positive: '#059669',
  negative: '#DC2626',
};

export interface ExcelColumnDef {
  key: string;
  label: string;
  group?: string;
  groupColor?: string;
  width?: number;
  format?: 'text' | 'number' | 'currency' | 'currency_man' | 'percent' | 'date' | 'datetime' | 'boolean' | 'badge' | 'phone' | 'rate' | 'index';
  numFmt?: string;
  align?: 'left' | 'center' | 'right';
  aggregation?: 'sum' | 'avg' | 'count' | 'max' | 'min' | 'countif' | 'none';
  conditional?: ExcelConditionalRule[];
  validation?: { type: 'list' | 'number' | 'date'; values?: string[]; min?: number; max?: number };
  hidden?: boolean;
  wrapText?: boolean;
  tooltip?: string;
  booleanDisplay?: { true: string; false: string };
  badgeMap?: Record<string, string>;
  formula?: string;
}

export interface ExcelConditionalRule {
  type: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'containsText' | 'colorScale' | 'dataBar' | 'iconSet';
  priority: number;
  value?: number | string;
  value2?: number;
  style?: { fill?: string; fontColor?: string; bold?: boolean };
  colorScale?: { min: string; mid?: string; max: string };
  dataBarColor?: string;
  iconSet?: '3Arrows' | '3TrafficLights' | '3Symbols' | '5Rating';
}

export interface ExcelSheetConfig {
  name: string;
  tabColor?: string;
  columns: ExcelColumnDef[];
  data: Record<string, unknown>[];
  freezePane?: { row: number; col: number };
  autoFilter?: boolean;
  totalRow?: { label: string; labelColIndex?: number };
  subtotalGroupBy?: string;
  subtotalLabel?: string;
  extraCalcRows?: { label: string; formula: 'AVERAGE' | 'MAX' | 'MIN' | 'STDEV'; labelColIndex?: number }[];
  conditionalFormats?: { ref: string; rules: ExcelConditionalRule[] }[];
  pageSetup?: Record<string, unknown> & { printTitlesRow?: string };
  headerFooter?: { oddHeader?: string; oddFooter?: string };
  protection?: { enabled: boolean; password?: string; allowAutoFilter?: boolean; allowSort?: boolean };
}

export interface CreateExcelConfig {
  fileName: string;
  orgName: string;
  title: string;
  subtitle?: string;
  exportDate?: boolean;
  creator?: string;
  department?: string;
  sheets: ExcelSheetConfig[];
}

type StyledCell = CellObject;

const baseCellStyle = {
  fontFamily: 'Malgun Gothic',
  fontSize: 10,
  textColor: COLORS.textPrimary,
  borderColor: COLORS.borderLight,
  borderStyle: 'thin' as const,
  alignVertical: 'center' as const,
};

function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Sheet';
}

function getColLetter(colNum: number): string {
  let result = '';
  let num = colNum;
  while (num > 0) {
    num -= 1;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

function getNumFmt(column: ExcelColumnDef): string {
  if (column.numFmt) return column.numFmt;
  switch (column.format) {
    case 'currency':
    case 'number':
      return '#,##0';
    case 'currency_man':
      return '#,##0"만원"';
    case 'percent':
    case 'rate':
      return '0.0%';
    case 'date':
      return 'yyyy-mm-dd';
    case 'datetime':
      return 'yyyy-mm-dd hh:mm';
    default:
      return '@';
  }
}

function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const hex = color.replace(/^#/, '').replace(/^FF/i, '');
  return hex.length === 6 ? `#${hex}` : undefined;
}

function makeDataCell(column: ExcelColumnDef, value: unknown, rowIndex: number, sheetRow: number): StyledCell {
  const cell: StyledCell = {
    ...baseCellStyle,
    backgroundColor: rowIndex % 2 === 1 ? COLORS.altRow : COLORS.white,
    align: column.align || 'left',
    wrap: Boolean(column.wrapText),
    value: value == null ? '' : String(value),
    type: String,
  };

  switch (column.format) {
    case 'index':
      cell.value = rowIndex + 1;
      cell.type = Number;
      cell.align = 'center';
      break;
    case 'currency':
    case 'currency_man':
    case 'number':
      cell.value = asNumber(value);
      cell.type = Number;
      cell.format = getNumFmt(column);
      cell.align = 'right';
      cell.fontFamily = 'Consolas';
      break;
    case 'percent':
    case 'rate': {
      const number = asNumber(value);
      cell.value = number / 100;
      cell.type = Number;
      cell.format = getNumFmt(column);
      cell.align = 'center';
      cell.fontFamily = 'Consolas';
      if (column.format === 'rate') {
        cell.textColor = number > 0 ? COLORS.positive : number < 0 ? COLORS.negative : COLORS.textPrimary;
        if (number !== 0) cell.fontWeight = 'bold';
      }
      break;
    }
    case 'date':
    case 'datetime': {
      const date = toDate(value);
      cell.value = date || '';
      cell.type = date ? Date : String;
      if (date) cell.format = getNumFmt(column);
      cell.align = 'center';
      break;
    }
    case 'boolean': {
      const labels = column.booleanDisplay || { true: '예', false: '아니오' };
      const enabled = value === true || value === 'true' || value === 1;
      cell.value = enabled ? labels.true : labels.false;
      cell.textColor = enabled ? COLORS.positive : COLORS.textMuted;
      if (enabled) cell.fontWeight = 'bold';
      cell.align = 'center';
      break;
    }
    case 'badge':
      cell.value = column.badgeMap?.[String(value)] || (value == null ? '' : String(value));
      cell.align = 'center';
      break;
    case 'phone':
      cell.value = value == null ? '' : String(value);
      cell.align = 'center';
      break;
  }

  if (column.formula) {
    cell.value = column.formula.replace(/\{row\}/g, String(sheetRow));
    cell.type = 'Formula';
    cell.format = getNumFmt(column);
    cell.align = 'right';
  }

  for (const rule of column.conditional || []) {
    const numericValue = typeof value === 'number' ? value : Number.NaN;
    const matches =
      (rule.type === 'greaterThan' && numericValue > Number(rule.value)) ||
      (rule.type === 'lessThan' && numericValue < Number(rule.value)) ||
      (rule.type === 'between' && numericValue >= Number(rule.value) && numericValue <= Number(rule.value2)) ||
      (rule.type === 'equal' && value === rule.value) ||
      (rule.type === 'containsText' && String(value ?? '').includes(String(rule.value ?? '')));

    if (matches) {
      cell.backgroundColor = normalizeColor(rule.style?.fill) || cell.backgroundColor;
      cell.textColor = normalizeColor(rule.style?.fontColor) || cell.textColor;
      if (rule.style?.bold) cell.fontWeight = 'bold';
    }
  }

  return cell;
}

function aggregate(values: unknown[], aggregation: ExcelColumnDef['aggregation']): number | string {
  const numbers = values.map(asNumber);
  switch (aggregation) {
    case 'sum':
      return numbers.reduce((sum, value) => sum + value, 0);
    case 'avg':
      return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
    case 'count':
      return values.filter((value) => value !== null && value !== undefined && value !== '').length;
    case 'countif':
      return values.filter(Boolean).length;
    case 'max':
      return numbers.length ? Math.max(...numbers) : 0;
    case 'min':
      return numbers.length ? Math.min(...numbers) : 0;
    default:
      return '';
  }
}

function makeSummaryRow(
  columns: ExcelColumnDef[],
  data: Record<string, unknown>[],
  label: string,
  labelIndex: number,
  backgroundColor: string,
  formulaOverride?: ExcelSheetConfig['extraCalcRows'][number]['formula'],
): Row {
  return columns.map((column, columnIndex) => {
    const cell: StyledCell = {
      ...baseCellStyle,
      backgroundColor,
      fontWeight: 'bold',
      textColor: formulaOverride ? COLORS.navyLight : COLORS.navy,
      align: columnIndex === labelIndex ? 'center' : 'right',
      value: '',
      type: String,
    };

    if (columnIndex === labelIndex) {
      cell.value = label;
      return cell;
    }

    if (!column.aggregation || column.aggregation === 'none') return cell;
    const values = data.map((row) => row[column.key]);
    const aggregation = formulaOverride === 'AVERAGE'
      ? 'avg'
      : formulaOverride === 'MAX'
        ? 'max'
        : formulaOverride === 'MIN'
          ? 'min'
          : column.aggregation;
    cell.value = aggregate(values, aggregation);
    cell.type = Number;
    cell.format = getNumFmt(column);
    return cell;
  });
}

function makeGroupHeader(columns: ExcelColumnDef[]): Row {
  const row: Row = [];
  let index = 0;
  while (index < columns.length) {
    const group = columns[index].group || '기본';
    let end = index + 1;
    while (end < columns.length && (columns[end].group || '기본') === group) end += 1;
    row.push({
      ...baseCellStyle,
      value: group,
      type: String,
      columnSpan: end - index,
      align: 'center',
      fontWeight: 'bold',
      textColor: COLORS.navyDark,
      backgroundColor: normalizeColor(columns[index].groupColor) || COLORS.totalBg,
    });
    for (let hiddenIndex = index + 1; hiddenIndex < end; hiddenIndex += 1) {
      row.push(null);
    }
    index = end;
  }
  return row;
}

function makeSpanningRow(cell: Row[number], columnSpan: number): Row {
  return [cell, ...Array(Math.max(0, columnSpan - 1)).fill(null)];
}

function buildSheet(config: CreateExcelConfig, sheetConfig: ExcelSheetConfig): Sheet<Blob | File | ArrayBuffer> | null {
  const columns = sheetConfig.columns.filter((column) => !column.hidden);
  if (columns.length === 0) return null;

  const rows: Row[] = [];
  rows.push(makeSpanningRow({
    value: config.orgName,
    type: String,
    columnSpan: columns.length,
    align: 'center',
    alignVertical: 'center',
    height: 30,
    fontFamily: 'Malgun Gothic',
    fontSize: 16,
    fontWeight: 'bold',
    textColor: COLORS.navy,
    backgroundColor: COLORS.titleBg,
  }, columns.length));
  rows.push(makeSpanningRow({
    value: config.title + (config.subtitle ? ` - ${config.subtitle}` : ''),
    type: String,
    columnSpan: columns.length,
    align: 'center',
    height: 22,
    fontFamily: 'Malgun Gothic',
    fontSize: 12,
    textColor: COLORS.textSecondary,
  }, columns.length));

  if (config.exportDate !== false) {
    const creatorSpan = Math.max(1, Math.floor(columns.length / 2));
    const exportedAtSpan = Math.max(1, columns.length - creatorSpan);
    rows.push([
      ...makeSpanningRow({
      value: `작성: ${config.department || ''} ${config.creator || ''}`.trim(),
      type: String,
      columnSpan: creatorSpan,
      fontFamily: 'Malgun Gothic',
      fontSize: 9,
      textColor: COLORS.textMuted,
      }, creatorSpan),
      ...makeSpanningRow({
      value: `출력일시: ${new Date().toLocaleString('ko-KR')}`,
      type: String,
      columnSpan: exportedAtSpan,
      align: 'right',
      fontFamily: 'Malgun Gothic',
      fontSize: 9,
      textColor: COLORS.textMuted,
      }, exportedAtSpan),
    ]);
  }

  rows.push([]);
  const hasGroups = columns.some((column) => column.group);
  if (hasGroups) rows.push(makeGroupHeader(columns));
  rows.push(columns.map((column) => ({
    ...baseCellStyle,
    value: column.label,
    type: String,
    height: 28,
    align: 'center',
    wrap: true,
    fontWeight: 'bold',
    textColor: COLORS.white,
    backgroundColor: COLORS.navy,
    borderColor: COLORS.navyDark,
  })));

  let previousGroup: unknown;
  let groupRows: Record<string, unknown>[] = [];
  const flushSubtotal = () => {
    if (!sheetConfig.subtotalGroupBy || groupRows.length === 0) return;
    rows.push(makeSummaryRow(
      columns,
      groupRows,
      `${sheetConfig.subtotalLabel || '소계'} (${String(previousGroup ?? '')})`,
      sheetConfig.totalRow?.labelColIndex || 0,
      COLORS.subtotalBg,
    ));
    groupRows = [];
  };

  sheetConfig.data.forEach((rowData, rowIndex) => {
    const groupValue = sheetConfig.subtotalGroupBy ? rowData[sheetConfig.subtotalGroupBy] : undefined;
    if (sheetConfig.subtotalGroupBy && rowIndex > 0 && groupValue !== previousGroup) flushSubtotal();
    previousGroup = groupValue;
    groupRows.push(rowData);
    const sheetRow = rows.length + 1;
    rows.push(columns.map((column) => makeDataCell(column, rowData[column.key], rowIndex, sheetRow)));
  });
  flushSubtotal();

  if (sheetConfig.totalRow) {
    rows.push(makeSummaryRow(
      columns,
      sheetConfig.data,
      sheetConfig.totalRow.label,
      sheetConfig.totalRow.labelColIndex || 0,
      COLORS.totalBg,
    ));
    for (const calculation of sheetConfig.extraCalcRows || []) {
      rows.push(makeSummaryRow(
        columns,
        sheetConfig.data,
        calculation.label,
        calculation.labelColIndex || 0,
        COLORS.subtotalBg,
        calculation.formula,
      ));
    }
  }

  const headerRows = (config.exportDate === false ? 3 : 4) + (hasGroups ? 2 : 1);
  return {
    data: rows,
    sheet: safeSheetName(sheetConfig.name),
    orientation: 'landscape',
    stickyRowsCount: sheetConfig.freezePane?.row || headerRows,
    stickyColumnsCount: sheetConfig.freezePane?.col || Math.min(3, columns.length),
    columns: columns.map((column) => {
      if (column.width) return { width: Math.max(8, Math.min(column.width / 8, 35)) };
      const longest = sheetConfig.data.reduce((max, row) => Math.max(max, String(row[column.key] ?? '').length), column.label.length);
      return { width: Math.max(8, Math.min(longest + 4, 35)) };
    }),
  };
}

function buildWorkbookSheets(config: CreateExcelConfig): Sheet<Blob | File | ArrayBuffer>[] {
  const sheets = config.sheets
    .map((sheet) => buildSheet(config, sheet))
    .filter((sheet): sheet is Sheet<Blob | File | ArrayBuffer> => sheet !== null);

  if (sheets.length === 0) throw new Error('내보낼 엑셀 데이터가 없습니다.');
  return sheets;
}

export async function createProfessionalExcelBlob(config: CreateExcelConfig): Promise<Blob> {
  const sheets = buildWorkbookSheets(config);
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  return writeXlsxFile(sheets, { fontFamily: 'Malgun Gothic', fontSize: 10 }).toBlob();
}

export async function createProfessionalExcel(config: CreateExcelConfig): Promise<void> {
  const sheets = buildWorkbookSheets(config);
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = config.orgName ? `${config.orgName}_` : '';
  await writeXlsxFile(sheets, { fontFamily: 'Malgun Gothic', fontSize: 10 })
    .toFile(`${prefix}${config.fileName}_${date}.xlsx`);
}

export function masterColumnToExcelColumn(column: {
  key: string;
  label: string;
  group?: string;
  width?: number;
  format?: string;
  subTotal?: string;
  booleanLabels?: { true: string; false: string };
  badgeMap?: Record<string, { label: string; color: string } | string>;
  tooltip?: string;
}): ExcelColumnDef {
  const excelColumn: ExcelColumnDef = {
    key: column.key,
    label: column.label,
    group: column.group,
    width: column.width,
    format: (column.format as ExcelColumnDef['format']) || 'text',
    tooltip: column.tooltip,
  };
  if (column.subTotal) excelColumn.aggregation = column.subTotal as ExcelColumnDef['aggregation'];
  if (column.booleanLabels) excelColumn.booleanDisplay = column.booleanLabels;
  if (column.badgeMap) {
    excelColumn.badgeMap = Object.fromEntries(
      Object.entries(column.badgeMap).map(([key, value]) => [key, typeof value === 'string' ? value : value.label]),
    );
  }
  return excelColumn;
}

export async function exportToExcelProfessional(options: {
  fileName: string;
  orgName?: string;
  title?: string;
  sheetName?: string;
  headers: { key: string; label: string; format?: string; width?: number }[];
  data: Record<string, unknown>[];
  summaryRow?: boolean;
  exportDate?: boolean;
}): Promise<void> {
  await createProfessionalExcel({
    fileName: options.fileName,
    orgName: options.orgName || '',
    title: options.title || options.fileName,
    exportDate: options.exportDate,
    sheets: [{
      name: options.sheetName || '데이터',
      columns: options.headers.map((header) => ({
        key: header.key,
        label: header.label,
        width: header.width,
        format: (header.format as ExcelColumnDef['format']) || 'text',
        aggregation: header.format === 'currency' || header.format === 'number' ? 'sum' : undefined,
      })),
      data: options.data,
      autoFilter: true,
      totalRow: options.summaryRow ? { label: '합계', labelColIndex: 0 } : undefined,
      extraCalcRows: options.summaryRow ? [{ label: '평균', formula: 'AVERAGE', labelColIndex: 0 }] : undefined,
    }],
  });
}

interface LegacySheetConfig {
  name: string;
  type?: string;
  headers: { key: string; label: string; format?: string; width?: number; subTotal?: string }[];
  data: Record<string, unknown>[];
  autoFilter?: boolean;
  freezePane?: { row: number; col: number };
  summaryRows?: { type: string; label: string; labelColumn: number; style: string }[];
  pageSetup?: Record<string, unknown>;
}

interface LegacyExcelConfig {
  fileName: string;
  orgName: string;
  title: string;
  subtitle?: string;
  sheets: LegacySheetConfig[];
}

export async function createExcelWorkbook(config: LegacyExcelConfig): Promise<void> {
  await createProfessionalExcel({
    fileName: config.fileName,
    orgName: config.orgName,
    title: config.title,
    subtitle: config.subtitle,
    sheets: config.sheets.map((sheet) => {
      const total = sheet.summaryRows?.find((row) => row.type === 'total');
      return {
        name: sheet.name,
        columns: sheet.headers.map((header) => ({
          key: header.key,
          label: header.label,
          width: header.width ? header.width * 8 : undefined,
          format: (header.format as ExcelColumnDef['format']) || 'text',
          aggregation: (header.subTotal as ExcelColumnDef['aggregation']) || undefined,
        })),
        data: sheet.data,
        autoFilter: sheet.autoFilter,
        freezePane: sheet.freezePane ? { row: sheet.freezePane.row + 5, col: sheet.freezePane.col } : undefined,
        totalRow: total ? { label: total.label, labelColIndex: total.labelColumn } : undefined,
      };
    }),
  });
}
