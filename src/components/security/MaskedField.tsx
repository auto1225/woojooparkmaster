/** SEC-4: 마스킹 필드 컴포넌트 */
import { useState, useEffect } from 'react';
import { usePIIMasking } from '@/hooks/usePIIMasking';
import type { PIIFieldType } from '@/lib/pii-masking';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Shield } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  value: string;
  field: PIIFieldType;
  table: string;
  recordId: string;
  createdBy?: string;
}

export function MaskedField({ value, field, table, recordId, createdBy }: Props) {
  const { shouldMask, getMasked, requestUnmask, role } = usePIIMasking();
  const [showOriginal, setShowOriginal] = useState(false);
  const [originalValue, setOriginalValue] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isMasked = shouldMask(field, createdBy);
  const displayValue = showOriginal && originalValue ? originalValue : getMasked(value, field, createdBy);

  // Auto re-mask after 5 seconds
  useEffect(() => {
    if (!showOriginal) return;
    const timer = setTimeout(() => {
      setShowOriginal(false);
      setOriginalValue(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [showOriginal]);

  const handleUnmask = async () => {
    setConfirmOpen(false);
    const val = await requestUnmask(table, recordId, field);
    if (val) {
      setOriginalValue(val);
      setShowOriginal(true);
    }
  };

  const canUnmask = isMasked && (role === 'editor' || role === 'manager' || role === 'admin');

  return (
    <span className="inline-flex items-center gap-1">
      {showOriginal && <Shield className="h-3 w-3 text-amber-500" />}
      <span className={showOriginal ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}>
        {displayValue}
      </span>
      {canUnmask && (
        <>
          <Button variant="ghost" size="icon" className="h-5 w-5 ml-0.5"
            onClick={() => showOriginal ? setShowOriginal(false) : setConfirmOpen(true)}>
            {showOriginal
              ? <EyeOff className="h-3 w-3 text-muted-foreground" />
              : <Eye className="h-3 w-3 text-muted-foreground" />}
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>개인정보 확인</AlertDialogTitle>
                <AlertDialogDescription>
                  개인정보를 확인합니다. 이 행위는 보안 감사 로그에 기록됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnmask}>확인</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </span>
  );
}
