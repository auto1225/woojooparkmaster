const activities = [
  { id: 1, user: "김민수", action: "새 프로젝트 생성", target: "Q1 마케팅 캠페인", time: "2분 전", status: "완료" },
  { id: 2, user: "이서연", action: "리포트 제출", target: "월간 분석 보고서", time: "15분 전", status: "검토 중" },
  { id: 3, user: "박지훈", action: "데이터 업데이트", target: "사용자 세그먼트 A", time: "1시간 전", status: "완료" },
  { id: 4, user: "최유진", action: "설정 변경", target: "알림 규칙 #12", time: "2시간 전", status: "대기" },
  { id: 5, user: "정현우", action: "팀원 초대", target: "dev@company.com", time: "3시간 전", status: "완료" },
];

const statusStyles: Record<string, string> = {
  "완료": "bg-success/10 text-success",
  "검토 중": "bg-warning/10 text-warning",
  "대기": "bg-muted text-muted-foreground",
};

export function RecentActivity() {
  return (
    <div className="rounded-md border bg-card">
      <div className="border-b px-5 py-3.5">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
          최근 활동
        </h3>
      </div>
      <div className="divide-y">
        {activities.map((a) => (
          <div key={a.id} className="flex items-center gap-4 px-5 py-3 text-sm">
            <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
              <span className="text-[10px] font-medium">{a.user[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">{a.user}</span>
              <span className="text-muted-foreground mx-1">·</span>
              <span className="text-muted-foreground">{a.action}</span>
              <span className="text-muted-foreground mx-1">→</span>
              <span className="truncate">{a.target}</span>
            </div>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${statusStyles[a.status] || ""}`}>
              {a.status}
            </span>
            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">{a.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
