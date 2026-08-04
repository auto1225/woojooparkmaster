/** SEC-2: 강제 비밀번호 변경 페이지 (자체 인증 기반) */
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/api/supabase-compat';
import { authApi } from '@/integrations/api';
import { useAuth } from '@/hooks/useAuth';
import { validatePassword } from '@/lib/password-validator';
import { PasswordStrengthIndicator } from '@/components/security/PasswordStrengthIndicator';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';

export default function ChangePassword() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason') || 'required';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validation = validatePassword(newPassword, user?.email || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) { toast.error('현재 비밀번호를 입력해주세요.'); return; }
    if (!validation.isValid) { toast.error('비밀번호 조건을 모두 충족해야 합니다.'); return; }
    if (newPassword !== confirmPassword) { toast.error('비밀번호가 일치하지 않습니다.'); return; }

    setLoading(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);

      // 프로필 메타데이터 갱신 (백엔드의 trigger가 처리하지 않는 부분만)
      if (user?.id) {
        await supabase.from('profiles').update({
          password_changed_at: new Date().toISOString(),
          must_change_password: false,
          password_expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
        } as any).eq('id', user.id);
      }

      toast.success('비밀번호가 변경되었습니다.');
      navigate('/');
    } catch (err: any) {
      toast.error(err?.clientMessage || err?.message || '비밀번호 변경 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-[420px] shadow-premium-xl border-border/60 rounded-2xl">
        <CardHeader className="text-center space-y-3 pb-2 pt-8 px-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">비밀번호 변경</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {reason === 'expired' ? '비밀번호가 만료되었습니다. 새 비밀번호를 설정해주세요.' : '보안을 위해 비밀번호를 변경해주세요.'}
            </p>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 px-8 pb-8">
            <div className="space-y-2">
              <Label className="text-xs">현재 비밀번호</Label>
              <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                placeholder="현재 비밀번호" className="h-10" required autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">새 비밀번호</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="새 비밀번호 입력" className="h-10" required autoComplete="new-password" />
              <PasswordStrengthIndicator password={newPassword} email={user?.email || ''} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">비밀번호 확인</Label>
              <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 다시 입력" className="h-10" required autoComplete="new-password" />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[11px] text-red-500">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>
            <Button type="submit" className="w-full h-10" disabled={loading || !currentPassword || !validation.isValid || newPassword !== confirmPassword}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              비밀번호 변경
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
