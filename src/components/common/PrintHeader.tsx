import { useSystemConfig } from "@/hooks/useSystemConfig";

export function PrintHeader() {
  const { data: config } = useSystemConfig();
  const orgName = config?.org_name || "ParkMaster™";
  const now = new Date().toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="print-header">
      <div style={{
        display: "flex", justifyContent: "space-between",
        borderBottom: "1px solid #333", paddingBottom: 8, marginBottom: 16,
      }}>
        <div><strong>{orgName}</strong></div>
        <div style={{ fontSize: 12 }}>출력일: {now}</div>
      </div>
    </div>
  );
}
