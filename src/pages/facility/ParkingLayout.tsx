import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, Plus, Move, Type, Trash2, RotateCw } from "lucide-react";

interface ParkingSpace {
  id: string; x: number; y: number; w: number; h: number; rotation: number;
  number: string; type: 'general' | 'disabled' | 'ev' | 'compact' | 'pregnant';
  sensor_id?: string;
}
interface Road { points: number[][]; width: number }
interface Entrance { x: number; y: number; label: string }
interface LayoutData {
  width: number; height: number;
  spaces: ParkingSpace[];
  roads: Road[];
  entrances: Entrance[];
  exits: Entrance[];
  labels: { x: number; y: number; text: string }[];
}

const TYPE_COLORS: Record<string, string> = {
  general: '#3b82f6', disabled: '#eab308', ev: '#22c55e', compact: '#8b5cf6', pregnant: '#ec4899',
};
const TYPE_LABELS: Record<string, string> = {
  general: '일반', disabled: '장애인', ev: '전기차', compact: '경차', pregnant: '임산부',
};

const emptyLayout: LayoutData = { width: 800, height: 600, spaces: [], roads: [], entrances: [], exits: [], labels: [] };

export default function ParkingLayout() {
  const { lotId } = useParams<{ lotId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const svgRef = useRef<SVGSVGElement>(null);
  const isAdmin = profile?.role === 'admin';

  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<'select' | 'space' | 'text'>('select');
  const [layout, setLayout] = useState<LayoutData>(emptyLayout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const { data: lot } = useQuery({
    queryKey: ['lot-layout', lotId],
    queryFn: async () => {
      const { data } = await supabase.from('parking_lots').select('id, name, code, layout_data, total_spaces').eq('id', lotId!).single();
      return data;
    },
    enabled: !!lotId,
  });

  useEffect(() => {
    if (lot?.layout_data) {
      setLayout(lot.layout_data as unknown as LayoutData);
    }
  }, [lot]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('parking_lots').update({ layout_data: layout as any }).eq('id', lotId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lot-layout', lotId] });
      toast.success('배치도가 저장되었습니다');
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addSpace = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'space' || !editing) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * layout.width;
    const y = ((e.clientY - rect.top) / rect.height) * layout.height;
    const newSpace: ParkingSpace = {
      id: crypto.randomUUID(), x: Math.round(x - 15), y: Math.round(y - 25),
      w: 30, h: 50, rotation: 0, number: `P-${layout.spaces.length + 1}`, type: 'general',
    };
    setLayout(l => ({ ...l, spaces: [...l.spaces, newSpace] }));
    setSelectedId(newSpace.id);
    setTool('select');
  }, [tool, editing, layout.width, layout.height, layout.spaces.length]);

  const addLabel = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'text' || !editing) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * layout.width;
    const y = ((e.clientY - rect.top) / rect.height) * layout.height;
    setLayout(l => ({ ...l, labels: [...l.labels, { x: Math.round(x), y: Math.round(y), text: '구역명' }] }));
    setTool('select');
  }, [tool, editing, layout.width, layout.height]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'space') addSpace(e);
    else if (tool === 'text') addLabel(e);
    else setSelectedId(null);
  };

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (!editing || tool !== 'select') return;
    e.stopPropagation();
    setSelectedId(id);
    const space = layout.spaces.find(s => s.id === id);
    if (!space) return;
    setDragging({ id, startX: e.clientX, startY: e.clientY, origX: space.x, origY: space.y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragging.startX) / rect.width) * layout.width;
    const dy = ((e.clientY - dragging.startY) / rect.height) * layout.height;
    setLayout(l => ({
      ...l,
      spaces: l.spaces.map(s => s.id === dragging.id ? { ...s, x: Math.round(dragging.origX + dx), y: Math.round(dragging.origY + dy) } : s),
    }));
  }, [dragging, layout.width, layout.height]);

  const handleMouseUp = () => setDragging(null);

  const selectedSpace = layout.spaces.find(s => s.id === selectedId);

  const updateSelectedSpace = (updates: Partial<ParkingSpace>) => {
    setLayout(l => ({
      ...l,
      spaces: l.spaces.map(s => s.id === selectedId ? { ...s, ...updates } : s),
    }));
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setLayout(l => ({ ...l, spaces: l.spaces.filter(s => s.id !== selectedId) }));
    setSelectedId(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
            <h2 className="text-lg font-bold">{lot?.name || '주차장'} — 배치도</h2>
            <Badge variant="outline">{layout.spaces.length}면</Badge>
          </div>
          <div className="flex gap-2">
            {isAdmin && !editing && (
              <Button size="sm" onClick={() => setEditing(true)}>편집</Button>
            )}
            {editing && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditing(false); if (lot?.layout_data) setLayout(lot.layout_data as unknown as LayoutData); }}>취소</Button>
                <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" />저장
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Toolbar (edit mode) */}
          {editing && (
            <Card className="lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm">도구</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <Button variant={tool === 'select' ? 'default' : 'outline'} size="sm" className="w-full justify-start" onClick={() => setTool('select')}>
                  <Move className="h-3.5 w-3.5 mr-2" />선택/이동
                </Button>
                <Button variant={tool === 'space' ? 'default' : 'outline'} size="sm" className="w-full justify-start" onClick={() => setTool('space')}>
                  <Plus className="h-3.5 w-3.5 mr-2" />주차면 추가
                </Button>
                <Button variant={tool === 'text' ? 'default' : 'outline'} size="sm" className="w-full justify-start" onClick={() => setTool('text')}>
                  <Type className="h-3.5 w-3.5 mr-2" />텍스트 추가
                </Button>

                {selectedSpace && (
                  <div className="border-t pt-3 mt-3 space-y-2">
                    <p className="text-xs font-medium">속성</p>
                    <div>
                      <Label className="text-[10px]">면 번호</Label>
                      <Input value={selectedSpace.number} onChange={e => updateSelectedSpace({ number: e.target.value })} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px]">유형</Label>
                      <Select value={selectedSpace.type} onValueChange={v => updateSelectedSpace({ type: v as any })}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px]">회전 (°)</Label>
                      <div className="flex gap-1">
                        <Input type="number" value={selectedSpace.rotation} onChange={e => updateSelectedSpace({ rotation: Number(e.target.value) })} className="h-7 text-xs" />
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateSelectedSpace({ rotation: (selectedSpace.rotation + 90) % 360 })}>
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" className="w-full" onClick={deleteSelected}>
                      <Trash2 className="h-3 w-3 mr-1" />삭제
                    </Button>
                  </div>
                )}

                <div className="border-t pt-3 mt-3">
                  <p className="text-[10px] text-muted-foreground mb-1">범례</p>
                  <div className="space-y-1">
                    {Object.entries(TYPE_LABELS).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: TYPE_COLORS[k] }} />
                        <span className="text-[10px]">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* SVG Canvas */}
          <Card className={editing ? 'lg:col-span-3' : 'lg:col-span-4'}>
            <CardContent className="p-2">
              {layout.spaces.length === 0 && !editing ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <p className="text-sm">배치도가 등록되지 않았습니다</p>
                  {isAdmin && <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>배치도 편집</Button>}
                </div>
              ) : (
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${layout.width} ${layout.height}`}
                  className="w-full border rounded bg-gray-50 dark:bg-gray-900"
                  style={{ cursor: tool === 'space' ? 'crosshair' : tool === 'text' ? 'text' : 'default' }}
                  onClick={handleSvgClick}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                >
                  {/* Roads */}
                  {layout.roads.map((road, i) => (
                    <polyline key={`road-${i}`} points={road.points.map(p => p.join(',')).join(' ')}
                      fill="none" stroke="#94a3b8" strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
                  ))}

                  {/* Parking spaces */}
                  {layout.spaces.map(space => (
                    <g key={space.id} transform={`translate(${space.x + space.w / 2}, ${space.y + space.h / 2}) rotate(${space.rotation}) translate(${-space.w / 2}, ${-space.h / 2})`}
                      onMouseDown={e => handleMouseDown(e, space.id)}
                      style={{ cursor: editing && tool === 'select' ? 'grab' : 'pointer' }}>
                      <rect width={space.w} height={space.h} rx={2}
                        fill={TYPE_COLORS[space.type]} fillOpacity={0.3}
                        stroke={selectedId === space.id ? '#fff' : TYPE_COLORS[space.type]}
                        strokeWidth={selectedId === space.id ? 2 : 1} />
                      <text x={space.w / 2} y={space.h / 2} textAnchor="middle" dominantBaseline="middle"
                        fontSize={8} fill={TYPE_COLORS[space.type]} fontWeight="bold">
                        {space.number}
                      </text>
                    </g>
                  ))}

                  {/* Entrances/Exits */}
                  {layout.entrances.map((e, i) => (
                    <g key={`ent-${i}`}>
                      <circle cx={e.x} cy={e.y} r={8} fill="#22c55e" opacity={0.7} />
                      <text x={e.x} y={e.y + 16} textAnchor="middle" fontSize={8} fill="#22c55e">{e.label}</text>
                    </g>
                  ))}
                  {layout.exits.map((e, i) => (
                    <g key={`exit-${i}`}>
                      <circle cx={e.x} cy={e.y} r={8} fill="#ef4444" opacity={0.7} />
                      <text x={e.x} y={e.y + 16} textAnchor="middle" fontSize={8} fill="#ef4444">{e.label}</text>
                    </g>
                  ))}

                  {/* Labels */}
                  {layout.labels.map((lbl, i) => (
                    <text key={`lbl-${i}`} x={lbl.x} y={lbl.y} textAnchor="middle" fontSize={12} fill="#6b7280" fontWeight="bold">{lbl.text}</text>
                  ))}
                </svg>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
