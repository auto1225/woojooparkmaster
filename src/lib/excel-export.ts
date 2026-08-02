import { exportToExcelProfessional } from '@/lib/excel-engine';

interface ExcelExportOptions {
  fileName: string;
  sheetName?: string;
  headers: { key: string; label: string; width?: number; format?: 'number' | 'currency' | 'date' | 'percent' }[];
  data: Record<string, unknown>[];
  orgName?: string;
  title?: string;
  exportDate?: boolean;
  summaryRow?: boolean;
}

export async function exportToExcel(options: ExcelExportOptions): Promise<void> {
  await exportToExcelProfessional(options);
}
