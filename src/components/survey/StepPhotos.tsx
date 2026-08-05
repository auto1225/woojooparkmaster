import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { getSurveyPhotoCategories } from "@/types/survey";
import type { SurveyPhoto } from "@/types/survey";
import { X } from "lucide-react";
import { savePhotoOffline } from "@/lib/offline-survey";

interface Props {
  surveyId: string;
  photos: SurveyPhoto[];
  onRefresh: () => void;
  lotType?: string | null;
  readOnly?: boolean;
}

export function StepPhotos({ surveyId, photos, onRefresh, lotType, readOnly }: Props) {
  const [uploadingCat, setUploadingCat] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const totalCount = photos.length;

  useEffect(() => {
    let active = true;
    const loadSignedUrls = async () => {
      const entries = await Promise.all(photos.map(async (photo) => {
        const { data, error } = await supabase.storage
          .from("survey-photos")
          .createSignedUrl(photo.file_path, 60 * 10);
        return [photo.file_path, error ? "" : data.signedUrl] as const;
      }));
      if (active) setSignedUrls(Object.fromEntries(entries));
    };
    loadSignedUrls();
    return () => { active = false; };
  }, [photos]);

  const handleUpload = async (file: File, category: string) => {
    setUploadingCat(category);
    try {
      if (!navigator.onLine) {
        const ext = file.name.split(".").pop() || "jpg";
        await savePhotoOffline(surveyId, file, `${crypto.randomUUID()}.${ext}`, category, photos.filter(p => p.category === category).length);
        toast({ title: "사진이 오프라인 저장되었습니다", description: "연결되면 자동으로 업로드합니다." });
        return;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${surveyId}/${category}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("survey-photos").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: metadataError } = await supabase.from("survey_photos").insert({
        survey_id: surveyId,
        category,
        file_path: path,
        sort_order: photos.filter(p => p.category === category).length,
      });
      if (metadataError) {
        await supabase.storage.from("survey-photos").remove([path]);
        throw metadataError;
      }

      toast({ title: "업로드 완료" });
      onRefresh();
    } catch (err: any) {
      if (!navigator.onLine || /fetch|network|connection/i.test(err.message || "")) {
        const ext = file.name.split(".").pop() || "jpg";
        await savePhotoOffline(surveyId, file, `${crypto.randomUUID()}.${ext}`, category, photos.filter(p => p.category === category).length);
        toast({ title: "사진이 오프라인 저장되었습니다", description: "연결되면 자동으로 업로드합니다." });
      } else {
        toast({ title: "업로드 실패", description: err.message, variant: "destructive" });
      }
    } finally {
      setUploadingCat(null);
    }
  };

  const handleDelete = async (photo: SurveyPhoto) => {
    if (!window.confirm("이 현장 사진을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.")) return;
    try {
      const { error: metadataError } = await supabase.from("survey_photos").delete().eq("id", photo.id);
      if (metadataError) throw metadataError;
      const { error: storageError } = await supabase.storage.from("survey-photos").remove([photo.file_path]);
      if (storageError) {
        toast({ title: "사진 정보는 삭제됐지만 파일 정리가 필요합니다", description: storageError.message, variant: "destructive" });
      }
      toast({ title: "삭제되었습니다" });
      onRefresh();
    } catch (err: any) {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    }
  };

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from("survey-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold">⑥ 사진대장</h3>
        <Badge variant="outline">총 {totalCount}장 업로드됨</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {getSurveyPhotoCategories(lotType).map(cat => {
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
                          src={signedUrls[p.file_path] || undefined}
                          alt={cat.label}
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() => signedUrls[p.file_path] && setPreviewUrl(signedUrls[p.file_path])}
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
                  <div className="space-y-2">
                    <Input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      aria-label={`${cat.label} 사진 선택`}
                      className="h-11 cursor-pointer text-xs file:mr-2 file:border-0 file:bg-transparent file:text-xs file:font-medium"
                      disabled={uploadingCat === cat.code}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleUpload(file, cat.code);
                        event.target.value = "";
                      }}
                    />
                  </div>
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
