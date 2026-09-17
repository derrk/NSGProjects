"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  EVENT,
  SEED_RESERVED,
  SEED_BLOCKED,
  FOUNDER_TABLES,
  SEATING_TABLES,
  TABLE_LAYOUT,
  computePricing,
  getTable,
  type Pricing,
  type PromoCode,
  type TableStatus,
  type VendorProfile,
} from "./tables";

// Bookable vendor tables (excludes founder HQ + seating). Used for the
// "X of Y available" indicator.
const BOOKABLE_IDS = TABLE_LAYOUT.filter(
  (t) => !FOUNDER_TABLES.includes(t.id) && !SEATING_TABLES.includes(t.id)
).map((t) => t.id);

const STORAGE_KEY = "940expo.vendors.v4";
const HOLD_MS = EVENT.holdMinutes * 60 * 1000;
const POLL_MS = 60000;

type VendorMap = Record<number, VendorProfile>;
type Mode = "loading" | "local" | "backend";
type SubmitResult =
  | { resCode: string; checkoutUrl?: string; paymentMethod?: "zelle" | "stripe" }
  | { error: string; tables?: number[] };

export interface PromoStatus {
  code: string;
  type: "fixed" | "percent" | "table_price";
  value: number;
  label: string;
  maxUses?: number;
  used: number;
  remaining: number | null;
}

interface ReservationState {
  vendors: VendorMap;
  blocked: Set<number>;
  cart: number[];
  holdExpiresAt: number | null;
  remainingMs: number;
  promoInput: string;
  pricing: Pricing;
  maxTables: number;
  mode: Mode;
  stripeEnabled: boolean;
  availableCount: number;
  bookableCount: number;
  promos: PromoStatus[];
  confirmedVendors: VendorListing[];
  statusOf: (id: number) => TableStatus;
  inCart: (id: number) => boolean;
  canSelect: (id: number) => boolean;
  getVendor: (id: number) => VendorProfile | undefined;
  vendorTableIds: (resId: string) => number[];
  toggleTable: (id: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
  setPromoInput: (v: string) => void;
  submitReservation: (
    profile: Omit<VendorProfile, "resId" | "status">,
    paymentMethod: "zelle" | "stripe"
  ) => Promise<SubmitResult>;
}

const Ctx = createContext<ReservationState | null>(null);

interface PublicRes {
  tableNumber: number;
  resCode: string;
  status: "pending" | "confirmed";
  business: string;
  instagram: string | null;
  bio: string | null;
  photo: string | null;
  category: string | null;
}

// One entry per CONFIRMED vendor (deduped across their tables) for the public
// vendor directory on the reserve page.
export interface VendorListing {
  resId: string;
  business: string;
  instagram?: string;
  bio?: string;
  photo?: string;
  category?: string;
  tables: number[];
}

export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [vendors, setVendors] = useState<VendorMap>({});
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [cart, setCart] = useState<number[]>([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [promoInput, setPromoInput] = useState("");
  // Vendor logos/bios, keyed by table number — fetched separately from the
  // availability poll (they're heavy base64 images) and merged in getVendor().
  const [media, setMedia] = useState<Record<number, { photo?: string; bio?: string }>>({});
  const [promos, setPromos] = useState<PromoStatus[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<Mode>("loading");
  modeRef.current = mode;

  const fetchMedia = useCallback(async () => {
    try {
      const res = await fetch("/api/reservations?media=1", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!Array.isArray(json?.media)) return;
      const next: Record<number, { photo?: string; bio?: string }> = {};
      for (const row of json.media as { tableNumber: number; photo: string | null; bio: string | null }[]) {
        next[row.tableNumber] = { photo: row.photo ?? undefined, bio: row.bio ?? undefined };
      }
      setMedia(next);
    } catch {
      /* ignore — map still works without logos */
    }
  }, []);

  const applyPublic = useCallback((data: { reservations: PublicRes[]; blocked: number[]; promos?: PromoStatus[] }) => {
    if (Array.isArray(data.promos)) setPromos(data.promos);
    const map: VendorMap = {};
    for (const r of data.reservations) {
      map[r.tableNumber] = {
        resId: r.resCode,
        status: r.status,
        business: r.business,
        instagram: r.instagram ?? undefined,
        bio: r.bio ?? undefined,
        photo: r.photo ?? undefined,
        category: r.category ?? undefined,
        email: "",
      };
    }
    setVendors(map);
    setBlocked(new Set([...data.blocked, ...FOUNDER_TABLES, ...SEATING_TABLES]));
  }, []);

  const refreshBackend = useCallback(async () => {
    try {
      const res = await fetch("/api/reservations", { cache: "no-store" });
      if (!res.ok) return; // keep last-known-good state on a transient/server error
      const json = await res.json();
      if (json?.configured && !json.error) applyPublic(json);
    } catch {
      /* ignore transient */
    }
  }, [applyPublic]);

  const loadLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setVendors(raw ? JSON.parse(raw) : {});
    } catch {
      setVendors({});
    }
    setBlocked(new Set([...SEED_BLOCKED, ...FOUNDER_TABLES, ...SEATING_TABLES]));
  }, []);

  // Decide mode on mount: backend if the API says it's configured, else localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reservations", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        setStripeEnabled(!!json?.stripeEnabled);
        if (res.ok && json?.configured && !json.error) {
          setMode("backend");
          applyPublic(json);
          return;
        }
        if (json?.configured) {
          // Backend IS configured but errored — don't render a misleading
          // "all available" map. Stay in backend mode (polling will recover),
          // and keep founder tables blocked in the meantime.
          setMode("backend");
          setBlocked(new Set([...FOUNDER_TABLES, ...SEATING_TABLES]));
          return;
        }
      } catch {
        /* fall through to local */
      }
      if (cancelled) return;
      setMode("local");
      loadLocal();
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPublic, loadLocal]);

  // Keep backend availability fresh (poll + on focus).
  useEffect(() => {
    if (mode !== "backend") return;
    const onFocus = () => refreshBackend();
    const id = setInterval(refreshBackend, POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mode, refreshBackend]);

  // Load vendor logos/bios once when the backend is available (they rarely change
  // and are heavy, so they're not part of the recurring poll).
  useEffect(() => {
    if (mode === "backend") fetchMedia();
  }, [mode, fetchMedia]);

  const persistLocal = useCallback((next: VendorMap) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }, []);

  // Countdown ticker.
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (holdExpiresAt == null) {
      setRemainingMs(0);
      return;
    }
    const update = () => {
      const left = holdExpiresAt - Date.now();
      if (left <= 0) {
        setRemainingMs(0);
        setCart([]);
        setHoldExpiresAt(null);
      } else {
        setRemainingMs(left);
      }
    };
    update();
    tickRef.current = setInterval(update, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [holdExpiresAt]);

  const seedReserved = useMemo(
    () => (mode === "local" ? new Set<number>(SEED_RESERVED) : new Set<number>()),
    [mode]
  );

  const heldIds = useMemo(() => {
    const s = new Set<number>(seedReserved);
    Object.keys(vendors).forEach((k) => s.add(Number(k)));
    blocked.forEach((b) => s.add(b));
    return s;
  }, [vendors, blocked, seedReserved]);

  const statusOf = useCallback(
    (id: number): TableStatus => {
      const v = vendors[id];
      if (v) return v.status === "confirmed" ? "reserved" : "held";
      if (blocked.has(id)) return "blocked";
      if (seedReserved.has(id)) return "reserved";
      if (cart.includes(id)) return "selected";
      return "available";
    },
    [vendors, blocked, seedReserved, cart]
  );

  const inCart = useCallback((id: number) => cart.includes(id), [cart]);
  const canSelect = useCallback(
    (id: number) => !!getTable(id) && !heldIds.has(id),
    [heldIds]
  );
  const getVendor = useCallback(
    (id: number) => {
      const v = vendors[id];
      if (!v) return undefined;
      const m = media[id];
      return m ? { ...v, photo: m.photo, bio: m.bio } : v;
    },
    [vendors, media]
  );
  const vendorTableIds = useCallback(
    (resId: string) =>
      Object.entries(vendors)
        .filter(([, v]) => v.resId === resId)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b),
    [vendors]
  );

  const maxTables = EVENT.maxTablesPerReservation;

  const toggleTable = useCallback(
    (id: number) => {
      if (heldIds.has(id)) return;
      setCart((prev) => {
        if (prev.includes(id)) {
          const next = prev.filter((t) => t !== id);
          if (next.length === 0) setHoldExpiresAt(null);
          return next;
        }
        if (maxTables > 0 && prev.length >= maxTables) return prev;
        const next = [...prev, id];
        setHoldExpiresAt((exp) => exp ?? Date.now() + HOLD_MS);
        return next;
      });
    },
    [heldIds, maxTables]
  );

  const removeFromCart = useCallback((id: number) => {
    setCart((prev) => {
      const next = prev.filter((t) => t !== id);
      if (next.length === 0) setHoldExpiresAt(null);
      return next;
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setHoldExpiresAt(null);
  }, []);

  // Build the live discount-code list from the polled promo status so the cart
  // prices codes correctly (the server re-validates authoritatively at checkout).
  const promoCodes = useMemo<PromoCode[]>(
    () => promos.map((p) => ({ code: p.code, type: p.type, value: p.value, label: p.label, maxUses: p.maxUses })),
    [promos]
  );
  const pricing = useMemo(() => computePricing(cart, promoInput, promoCodes), [cart, promoInput, promoCodes]);

  // Public vendor directory: one entry per CONFIRMED vendor, deduped across their
  // tables, with logo/bio merged in from the separately-loaded media. Built from
  // data already fetched for the map, so it adds no extra network/egress.
  const confirmedVendors = useMemo<VendorListing[]>(() => {
    const byRes = new Map<string, VendorListing>();
    for (const [key, v] of Object.entries(vendors)) {
      if (v.status !== "confirmed") continue;
      const id = Number(key);
      const m = media[id];
      const existing = byRes.get(v.resId);
      if (existing) {
        existing.tables.push(id);
        if (!existing.photo && m?.photo) existing.photo = m.photo;
        if (!existing.bio && m?.bio) existing.bio = m.bio;
      } else {
        byRes.set(v.resId, {
          resId: v.resId,
          business: v.business,
          instagram: v.instagram,
          bio: m?.bio ?? v.bio,
          photo: m?.photo ?? v.photo,
          category: v.category,
          tables: [id],
        });
      }
    }
    const list = [...byRes.values()];
    list.forEach((x) => x.tables.sort((a, b) => a - b));
    // Vendors with a logo first, then alphabetically by business name.
    list.sort((a, b) => {
      const ap = a.photo ? 0 : 1;
      const bp = b.photo ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.business.localeCompare(b.business);
    });
    return list;
  }, [vendors, media]);

  // Live availability for the "X of Y tables available" indicator (ignores the
  // current user's cart selections — reflects tables actually held/blocked).
  const bookableCount = BOOKABLE_IDS.length;
  const availableCount = useMemo(
    () => BOOKABLE_IDS.filter((id) => !vendors[id] && !blocked.has(id)).length,
    [vendors, blocked]
  );

  const submitReservation = useCallback(
    async (
      profile: Omit<VendorProfile, "resId" | "status">,
      paymentMethod: "zelle" | "stripe"
    ): Promise<SubmitResult> => {
      if (cart.length === 0) return { error: "empty" };

      if (modeRef.current === "backend") {
        try {
          const res = await fetch("/api/reservations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tableNumbers: cart, promoCode: promoInput || null, paymentMethod, profile }),
          });
          const json = await res.json();
          if (res.status === 409) {
            if (json.error === "promo_exhausted") return { error: "promo_exhausted" };
            return { error: "conflict", tables: json.tables ?? cart };
          }
          if (!res.ok || !json.ok) return { error: json.error || "error" };
          await refreshBackend();
          fetchMedia(); // pick up the just-uploaded vendor logo
          setCart([]);
          setHoldExpiresAt(null);
          setPromoInput("");
          return {
            resCode: json.resCode as string,
            checkoutUrl: json.checkoutUrl as string | undefined,
            paymentMethod: json.paymentMethod as "zelle" | "stripe" | undefined,
          };
        } catch {
          return { error: "network" };
        }
      }

      // Local fallback (per-browser, not authoritative).
      const resId = `940CE-${Math.abs(Date.now() % 100000).toString().padStart(5, "0")}`;
      const full: VendorProfile = { ...profile, resId, status: "pending" };
      setVendors((prev) => {
        const next = { ...prev };
        cart.forEach((id) => {
          next[id] = full;
        });
        persistLocal(next);
        return next;
      });
      setCart([]);
      setHoldExpiresAt(null);
      setPromoInput("");
      return { resCode: resId };
    },
    [cart, promoInput, refreshBackend, fetchMedia, persistLocal]
  );

  return (
    <Ctx.Provider
      value={{
        vendors,
        blocked,
        cart,
        holdExpiresAt,
        remainingMs,
        promoInput,
        pricing,
        maxTables,
        mode,
        stripeEnabled,
        availableCount,
        bookableCount,
        promos,
        confirmedVendors,
        statusOf,
        inCart,
        canSelect,
        getVendor,
        vendorTableIds,
        toggleTable,
        removeFromCart,
        clearCart,
        setPromoInput,
        submitReservation,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useReservation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReservation must be used within ReservationProvider");
  return ctx;
}
