import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/api/supabase-compat";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LayoutDashboard, Car, Menu, HelpCircle, Headphones } from "lucide-react";

const STEPS = [
  { icon: LayoutDashboard, title: '대시보드', desc: '대시보드에서 전체 현황을 파악하세요' },
  { icon: Car, title: '주차장 관리', desc: '주차장 관리에서 정보를 관리하세요' },
  { icon: Menu, title: '메뉴 탐색', desc: '좌측 메뉴에서 각 업무를 시작하세요' },
  { icon: HelpCircle, title: '도움말', desc: '우하단 ? 버튼으로 도움말을 보세요' },
  { icon: Headphones, title: '지원', desc: '문제가 있으면 관리자에게 문의하세요' },
];

export function OnboardingGuide() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (profile && !(profile as any).onboarding_completed && !(profile as any).last_login_at) {
      setOpen(true);
    }
  }, [profile]);

  const handleClose = async () => {
    setOpen(false);
    if (dontShow && user?.id) {
      await supabase.from('profiles').update({ onboarding_completed: true } as any).eq('id', user.id);
    }
  };

  if (!open) return null;

  const CurrentIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <div className="text-center space-y-4 py-4">
          {step === 0 && (
            <h2 className="text-lg font-bold">ParkMaster에 오신 것을 환영합니다!</h2>
          )}
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CurrentIcon className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{STEPS[step].title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{STEPS[step].desc}</p>
          </div>
          <div className="flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === step ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
          <div className="flex gap-2 justify-center">
            {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(s => s - 1)}>이전</Button>}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>다음</Button>
            ) : (
              <Button size="sm" onClick={handleClose}>시작하기</Button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2">
            <Checkbox id="dont-show" checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            <label htmlFor="dont-show" className="text-[10px] text-muted-foreground cursor-pointer">다시 보지 않기</label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
