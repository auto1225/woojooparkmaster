import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemConfig } from "@/hooks/useSystemConfig";
import { LOT_TYPE_LABELS, OPERATOR_LABELS, SURFACE_LABELS, POWER_LABELS } from "@/types/database";
import type { LotType, OperatorType, SurfaceType, PowerStatus } from "@/types/database";
import { Camera } from "lucide-react";

function Check({ checked }: { checked: boolean }) {
  return <span>{checked ? "☑" : "☐"}</span>;
}

export default function SurveyPrint() {
  const { id } = useParams<{ id: string }>();
  const { data: config } = useSystemConfig();

  const { data: survey } = useQuery({
    queryKey: ["survey-print", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("surveys")
        .select("*, parking_lots(*), profiles!surveys_surveyor_id_fkey(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: basicInfo } = useQuery({
    queryKey: ["survey-basic-print", id],
    queryFn: async () => {
      const { data } = await supabase.from("survey_basic_info").select("*").eq("survey_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: operation } = useQuery({
    queryKey: ["survey-operation-print", id],
    queryFn: async () => {
      const { data } = await supabase.from("survey_operation").select("*").eq("survey_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: infra } = useQuery({
    queryKey: ["survey-infra-print", id],
    queryFn: async () => {
      const { data } = await supabase.from("survey_infra").select("*").eq("survey_id", id!).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: photos } = useQuery({
    queryKey: ["survey-photos-print", id],
    queryFn: async () => {
      const { data } = await supabase.from("survey_photos").select("*").eq("survey_id", id!).order("category");
      return data || [];
    },
    enabled: !!id,
  });

  // Auto print after load
  useEffect(() => {
    if (survey && basicInfo) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [survey, basicInfo]);

  if (!survey) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">로딩 중...</div>;
  }

  const lot = survey.parking_lots as any;
  const orgName = config?.org_name || "제주시";
  const surveyDate = survey.survey_date ? new Date(survey.survey_date).toLocaleDateString("ko-KR") : "—";
  const surveyorName = (survey.profiles as any)?.name || "—";

  const PHOTO_CATEGORIES = [
    { key: "overview", label: "전경", size: "large" },
    { key: "full_view", label: "주차장 전체", size: "large" },
    { key: "entrance", label: "입구", size: "medium" },
    { key: "exit", label: "출구", size: "medium" },
    { key: "display_board", label: "안내전광판", size: "medium" },
    { key: "gateway", label: "게이트웨이", size: "medium" },
    { key: "booth", label: "관제부스", size: "medium" },
    { key: "gate_lpr", label: "차단기/LPR", size: "medium" },
    { key: "kiosk", label: "무인정산기", size: "medium" },
    { key: "cctv", label: "CCTV", size: "medium" },
  ];

  const getPhotoUrl = (category: string) => {
    const photo = photos?.find((p: any) => p.category === category);
    if (!photo) return null;
    const { data } = supabase.storage.from("survey-photos").getPublicUrl(photo.file_path);
    return data.publicUrl;
  };

  return (
    <div style={{ fontFamily: "Malgun Gothic, sans-serif", fontSize: 12, padding: "20mm", maxWidth: "210mm", margin: "0 auto" }}>
      {/* Page 1: 현황조사표 */}
      <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: "bold", marginBottom: 16 }}>
        {orgName} 유료 공영주차장 현황조사표
      </h2>

      <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #333" }}>
        <thead>
          <tr style={{ backgroundColor: "#1B3A5C", color: "#fff" }}>
            <th style={{ ...thStyle, width: "15%" }}>구 분</th>
            <th style={{ ...thStyle, width: "20%" }}>세부항목</th>
            <th style={{ ...thStyle, width: "45%" }}>조사내용</th>
            <th style={{ ...thStyle, width: "20%" }}>기 타</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdStyle} rowSpan={5}>기본현황</td>
            <td style={tdStyle}>주차장명</td>
            <td style={tdStyle}>{lot?.name || "—"}</td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>주소</td>
            <td style={tdStyle}>{lot?.address_road || lot?.address_jibun || "—"}</td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>주차장 유형</td>
            <td style={tdStyle}>
              {Object.entries(LOT_TYPE_LABELS).map(([k, v]) => (
                <span key={k} style={{ marginRight: 8 }}>
                  <Check checked={lot?.lot_type === k} /> {v}
                  {k === "multilevel" && lot?.lot_type === "multilevel" ? ` (${lot?.floors || 1}층)` : ""}
                </span>
              ))}
            </td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>운영주체</td>
            <td style={tdStyle}>
              {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                <span key={k} style={{ marginRight: 8 }}>
                  <Check checked={lot?.operator_type === k} /> {v}
                </span>
              ))}
              {lot?.operator_name ? ` (${lot.operator_name})` : ""}
            </td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>좌표</td>
            <td style={tdStyle}>{lot?.latitude && lot?.longitude ? `${lot.latitude}, ${lot.longitude}` : "—"}</td>
            <td style={tdStyle}></td>
          </tr>

          <tr>
            <td style={tdStyle} rowSpan={4}>시설현황</td>
            <td style={tdStyle}>총 주차면수</td>
            <td style={tdStyle}>{lot?.total_spaces || 0}대</td>
            <td style={tdStyle}>층별기입</td>
          </tr>
          <tr>
            <td style={tdStyle}>특수 주차면</td>
            <td style={tdStyle}>
              장애인: {lot?.disabled_spaces || 0}대, 전기차: {lot?.ev_spaces || 0}대,
              경형: {lot?.compact_spaces || 0}대, 임산부: {lot?.pregnant_spaces || 0}대
            </td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>면적</td>
            <td style={tdStyle}>{lot?.area_sqm ? `${lot.area_sqm}㎡` : "—"}</td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>바닥 포장재</td>
            <td style={tdStyle}>
              {Object.entries(SURFACE_LABELS).map(([k, v]) => (
                <span key={k} style={{ marginRight: 8 }}>
                  <Check checked={lot?.surface_type === k} /> {v}
                </span>
              ))}
            </td>
            <td style={tdStyle}></td>
          </tr>

          <tr>
            <td style={tdStyle} rowSpan={3}>설비현황</td>
            <td style={tdStyle}>설치 설비</td>
            <td style={tdStyle}>
              <Check checked={lot?.has_gate} /> 차단기{" "}
              <Check checked={lot?.has_lpr} /> LPR{" "}
              <Check checked={lot?.has_kiosk} /> 무인정산기{" "}
              <Check checked={lot?.has_cctv} /> CCTV{" "}
              <Check checked={lot?.has_display_board} /> 전광판{" "}
              <Check checked={lot?.has_sensor} /> 센서
            </td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>연계 시스템</td>
            <td style={tdStyle}>
              <Check checked={lot?.control_system_linked} /> 통합관제{" "}
              <Check checked={lot?.portal_linked} /> 주차포털
            </td>
            <td style={tdStyle}></td>
          </tr>
          <tr>
            <td style={tdStyle}>전기/통신</td>
            <td style={tdStyle}>
              전기: {lot?.power_status ? POWER_LABELS[lot.power_status as PowerStatus] : "—"} |
              통신: {lot?.network_type || "—"}
            </td>
            <td style={tdStyle}></td>
          </tr>

          {operation && (
            <>
              <tr>
                <td style={tdStyle} rowSpan={2}>운영현황</td>
                <td style={tdStyle}>운영시간</td>
                <td style={tdStyle}>
                  평일: {operation.weekday_start || "—"}~{operation.weekday_end || "—"} |
                  토: {operation.saturday_start || "—"}~{operation.saturday_end || "—"} |
                  일/공: {operation.holiday_start || "—"}~{operation.holiday_end || "—"}
                </td>
                <td style={tdStyle}></td>
              </tr>
              <tr>
                <td style={tdStyle}>요금정보</td>
                <td style={tdStyle}>
                  기본: {operation.base_fee || 0}원 ({operation.base_time || 0}분),
                  추가: {operation.extra_fee || 0}원 ({operation.extra_time || 0}분),
                  1일: {operation.daily_max || 0}원,
                  월정기: {operation.monthly_pass_fee || 0}원
                </td>
                <td style={tdStyle}></td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span>소속: {orgName}</span>
        <span>조사자: {surveyorName}</span>
        <span>조사일자: {surveyDate}</span>
      </div>

      {/* Page 2-3: 사진대장 */}
      <div className="page-break" />
      <h2 style={{ textAlign: "center", fontSize: 16, fontWeight: "bold", marginBottom: 8 }}>사 진 대 장</h2>
      <p style={{ textAlign: "center", fontSize: 11, marginBottom: 16 }}>
        주차장명: {lot?.name} | {lot?.address_road || lot?.address_jibun || ""} | 촬영일: {surveyDate}
      </p>

      {/* Large photos */}
      {PHOTO_CATEGORIES.filter((c) => c.size === "large").map((cat) => {
        const url = getPhotoUrl(cat.key);
        return (
          <div key={cat.key} style={{ marginBottom: 16 }}>
            <div
              style={{
                backgroundColor: "#1B3A5C", color: "#fff", padding: "4px 8px",
                fontSize: 11, fontWeight: "bold",
              }}
            >
              {cat.label}
            </div>
            {url ? (
              <img src={url} alt={cat.label} style={{ width: "100%", maxHeight: 300, objectFit: "cover" }} />
            ) : (
              <div style={{
                width: "100%", height: 200, backgroundColor: "#f3f4f6",
                display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af",
              }}>
                사진 없음
              </div>
            )}
          </div>
        );
      })}

      <div className="page-break" />

      {/* Medium photos in 2-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {PHOTO_CATEGORIES.filter((c) => c.size === "medium").map((cat) => {
          const url = getPhotoUrl(cat.key);
          return (
            <div key={cat.key}>
              <div
                style={{
                  backgroundColor: "#1B3A5C", color: "#fff", padding: "3px 6px",
                  fontSize: 10, fontWeight: "bold",
                }}
              >
                {cat.label}
              </div>
              {url ? (
                <img src={url} alt={cat.label} style={{ width: "100%", height: 160, objectFit: "cover" }} />
              ) : (
                <div style={{
                  width: "100%", height: 160, backgroundColor: "#f3f4f6",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 11,
                }}>
                  사진 없음
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  border: "1px solid #333",
  padding: "6px 8px",
  textAlign: "center",
  fontSize: 11,
};

const tdStyle: React.CSSProperties = {
  border: "1px solid #999",
  padding: "5px 8px",
  fontSize: 11,
  verticalAlign: "top",
};
