import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { name: "1월", value: 2400, prev: 2100 },
  { name: "2월", value: 1398, prev: 1800 },
  { name: "3월", value: 4800, prev: 3200 },
  { name: "4월", value: 3908, prev: 2780 },
  { name: "5월", value: 4800, prev: 3890 },
  { name: "6월", value: 3800, prev: 4300 },
  { name: "7월", value: 4300, prev: 3800 },
  { name: "8월", value: 5200, prev: 4100 },
  { name: "9월", value: 4900, prev: 4600 },
  { name: "10월", value: 6100, prev: 5200 },
  { name: "11월", value: 5800, prev: 5500 },
  { name: "12월", value: 7200, prev: 5900 },
];

export function OverviewChart() {
  return (
    <div className="rounded-md border bg-card">
      <div className="border-b px-5 py-3.5 flex items-center justify-between">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground">
          트래픽 개요
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-[10px] font-mono text-muted-foreground">올해</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-border" />
            <span className="text-[10px] font-mono text-muted-foreground">전년</span>
          </div>
        </div>
      </div>
      <div className="p-5 pt-2">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(215, 80%, 52%)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="hsl(215, 80%, 52%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 90%)" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "hsl(220, 6%, 46%)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "hsl(220, 6%, 46%)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                fontFamily: "IBM Plex Sans",
                background: "hsl(0, 0%, 100%)",
                border: "1px solid hsl(220, 10%, 90%)",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
              }}
            />
            <Area
              type="monotone"
              dataKey="prev"
              stroke="hsl(220, 10%, 82%)"
              strokeWidth={1.5}
              fill="none"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(215, 80%, 52%)"
              strokeWidth={2}
              fill="url(#colorValue)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
