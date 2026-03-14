/**
 * ExcelJS 기반 전문가급 엑셀 엔진
 * ─────────────────────────────────
 * 2단 그룹 헤더, 조건부 서식, 수식 합계, 소계, 틀 고정,
 * 자동 필터, 인쇄 설정 등 전문가급 엑셀을 생성합니다.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// ─── 색상 팔레트 ───
const COLORS = {
  navy: 'FF1B3A5C',
  navyDark: 'FF0F2B46',
  navyLight: 'FF2A5580',
  white: 'FFFFFFFF',
  altRow: 'FFF8FAFC',
  headerBg: 'FF1B3A5C',
  subHeaderBg: 'FF2A5580',
  totalBg: 'FFE8F0FE',
  subtotalBg: 'FFF0F4FF',
  titleBg: 'FFF1F5F9',
  groupBasic: 'FFDBEAFE',
  groupOperation: 'FFD1FAE5',
  groupFacility: 'FFFED7AA',
  groupUsage: 'FFE9D5FF',
  groupRevenue: 'FFFECACA',
  groupBudget: 'FFFEF3C7',
  groupDefault: 'FFE2E8F0',
  positive: 'FF059669',
  positiveBg: 'FFD1FAE5',
  negative: 'FFDC2626',
  negativeBg: 'FFFEE2E2',
  warning: 'FFD97706',
  warningBg: 'FFFEF3C7',
  textPrimary: 'FF1E293B',
  textSecondary: 'FF64748B',
  textWhite: 'FFFFFFFF',
  textMuted: 'FF94A3B8',
  borderLight: 'FFE2E8F0',
  borderMedium: 'FFCBD5E1',
  borderDark: 'FF1B3A5C',
};

const GROUP_COLOR_MAP: Record<string, string> = {
  '기본정보': COLORS.groupBasic,
  '기본현황': COLORS.groupBasic,
  '운영현황': COLORS.groupOperation,
  '계약정보': COLORS.groupOperation,
  '인력정보': COLORS.groupOperation,
  '정기권정보': COLORS.groupOperation,
  '인프라현황': COLORS.groupFacility,
  '장비정보': COLORS.groupFacility,
  '유지보수': COLORS.groupFacility,
  '이용현황': COLORS.groupUsage,
  '수입현황': COLORS.groupRevenue,
  '예산현황': COLORS.groupBudget,
  '센서설치계획': COLORS.groupUsage,
  '조사메타': COLORS.groupDefault,
};

const FONTS = {
  title: { name: '맑은 고딕', size: 16, bold: true, color: { argb: COLORS.navy } } as Partial<ExcelJS.Font>,
  subtitle: { name: '맑은 고딕', size: 12, color: { argb: COLORS.textSecondary } } as Partial<ExcelJS.Font>,
  exportDate: { name: '맑은 고딕', size: 9, italic: true, color: { argb: COLORS.textMuted } } as Partial<ExcelJS.Font>,
  colGroupHeader: { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.navyDark } } as Partial<ExcelJS.Font>,
  colHeader: { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.textWhite } } as Partial<ExcelJS.Font>,
  dataDefault: { name: '맑은 고딕', size: 10, color: { argb: COLORS.textPrimary } } as Partial<ExcelJS.Font>,
  dataMono: { name: 'Consolas', size: 10, color: { argb: COLORS.textPrimary } } as Partial<ExcelJS.Font>,
  dataPositive: { name: 'Consolas', size: 10, bold: true, color: { argb: COLORS.positive } } as Partial<ExcelJS.Font>,
  dataNegative: { name: 'Consolas', size: 10, bold: true, color: { argb: COLORS.negative } } as Partial<ExcelJS.Font>,
  total: { name: '맑은 고딕', size: 11, bold: true, color: { argb: COLORS.navy } } as Partial<ExcelJS.Font>,
  subtotal: { name: '맑은 고딕', size: 10, bold: true, color: { argb: COLORS.navyLight } } as Partial<ExcelJS.Font>,
};

const BORDERS: Record<string, Partial<ExcelJS.Borders>> = {
  thin: {
    top: { style: 'thin', color: { argb: COLORS.borderLight } },
    bottom: { style: 'thin', color: { argb: COLORS.borderLight } },
    left: { style: 'thin', color: { argb: COLORS.borderLight } },
    right: { style: 'thin', color: { argb: COLORS.borderLight } },
  },
  header: {
    top: { style: 'thin', color: { argb: COLORS.navyDark } },
    bottom: { style: 'medium', color: { argb: COLORS.navyDark } },
    left: { style: 'thin', color: { argb: COLORS.navyDark } },
    right: { style: 'thin', color: { argb: COLORS.navyDark } },
  },
  totalTop: {
    top: { style: 'double', color: { argb: COLORS.navy } },
    bottom: { style: 'medium', color: { argb: COLORS.navy } },
    left: { style: 'thin', color: { argb: COLORS.borderMedium } },
    right: { style: 'thin', color: { argb: COLORS.borderMedium } },
  },
  subtotal: {
    top: { style: 'thin', color: { argb: COLORS.borderMedium } },
    bottom: { style: 'thin', color: { argb: COLORS.borderMedium } },
    left: { style: 'thin', color: { argb: COLORS.borderLight } },
    right: { style: 'thin', color: { argb: COLORS.borderLight } },
  },
};

// ─── 인터페이스 ───
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
  data: Record<string, any>[];
  freezePane?: { row: number; col: number };
  autoFilter?: boolean;
  totalRow?: { label: string; labelColIndex?: number };
  subtotalGroupBy?: string;
  subtotalLabel?: string;
  extraCalcRows?: { label: string; formula: 'AVERAGE' | 'MAX' | 'MIN' | 'STDEV'; labelColIndex?: number }[];
  conditionalFormats?: { ref: string; rules: ExcelConditionalRule[] }[];
  pageSetup?: Partial<ExcelJS.PageSetup> & { printTitlesRow?: string };
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

function getColLetter(colNum: number): string {
  let result = '', num = colNum;
  while (num > 0) { num--; result = String.fromCharCode(65 + (num % 26)) + result; num = Math.floor(num / 26); }
  return result;
}

function getNumFmt(col: ExcelColumnDef): string {
  if (col.numFmt) return col.numFmt;
  switch (col.format) {
    case 'currency': return '#,##0';
    case 'currency_man': return '#,##0"만원"';
    case 'number': return '#,##0';
    case 'percent': return '0.0%';
    case 'rate': return '▲ 0.0%;▼ 0.0%;"-"';
    case 'date': return 'yyyy-mm-dd';
    case 'datetime': return 'yyyy-mm-dd hh:mm';
    default: return '@';
  }
}

function getGroupColor(groupName?: string, explicitColor?: string): string {
  if (explicitColor) return explicitColor;
  if (groupName && GROUP_COLOR_MAP[groupName]) return GROUP_COLOR_MAP[groupName];
  return COLORS.groupDefault;
}

export async function createProfessionalExcel(config: CreateExcelConfig): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = config.creator || config.orgName;
  workbook.created = new Date();
  workbook.modified = new Date();

  for (const sheetConfig of config.sheets) {
    const ws = workbook.addWorksheet(sheetConfig.name.slice(0, 31), {
      properties: { tabColor: { argb: sheetConfig.tabColor || COLORS.navy } },
      pageSetup: {
        orientation: 'landscape' as const,
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { top: 0.5, right: 0.3, bottom: 0.5, left: 0.3, header: 0.3, footer: 0.3 },
        horizontalCentered: true,
        ...(sheetConfig.pageSetup || {}),
      },
      headerFooter: {
        oddHeader: sheetConfig.headerFooter?.oddHeader || `&L&"맑은 고딕,Bold"${config.orgName}&C&"맑은 고딕,Bold"${config.title}&R&D`,
        oddFooter: sheetConfig.headerFooter?.oddFooter || `&L${config.department || ''}&C&P / &N 페이지&R인쇄: &D &T`,
      },
    });

    const cols = sheetConfig.columns.filter(c => !c.hidden);
    const totalCols = cols.length;
    if (totalCols === 0) continue;
    let currentRow = 1;

    // ═══ 타이틀 ═══
    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const titleCell = ws.getCell(currentRow, 1);
    titleCell.value = config.orgName;
    titleCell.font = FONTS.title;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.titleBg } };
    ws.getRow(currentRow).height = 30;
    currentRow++;

    ws.mergeCells(currentRow, 1, currentRow, totalCols);
    const stCell = ws.getCell(currentRow, 1);
    stCell.value = config.title + (config.subtitle ? ` — ${config.subtitle}` : '');
    stCell.font = FONTS.subtitle;
    stCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(currentRow).height = 22;
    currentRow++;

    if (config.exportDate !== false) {
      const half = Math.floor(totalCols / 2);
      ws.mergeCells(currentRow, 1, currentRow, half || 1);
      ws.getCell(currentRow, 1).value = `작성: ${config.department || ''} ${config.creator || ''}`;
      ws.getCell(currentRow, 1).font = FONTS.exportDate;
      ws.getCell(currentRow, 1).alignment = { horizontal: 'left' };

      ws.mergeCells(currentRow, (half || 1) + 1, currentRow, totalCols);
      const dc = ws.getCell(currentRow, (half || 1) + 1);
      dc.value = `출력일시: ${new Date().toLocaleString('ko-KR')}`;
      dc.font = FONTS.exportDate;
      dc.alignment = { horizontal: 'right' };
      ws.getRow(currentRow).height = 18;
      currentRow++;
    }

    ws.getRow(currentRow).height = 6;
    currentRow++;

    // ═══ 헤더 ═══
    const hasGroups = cols.some(c => c.group);
    const groupHeaderRow = currentRow;
    const colHeaderRow = hasGroups ? currentRow + 1 : currentRow;

    if (hasGroups) {
      let groupStart = 1;
      let prevGroup = cols[0].group || '';
      for (let i = 0; i <= cols.length; i++) {
        const curGroup = i < cols.length ? (cols[i].group || '') : '__END__';
        if (curGroup !== prevGroup || i === cols.length) {
          const groupEnd = i;
          if (groupEnd - groupStart >= 1) {
            if (groupEnd - groupStart > 1) ws.mergeCells(groupHeaderRow, groupStart, groupHeaderRow, groupEnd);
            const gCell = ws.getCell(groupHeaderRow, groupStart);
            gCell.value = prevGroup || '기본';
            gCell.font = FONTS.colGroupHeader;
            gCell.alignment = { horizontal: 'center', vertical: 'middle' };
            gCell.border = BORDERS.header;
            const gc = getGroupColor(prevGroup, cols[groupStart - 1]?.groupColor);
            for (let c = groupStart; c <= Math.min(groupEnd, totalCols); c++) {
              ws.getCell(groupHeaderRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gc } };
              ws.getCell(groupHeaderRow, c).border = BORDERS.header;
            }
          }
          groupStart = i + 1;
          prevGroup = curGroup;
        }
      }
      ws.getRow(groupHeaderRow).height = 22;
      currentRow++;
    }

    ws.getRow(colHeaderRow).height = 28;
    cols.forEach((col, idx) => {
      const cell = ws.getCell(colHeaderRow, idx + 1);
      cell.value = col.label;
      cell.font = FONTS.colHeader;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = BORDERS.header;
      if (col.tooltip) cell.note = { texts: [{ text: col.tooltip, font: { size: 9, name: '맑은 고딕' } }] } as any;
    });
    currentRow = colHeaderRow + 1;

    // ═══ 데이터 ═══
    const dataStartRow = currentRow;
    let subtotalInserted = 0;
    const subtotalKey = sheetConfig.subtotalGroupBy;
    let prevGroupVal = subtotalKey ? sheetConfig.data[0]?.[subtotalKey] : null;
    let groupDataRows: number[] = [];

    const writeSubtotal = (atRow: number, groupVal: any) => {
      ws.getRow(atRow).height = 24;
      cols.forEach((col, ci) => {
        const cell = ws.getCell(atRow, ci + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
        cell.font = FONTS.subtotal;
        cell.border = BORDERS.subtotal;
        if (ci === (sheetConfig.totalRow?.labelColIndex || 0)) {
          cell.value = `${sheetConfig.subtotalLabel || '소 계'} (${groupVal})`;
        } else if (col.aggregation && col.aggregation !== 'none' && groupDataRows.length > 0) {
          const cl = getColLetter(ci + 1);
          const fn = col.aggregation === 'sum' ? 9 : col.aggregation === 'avg' ? 1 : 2;
          cell.value = { formula: `SUBTOTAL(${fn},${cl}${groupDataRows[0]}:${cl}${groupDataRows[groupDataRows.length - 1]})` };
          cell.numFmt = getNumFmt(col);
          cell.alignment = { horizontal: 'right' };
        }
      });
    };

    sheetConfig.data.forEach((rowData, rowIdx) => {
      if (subtotalKey && rowData[subtotalKey] !== prevGroupVal && rowIdx > 0 && groupDataRows.length > 0) {
        writeSubtotal(currentRow + rowIdx + subtotalInserted, prevGroupVal);
        subtotalInserted++;
        groupDataRows = [];
        prevGroupVal = rowData[subtotalKey];
      }

      const actualRow = currentRow + rowIdx + subtotalInserted;
      groupDataRows.push(actualRow);
      const isAltRow = (rowIdx + subtotalInserted) % 2 === 1;
      ws.getRow(actualRow).height = 20;

      cols.forEach((col, ci) => {
        const cell = ws.getCell(actualRow, ci + 1);
        const value = rowData[col.key];

        switch (col.format) {
          case 'index':
            cell.value = rowIdx + 1; cell.font = FONTS.dataDefault; cell.alignment = { horizontal: 'center' }; break;
          case 'currency':
            cell.value = typeof value === 'number' ? value : (parseFloat(value) || 0);
            cell.numFmt = '#,##0'; cell.font = FONTS.dataMono; cell.alignment = { horizontal: 'right' }; break;
          case 'currency_man':
            cell.value = typeof value === 'number' ? value : (parseFloat(value) || 0);
            cell.numFmt = '#,##0"만원"'; cell.font = FONTS.dataMono; cell.alignment = { horizontal: 'right' }; break;
          case 'number':
            cell.value = typeof value === 'number' ? value : (parseFloat(value) || 0);
            cell.numFmt = col.numFmt || '#,##0'; cell.font = FONTS.dataMono; cell.alignment = { horizontal: 'right' }; break;
          case 'percent':
            cell.value = typeof value === 'number' ? value / 100 : (parseFloat(value) || 0) / 100;
            cell.numFmt = '0.0%'; cell.font = FONTS.dataMono; cell.alignment = { horizontal: 'center' }; break;
          case 'rate': {
            const nv = typeof value === 'number' ? value : parseFloat(value) || 0;
            cell.value = nv / 100; cell.numFmt = '▲ 0.0%;▼ 0.0%;"-"';
            cell.font = nv > 0 ? FONTS.dataPositive : nv < 0 ? FONTS.dataNegative : FONTS.dataMono;
            cell.alignment = { horizontal: 'center' }; break;
          }
          case 'date':
            if (value) { cell.value = new Date(value); cell.numFmt = 'yyyy-mm-dd'; } else { cell.value = ''; }
            cell.font = FONTS.dataDefault; cell.alignment = { horizontal: 'center' }; break;
          case 'datetime':
            if (value) { cell.value = new Date(value); cell.numFmt = 'yyyy-mm-dd hh:mm'; } else { cell.value = ''; }
            cell.font = FONTS.dataDefault; cell.alignment = { horizontal: 'center' }; break;
          case 'boolean': {
            const lb = col.booleanDisplay || { true: '○', false: '×' };
            cell.value = value ? lb.true : lb.false;
            cell.font = { ...FONTS.dataDefault, color: { argb: value ? COLORS.positive : COLORS.textMuted }, bold: !!value };
            cell.alignment = { horizontal: 'center' }; break;
          }
          case 'badge':
            cell.value = col.badgeMap?.[value] || value || '';
            cell.font = FONTS.dataDefault; cell.alignment = { horizontal: 'center' }; break;
          case 'phone':
            cell.value = value || ''; cell.numFmt = '@'; cell.font = FONTS.dataDefault; cell.alignment = { horizontal: 'center' }; break;
          default:
            cell.value = value ?? ''; cell.font = FONTS.dataDefault;
            cell.alignment = { horizontal: col.align || 'left', vertical: 'middle', wrapText: col.wrapText || false };
        }

        if (col.formula) {
          cell.value = { formula: col.formula.replace(/\{row\}/g, String(actualRow)) };
          cell.numFmt = getNumFmt(col); cell.font = FONTS.dataMono; cell.alignment = { horizontal: 'right' };
        }

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAltRow ? COLORS.altRow : COLORS.white } };

        if (col.conditional) {
          col.conditional.forEach(rule => {
            const applyStyle = () => {
              if (rule.style?.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rule.style.fill } };
              if (rule.style?.fontColor) cell.font = { ...cell.font as any, color: { argb: rule.style.fontColor } };
              if (rule.style?.bold) cell.font = { ...cell.font as any, bold: true };
            };
            if (rule.type === 'greaterThan' && typeof value === 'number' && value > (rule.value as number)) applyStyle();
            if (rule.type === 'lessThan' && typeof value === 'number' && value < (rule.value as number)) applyStyle();
            if (rule.type === 'between' && typeof value === 'number' && value >= (rule.value as number) && value <= (rule.value2 as number)) applyStyle();
          });
        }

        cell.border = BORDERS.thin;
      });
    });

    const dataEndRow = currentRow + sheetConfig.data.length - 1 + subtotalInserted;

    // 마지막 소계
    if (subtotalKey && groupDataRows.length > 0) {
      writeSubtotal(dataEndRow + 1, prevGroupVal);
      subtotalInserted++;
    }

    // ═══ 합계행 ═══
    if (sheetConfig.totalRow) {
      const totalRowNum = dataEndRow + (subtotalKey ? 2 : 1);
      ws.getRow(totalRowNum).height = 28;

      cols.forEach((col, ci) => {
        const cell = ws.getCell(totalRowNum, ci + 1);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.totalBg } };
        cell.font = FONTS.total;
        cell.border = BORDERS.totalTop;

        if (ci === (sheetConfig.totalRow!.labelColIndex || 0)) {
          cell.value = sheetConfig.totalRow!.label;
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (col.aggregation && col.aggregation !== 'none') {
          const cl = getColLetter(ci + 1);
          const range = `${cl}${dataStartRow}:${cl}${dataEndRow}`;
          switch (col.aggregation) {
            case 'sum': cell.value = { formula: `SUBTOTAL(9,${range})` }; break;
            case 'avg': cell.value = { formula: `SUBTOTAL(1,${range})` }; break;
            case 'count': cell.value = { formula: `SUBTOTAL(2,${range})` }; break;
            case 'max': cell.value = { formula: `SUBTOTAL(4,${range})` }; break;
            case 'min': cell.value = { formula: `SUBTOTAL(5,${range})` }; break;
            case 'countif': cell.value = { formula: `COUNTA(${range})` }; break;
          }
          cell.numFmt = getNumFmt(col);
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });

      if (sheetConfig.extraCalcRows) {
        sheetConfig.extraCalcRows.forEach((cr, ci2) => {
          const crn = totalRowNum + 1 + ci2;
          ws.getRow(crn).height = 24;
          cols.forEach((col, ci) => {
            const cell = ws.getCell(crn, ci + 1);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subtotalBg } };
            cell.font = FONTS.subtotal;
            cell.border = BORDERS.subtotal;
            if (ci === (cr.labelColIndex || 0)) {
              cell.value = cr.label; cell.alignment = { horizontal: 'center' };
            } else if (col.aggregation && col.aggregation !== 'none') {
              const cl = getColLetter(ci + 1);
              const range = `${cl}${dataStartRow}:${cl}${dataEndRow}`;
              switch (cr.formula) {
                case 'AVERAGE': cell.value = { formula: `AVERAGE(${range})` }; break;
                case 'MAX': cell.value = { formula: `MAX(${range})` }; break;
                case 'MIN': cell.value = { formula: `MIN(${range})` }; break;
                case 'STDEV': cell.value = { formula: `STDEV(${range})` }; break;
              }
              cell.numFmt = getNumFmt(col); cell.alignment = { horizontal: 'right' };
            }
          });
        });
      }
    }

    // ═══ 시트 마무리 ═══
    cols.forEach((col, idx) => {
      const wsCol = ws.getColumn(idx + 1);
      if (col.width) {
        wsCol.width = Math.max(col.width / 8, 8);
      } else {
        let maxLen = col.label.length;
        sheetConfig.data.forEach(row => {
          const v = row[col.key];
          const sl = v != null ? String(v).length : 0;
          if (sl > maxLen) maxLen = sl;
        });
        const kc = (col.label.match(/[가-힣]/g) || []).length;
        wsCol.width = Math.min(Math.max(maxLen + kc + 4, 8), 35);
      }
    });

    const freeze = sheetConfig.freezePane || { row: colHeaderRow + 1, col: Math.min(3, totalCols) };
    ws.views = [{ state: 'frozen' as const, xSplit: freeze.col, ySplit: freeze.row, topLeftCell: `${getColLetter(freeze.col + 1)}${freeze.row + 1}`, activeCell: `${getColLetter(freeze.col + 1)}${freeze.row + 1}` }];

    if (sheetConfig.autoFilter !== false) {
      ws.autoFilter = { from: { row: colHeaderRow, column: 1 }, to: { row: colHeaderRow, column: totalCols } };
    }

    const lastRow = dataEndRow + (sheetConfig.totalRow ? 1 : 0) + (sheetConfig.extraCalcRows?.length || 0);
    ws.pageSetup.printArea = `A1:${getColLetter(totalCols)}${lastRow}`;
    ws.pageSetup.printTitlesRow = sheetConfig.pageSetup?.printTitlesRow || `${groupHeaderRow}:${colHeaderRow}`;

    if (sheetConfig.protection?.enabled) {
      await ws.protect(sheetConfig.protection.password || '', {
        autoFilter: sheetConfig.protection.allowAutoFilter !== false,
        sort: sheetConfig.protection.allowSort !== false,
        selectLockedCells: true,
        selectUnlockedCells: true,
      });
    }

    if (sheetConfig.conditionalFormats) {
      sheetConfig.conditionalFormats.forEach(cf => {
        cf.rules.forEach(rule => {
          if (rule.type === 'dataBar') {
            ws.addConditionalFormatting({ ref: cf.ref, rules: [{ type: 'dataBar', priority: rule.priority, minLength: 0, maxLength: 100, gradient: true } as any] });
          }
          if (rule.type === 'colorScale') {
            ws.addConditionalFormatting({
              ref: cf.ref,
              rules: [{
                type: 'colorScale', priority: rule.priority,
                cfvo: [{ type: 'min' }, ...(rule.colorScale?.mid ? [{ type: 'percentile' as const, value: 50 }] : []), { type: 'max' }],
                color: [{ argb: rule.colorScale?.min || COLORS.negativeBg }, ...(rule.colorScale?.mid ? [{ argb: rule.colorScale.mid }] : []), { argb: rule.colorScale?.max || COLORS.positiveBg }],
              } as any],
            });
          }
          if (rule.type === 'iconSet') {
            ws.addConditionalFormatting({
              ref: cf.ref,
              rules: [{ type: 'iconSet', priority: rule.priority, iconSet: rule.iconSet || '3TrafficLights', cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }] } as any],
            });
          }
        });
      });
    }

    cols.forEach((col, idx) => {
      if (col.validation?.type === 'list' && col.validation.values) {
        const cl = getColLetter(idx + 1);
        try {
          (ws as any).dataValidations?.add?.(`${cl}${dataStartRow}:${cl}${dataEndRow}`, {
            type: 'list', allowBlank: true, formulae: [`"${col.validation.values.join(',')}"`],
            showErrorMessage: true, errorTitle: '입력 오류', error: `허용값: ${col.validation.values.join(', ')}`,
          });
        } catch { /* skip if not supported */ }
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = config.orgName ? `${config.orgName}_` : '';
  saveAs(blob, `${prefix}${config.fileName}_${dateStr}.xlsx`);
}

// ─── MasterColumn → ExcelColumnDef 변환 ───
export function masterColumnToExcelColumn(col: {
  key: string; label: string; group?: string; width?: number; format?: string;
  subTotal?: string; booleanLabels?: { true: string; false: string };
  badgeMap?: Record<string, { label: string; color: string }>; tooltip?: string;
}): ExcelColumnDef {
  const ecol: ExcelColumnDef = {
    key: col.key, label: col.label, group: col.group, width: col.width,
    format: (col.format as ExcelColumnDef['format']) || 'text', tooltip: col.tooltip,
  };
  if (col.subTotal) ecol.aggregation = col.subTotal as ExcelColumnDef['aggregation'];
  if (col.booleanLabels) ecol.booleanDisplay = col.booleanLabels;
  if (col.badgeMap) {
    ecol.badgeMap = {};
    Object.entries(col.badgeMap).forEach(([k, v]) => { ecol.badgeMap![k] = typeof v === 'string' ? v : v.label; });
  }
  return ecol;
}

// ─── 기존 exportToExcel 하위 호환 래퍼 ───
export async function exportToExcelProfessional(options: {
  fileName: string; orgName?: string; title?: string; sheetName?: string;
  headers: { key: string; label: string; format?: string; width?: number }[];
  data: Record<string, any>[]; summaryRow?: boolean; exportDate?: boolean;
}): Promise<void> {
  await createProfessionalExcel({
    fileName: options.fileName,
    orgName: options.orgName || '',
    title: options.title || options.fileName,
    exportDate: options.exportDate,
    sheets: [{
      name: options.sheetName || '데이터',
      columns: options.headers.map(h => ({
        key: h.key, label: h.label, width: h.width,
        format: (h.format as ExcelColumnDef['format']) || 'text',
        aggregation: (h.format === 'currency' || h.format === 'number') ? 'sum' as const : undefined,
      })),
      data: options.data,
      autoFilter: true,
      totalRow: options.summaryRow ? { label: '합 계', labelColIndex: 0 } : undefined,
      extraCalcRows: options.summaryRow ? [{ label: '평 균', formula: 'AVERAGE' as const, labelColIndex: 0 }] : undefined,
    }],
  });
}

// ─── 기존 createExcelWorkbook 하위 호환 래퍼 ───
interface LegacySheetConfig {
  name: string;
  type?: string;
  headers: { key: string; label: string; format?: string; width?: number; subTotal?: string }[];
  data: Record<string, any>[];
  autoFilter?: boolean;
  freezePane?: { row: number; col: number };
  summaryRows?: { type: string; label: string; labelColumn: number; style: string }[];
  pageSetup?: any;
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
    sheets: config.sheets.map(s => ({
      name: s.name.slice(0, 31),
      columns: s.headers.map(h => ({
        key: h.key,
        label: h.label,
        width: h.width ? h.width * 8 : undefined,
        format: (h.format as ExcelColumnDef['format']) || 'text',
        aggregation: h.subTotal as ExcelColumnDef['aggregation'] || undefined,
      })),
      data: s.data,
      autoFilter: s.autoFilter,
      freezePane: s.freezePane ? { row: s.freezePane.row + 5, col: s.freezePane.col } : undefined,
      totalRow: s.summaryRows?.some(sr => sr.type === 'total')
        ? { label: s.summaryRows!.find(sr => sr.type === 'total')!.label, labelColIndex: s.summaryRows!.find(sr => sr.type === 'total')!.labelColumn }
        : undefined,
    })),
  });
}
