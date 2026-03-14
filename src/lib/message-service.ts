import { supabase } from "@/integrations/supabase/client";

export interface SendMessageParams {
  channel: 'alimtalk' | 'sms' | 'lms' | 'email';
  recipientPhone: string;
  recipientName?: string;
  templateCode?: string;
  title?: string;
  content: string;
  variables?: Record<string, string>;
  module: string;
  refId?: string;
  refType?: string;
}

export async function sendMessage(params: SendMessageParams) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('인증 필요');

  const { data, error } = await supabase.from('message_logs').insert({
    message_type: 'notification',
    channel: params.channel,
    recipient_name: params.recipientName || null,
    recipient_phone: params.recipientPhone,
    template_code: params.templateCode || null,
    title: params.title || null,
    content: params.content,
    variables: params.variables || null,
    module: params.module,
    ref_id: params.refId || null,
    ref_type: params.refType || null,
    status: 'pending',
    created_by: user.id,
  } as any).select().single();

  if (error) throw error;
  return data;
}

export const ALIMTALK_TEMPLATES = {
  monthly_pass_expire: {
    code: 'PM_PASS_EXPIRE',
    title: '월정기권 만료 안내',
    content: '#{주차장명} 월정기권이 #{만료일}에 만료됩니다. 갱신을 원하시면 주차장 관리소에 문의해주세요.',
    variables: ['주차장명', '만료일', '차량번호'],
  },
  enforcement_notice: {
    code: 'PM_ENFORCE',
    title: '주차위반 단속 통보',
    content: '#{차량번호} 차량이 #{위반일시}에 #{주차장명}에서 #{위반유형}으로 단속되었습니다. 과태료: #{금액}원',
    variables: ['차량번호', '위반일시', '주차장명', '위반유형', '금액'],
  },
  complaint_result: {
    code: 'PM_COMPLAINT',
    title: '민원 처리 결과 안내',
    content: '접수하신 민원(#{민원번호})의 처리가 완료되었습니다.\n처리결과: #{처리결과}\n상세 내용은 주차관리과(#{전화번호})로 문의해주세요.',
    variables: ['민원번호', '처리결과', '전화번호'],
  },
} as const;

export function fillTemplate(templateContent: string, variables: Record<string, string>): string {
  let result = templateContent;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`#\\{${key}\\}`, 'g'), value);
  }
  return result;
}
