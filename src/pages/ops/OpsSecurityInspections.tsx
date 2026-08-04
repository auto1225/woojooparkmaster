import { DomainWorkflowPage } from "@/components/work/DomainWorkflowPage";
import { SECURITY_INSPECTION_WORKFLOW } from "@/config/domain-workflows";

export default function OpsSecurityInspections() {
  return <DomainWorkflowPage config={SECURITY_INSPECTION_WORKFLOW} />;
}
