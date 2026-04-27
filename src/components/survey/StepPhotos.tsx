import { useRef, useState } from "react";
import { supabase } from "@/integrations/api/supabase-compat";
import { filesApi } from "@/integrations/api/files";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { PHOTO_CATEGORIES } from "@/types/survey";
import type { SurveyPhoto } from "@/types/survey";
import { Camera, X, ZoomIn } from "lucide-react";

interface Props {
  surveyId: string;
  photos: SurveyPhoto[];
  onRefresh: () => void;
  readOnly?: boolean;
}

export function StepPhotos({ surveyId, photos, onRefresh, readOnly }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const totalCount = photos.length;

  const handleUpload = async (file: File, category: string) => {
    setUploadingCat(category);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${surveyId}/${category}_${Date.now()}.${ext}`;
      const _ul = await filesApi.legacyUpload("survey-photos", path, file); const uploadError = _ul.error;
      if (uploadError) throw uploadError;

      await supabase.from("survey_photos").insert({
        survey_id: surveyId,
        category,
        file_path: path,
        sort_order: photos.filter(p => p.category === category).length,
      });

      toast({ title: "업로드 완료" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (photo: SurveyPhoto) => {
    try {
      await filesApi.remove("survey-photos", photo.file_path);
      await supabase.from("survey_photos").delete().eq("id", photo.id);
      toast({ title: "삭제되었습니다" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    }
  };

  const getPublicUrl = (path: string) => {
    const data = { publicUrl: filesApi.getUrl("survey-photos", path, { inline: true }) };
    return data.publicUrl;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">⑥ 사진대장</h3>
        <Badge variant="outline">총 {totalCount}장 업로드됨</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PHOTO_CATEGORIES.map(cat => {
          const catPhotos = photos.filter(p => p.category === cat.code);
          return (
            <Card key={cat.code} className="overflow-hidden">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{cat.label}</span>
                  {catPhotos.length > 0 && <Badge variant="secondary" className="text-[10px]">{catPhotos.length}</Badge>}
                </div>

                {catPhotos.length > 0 && (
                  <div className="grid grid-cols-2 gap-1">
                    {catPhotos.map(p => (
                      <div key={p.id} className="relative group aspect-square bg-muted rounded overflow-hidden">
                        <img
                          src={getPublicUrl(p.file_path)}
                          alt={cat.label}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => setPreviewUrl(getPublicUrl(p.file_path))}
                        />
                        {!readOnly && (
                          <button
                            onClick={() => handleDelete(p)}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    disabled={uploadingCat === cat.code}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "image/*";
                      input.capture = "environment";
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) handleUpload(file, cat.code);
                      };
                      input.click();
                    }}
                  >
                    {uploadingCat === cat.code ? "업로드 중..." : (
                      <>
                        <Camera className="h-3.5 w-3.5 mr-1" />
                        {catPhotos.length === 0 ? "촬영/업로드" : "추가"}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-2xl p-2">
          {previewUrl && <img src={previewUrl} alt="preview" className="w-full rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
