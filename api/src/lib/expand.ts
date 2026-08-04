/**
 * GET 라우트의 ?expand= 옵션 처리 헬퍼.
 *
 * Supabase의 `select("*, parking_lots(code, name)")` 패턴을
 * 백엔드에서 직접 LEFT JOIN으로 처리한다. shim의 polyfill보다 효율적.
 *
 * 사용:
 *   const expand = parseExpand(req.query.expand, ALLOWED_EXPANSIONS);
 *   const { selectClause, joinClause } = buildExpand(expand);
 *   const sql = `SELECT ${selectClause} FROM main_table m ${joinClause} WHERE ...`;
 *
 * 안전:
 *   - 허용된 확장만 처리 (SQL injection 방지)
 *   - 컬럼명도 화이트리스트
 */

export interface ExpansionDef {
  /** Supabase에서의 키 이름 (예: parking_lots, surveyor) */
  alias: string;
  /** 실제 부모 테이블명 (예: parking_lots, profiles) */
  table: string;
  /** 메인 테이블의 외래키 컬럼 */
  fkColumn: string;
  /** 가져올 부모 테이블 컬럼 (화이트리스트) */
  cols: string[];
}

/**
 * 라우트별 허용 expansion 정의.
 *
 * 예: parking_lots 정보를 가져올 수 있는 테이블의 fkColumn 매핑.
 */
export const COMMON_EXPANSIONS: Record<string, ExpansionDef> = {
  parking_lots: {
    alias: "parking_lots",
    table: "parking_lots",
    fkColumn: "lot_id",
    cols: ["id", "code", "name", "address_jibun", "address_road", "lot_type", "total_spaces", "latitude", "longitude"],
  },
  profiles: {
    alias: "profiles",
    table: "profiles",
    fkColumn: "user_id",
    cols: ["id", "name", "email", "team", "role"],
  },
  // assigned_to 컬럼이 profiles를 가리키는 경우 별도 alias
  assignee: {
    alias: "assignee",
    table: "profiles",
    fkColumn: "assigned_to",
    cols: ["id", "name", "email", "team"],
  },
  surveyor: {
    alias: "surveyor",
    table: "profiles",
    fkColumn: "surveyor_id",
    cols: ["id", "name", "email", "team"],
  },
  reviewer: {
    alias: "reviewer",
    table: "profiles",
    fkColumn: "reviewer_id",
    cols: ["id", "name", "email"],
  },
  approver: {
    alias: "approver",
    table: "profiles",
    fkColumn: "approver_id",
    cols: ["id", "name", "email"],
  },
  supervisor: {
    alias: "supervisor",
    table: "profiles",
    fkColumn: "supervisor_id",
    cols: ["id", "name", "email"],
  },
  inspector: {
    alias: "inspector",
    table: "profiles",
    fkColumn: "inspector_id",
    cols: ["id", "name", "email"],
  },
  bid_projects: {
    alias: "bid_projects",
    table: "bid_projects",
    fkColumn: "bid_project_id",
    cols: ["id", "title", "bid_number", "bid_type", "status"],
  },
  service_projects: {
    alias: "service_projects",
    table: "service_projects",
    fkColumn: "project_id",
    cols: ["id", "title", "project_number", "status"],
  },
  equipment: {
    alias: "equipment",
    table: "equipment",
    fkColumn: "equipment_id",
    cols: ["id", "equipment_code", "name", "equipment_type", "status"],
  },
  budget_items: {
    alias: "budget_items",
    table: "budget_items",
    fkColumn: "item_id",
    cols: ["id", "item_code", "item_name", "category_l1"],
  },
  surveys: {
    alias: "surveys",
    table: "surveys",
    fkColumn: "survey_id",
    cols: ["id", "lot_id", "status", "survey_type", "survey_date"],
  },
  report_templates: {
    alias: "template",
    table: "report_templates",
    fkColumn: "template_id",
    cols: ["id", "template_code", "template_name"],
  },
};

/**
 * ?expand=parking_lots,profiles 같은 파라미터를 파싱.
 * allowed에 명시된 것만 통과 (whitelist).
 */
export function parseExpand(
  raw: string | undefined,
  allowed: string[],
): ExpansionDef[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.includes(s) && COMMON_EXPANSIONS[s])
    .map((s) => COMMON_EXPANSIONS[s]);
}

/**
 * SELECT clause + LEFT JOIN clause 생성.
 *
 * 메인 테이블 alias: `m`
 * 각 expansion alias: `e_{alias}`
 *
 * 반환된 selectClause는 main 컬럼 + 각 expansion에 대한 jsonb_build_object를 포함.
 */
export function buildExpand(expansions: ExpansionDef[], mainCols = "m.*"): {
  selectClause: string;
  joinClause: string;
} {
  if (expansions.length === 0) {
    return { selectClause: mainCols, joinClause: "" };
  }

  const selectParts: string[] = [mainCols];
  const joinParts: string[] = [];

  for (const exp of expansions) {
    const a = `e_${exp.alias}`;
    const jsonObj = exp.cols
      .map((col) => `'${col}', ${a}.${col}`)
      .join(", ");
    // null 부모는 null 객체로 (전 컬럼 null이면)
    selectParts.push(
      `CASE WHEN ${a}.id IS NULL THEN NULL ELSE jsonb_build_object(${jsonObj}) END AS ${exp.alias}`,
    );
    joinParts.push(
      `LEFT JOIN ${exp.table} ${a} ON ${a}.id = m.${exp.fkColumn}`,
    );
  }

  return {
    selectClause: selectParts.join(",\n  "),
    joinClause: joinParts.join("\n  "),
  };
}

/** 라우트별 허용 expand 목록 (편의 헬퍼) */
export const EXPAND_FOR = {
  parking_lots: ["parking_lots"],
  complaints: ["parking_lots", "assignee"],
  surveys: ["parking_lots", "surveyor", "reviewer", "approver"],
  budget_items: ["parking_lots", "budget_plans"],
  budget_executions: ["parking_lots", "budget_items"],
  bid_evaluations: ["bid_projects"],
  bid_contracts: ["bid_projects"],
  service_projects: ["parking_lots", "supervisor", "inspector"],
  service_milestones: ["service_projects"],
  service_inspections: ["service_projects"],
  service_payments: ["service_projects"],
  service_issues: ["service_projects"],
  enforcement_records: ["parking_lots"],
  equipment: ["parking_lots"],
  fee_policies: ["parking_lots"],
  fee_exemptions: ["parking_lots"],
  monthly_passes: ["parking_lots"],
  outsourcing_contracts: ["parking_lots"],
  gateway_devices: ["parking_lots"],
  display_boards: ["parking_lots"],
  report_generated: ["report_templates"],
  maintenance_logs: ["parking_lots", "equipment"],
  maintenance_schedules: ["parking_lots", "equipment", "assignee"],
  notifications: ["profiles"],
  approval_steps: ["assignee"],
  active_sessions: ["profiles"],
};
