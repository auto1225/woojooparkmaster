import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/api/supabase-compat";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/activity-logger";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedLotId?: string;
}

export function NewSurveyDialog({ open, onOpenChange, preselectedLotId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [lotId, setLotId] = useState(preselectedLotId || "");
  const [surveyType, setSurveyType] = useState("initial");
  const [surveyDate, setSurveyDate] = useState(new Date().toISOString().split("T")[0]);
  const [lotOpen, setLotOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const { data: lots } = useQuery({
    queryKey: ["parking-lots-for-survey"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parking_lots").select("id, code, name, lot_type").eq("status", "active").order("code");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: existingSurveys } = useQuery({
    queryKey: ["existing-active-surveys"],
    queryFn: async () => {
      const { data, error } = await supabase.from("surveys").select("lot_id, status, invalidated_at").in("status", ["draft", "in_progress", "submitted", "review", "rejected"]);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const activeLotIds = new Set((existingSurveys || []).filter((s: any) => !s.invalidated_at).map((s: any) => s.lot_id));
  const selectedLot = lots?.find((l: any) => l.id === lotId);
  const selectedLotHasActiveSurvey = activeLotIds.has(lotId);

  const handleCreate = async () => {
    if (!lotId || !user || selectedLotHasActiveSurvey) return;
    setCreating(true);
    try {
      const lot = lots?.find((l: any) => l.id === lotId) as any;

      const rpcResult = await (supabase.rpc as any)("create_survey_draft", {
        p_lot_id: lotId,
        p_survey_type: surveyType,
        p_survey_date: surveyDate,
      });
      let survey = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;

      // Compatibility path until the integrity migration is deployed.
      if (rpcResult.error) {
        if (rpcResult.error.code !== "PGRST202" && !/create_survey_draft|schema cache/i.test(rpcResult.error.message || "")) {
          throw rpcResult.error;
        }
        const { data: lotDetail, error: lotError } = await supabase.from("parking_lots").select("*").eq("id", lotId).single();
        if (lotError) throw lotError;
        const legacyCreate = await supabase.from("surveys").insert({
          lot_id: lotId, survey_type: surveyType, status: "draft" as any, surveyor_id: user.id, survey_date: surveyDate,
        }).select().single();
        if (legacyCreate.error) throw legacyCreate.error;
        survey = legacyCreate.data;
        const childResults = await Promise.all([
          supabase.from("survey_basic_info").insert({
            survey_id: survey.id, lot_name: lotDetail?.name, address: lotDetail?.address_jibun || lotDetail?.address_road,
            lot_type: lotDetail?.lot_type, operator_type: lotDetail?.operator_type, surface_type: lotDetail?.surface_type,
            total_spaces: lotDetail?.total_spaces || 0, disabled_spaces: lotDetail?.disabled_spaces || 0,
            ev_spaces: lotDetail?.ev_spaces || 0, compact_spaces: lotDetail?.compact_spaces || 0,
            pregnant_spaces: lotDetail?.pregnant_spaces || 0, entry_count: null, exit_count: null,
            gps_lat: lotDetail?.latitude ? Number(lotDetail.latitude) : null,
            gps_lng: lotDetail?.longitude ? Number(lotDetail.longitude) : null,
          }),
          supabase.from("survey_operation").insert({ survey_id: survey.id }),
          supabase.from("survey_infra").insert({ survey_id: survey.id }),
          supabase.from("survey_usage").insert({ survey_id: survey.id }),
          supabase.from("survey_sensor_plan").insert({ survey_id: survey.id }),
        ]);
        const childError = childResults.find(result => result.error)?.error;
        if (childError) {
          await supabase.from("surveys").delete().eq("id", survey.id);
          throw childError;
        }
      }

      if (!survey?.id) throw new Error("생성된 조사를 확인할 수 없습니다.");
      const surveyId = survey.id;

      await logActivity({
        module: "survey", action: "create",
        targetType: "survey", targetId: surveyId,
        targetName: lot?.name,
      });

      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast({ title: "조사가 생성되었습니다" });
      onOpenChange(false);
      navigate(`/surveys/${surveyId}`);
    } catch (err: any) {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>신규 조사 생성</DialogTitle>
          <DialogDescription>주차장을 선택하면 기존 정보를 불러와 현장조사 초안을 만듭니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>주차장 선택</Label>
            <Popover open={lotOpen} onOpenChange={setLotOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between text-sm">
                  {selectedLot ? `${(selectedLot as any).code} ${(selectedLot as any).name}` : "주차장을 선택하세요"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="코드 또는 이름으로 검색..." />
                  <CommandList>
                    <CommandEmpty>결과 없음</CommandEmpty>
                    <CommandGroup>
                      {(lots || []).map((l: any) => (
                        <CommandItem
                          key={l.id}
                          value={`${l.code} ${l.name}`}
                          disabled={activeLotIds.has(l.id)}
                          onSelect={() => { if (!activeLotIds.has(l.id)) { setLotId(l.id); setLotOpen(false); } }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", lotId === l.id ? "opacity-100" : "opacity-0")} />
                          <span className="font-mono text-xs mr-2">{l.code}</span>
                          <span className="text-sm">{l.name}</span>
                          <Badge variant="secondary" className="ml-2 text-[9px]">
                            {l.lot_type === "onstreet" ? "노상" : l.lot_type === "multilevel" ? "주차빌딩" : "노외"}
                          </Badge>
                          {activeLotIds.has(l.id) && <Badge variant="outline" className="ml-auto text-[9px] text-warning">진행중</Badge>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedLotHasActiveSurvey && (
              <p className="text-xs text-destructive" role="alert">이 주차장에는 완료되지 않은 조사가 있습니다. 기존 조사를 먼저 처리해 주세요.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>조사 유형</Label>
            <RadioGroup value={surveyType} onValueChange={setSurveyType} className="flex gap-4">
              <div className="flex items-center space-x-2"><RadioGroupItem value="initial" id="t-i" /><Label htmlFor="t-i" className="text-sm font-normal">최초조사</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="regular" id="t-r" /><Label htmlFor="t-r" className="text-sm font-normal">정기조사</Label></div>
              <div className="flex items-center space-x-2"><RadioGroupItem value="special" id="t-s" /><Label htmlFor="t-s" className="text-sm font-normal">특별조사</Label></div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>조사일</Label>
            <Input type="date" value={surveyDate} onChange={e => setSurveyDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleCreate} disabled={!lotId || creating || selectedLotHasActiveSurvey}>
            {creating ? "생성 중..." : "생성"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
