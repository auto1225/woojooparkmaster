import { useQuery } from "@tanstack/react-query";
import { ContactRound, ExternalLink, Mail, Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { listBusinessCardsForRecord } from "@/lib/business-card-registry";

interface LinkedBusinessContactsProps {
  module: string;
  recordId: string;
  title?: string;
}

export function LinkedBusinessContacts({ module, recordId, title = "연결된 담당자" }: LinkedBusinessContactsProps) {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["linked-business-cards", module, recordId],
    queryFn: () => listBusinessCardsForRecord(module, recordId),
    enabled: Boolean(recordId),
  });

  return <section className="border-t pt-4">
    <div className="flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold"><ContactRound className="h-4 w-4" />{title}</h3>
      <Button variant="ghost" size="sm" asChild><Link to="/business-cards">연락망 관리<ExternalLink className="ml-2 h-3.5 w-3.5" /></Link></Button>
    </div>
    {isLoading ? <p className="mt-3 text-sm text-muted-foreground">담당자를 불러오는 중...</p> : contacts.length ? <div className="mt-3 divide-y border">
      {contacts.map((contact) => <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" key={contact.id}>
        <Link className="min-w-0 flex-1" to={`/business-cards?card=${contact.id}`}>
          <p className="truncate text-sm font-medium">{contact.name || "이름 미등록"} <span className="font-normal text-muted-foreground">{contact.position}</span></p>
          <p className="truncate text-xs text-muted-foreground">{contact.company} · {contact.department || "부서 미등록"}</p>
        </Link>
        <div className="flex gap-2"><Button variant="outline" size="sm" asChild><a href={`tel:${contact.mobile || contact.phone}`}><Phone className="mr-1.5 h-3.5 w-3.5" />전화</a></Button>{contact.email && <Button variant="outline" size="sm" asChild><a href={`mailto:${contact.email}`}><Mail className="mr-1.5 h-3.5 w-3.5" />메일</a></Button>}</div>
      </div>)}
    </div> : <p className="mt-3 text-sm text-muted-foreground">연결된 연락처가 없습니다. 연락처/명함관리에서 이 업무를 연결하면 여기에서 바로 연락할 수 있습니다.</p>}
  </section>;
}
