import "server-only";
import { getServiceClient } from "./supabase";

export interface InquiryInput {
  business?: string;
  contactName?: string;
  email: string;
  phone?: string;
  products?: string[];
  tablesRequested?: string;
  website?: string;
  social?: string;
  notes?: string;
}

export interface AdminInquiry {
  id: string;
  business: string | null;
  contactName: string | null;
  email: string;
  phone: string | null;
  products: string[];
  tablesRequested: string | null;
  website: string | null;
  social: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
}

export async function createInquiry(input: InquiryInput): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("vendor_inquiries").insert({
    business: input.business || null,
    contact_name: input.contactName || null,
    email: input.email,
    phone: input.phone || null,
    products: input.products && input.products.length ? input.products : null,
    tables_requested: input.tablesRequested || null,
    website: input.website || null,
    social: input.social || null,
    notes: input.notes || null,
  });
  if (error) throw error;
}

export async function listInquiries(): Promise<AdminInquiry[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("vendor_inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    business: (r.business as string) ?? null,
    contactName: (r.contact_name as string) ?? null,
    email: r.email as string,
    phone: (r.phone as string) ?? null,
    products: (r.products as string[]) ?? [],
    tablesRequested: (r.tables_requested as string) ?? null,
    website: (r.website as string) ?? null,
    social: (r.social as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: r.status as string,
    createdAt: r.created_at as string,
  }));
}

export async function setInquiryStatus(id: string, status: "new" | "archived"): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from("vendor_inquiries").update({ status }).eq("id", id);
  if (error) throw error;
}
