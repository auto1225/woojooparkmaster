import { FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { FacilityReportSectionId } from "@/lib/facility-report";
import { FACILITY_REPORT_TEMPLATE_CODE, reportGeneratePath } from "@/lib/report-catalog";

export function FacilityReportShortcut({ focus, label = "시설 보고서" }: { focus?: FacilityReportSectionId; label?: string }) {
  const base = reportGeneratePath(FACILITY_REPORT_TEMPLATE_CODE);
  const href = focus ? `${base}&focus=${focus}` : base;
  return <Button variant="outline" asChild><Link to={href}><FileText className="mr-1.5 h-4 w-4" />{label}</Link></Button>;
}
