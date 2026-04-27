/** SEC-WEB-2: 안전한 파일 업로드 컴포넌트 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/api/supabase-compat';
import { filesApi } from "@/integrations/api/files";
import { validateUploadFile, getSecureUploadPath, ALLOWED_FILE_TYPES } from '@/lib/file-security';
import { logSecurityAudit } from '@/lib/auth-security';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, CheckCircle2, XCircle, AlertTriangle, Trash2, FileIcon } from 'lucide-react';
import { toast } from 'sonner';

interface SecureFileUploadProps {
  category: 'image' | 'document' | 'design';
  bucket: string;
  folder: string;
  maxFiles?: number;
  onUpload: (filePaths: string[]) => void;
  onError?: (errors: string[]) => void;
}

interface UploadedFile {
  name: string;
  path: string;
  status: 'validating' | 'uploading' | 'done' | 'error';
  progress: number;
  errors?: string[];
  warnings?: string[];
}

export function SecureFileUpload({ category, bucket, folder, maxFiles = 1, onUpload, onError }: SecureFileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const config = ALLOWED_FILE_TYPES[category];

  const processFiles = useCallback(async (selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles).slice(0, maxFiles - files.filter(f => f.status === 'done').length);

    for (const file of fileArray) {
      const entry: UploadedFile = { name: file.name, path: '', status: 'validating', progress: 0 };
      setFiles(prev => [...prev, entry]);

      // Validate
      const result = await validateUploadFile(file, category);

      if (!result.isValid) {
        setFiles(prev => prev.map(f => f.name === file.name && f.status === 'validating'
          ? { ...f, status: 'error' as const, errors: result.errors, warnings: result.warnings } : f));
        await logSecurityAudit('file_upload_blocked', 'warning', {
          fileName: file.name, fileType: file.type, fileSize: file.size, reason: result.errors,
        });
        onError?.(result.errors);
        continue;
      }

      // Upload
      setFiles(prev => prev.map(f => f.name === file.name && f.status === 'validating'
        ? { ...f, status: 'uploading' as const, progress: 30, warnings: result.warnings } : f));

      const securePath = `${folder}/${getSecureUploadPath(category, file.name)}`;

      const _ul = await filesApi.legacyUpload(bucket, securePath, file); const error = _ul.error;

      if (error) {
        setFiles(prev => prev.map(f => f.name === file.name && f.status === 'uploading'
          ? { ...f, status: 'error' as const, errors: ['업로드 실패: ' + error.message] } : f));
        continue;
      }

      setFiles(prev => prev.map(f => f.name === file.name && f.status === 'uploading'
        ? { ...f, status: 'done' as const, progress: 100, path: securePath } : f));

      await logSecurityAudit('file_upload', 'info', {
        fileName: file.name, fileSize: file.size, bucket, path: securePath,
      });

      toast.success(`${file.name} 업로드 완료`);
    }

    // Callback with all done paths
    setFiles(prev => {
      const donePaths = prev.filter(f => f.status === 'done').map(f => f.path);
      if (donePaths.length > 0) onUpload(donePaths);
      return prev;
    });
  }, [category, bucket, folder, maxFiles, files, onUpload, onError]);

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">파일을 끌어다 놓거나 클릭하세요</p>
        <p className="text-xs text-muted-foreground mt-1">
          허용: {config.extensions.join(', ')} (최대 {config.maxSizeMB}MB)
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={config.extensions.join(',')}
          multiple={maxFiles > 1}
          onChange={e => e.target.files && processFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className={`flex items-center gap-3 p-3 rounded-lg border text-sm
          ${f.status === 'error' ? 'border-destructive/50 bg-destructive/5' :
            f.status === 'done' ? 'border-primary/50 bg-primary/5' :
            'border-border'}`}>
          <div className="flex-shrink-0">
            {f.status === 'done' && <CheckCircle2 className="h-5 w-5 text-primary" />}
            {f.status === 'error' && <XCircle className="h-5 w-5 text-destructive" />}
            {(f.status === 'validating' || f.status === 'uploading') && (
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{f.name}</p>
            {f.status === 'uploading' && <Progress value={f.progress} className="h-1 mt-1" />}
            {f.status === 'validating' && <p className="text-[10px] text-muted-foreground">검증 중...</p>}
            {f.errors?.map((err, j) => (
              <p key={j} className="text-[10px] text-destructive flex items-center gap-1 mt-0.5">
                <AlertTriangle className="h-3 w-3" />{err}
              </p>
            ))}
            {f.warnings?.map((w, j) => (
              <p key={j} className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">{w}</p>
            ))}
            {f.status === 'done' && <p className="text-[10px] text-primary">파일 검증 완료 ✓</p>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={() => removeFile(f.name)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
