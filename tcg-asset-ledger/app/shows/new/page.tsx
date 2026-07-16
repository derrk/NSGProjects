import { PageHeader } from "@/components/page-header";
import { ShowForm } from "../show-form";

export default function NewShowPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add a show" description="Venue, dates, and what it costs to be there." />
      <ShowForm />
    </div>
  );
}
