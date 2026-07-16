import { PageHeader } from "@/components/page-header";
import { ImportClient } from "./import-client";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Import from Collectr"
        description="Sync your Collectr portfolio. New cards are added, prices refreshed, and anything your ledger already tracks is protected."
      />
      <ImportClient />
    </div>
  );
}
