import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle, Clock, XCircle } from "lucide-react";

interface ApprovalProgressProps {
  module: string;
  documentType: string;
  refId: string;
}

export function ApprovalProgress({ module, documentType, refId }: ApprovalProgressProps) {
  const { data: record } = useQuery({
    queryKey: ['approval-record', module, documentType, refId],
    queryFn: async () => {
      const { data } = await supabase
        .from('approval_records')
        .select('*')
        .eq('module', module)
        .eq('document_type', documentType)
        .eq('ref_id', refId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: steps } = useQuery({
    queryKey: ['approval-steps', record?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('approval_steps')
        .select('*')
        .eq('record_id', record!.id)
        .order('step_number');
      return data || [];
    },
    enabled: !!record?.id,
  });

  if (!record || !steps?.length) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {steps.map((step: any, i: number) => {
        const isApproved = step.action === 'approved';
        const isRejected = step.action === 'rejected';
        const isCurrent = step.step_number === record.current_step && record.status === 'in_progress';
        const isPending = step.action === 'pending' && !isCurrent;

        return (
          <div key={step.id} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground text-xs">→</span>}
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${
              isApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              isRejected ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
              isCurrent ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse' :
              'bg-muted text-muted-foreground'
            }`}>
              {isApproved ? <CheckCircle className="h-3 w-3" /> :
               isRejected ? <XCircle className="h-3 w-3" /> :
               isCurrent ? <Clock className="h-3 w-3" /> :
               <Circle className="h-3 w-3" />}
              <span>{step.step_label}</span>
              {step.approver_name && <span>({step.approver_name})</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
