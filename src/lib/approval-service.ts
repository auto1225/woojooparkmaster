import { supabase } from "@/integrations/api/supabase-compat";

interface InitiateApprovalParams {
  module: string;
  documentType: string;
  refId: string;
  refNumber?: string;
  title: string;
  initiatorId: string;
}

export async function initiateApproval(params: InitiateApprovalParams) {
  const { data: existing, error: existingError } = await supabase
    .from('approval_records')
    .select('*')
    .eq('module', params.module)
    .eq('document_type', params.documentType)
    .eq('ref_id', params.refId)
    .eq('status', 'in_progress')
    .order('initiated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  // Choose the newest default line while legacy duplicates are being cleaned.
  const { data: lines, error: lineError } = await supabase
    .from('approval_lines')
    .select('*')
    .eq('module', params.module)
    .eq('document_type', params.documentType)
    .eq('is_default', true)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lineError) throw lineError;
  const line = lines?.[0];

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
    const { error: stepError } = await supabase.from('approval_steps').insert({
      record_id: record.id,
      step_number: step.step,
      step_label: step.label,
      approver_id: step.approver_id || null,
      approver_name: step.approver_name || null,
      action: step.step === 1 ? 'pending' : 'pending',
    } as any);
    if (stepError) {
      await supabase.from('approval_records').update({ status: 'invalid', completed_at: new Date().toISOString() }).eq('id', record.id);
      throw stepError;
    }
  }

  return record;
}

export async function processApprovalStep(stepId: string, action: 'approved' | 'rejected', approverId: string, approverName: string, comment?: string) {
  const { data: currentStep, error: currentStepError } = await supabase
    .from('approval_steps')
    .select('*, approval_records(*)')
    .eq('id', stepId)
    .single() as any;
  if (currentStepError) throw currentStepError;
  if (!currentStep?.approval_records) throw new Error('결재 문서를 찾을 수 없습니다.');
  if (currentStep.action !== 'pending') throw new Error('이미 처리된 결재 단계입니다.');
  if (currentStep.approval_records.status !== 'in_progress' || currentStep.step_number !== currentStep.approval_records.current_step) {
    throw new Error('현재 처리할 수 있는 결재 단계가 아닙니다.');
  }

  const { data: updatedStep, error: stepError } = await supabase.from('approval_steps').update({
    action,
    approver_id: approverId,
    approver_name: approverName,
    comment: comment || null,
    acted_at: new Date().toISOString(),
  } as any).eq('id', stepId).eq('action', 'pending').select('id').maybeSingle();
  if (stepError) throw stepError;
  if (!updatedStep) throw new Error('다른 사용자가 먼저 결재했습니다. 목록을 새로고침해 주세요.');

  const step = currentStep;
  const record = currentStep.approval_records;

  if (action === 'rejected') {
    // Reject entire record
    const { error } = await supabase.from('approval_records').update({
      status: 'rejected',
      completed_at: new Date().toISOString(),
    } as any).eq('id', record.id);
    if (error) throw error;
    return { status: 'rejected', recordId: record.id };
  }

  // Check if this was the last step
  if (step.step_number >= record.total_steps) {
    const { error } = await supabase.from('approval_records').update({
      status: 'approved',
      completed_at: new Date().toISOString(),
    } as any).eq('id', record.id);
    if (error) throw error;
    return { status: 'approved', recordId: record.id };
  }

  // Move to next step
  const { error } = await supabase.from('approval_records').update({
    current_step: step.step_number + 1,
  } as any).eq('id', record.id);
  if (error) throw error;

  return { status: 'in_progress', recordId: record.id, nextStep: step.step_number + 1 };
}
