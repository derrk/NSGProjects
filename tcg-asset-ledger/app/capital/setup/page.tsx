import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { isCapitalSetUp } from "@/lib/accounting";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default async function CapitalSetupPage() {
  if (await isCapitalSetUp()) redirect("/capital");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Capital setup"
        description="Enter your starting balances as of a date. This posts a one-time opening entry — review the totals before you confirm."
      />
      <SetupWizard />
    </div>
  );
}
