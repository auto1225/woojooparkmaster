import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageSquare, AlertOctagon, Clock, Inbox, Timer, Plus, Search, AlertTriangle } from "lucide-react";
import { CHANNEL_LABELS, CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, COMPLAINT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, getDDay } from "@/types/complaint";

export default function ComplaintDashboard() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  const { data: complaints } = useQuery({
    queryKey: ["complaints"],
    queryFn: async () => {
      const { data } = await supabase
        .from("complaints")
        .select("*, parking_lots(code, name), profiles!complaints_assigned_to_fkey(name, team)")
        .order("received_at", { ascending: false });
      return data || [];
    },
  });

  const stats = useMemo(() => {
    if (!complaints) return { open: 0, urgent: 0, overdue: 0, today: 0, avgDays: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const open = complaints.filter(c => !["closed", "responded"].includes(c.status));
    const urgent = open.filter(c => c.priority === "urgent");
    const overdue = open.filter(c => c.is_overdue);
    const todayCount = complaints.filter(c => c.received_at?.slice(0, 10) === today);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recent = complaints.filter(c => c.closed_at && new Date(c.received_at) >= thirtyDaysAgo);
    const avgDays = recent.length
      ? recent.reduce((s, c) => s + (new Date(c.closed_at!).getTime() - new Date(c.received_at).getTime()) / 86400000, 0) / recent.length
      : 0;

    return { open: open.length, urgent: urgent.length, overdue: overdue.length, today: todayCount.length, avgDays: Math.round(avgDays * 10) / 10 };
  }, [complaints]);

  const filtered = useMemo(() => {
    let list = complaints || [];
    if (statusTab === "open") list = list.filter(c => !["closed", "responded"].includes(c.status));
    else if (statusTab === "responded") list = list.filter(c => c.status === "responded");
    else if (statusTab === "closed") list = list.filter(c => c.status === "closed");

    if (categoryFilter !== "all") list = list.filter(c => c.category === categoryFilter);
    if (priorityFilter !== "all") list = list.filter(c => c.priority === priorityFilter);
    if (channelFilter !== "all") list = list.filter(c => c.channel === channelFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.complaint_number?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.complainant_name?.toLowerCase().includes(q) ||
        c.vehicle_number?.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (b.priority === "urgent" && a.priority !== "urgent") return 1;
      if (a.is_overdue && !b.is_overdue) return -1;
      if (b.is_overdue && !a.is_overdue) return 1;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });
  }, [complaints, statusTab, categoryFilter, priorityFilter, channelFilter, search]);

  const kpis = [
    { label: "미처리 민원", value: stats.open, icon: MessageSquare, color: "text-blue-600" },
    { label: "긴급 민원", value: stats.urgent, icon: AlertOctagon, color: "text-red-600", blink: stats.urgent > 0 },
    { label: "기한 초과", value: stats.overdue, icon: Clock, color: "text-orange-600" },
    { label: "오늘 접수", value: stats.today, icon: Inbox, color: "text-green-600" },
    { label: "평균 처리일", value: `${stats.avgDays}일`, icon: Timer, color: "text-purple-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">민원관리</h2>
          <Button size="sm" onClick={() => navigate("/complaints/new")}><Plus className="h-4 w-4 mr-1" />민원 접수</Button>
        </div>

        {(stats.urgent > 0 || stats.overdue > 0) && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive font-medium">
              {stats.urgent > 0 && `긴급 민원 ${stats.urgent}건`}
              {stats.urgent > 0 && stats.overdue > 0 && " / "}
              {stats.overdue > 0 && `기한 초과 ${stats.overdue}건`}
              이 있습니다
            </span>
            <Button variant="link" size="sm" className="text-destructive ml-auto p-0 h-auto" onClick={() => setPriorityFilter("urgent")}>바로 확인</Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {kpis.map(k => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className={`h-4 w-4 ${k.color} ${k.blink ? "animate-pulse" : ""}`} />
                  <span className="text-[10px] text-muted-foreground uppercase">{k.label}</span>
                </div>
                <span className="text-2xl font-bold">{k.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="민원번호, 제목, 민원인, 차량번호" value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="유형" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue placeholder="우선순위" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-28 h-9 text-sm"><SelectValue placeholder="채널" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={statusTab} onValueChange={setStatusTab}>
          <TabsList>
            <TabsTrigger value="all">전체 ({complaints?.length || 0})</TabsTrigger>
            <TabsTrigger value="open">미처리 ({stats.open})</TabsTrigger>
            <TabsTrigger value="responded">회신완료</TabsTrigger>
            <TabsTrigger value="closed">완결</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">민원번호</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead className="min-w-[200px]">제목</TableHead>
                  <TableHead>주차장</TableHead>
                  <TableHead>민원인</TableHead>
                  <TableHead>채널</TableHead>
                  <TableHead>접수일</TableHead>
                  <TableHead>기한</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>우선순위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => {
                  const dday = getDDay(c.due_date);
                  const isUrgent = c.priority === "urgent";
                  return (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer hover:bg-muted/50 ${c.is_overdue ? "bg-destructive/5" : ""} ${isUrgent ? "border-l-2 border-l-destructive" : ""}`}
                      onClick={() => navigate(`/complaints/${c.id}`)}
                    >
                      <TableCell className="text-xs font-mono">{c.complaint_number}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[c.category] || c.category}</Badge></TableCell>
                      <TableCell className="text-sm truncate max-w-[250px]">{c.title}</TableCell>
                      <TableCell className="text-xs">{(c as any).parking_lots?.name || "-"}</TableCell>
                      <TableCell className="text-xs">{c.is_anonymous ? "익명" : c.complainant_name || "-"}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{CHANNEL_LABELS[c.channel] || c.channel}</Badge></TableCell>
                      <TableCell className="text-xs">{c.received_at?.slice(0, 10)}</TableCell>
                      <TableCell className={`text-xs font-medium ${dday.isOverdue ? "text-destructive" : ""}`}>{dday.text}</TableCell>
                      <TableCell className="text-xs">{(c as any).profiles?.name || "-"}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${COMPLAINT_STATUS_COLORS[c.status] || ""}`}>{COMPLAINT_STATUS_LABELS[c.status] || c.status}</Badge></TableCell>
                      <TableCell><Badge className={`text-[10px] ${PRIORITY_COLORS[c.priority] || ""}`}>{PRIORITY_LABELS[c.priority] || c.priority}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">민원이 없습니다</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
