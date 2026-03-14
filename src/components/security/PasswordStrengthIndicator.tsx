/** SEC-2: 비밀번호 강도 표시기 */
import { validatePassword, CHECK_LABELS } from '@/lib/password-validator';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  password: string;
  email?: string;
}

export function PasswordStrengthIndicator({ password, email }: Props) {
  if (!password) return null;
  const result = validatePassword(password, email);
  const strengthColor = result.strength === 'strong' ? 'text-green-600' : result.strength === 'medium' ? 'text-yellow-600' : 'text-red-600';
  const strengthLabel = result.strength === 'strong' ? '강함' : result.strength === 'medium' ? '보통' : '약함';
  const progressColor = result.strength === 'strong' ? '[&>div]:bg-green-500' : result.strength === 'medium' ? '[&>div]:bg-yellow-500' : '[&>div]:bg-red-500';

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">비밀번호 강도</span>
        <span className={`text-xs font-semibold ${strengthColor}`}>{strengthLabel}</span>
      </div>
      <Progress value={result.score} className={`h-1.5 ${progressColor}`} />
      <div className="grid grid-cols-2 gap-1">
        {Object.entries(result.checks).map(([key, passed]) => (
          <div key={key} className="flex items-center gap-1.5">
            {passed
              ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
              : <XCircle className="h-3 w-3 text-red-400 shrink-0" />}
            <span className={`text-[11px] ${passed ? 'text-muted-foreground' : 'text-red-500'}`}>
              {CHECK_LABELS[key] || key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
