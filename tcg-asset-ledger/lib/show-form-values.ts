// Plain (non-client) helpers for the show form so server components can build
// initial values without importing a "use client" module.
import { toDollars } from "@/lib/money";

export interface ShowFormValues {
  id?: string;
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  status: string;
  tableFeeDollars: string;
  hotelDollars: string;
  travelDollars: string;
  foodDollars: string;
  otherDollars: string;
  notes: string;
}

export function emptyShowForm(): ShowFormValues {
  return {
    name: "",
    venue: "",
    city: "",
    startDate: "",
    endDate: "",
    status: "Upcoming",
    tableFeeDollars: "",
    hotelDollars: "",
    travelDollars: "",
    foodDollars: "",
    otherDollars: "",
    notes: "",
  };
}

export function showToFormValues(s: {
  id: string;
  name: string;
  venue: string | null;
  city: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  tableFeeCents: number;
  hotelCents: number;
  travelCents: number;
  foodCents: number;
  otherCents: number;
  notes: string | null;
}): ShowFormValues {
  const d = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const money = (c: number) => (c ? String(toDollars(c)) : "");
  return {
    id: s.id,
    name: s.name,
    venue: s.venue ?? "",
    city: s.city ?? "",
    startDate: d(s.startDate),
    endDate: s.endDate ? d(s.endDate) : "",
    status: s.status,
    tableFeeDollars: money(s.tableFeeCents),
    hotelDollars: money(s.hotelCents),
    travelDollars: money(s.travelCents),
    foodDollars: money(s.foodCents),
    otherDollars: money(s.otherCents),
    notes: s.notes ?? "",
  };
}
