const DEFAULT_HANCOM_BRIDGE_URL = "http://127.0.0.1:43127";

function bridgeUrl() {
  return (import.meta.env.VITE_HANCOM_BRIDGE_URL || DEFAULT_HANCOM_BRIDGE_URL).replace(/\/$/, "");
}

export async function checkHancomPdfConverter(): Promise<boolean> {
  try {
    const response = await fetch(`${bridgeUrl()}/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const result = await response.json() as { available?: boolean };
    return result.available === true;
  } catch {
    return false;
  }
}

export async function convertHwpxToPdfWithHancom(hwpx: Blob): Promise<{ blob: Blob; pageCount: number }> {
  let response: Response;
  try {
    response = await fetch(`${bridgeUrl()}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/hwp+zip" },
      body: hwpx,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error("한컴 PDF 변환 서비스를 연결하지 못했습니다. ParkMaster를 다시 실행한 뒤 한컴오피스 설치 상태를 확인해 주세요.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "한컴에서 PDF를 생성하지 못했습니다.");
  }
  const blob = await response.blob();
  const signature = new TextDecoder("latin1").decode(new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
  if (signature !== "%PDF-") throw new Error("한컴 변환 결과가 올바른 PDF가 아닙니다.");
  const pageCount = Math.max(1, Number(response.headers.get("X-PDF-Page-Count")) || 1);
  return { blob: new Blob([await blob.arrayBuffer()], { type: "application/pdf" }), pageCount };
}
