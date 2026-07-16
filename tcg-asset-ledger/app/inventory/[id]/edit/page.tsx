import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AssetForm } from "@/components/asset-form";
import { assetToFormValues } from "@/lib/asset-form-values";
import { getAsset } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await getAsset(id);
  if (!asset) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${asset.name}`} description="Update details or correct values." />
      <AssetForm initial={assetToFormValues(asset)} />
    </div>
  );
}
