import { PageHeader } from "@/components/page-header";
import { CustomerForm } from "../customer-form";

export default function NewCustomerPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add a customer" description="Name, and however you'd reach them." />
      <CustomerForm />
    </div>
  );
}
