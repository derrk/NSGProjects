import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/db";
import { ShowForm } from "../../show-form";
import { showToFormValues } from "@/lib/show-form-values";

export const dynamic = "force-dynamic";

export default async function EditShowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${show.name}`} description="Update details or expenses." />
      <ShowForm initial={showToFormValues(show)} />
    </div>
  );
}
