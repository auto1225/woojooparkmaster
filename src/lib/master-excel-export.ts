import type { MasterColumn } from '@/components/common/MasterDataView';
import { createProfessionalExcel, masterColumnToExcelColumn } from '@/lib/excel-engine';

export interface ExcelSheetConfig {
  name: string;
  columns: MasterColumn[];
  data: Record<string, unknown>[];
}

interface MasterExcelConfig {
  fileName: string;
  orgName: string;
  title: string;
  columns: MasterColumn[];
  data: Record<string, unknown>[];
  mode: 'current' | 'full' | 'multi';
  sheets?: ExcelSheetConfig[];
}

export async function exportMasterExcel(config: MasterExcelConfig): Promise<void> {
  const sheets = config.mode === 'multi' && config.sheets?.length
    ? config.sheets
    : [{ name: '종합현황', columns: config.columns, data: config.data }];

  await createProfessionalExcel({
    fileName: config.fileName,
    orgName: config.orgName,
    title: config.title,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      columns: sheet.columns.map(masterColumnToExcelColumn),
      data: sheet.data,
      totalRow: sheet.columns.some((column) => column.subTotal)
        ? { label: '합계', labelColIndex: 0 }
        : undefined,
    })),
  });
}
