import { supabase } from "@/integrations/supabase/client";

interface InitiateApprovalParams {
  module: string;
  documentType: string;
  refId: string;
  refNumber?: string;
  title: string;
  initiatorId: string;
}

export async function initiateApproval(params: InitiateApprovalParams) {
  // Find default approval line
  const { data: line } = await supabase
    .from('approval_lines')
    .select('*')
    .eq('module', params.module)
    .eq('document_type', params.documentType)
    .eq('is_default', true)
    .single();

  if (!line) return null; // No approval line configured

  const steps = (line.steps as any[]) || [];

  // Create approval record
  const { data: record, error } = await supabase
    .from('approval_records')
    .insert({
      line_id: line.id,
      module: params.module,
      document_type: params.documentType,
      ref_id: params.refId,
      ref_number: params.refNumber || null,
      title: params.title,
      current_step: 1,
      total_steps: steps.length,
      status: 'in_progress',
      initiated_by: params.initiatorId,
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Create step records
  for (const step of steps) {
    await supabase.from('approval_steps').insert({
      record_id: record.id,
      step_number: step.step,
      step_label: step.label,
      action: step.step === 1 ? 'pending' : 'pending',
    } as any);
  }

  return record;
}

export async function processApprovalStep(stepId: string, action: 'approved' | 'rejected', approverId: string, approverName: string, comment?: string) {
  // Update the step
  await supabase.from('approval_steps').update({
    action,
    approver_id: approverId,
    approver_name: approverName,
    comment: comment || null,
    acted_at: new Date().toISOString(),
  } as any).eq('id', stepId);

  // Get step info
  const { data: step } = await supabase.from('approval_steps').select('*, approval_records(*)').eq('id', stepId).single() as any;
  if (!step) return;

  const record = step.approval_records;

  if (action === 'rejected') {
    // Reject entire record
    await supabase.from('approval_records').update({
      status: 'rejected',
      completed_at: new Date().toISOString(),
    } as any).eq('id', record.id);
    return { status: 'rejected', recordId: record.id };
  }

  // Check if this was the last step
  if (step.step_number >= record.total_steps) {
    await supabase.from('approval_records').update({
      status: 'approved',
      completed_at: new Date().toISOString(),
    } as any).eq('id', record.id);
    return { status: 'approved', recordId: record.id };
  }

  // Move to next step
  await supabase.from('approval_records').update({
    current_step: step.step_number + 1,
  } as any).eq('id', record.id);

  return { status: 'in_progress', recordId: record.id, nextStep: step.step_number + 1 };
}
