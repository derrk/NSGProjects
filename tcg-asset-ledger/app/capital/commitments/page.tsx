import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { listCommitments } from "@/lib/commitments";
import { CommitmentsClient, type CommitmentView } from "./commitments-client";

export const dynamic = "force-dynamic";

export default async function CommitmentsPage() {
  const rows = await listCommitments(true);
  const views: CommitmentView[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    totalCents: c.totalCents,
    depositPaidCents: c.depositPaidCents,
    dueDate: c.dueDate ? c.dueDate.toISOString() : null,
    status: c.status,
    notes: c.notes,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming commitments"
        description="Pre-orders and future obligations. The remaining balance is reserved out of your safe-to-spend buying power, and due dates trigger dashboard alerts."
        actions={<Link href="/capital" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>← Capital</Link>}
      />
      <CommitmentsClient commitments={views} />
    </div>
  );
}
