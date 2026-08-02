import { DomainWorkflowPage } from "@/components/work/DomainWorkflowPage";
import { ABANDONED_VEHICLE_WORKFLOW } from "@/config/domain-workflows";

export default function OpsAbandonedVehicles() {
  return <DomainWorkflowPage config={ABANDONED_VEHICLE_WORKFLOW} />;
}
