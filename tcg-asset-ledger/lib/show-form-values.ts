// Plain (non-client) helpers for the show form so server components can build
// initial values without importing a "use client" module.
//
// Show expenses are NOT collected here anymore — they're recorded as journal
// entries tagged to the show (see the Add-expense panel on the show detail page).

export interface ShowFormValues {
  id?: string;
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  status: string;
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
  notes: string | null;
}): ShowFormValues {
  const d = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return {
    id: s.id,
    name: s.name,
    venue: s.venue ?? "",
    city: s.city ?? "",
    startDate: d(s.startDate),
    endDate: s.endDate ? d(s.endDate) : "",
    status: s.status,
    notes: s.notes ?? "",
  };
}
