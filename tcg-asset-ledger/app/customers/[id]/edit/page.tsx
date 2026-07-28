import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCustomer } from "@/lib/customers";
import { CustomerForm } from "../../customer-form";
import { customerToFormValues } from "@/lib/customer-form-values";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title={`Edit ${customer.name}`} description="Update contact details." />
      <CustomerForm initial={customerToFormValues(customer)} />
    </div>
  );
}
