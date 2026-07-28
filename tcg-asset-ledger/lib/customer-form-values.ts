// Plain (non-client) helpers for the customer form so server components can
// build initial values without importing a "use client" module.

export interface CustomerFormValues {
  id?: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

export function emptyCustomerForm(): CustomerFormValues {
  return { name: "", email: "", phone: "", notes: "" };
}

export function customerToFormValues(c: {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}): CustomerFormValues {
  return {
    id: c.id,
    name: c.name,
    email: c.email ?? "",
    phone: c.phone ?? "",
    notes: c.notes ?? "",
  };
}
