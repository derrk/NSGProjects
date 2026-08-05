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
  computePricing,
  getTable,
  type Pricing,
  type TableStatus,
  type VendorProfile,
} from "./tables";

const STORAGE_KEY = "940expo.vendors.v4";
const HOLD_MS = EVENT.holdMinutes * 60 * 1000;
const POLL_MS = 15000;

type VendorMap = Record<number, VendorProfile>;
type Mode = "loading" | "local" | "backend";
type SubmitResult = { resCode: string } | { error: string; tables?: number[] };

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
  statusOf: (id: number) => TableStatus;
  inCart: (id: number) => boolean;
  canSelect: (id: number) => boolean;
  getVendor: (id: number) => VendorProfile | undefined;
  vendorTableIds: (resId: string) => number[];
  toggleTable: (id: number) => void;
  removeFromCart: (id: number) => void;
  clearCart: () => void;
  setPromoInput: (v: string) => void;
  submitReservation: (profile: Omit<VendorProfile, "resId" | "status">) => Promise<SubmitResult>;
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
}

export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [vendors, setVendors] = useState<VendorMap>({});
  const [blocked, setBlocked] = useState<Set<number>>(new Set());
  const [cart, setCart] = useState<number[]>([]);
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [promoInput, setPromoInput] = useState("");
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const modeRef = useRef<Mode>("loading");
  modeRef.current = mode;

  const applyPublic = useCallback((data: { reservations: PublicRes[]; blocked: number[] }) => {
    const map: VendorMap = {};
    for (const r of data.reservations) {
      map[r.tableNumber] = {
        resId: r.resCode,
        status: r.status,
        business: r.business,
        instagram: r.instagram ?? undefined,
        bio: r.bio ?? undefined,
        photo: r.photo ?? undefined,
        email: "",
      };
    }
    setVendors(map);
    setBlocked(new Set([...data.blocked, ...FOUNDER_TABLES]));
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
    setBlocked(new Set([...SEED_BLOCKED, ...FOUNDER_TABLES]));
  }, []);

  // Decide mode on mount: backend if the API says it's configured, else localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/reservations", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
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
          setBlocked(new Set(FOUNDER_TABLES));
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
  const getVendor = useCallback((id: number) => vendors[id], [vendors]);
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

  const pricing = useMemo(() => computePricing(cart, promoInput), [cart, promoInput]);

  const submitReservation = useCallback(
    async (profile: Omit<VendorProfile, "resId" | "status">): Promise<SubmitResult> => {
      if (cart.length === 0) return { error: "empty" };

      if (modeRef.current === "backend") {
        try {
          const res = await fetch("/api/reservations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tableNumbers: cart, promoCode: promoInput || null, profile }),
          });
          const json = await res.json();
          if (res.status === 409) {
            if (json.error === "promo_exhausted") return { error: "promo_exhausted" };
            return { error: "conflict", tables: json.tables ?? cart };
          }
          if (!res.ok || !json.ok) return { error: json.error || "error" };
          await refreshBackend();
          setCart([]);
          setHoldExpiresAt(null);
          setPromoInput("");
          return { resCode: json.resCode as string };
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
    [cart, promoInput, refreshBackend, persistLocal]
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
