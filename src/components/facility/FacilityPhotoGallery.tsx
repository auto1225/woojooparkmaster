import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Cloud, ExternalLink, HardDrive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FacilityPhotoPicker } from "@/components/facility/FacilityPhotoPicker";
import { useAuthorization } from "@/hooks/useAuthorization";
import {
  getFacilityPhotoUrl,
  listFacilityRecordPhotos,
  type FacilityPhotoRefType,
} from "@/lib/facility-field-work";
import {
  getLocalFacilityPhotoFile,
  listLocalFacilityPhotos,
  saveFacilityRecordPhotosLocally,
  type LocalFacilityPhoto,
} from "@/lib/facility-local-photos";
import { toast } from "sonner";

type Props = {
  refType: FacilityPhotoRefType;
  refId: string;
  title?: string;
  category?: string;
};

export function FacilityPhotoGallery({ refType, refId, title = "현장 사진", category = "record_photo" }: Props) {
  const queryClient = useQueryClient();
  const { canEdit } = useAuthorization("FACILITY");
  const [files, setFiles] = useState<File[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const queryKey = ["facility-record-photos", refType, refId, category];
  const { data: photos = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const [localResult, remoteResult] = await Promise.allSettled([
        listLocalFacilityPhotos(refType, refId, category),
        listFacilityRecordPhotos(refType, refId, category),
      ]);
      const local = localResult.status === "fulfilled" ? localResult.value.map((photo) => ({
        id: `local:${photo.id}`, fileName: photo.fileName, createdAt: photo.createdAt,
        source: "local" as const, localPhoto: photo,
      })) : [];
      const remote = remoteResult.status === "fulfilled" ? remoteResult.value.map((photo) => ({
        id: `remote:${photo.id}`, fileName: photo.file_name, createdAt: photo.created_at || "",
        source: "remote" as const, filePath: photo.file_path,
      })) : [];
      return [...local, ...remote].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    enabled: Boolean(refId),
  });
  const uploadMutation = useMutation({
    mutationFn: () => saveFacilityRecordPhotosLocally(refType, refId, files, category),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey });
      if (result.saveErrors.length) {
        toast.error(`사진 ${result.savedPaths.length}장 PC 저장, ${result.saveErrors.length}장 실패했습니다.`, {
          description: result.saveErrors.join("\n"),
        });
      } else {
        toast.success(`사진 ${result.savedPaths.length}장을 지정한 PC 폴더에 저장했습니다.`);
        setFiles([]);
        setPickerOpen(false);
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openRemotePhoto = async (filePath: string) => {
    try {
      window.open(await getFacilityPhotoUrl(filePath), "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "사진을 열지 못했습니다.");
    }
  };

  const openLocalPhoto = async (photo: LocalFacilityPhoto) => {
    try {
      const file = await getLocalFacilityPhotoFile(photo);
      const url = URL.createObjectURL(file);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PC에 저장된 사진을 열지 못했습니다.");
    }
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Camera className="h-4 w-4" />{title} <span className="font-normal text-muted-foreground">{photos.length}장</span></h3>
        {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen((value) => !value)}>{pickerOpen ? "닫기" : "사진 추가"}</Button>}
      </div>
      {pickerOpen && (
        <div className="space-y-2">
          <FacilityPhotoPicker files={files} onFilesChange={setFiles} label="추가할 사진" />
          <Button className="w-full" disabled={!files.length || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
            {uploadMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />PC에 저장 중</> : `${files.length}장 PC에 저장`}
          </Button>
        </div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">사진을 불러오는 중...</p> : photos.length ? (
        <div className="divide-y rounded-md border">
          {photos.map((photo) => (
            <div className="flex items-center gap-3 px-3 py-2 text-sm" key={photo.id}>
              {photo.source === "local" ? <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" /> : <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{photo.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{photo.createdAt ? new Date(photo.createdAt).toLocaleDateString("ko-KR") : ""}</span>
              <Button type="button" variant="ghost" size="icon" title={photo.source === "local" ? "PC 사진 열기" : "기존 원격 사진 열기"} onClick={() => void (photo.source === "local" ? openLocalPhoto(photo.localPhoto) : openRemotePhoto(photo.filePath))}><ExternalLink className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">이 PC 또는 기존 원격 저장소에 연결된 현장 사진이 없습니다.</p>}
    </section>
  );
}
