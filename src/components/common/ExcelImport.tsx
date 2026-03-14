import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, FileSpreadsheet, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  type: "text" | "number" | "date" | "select";
  options?: string[];
  example?: string;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ExcelImportProps {
  templateColumns: ImportColumn[];
  onImport: (data: any[]) => Promise<{ success: number; errors: ImportError[] }>;
  templateFileName: string;
}

export function ExcelImport({ templateColumns, onImport, templateFileName }: ExcelImportProps) {
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const downloadTemplate = useCallback(() => {
    const ws = XLSX.utils.aoa_to_sheet([
      templateColumns.map((c) => `${c.label}${c.required ? " *" : ""}`),
      templateColumns.map((c) => c.example || (c.type === "number" ? "0" : c.type === "date" ? "2025-01-01" : c.options ? c.options[0] : "예시")),
    ]);

    // Style header row
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws[addr]) {
        ws[addr].s = { fill: { fgColor: { rgb: templateColumns[C].required ? "FFE0E0" : "E0E8F0" } } };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "템플릿");
    XLSX.writeFile(wb, `${templateFileName}.xlsx`);
  }, [templateColumns, templateFileName]);

  const validateData = useCallback((data: any[]): ImportError[] => {
    const errs: ImportError[] = [];
    data.forEach((row, i) => {
      templateColumns.forEach((col) => {
        const val = row[col.key];
        if (col.required && (val === undefined || val === null || val === "")) {
          errs.push({ row: i + 1, field: col.label, message: "필수 입력" });
        }
        if (val !== undefined && val !== null && val !== "") {
          if (col.type === "number" && isNaN(Number(val))) {
            errs.push({ row: i + 1, field: col.label, message: "숫자 형식 오류" });
          }
          if (col.type === "date" && isNaN(Date.parse(String(val)))) {
            errs.push({ row: i + 1, field: col.label, message: "날짜 형식 오류" });
          }
          if (col.type === "select" && col.options && !col.options.includes(String(val))) {
            errs.push({ row: i + 1, field: col.label, message: `허용값: ${col.options.join(", ")}` });
          }
        }
      });
    });
    return errs;
  }, [templateColumns]);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { header: templateColumns.map((c) => c.key) });
        // Skip header row
        const data = json.slice(1) as any[];
        setParsedData(data);
        setErrors(validateData(data));
      } catch {
        toast.error("파일 파싱 실패");
      }
    };
    reader.readAsBinaryString(file);
  }, [templateColumns, validateData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(10);
    try {
      const validData = parsedData.filter((_, i) => !errors.some((e) => e.row === i + 1));
      setProgress(30);
      const result = await onImport(validData);
      setProgress(100);
      toast.success(`${result.success}건 등록 완료${result.errors.length > 0 ? `, ${result.errors.length}건 실패` : ""}`);
      if (result.errors.length === 0) {
        setParsedData([]);
        setErrors([]);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedData.length - new Set(errors.map((e) => e.row)).size;
  const errorRows = new Set(errors.map((e) => e.row));
  const displayData = showErrorsOnly ? parsedData.filter((_, i) => errorRows.has(i + 1)) : parsedData.slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-1" />템플릿 다운로드
        </Button>
      </div>

      {parsedData.length === 0 && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".xlsx,.xls,.csv";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            input.click();
          }}
        >
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">파일을 드래그하거나 클릭하여 선택</p>
          <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv 형식 지원</p>
        </div>
      )}

      {parsedData.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline">
              <FileSpreadsheet className="h-3 w-3 mr-1" />
              총 {parsedData.length}행
            </Badge>
            <Badge variant="default" className="bg-green-100 text-green-700">
              <Check className="h-3 w-3 mr-1" />정상 {validCount}행
            </Badge>
            {errors.length > 0 && (
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3 mr-1" />오류 {errorRows.size}행
              </Badge>
            )}
            {errors.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowErrorsOnly(!showErrorsOnly)}>
                {showErrorsOnly ? "전체 보기" : "오류만 보기"}
              </Button>
            )}
          </div>

          <div className="overflow-x-auto border rounded-lg max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                  {templateColumns.map((c) => (
                    <th key={c.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                      {c.label}{c.required && <span className="text-destructive ml-0.5">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayData.map((row, idx) => {
                  const rowNum = showErrorsOnly ? Array.from(errorRows)[idx] : idx + 1;
                  const rowErrors = errors.filter((e) => e.row === rowNum);
                  return (
                    <tr key={idx} className={`border-b ${rowErrors.length > 0 ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1 text-muted-foreground">{rowNum}</td>
                      {templateColumns.map((c) => {
                        const cellErr = rowErrors.find((e) => e.field === c.label);
                        return (
                          <td key={c.key} className={`px-2 py-1 ${cellErr ? "bg-destructive/10 text-destructive" : ""}`} title={cellErr?.message}>
                            {String(row[c.key] ?? "")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {importing && <Progress value={progress} className="h-2" />}

          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={importing || validCount === 0} size="sm">
              {importing ? "가져오는 중..." : `${validCount}건 가져오기`}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setParsedData([]); setErrors([]); }}>
              초기화
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
