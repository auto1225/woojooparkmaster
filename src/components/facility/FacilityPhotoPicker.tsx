import { useEffect, useId, useState } from "react";
import { Camera, FolderOpen, HardDrive, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  chooseFacilityPhotoDirectory,
  getFacilityPhotoDirectoryStatus,
  type FacilityPhotoDirectoryStatus,
} from "@/lib/facility-local-photos";
import { toast } from "sonner";

type Props = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function mergeFacilityPhotoFiles(current: File[], incoming: File[]) {
  const valid = incoming.filter((file) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast.error(`${file.name}: JPG, PNG, WEBP 사진만 등록할 수 있습니다.`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`${file.name}: 사진은 한 장당 10MB 이하여야 합니다.`);
      return false;
    }
    return true;
  });
  const keyed = new Map(current.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]));
  valid.forEach((file) => keyed.set(`${file.name}:${file.size}:${file.lastModified}`, file));
  return [...keyed.values()].slice(0, 10);
}

export function FacilityPhotoPicker({
  files,
  onFilesChange,
  label = "현장 사진 (선택)",
  description = "현장에서 촬영하거나 기기에 저장된 사진을 선택할 수 있습니다.",
  disabled = false,
}: Props) {
  const inputId = useId();
  const [directory, setDirectory] = useState<FacilityPhotoDirectoryStatus>({ supported: true, configured: false, writable: false, directoryName: "" });
  const [choosingDirectory, setChoosingDirectory] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => void getFacilityPhotoDirectoryStatus().then((status) => active && setDirectory(status));
    refresh();
    window.addEventListener("parkmaster:facility-photo-directory", refresh);
    return () => {
      active = false;
      window.removeEventListener("parkmaster:facility-photo-directory", refresh);
    };
  }, []);

  const chooseDirectory = async () => {
    setChoosingDirectory(true);
    try {
      setDirectory(await chooseFacilityPhotoDirectory());
      toast.success("시설 사진 저장 폴더를 지정했습니다.");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error(error instanceof Error ? error.message : "사진 저장 폴더를 지정하지 못했습니다.");
      }
    } finally {
      setChoosingDirectory(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor={inputId}>{label}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{files.length}/10장</span>
      </div>
      <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {directory.writable ? `${directory.directoryName} 폴더에 저장` : directory.supported ? "사진 저장 폴더를 지정해 주세요" : "이 브라우저는 폴더 직접 저장을 지원하지 않습니다"}
            </p>
            <p className="text-[11px] text-muted-foreground">사진 파일은 Supabase가 아닌 이 PC에만 저장됩니다.</p>
          </div>
        </div>
        {directory.supported && (
          <Button type="button" variant="outline" size="sm" className="shrink-0" disabled={choosingDirectory || disabled} onClick={() => void chooseDirectory()}>
            {choosingDirectory ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="mr-1.5 h-3.5 w-3.5" />}
            {directory.configured ? directory.writable ? "폴더 변경" : "폴더 다시 연결" : "저장 폴더 지정"}
          </Button>
        )}
      </div>
      <input
        id={inputId}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        multiple
        disabled={disabled}
        onChange={(event) => {
          const input = event.currentTarget;
          const incoming = Array.from(input.files || []);
          void getFacilityPhotoDirectoryStatus().then((status) => {
            setDirectory(status);
            if (!status.writable) {
              toast.error(status.supported ? "사진을 선택하기 전에 저장 폴더를 지정해 주세요." : "현재 브라우저에서는 PC 폴더 직접 저장을 사용할 수 없습니다.");
              input.value = "";
              return;
            }
            onFilesChange(mergeFacilityPhotoFiles(files, incoming));
            input.value = "";
          });
        }}
      />
      <label
        htmlFor={inputId}
        className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 text-sm font-medium hover:bg-muted/40"
      >
        {files.length ? <ImagePlus className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {files.length ? "사진 더 추가" : "사진 촬영 또는 파일 선택"}
      </label>
      {files.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {files.map((file, index) => (
            <li className="flex items-center gap-2 px-3 py-2" key={`${file.name}:${file.size}:${file.lastModified}`}>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="선택 해제"
                onClick={() => onFilesChange(files.filter((_, itemIndex) => itemIndex !== index))}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
