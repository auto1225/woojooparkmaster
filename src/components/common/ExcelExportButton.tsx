import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";
import { useSystemConfig } from "@/hooks/useSystemConfig";

interface ExcelExportButtonProps {
  fileName: string;
  title?: string;
  headers: { key: string; label: string; width?: number; format?: 'number' | 'currency' | 'date' | 'percent' }[];
  getData: () => Record<string, any>[];
  summaryRow?: boolean;
  className?: string;
}

export function ExcelExportButton({
  fileName, title, headers, getData, summaryRow, className,
}: ExcelExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const { data: config } = useSystemConfig();

  const handleExport = async () => {
    setLoading(true);
    try {
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
