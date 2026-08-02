import { DomainWorkflowPage } from "@/components/work/DomainWorkflowPage";
import { CAPITAL_PROCEDURE_WORKFLOW } from "@/config/domain-workflows";

export default function PlanningProcedures() {
  return <DomainWorkflowPage config={CAPITAL_PROCEDURE_WORKFLOW} />;
}
