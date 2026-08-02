import { useCallback, useState } from 'react';
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { Row } from 'write-excel-file/browser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'number' | 'date' | 'select';
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
  onImport: (data: Record<string, unknown>[]) => Promise<{ success: number; errors: ImportError[] }>;
  templateFileName: string;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(value.trim());
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function rowsToRecords(rows: unknown[][], columns: ImportColumn[]): Record<string, unknown>[] {
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column.key, row[index] ?? ''])));
}

export function ExcelImport({ templateColumns, onImport, templateFileName }: ExcelImportProps) {
  const [parsedData, setParsedData] = useState<Record<string, unknown>[]>([]);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const downloadTemplate = useCallback(async () => {
    const rows: Row[] = [
      templateColumns.map((column) => ({
        value: `${column.label}${column.required ? ' *' : ''}`,
        type: String,
        fontWeight: 'bold',
        backgroundColor: column.required ? '#FFE0E0' : '#E0E8F0',
        borderColor: '#CBD5E1',
        borderStyle: 'thin',
      })),
      templateColumns.map((column) => ({
        value: column.example || (column.type === 'number' ? '0' : column.type === 'date' ? '2025-01-01' : column.options?.[0] || '예시'),
        type: String,
      })),
    ];
    const { default: writeXlsxFile } = await import('write-excel-file/browser');
    await writeXlsxFile(rows, {
      sheet: '템플릿',
      stickyRowsCount: 1,
      columns: templateColumns.map((column) => ({ width: Math.max(12, column.label.length + 6) })),
    }).toFile(`${templateFileName}.xlsx`);
  }, [templateColumns, templateFileName]);

  const validateData = useCallback((data: Record<string, unknown>[]): ImportError[] => {
    const validationErrors: ImportError[] = [];
    data.forEach((row, rowIndex) => {
      templateColumns.forEach((column) => {
        const value = row[column.key];
        if (column.required && (value === undefined || value === null || value === '')) {
          validationErrors.push({ row: rowIndex + 1, field: column.label, message: '필수 입력' });
        }
        if (value === undefined || value === null || value === '') return;
        if (column.type === 'number' && Number.isNaN(Number(value))) {
          validationErrors.push({ row: rowIndex + 1, field: column.label, message: '숫자 형식 오류' });
        }
        if (column.type === 'date' && Number.isNaN(Date.parse(String(value)))) {
          validationErrors.push({ row: rowIndex + 1, field: column.label, message: '날짜 형식 오류' });
        }
        if (column.type === 'select' && column.options && !column.options.includes(String(value))) {
          validationErrors.push({ row: rowIndex + 1, field: column.label, message: `허용값: ${column.options.join(', ')}` });
        }
      });
    });
    return validationErrors;
  }, [templateColumns]);

  const handleFile = useCallback(async (file: File) => {
    try {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const rows = extension === 'csv'
        ? parseCsv(await file.text())
        : await (await import('read-excel-file/browser')).default(file);
      const data = rowsToRecords(rows as unknown[][], templateColumns);
      setParsedData(data);
      setErrors(validateData(data));
    } catch {
      toast.error('파일을 읽지 못했습니다. XLSX 또는 CSV 형식을 확인해 주세요.');
    }
  }, [templateColumns, validateData]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(10);
    try {
      const validData = parsedData.filter((_, index) => !errors.some((error) => error.row === index + 1));
      setProgress(30);
      const result = await onImport(validData);
      setProgress(100);
      toast.success(`${result.success}건 등록 완료${result.errors.length > 0 ? `, ${result.errors.length}건 실패` : ''}`);
      if (result.errors.length === 0) {
        setParsedData([]);
        setErrors([]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '가져오기에 실패했습니다.');
    } finally {
      setImporting(false);
    }
  };

  const errorRows = new Set(errors.map((error) => error.row));
  const validCount = parsedData.length - errorRows.size;
  const displayRows = showErrorsOnly
    ? parsedData.map((row, index) => ({ row, rowNumber: index + 1 })).filter(({ rowNumber }) => errorRows.has(rowNumber))
    : parsedData.slice(0, 100).map((row, index) => ({ row, rowNumber: index + 1 }));

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={() => void downloadTemplate()}>
        <Download className="mr-1 h-4 w-4" />
        템플릿 다운로드
      </Button>

      {parsedData.length === 0 && (
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors hover:border-primary/50"
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.csv';
            input.onchange = (event) => {
              const file = (event.target as HTMLInputElement).files?.[0];
              if (file) void handleFile(file);
            };
            input.click();
          }}
        >
          <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">파일을 끌어놓거나 클릭하여 선택</p>
          <p className="mt-1 text-xs text-muted-foreground">.xlsx, .csv 형식 지원</p>
        </div>
      )}

      {parsedData.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline"><FileSpreadsheet className="mr-1 h-3 w-3" />총 {parsedData.length}건</Badge>
            <Badge variant="default" className="bg-green-100 text-green-700"><Check className="mr-1 h-3 w-3" />정상 {validCount}건</Badge>
            {errors.length > 0 && (
              <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />오류 {errorRows.size}건</Badge>
            )}
            {errors.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowErrorsOnly((value) => !value)}>
                {showErrorsOnly ? '전체 보기' : '오류만 보기'}
              </Button>
            )}
          </div>

          <div className="max-h-96 overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                  {templateColumns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                      {column.label}{column.required && <span className="ml-0.5 text-destructive">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map(({ row, rowNumber }) => {
                  const rowErrors = errors.filter((error) => error.row === rowNumber);
                  return (
                    <tr key={rowNumber} className={`border-b ${rowErrors.length > 0 ? 'bg-destructive/5' : ''}`}>
                      <td className="px-2 py-1 text-muted-foreground">{rowNumber}</td>
                      {templateColumns.map((column) => {
                        const cellError = rowErrors.find((error) => error.field === column.label);
                        return (
                          <td
                            key={column.key}
                            className={`px-2 py-1 ${cellError ? 'bg-destructive/10 text-destructive' : ''}`}
                            title={cellError?.message}
                          >
                            {String(row[column.key] ?? '')}
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
            <Button onClick={() => void handleImport()} disabled={importing || validCount === 0} size="sm">
              {importing ? '가져오는 중...' : `${validCount}건 가져오기`}
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
