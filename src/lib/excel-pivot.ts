import { createProfessionalExcel, type ExcelColumnDef } from '@/lib/excel-engine';

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

export async function createPivotExcel(config: PivotExcelConfig): Promise<void> {
  const showRowTotal = config.showRowTotal !== false;
  const showColTotal = config.showColTotal !== false;
  const valueFormat: ExcelColumnDef['format'] = config.format || 'number';
  const data = config.rowData.map((label, rowIndex) => {
    const row: Record<string, unknown> = { rowLabel: label };
    config.colData.forEach((_, columnIndex) => {
      row[`value_${columnIndex}`] = config.values[rowIndex]?.[columnIndex] ?? 0;
    });
    if (showRowTotal) {
      row.rowTotal = config.colData.reduce(
        (sum, _, columnIndex) => sum + (config.values[rowIndex]?.[columnIndex] || 0),
        0,
      );
    }
    return row;
  });

  const columns: ExcelColumnDef[] = [
    { key: 'rowLabel', label: `${config.rowHeader} \\ ${config.colHeader}`, width: 120 },
    ...config.colData.map((label, index) => ({
      key: `value_${index}`,
      label,
      format: valueFormat,
      aggregation: 'sum' as const,
      width: 96,
    })),
  ];
  if (showRowTotal) {
    columns.push({ key: 'rowTotal', label: '합계', format: valueFormat, aggregation: 'sum', width: 104 });
  }

  await createProfessionalExcel({
    fileName: config.fileName,
    orgName: config.orgName,
    title: config.title,
    subtitle: config.subtitle,
    sheets: [{
      name: '피벗 테이블',
      columns,
      data,
      freezePane: { row: 5, col: 1 },
      totalRow: showColTotal ? { label: '합계', labelColIndex: 0 } : undefined,
      extraCalcRows: showColTotal ? [{ label: '평균', formula: 'AVERAGE', labelColIndex: 0 }] : undefined,
    }],
  });
}
