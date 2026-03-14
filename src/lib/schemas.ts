import { z } from 'zod';
import { validateBusinessNumber, VEHICLE_NUMBER_REGEX } from './validators';

/** 주차장 등록/수정 스키마 */
export const parkingLotSchema = z
  .object({
    name: z.string().min(1, '주차장명을 입력해주세요').max(200),
    code: z.string().regex(/^PL-\d{3,}$/, '코드 형식: PL-001'),
    address_jibun: z.string().optional(),
    address_road: z.string().optional(),
    latitude: z.coerce.number().min(33.0).max(38.7).optional().or(z.literal(undefined)),
    longitude: z.coerce.number().min(124.5).max(132.0).optional().or(z.literal(undefined)),
    lot_type: z.enum(['offstreet', 'onstreet', 'multilevel', 'vacant_lot', 'underground']),
    total_spaces: z.coerce.number().min(0, '0 이상 입력').max(10000),
    floors: z.coerce.number().min(1).default(1),
    operator_type: z.enum(['direct', 'outsourced', 'other']),
    operator_name: z.string().optional(),
    surface_type: z.enum(['ascon', 'block', 'concrete', 'other']).optional(),
    power_status: z.enum(['supplied', 'available', 'unavailable']).optional(),
    network_type: z.string().optional(),
    status: z.enum(['active', 'inactive', 'construction', 'closed']).default('active'),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.operator_type === 'outsourced' && !data.operator_name) return false;
      return true;
    },
    { message: '위탁운영 시 업체명을 입력해주세요', path: ['operator_name'] }
  );

/** 민원 접수 스키마 */
export const complaintSchema = z.object({
  title: z.string().min(2, '제목을 2자 이상 입력해주세요').max(200),
  content: z.string().min(10, '내용을 10자 이상 입력해주세요'),
  channel: z.string().min(1, '접수 채널을 선택해주세요'),
  category: z.string().min(1, '민원 유형을 선택해주세요'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  complainant_phone: z
    .string()
    .regex(/^01[016789]-?\d{3,4}-?\d{4}$/, '올바른 전화번호를 입력해주세요')
    .optional()
    .or(z.literal('')),
  complainant_email: z
    .string()
    .email('올바른 이메일을 입력해주세요')
    .optional()
    .or(z.literal('')),
  vehicle_number: z
    .string()
    .regex(VEHICLE_NUMBER_REGEX, '올바른 차량번호 형식이 아닙니다 (예: 12가3456)')
    .optional()
    .or(z.literal('')),
});

/** 월정기권 스키마 */
export const monthlyPassSchema = z
  .object({
    vehicle_number: z.string().regex(VEHICLE_NUMBER_REGEX, '차량번호 형식: 12가3456'),
    lot_id: z.string().uuid(),
    pass_start: z.string().min(1, '시작일을 선택해주세요'),
    pass_end: z.string().min(1, '종료일을 선택해주세요'),
    fee_amount: z.coerce.number().min(0),
  })
  .refine((data) => new Date(data.pass_end) > new Date(data.pass_start), {
    message: '종료일은 시작일보다 이후여야 합니다',
    path: ['pass_end'],
  });

/** 예산 집행 스키마 */
export const budgetExecutionSchema = z.object({
  item_id: z.string().uuid('예산항목을 선택해주세요'),
  execution_date: z.string().min(1, '집행일을 선택해주세요'),
  amount: z.coerce.number().min(1, '금액은 1원 이상이어야 합니다'),
  execution_type: z.string().min(1),
  description: z.string().min(2, '내용을 입력해주세요'),
});

/** 위탁계약 스키마 */
export const outsourcingContractSchema = z
  .object({
    company_name: z.string().min(1, '업체명을 입력해주세요'),
    business_number: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val === '') return true;
          return validateBusinessNumber(val);
        },
        '올바른 사업자등록번호가 아닙니다'
      ),
    contract_start: z.string().min(1, '시작일을 선택해주세요'),
    contract_end: z.string().min(1, '종료일을 선택해주세요'),
    contract_amount: z.coerce.number().min(0),
  })
  .refine((data) => new Date(data.contract_end) > new Date(data.contract_start), {
    message: '종료일은 시작일보다 이후여야 합니다',
    path: ['contract_end'],
  });

export type ParkingLotFormData = z.infer<typeof parkingLotSchema>;
export type ComplaintFormData = z.infer<typeof complaintSchema>;
export type MonthlyPassFormData = z.infer<typeof monthlyPassSchema>;
export type BudgetExecutionFormData = z.infer<typeof budgetExecutionSchema>;
export type OutsourcingContractFormData = z.infer<typeof outsourcingContractSchema>;
