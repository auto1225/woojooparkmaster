/**
 * PrintPageWrapper — 인쇄/PDF 래퍼 컴포넌트
 * ─────────────────────────────────────────────
 * 인쇄 옵션 다이얼로그 + 자동 스케일 + 결재란
 */
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Printer, FileDown, Eye } from "lucide-react";

interface PrintPageWrapperProps {
  title: string;
  orgName: string;
  children: ReactNode;
  orientation?: 'portrait' | 'landscape';
  paperSize?: 'A4' | 'A3';
  fitToPage?: boolean;
  fitMode?: 'width' | 'height' | 'both';
  scale?: number;
  margins?: { top: string; right: string; bottom: string; left: string };
  showHeader?: boolean;
  showFooter?: boolean;
  showPrintDialog?: boolean;
  approvalSlots?: { title: string; name?: string }[];
}

// 자동 스케일 계산
function calculateAutoScale(
  el: HTMLElement,
  pageWidthMm: number,
  pageHeightMm: number,
  fitMode: 'width' | 'height' | 'both'
): number {
  const pxToMm = 0.2645833;
  const wMm = el.scrollWidth * pxToMm;
  const hMm = el.scrollHeight * pxToMm;
  let s = 1;
  if (fitMode === 'width' || fitMode === 'both') s = Math.min(s, pageWidthMm / wMm);
  if (fitMode === 'height' || fitMode === 'both') s = Math.min(s, pageHeightMm / hMm);
  return Math.max(s, 0.4);
}

// 용지 크기 → mm
const PAPER: Record<string, Record<string, { w: number; h: number }>> = {
  A4: { landscape: { w: 277, h: 190 }, portrait: { w: 190, h: 277 } },
  A3: { landscape: { w: 400, h: 277 }, portrait: { w: 277, h: 400 } },
};

const MARGINS_PRESETS = {
  normal: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  narrow: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  minimum: { top: '5mm', right: '5mm', bottom: '5mm', left: '5mm' },
};

export function PrintPageWrapper({
  title,
  orgName,
  children,
  orientation: initOrientation = 'landscape',
  paperSize: initPaper = 'A4',
  fitToPage = true,
  fitMode: initFitMode = 'width',
  scale: initScale,
  showHeader = true,
  showFooter = true,
  showPrintDialog = true,
  approvalSlots,
}: PrintPageWrapperProps) {
  const [orientation, setOrientation] = useState(initOrientation);
  const [paper, setPaper] = useState(initPaper);
  const [fitModeState, setFitModeState] = useState<'width' | 'both' | 'manual'>(initFitMode === 'both' ? 'both' : initFitMode === 'width' ? 'width' : 'width');
  const [manualScale, setManualScale] = useState(initScale ? initScale * 100 : 70);
  const [marginPreset, setMarginPreset] = useState<'normal' | 'narrow' | 'minimum'>('narrow');
  const [computedScale, setComputedScale] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);

  const computeScale = useCallback(() => {
    if (!contentRef.current || fitModeState === 'manual') return;
    const dims = PAPER[paper][orientation];
    const m = MARGINS_PRESETS[marginPreset];
    const mVal = parseInt(m.top);
    const pw = dims.w - mVal * 2;
    const ph = dims.h - mVal * 2;
    const s = calculateAutoScale(contentRef.current, pw, ph, fitModeState === 'both' ? 'both' : 'width');
    setComputedScale(s);
  }, [orientation, paper, fitModeState, marginPreset]);

  useEffect(() => {
    computeScale();
  }, [computeScale]);

  const activeScale = fitModeState === 'manual' ? manualScale / 100 : computedScale;
  const margin = MARGINS_PRESETS[marginPreset];

  const handlePrint = () => {
    window.print();
  };

  // Inject dynamic print CSS
  useEffect(() => {
    const styleId = 'dynamic-print-style';
    let style = document.getElementById(styleId) as HTMLStyleElement;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      @media print {
        @page {
          size: ${paper} ${orientation};
          margin: ${margin.top} ${margin.right} ${margin.bottom} ${margin.left};
        }
        .print-settings-bar { display: none !important; }
        nav, header, .sidebar, .no-print, footer,
        button:not(.print-only), .toast-container,
        [data-sidebar], [data-sonner-toaster] { display: none !important; }
        main, .main-content, [role="main"] {
          margin: 0 !important; padding: 0 !important;
          width: 100% !important; max-width: 100% !important;
        }
        body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        .print-content {
          width: 100% !important;
          overflow: visible !important;
        }
        .print-scalable {
          transform-origin: top left;
          transform: scale(${activeScale});
        }
        .print-table td, .print-table th {
          font-size: 9pt !important;
          padding: 3px 5px !important;
          white-space: nowrap;
          border: 0.5pt solid #ccc !important;
        }
        .print-table th {
          background-color: #1B3A5C !important;
          color: white !important;
          font-size: 8pt !important;
          -webkit-print-color-adjust: exact !important;
        }
        .print-total-row td {
          background-color: #E8F0FE !important;
          font-weight: bold !important;
          border-top: 2pt solid #1B3A5C !important;
          -webkit-print-color-adjust: exact !important;
        }
        .print-table thead { display: table-header-group; }
        .print-table tfoot { display: table-footer-group; }
        .page-break-before { page-break-before: always; }
        .no-page-break { page-break-inside: avoid; }
        .approval-box { page-break-inside: avoid; margin-top: 10mm; float: right; }
        .approval-box td { border: 1pt solid #333 !important; width: 25mm; height: 15mm; text-align: center; font-size: 9pt; }
        .approval-box .approval-title { height: 8mm; font-size: 8pt; font-weight: bold; background-color: #F1F5F9 !important; }
      }
    `;
    return () => {
      style.textContent = '';
    };
  }, [paper, orientation, margin, activeScale]);

  return (
    <div>
      {/* 인쇄 설정 바 */}
      {showPrintDialog && (
        <div className="print-settings-bar no-print bg-card border-b p-4 sticky top-0 z-50 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">📋 인쇄 설정</h3>
          <div className="flex flex-wrap gap-6 items-start text-sm">
            {/* 용지 방향 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">용지 방향</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={orientation === 'landscape' ? 'default' : 'outline'} onClick={() => setOrientation('landscape')}>가로</Button>
                <Button size="sm" variant={orientation === 'portrait' ? 'default' : 'outline'} onClick={() => setOrientation('portrait')}>세로</Button>
              </div>
            </div>

            {/* 용지 크기 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">용지 크기</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={paper === 'A4' ? 'default' : 'outline'} onClick={() => setPaper('A4')}>A4</Button>
                <Button size="sm" variant={paper === 'A3' ? 'default' : 'outline'} onClick={() => setPaper('A3')}>A3</Button>
              </div>
            </div>

            {/* 맞춤 설정 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">맞춤 설정</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={fitModeState === 'width' ? 'default' : 'outline'} onClick={() => setFitModeState('width')}>폭 맞춤</Button>
                <Button size="sm" variant={fitModeState === 'both' ? 'default' : 'outline'} onClick={() => setFitModeState('both')}>전체 맞춤</Button>
                <Button size="sm" variant={fitModeState === 'manual' ? 'default' : 'outline'} onClick={() => setFitModeState('manual')}>수동</Button>
              </div>
              {fitModeState === 'manual' && (
                <div className="flex items-center gap-2 pt-1">
                  <Slider value={[manualScale]} onValueChange={([v]) => setManualScale(v)} min={40} max={100} step={5} className="w-32" />
                  <span className="text-xs text-muted-foreground w-10">{manualScale}%</span>
                </div>
              )}
            </div>

            {/* 여백 */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">여백</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={marginPreset === 'normal' ? 'default' : 'outline'} onClick={() => setMarginPreset('normal')}>보통</Button>
                <Button size="sm" variant={marginPreset === 'narrow' ? 'default' : 'outline'} onClick={() => setMarginPreset('narrow')}>좁게</Button>
                <Button size="sm" variant={marginPreset === 'minimum' ? 'default' : 'outline'} onClick={() => setMarginPreset('minimum')}>최소</Button>
              </div>
            </div>

            {/* 동작 버튼 */}
            <div className="space-y-1 ml-auto">
              <Label className="text-xs text-muted-foreground">&nbsp;</Label>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={computeScale}><Eye className="h-3.5 w-3.5 mr-1" />미리보기</Button>
                <Button size="sm" onClick={handlePrint}><Printer className="h-3.5 w-3.5 mr-1" />인쇄</Button>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">현재 스케일: {(activeScale * 100).toFixed(0)}% | {paper} {orientation === 'landscape' ? '가로' : '세로'} | 여백: {marginPreset === 'normal' ? '보통' : marginPreset === 'narrow' ? '좁게' : '최소'}</p>
        </div>
      )}

      {/* 인쇄 내용 */}
      <div className="print-content">
        <div
          ref={contentRef}
          className="print-scalable"
          style={{ transform: `scale(${activeScale})`, transformOrigin: 'top left' }}
        >
          {/* 페이지 헤더 */}
          {showHeader && (
            <div className="print-page-header flex justify-between items-end pb-2 mb-3 border-b text-xs text-muted-foreground">
              <span className="font-bold">{orgName}</span>
              <span className="text-sm font-bold">{title}</span>
              <span>{new Date().toLocaleDateString('ko-KR')}</span>
            </div>
          )}

          {children}

          {/* 결재란 */}
          {approvalSlots && approvalSlots.length > 0 && (
            <ApprovalBox slots={approvalSlots} />
          )}

          {/* 페이지 푸터 */}
          {showFooter && (
            <div className="print-page-footer mt-4 pt-2 border-t text-center text-xs text-muted-foreground">
              {orgName} | 인쇄: {new Date().toLocaleString('ko-KR')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 결재란 컴포넌트
function ApprovalBox({ slots }: { slots: { title: string; name?: string }[] }) {
  return (
    <div className="approval-box float-right mt-6 no-print-settings">
      <table className="border-collapse">
        <tbody>
          <tr>
            {slots.map(s => (
              <td
                key={s.title}
                className="approval-title border border-foreground/30 px-3 py-1 text-xs font-bold bg-muted text-center"
                style={{ width: 80, height: 28 }}
              >
                {s.title}
              </td>
            ))}
          </tr>
          <tr>
            {slots.map(s => (
              <td
                key={s.title}
                className="border border-foreground/30 text-center text-sm"
                style={{ width: 80, height: 60 }}
              >
                {s.name || ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default PrintPageWrapper;
