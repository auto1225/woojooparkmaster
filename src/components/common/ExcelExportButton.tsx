import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FileSpreadsheet, Loader2, ChevronDown } from "lucide-react";
import { exportToExcelProfessional } from "@/lib/excel-engine";
import { exportToExcel } from "@/lib/excel-export";
import { useSystemConfig } from "@/hooks/useSystemConfig";

interface ExcelExportButtonProps {
  fileName: string;
  title?: string;
  headers: { key: string; label: string; width?: number; format?: 'number' | 'currency' | 'date' | 'percent' }[];
  getData: () => Record<string, any>[];
  summaryRow?: boolean;
  className?: string;
  onExportFull?: () => void;
  onExportMulti?: () => void;
  onExportPDF?: () => void;
}

export function ExcelExportButton({
  fileName, title, headers, getData, summaryRow, className,
  onExportFull, onExportMulti, onExportPDF,
}: ExcelExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const { data: config } = useSystemConfig();

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = getData();
      await exportToExcelProfessional({
        fileName,
        title,
        headers,
        data,
        orgName: config?.org_name,
        summaryRow,
      });
    } catch {
      // Fallback to legacy
      const data = getData();
      exportToExcel({
        fileName,
        title,
        headers,
        data,
        orgName: config?.org_name,
        summaryRow,
      });
    } finally {
      setTimeout(() => setLoading(false), 500);
    }
  };

  const hasAdvanced = onExportFull || onExportMulti || onExportPDF;

  if (!hasAdvanced) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleExport}
        disabled={loading}
        className={`no-print ${className ?? ""}`}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
        엑셀 다운로드
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          className={`no-print ${className ?? ""}`}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />}
          엑셀 <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleExport}>현재 화면 엑셀</DropdownMenuItem>
        {onExportFull && <DropdownMenuItem onClick={onExportFull}>전체 항목 엑셀</DropdownMenuItem>}
        {onExportMulti && <DropdownMenuItem onClick={onExportMulti}>멀티시트 분석 엑셀</DropdownMenuItem>}
        {onExportPDF && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExportPDF}>PDF 출력</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
