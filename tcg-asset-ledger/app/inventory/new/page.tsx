import { PageHeader } from "@/components/page-header";
import { AssetForm } from "@/components/asset-form";

export default function NewAssetPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Add asset"
        description="Manually add a single item to inventory. For bulk, use the Collectr import."
      />
      <AssetForm />
    </div>
  );
}
