"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, Eye, X, AtSign } from "lucide-react";
import {
  TABLE_LAYOUT,
  CANVAS,
  basePriceCents,
  formatUSD,
  EVENT,
  type VendorProfile,
} from "./tables";
import { useReservation } from "./ReservationContext";

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5];

export default function FloorMap() {
  const { statusOf, canSelect, toggleTable, getVendor, vendorTableIds } = useReservation();
  const [zoomIdx, setZoomIdx] = useState(0);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [spotlight, setSpotlight] = useState<VendorProfile | null>(null);
  const zoom = ZOOM_STEPS[zoomIdx];

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <LegendSwatch className="bg-[#0B0713] border-white/30" label="Available" />
          <LegendSwatch className="bg-[#A855F7] border-[#A855F7]" label="Selected" />
          <LegendSwatch className="bg-[#0B0713] border-[#FACC15]/70 ring-1 ring-[#FACC15]/40" label="Held (pending)" />
          <LegendSwatch className="bg-[#0B0713] border-[#A855F7]/70 ring-1 ring-[#A855F7]/40" label="Confirmed vendor" />
          <LegendSwatch className="bg-white/5 border-white/10" label="Reserved" striped />
          <span className="flex items-center gap-1.5 text-[#E5E7EB]/70">
            <span className="w-4 h-3 rounded-[3px] border border-[#FACC15]/70 bg-[#FACC15]/15" />
            6′ end cap
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAvailableOnly((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              availableOnly
                ? "bg-[#A855F7]/15 border-[#A855F7]/40 text-[#A855F7]"
                : "bg-[#0B0713] border-white/10 text-[#E5E7EB]/60 hover:text-white"
            }`}
          >
            <Eye size={13} /> Available only
          </button>
          <button onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0} className="p-1.5 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/60 hover:text-white disabled:opacity-30 transition-colors" aria-label="Zoom out">
            <ZoomOut size={15} />
          </button>
          <button onClick={() => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))} disabled={zoomIdx === ZOOM_STEPS.length - 1} className="p-1.5 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/60 hover:text-white disabled:opacity-30 transition-colors" aria-label="Zoom in">
            <ZoomIn size={15} />
          </button>
          <button onClick={() => setZoomIdx(0)} className="p-1.5 rounded-lg bg-[#0B0713] border border-white/10 text-[#E5E7EB]/60 hover:text-white transition-colors" aria-label="Reset view">
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/* Scroll / pan viewport */}
      <div className="retro-panel p-3 overflow-auto max-h-[72vh]">
        <div
          className="relative mx-auto"
          style={{
            width: `${zoom * 100}%`,
            minWidth: `${zoom * 660}px`,
            aspectRatio: `${CANVAS.w} / ${CANVAS.h}`,
          }}
        >
          <div className="absolute inset-[3%_9%] border-2 border-white/15 rounded-sm" />
          <span className="absolute text-[9px] tracking-widest uppercase text-[#FACC15]/70 font-semibold" style={{ left: "42%", bottom: "1%" }}>
            ⬆ Entrance
          </span>

          {TABLE_LAYOUT.map((t) => {
            const status = statusOf(t.id);
            const selectable = canSelect(t.id);
            const isEndcap = t.tableType === "endcap";
            const vendor = getVendor(t.id);
            const pending = vendor?.status === "pending";
            const priceLabel = formatUSD(basePriceCents(t));
            const dimLabel = `${t.lengthFt}′ × ${t.depthFt}′`;

            const clickable = selectable || !!vendor;
            const dim = availableOnly && status !== "available" && status !== "selected";

            let cls =
              "absolute rounded-[3px] border flex items-center justify-center font-bold leading-none transition-colors duration-150 select-none overflow-hidden";
            const style: React.CSSProperties = {
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: `${t.w}%`,
              height: `${t.h}%`,
              fontSize: t.orientation === "vertical" ? "0.5rem" : "0.55rem",
              opacity: dim ? 0.12 : 1,
            };

            if (vendor) {
              cls += pending
                ? " border-[#FACC15]/80 text-white cursor-pointer ring-1 ring-[#FACC15]/50 z-[5]"
                : " border-[#A855F7]/80 text-white cursor-pointer ring-1 ring-[#A855F7]/40 z-[5]";
              if (vendor.photo) {
                style.backgroundImage = `url(${vendor.photo})`;
                style.backgroundSize = "cover";
                style.backgroundPosition = "center";
                if (pending) style.opacity = dim ? 0.12 : 0.85;
              } else {
                cls += pending ? " bg-[#FACC15]/20" : " bg-[#A855F7]/25";
              }
            } else if (status === "reserved") {
              cls += " border-white/10 text-[#E5E7EB]/30 cursor-not-allowed reserved-fill";
            } else if (status === "blocked") {
              cls += " border-white/10 text-[#E5E7EB]/25 cursor-not-allowed blocked-fill";
            } else if (status === "selected") {
              cls += " bg-[#A855F7] border-[#A855F7] text-white cursor-pointer shadow shadow-purple-500/30 z-10";
            } else if (isEndcap) {
              cls += " bg-[#FACC15]/10 border-[#FACC15]/60 text-[#FACC15] cursor-pointer hover:bg-[#FACC15]/20";
            } else {
              cls += " bg-[#0B0713] border-white/25 text-[#E5E7EB]/70 cursor-pointer hover:border-[#A855F7] hover:text-white hover:bg-[#A855F7]/10";
            }

            const label = vendor
              ? `Table ${t.id}, ${vendor.business}, ${pending ? "held pending payment" : "reserved"}. Click for details.`
              : `Table ${t.id}, ${t.zone}, ${isEndcap ? "6 foot end cap" : "8 foot"}, ${status}, ${priceLabel}`;
            const tip = vendor
              ? `${vendor.business} · Table ${t.id}${pending ? " · held (pending payment)" : ""}`
              : `Table ${t.id} · ${t.zone} · ${dimLabel} · ${priceLabel} · ${status}`;

            return (
              <button
                key={t.id}
                type="button"
                disabled={!clickable}
                onClick={() => (selectable ? toggleTable(t.id) : vendor ? setSpotlight(vendor) : undefined)}
                title={tip}
                aria-label={label}
                className={cls}
                style={style}
              >
                {!vendor?.photo && (
                  <span
                    style={{
                      transform: t.orientation === "vertical" ? "rotate(-90deg)" : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {vendor ? vendor.business.charAt(0).toUpperCase() : t.id}
                    {!vendor && isEndcap && <span className="ml-0.5 opacity-70">·6FT</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-[#E5E7EB]/40 mt-3">
        {EVENT.name} · {EVENT.venueName} · {TABLE_LAYOUT.length} tables (100 × 8′ + 8 × 6′
        end caps). Tap an open table to add it. Reserved tables show the vendor&apos;s photo —
        tap one to see who&apos;s there.
      </p>

      {/* Vendor spotlight */}
      {spotlight && <VendorSpotlight vendor={spotlight} tableIds={vendorTableIds(spotlight.resId)} onClose={() => setSpotlight(null)} />}

      <style jsx>{`
        .reserved-fill {
          background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 3px, rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 6px);
        }
        .blocked-fill {
          background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.06) 2px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 5px);
        }
      `}</style>
    </div>
  );
}

function VendorSpotlight({
  vendor,
  tableIds,
  onClose,
}: {
  vendor: VendorProfile;
  tableIds: number[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl bg-[#171022] border border-white/10 shadow-2xl overflow-hidden"
      >
        <div className="relative h-40 bg-[#0B0713] flex items-center justify-center">
          {vendor.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.photo} alt={vendor.business} className="w-full h-full object-cover" />
          ) : (
            <span className="text-5xl font-black text-[#A855F7]/70">
              {vendor.business.charAt(0).toUpperCase()}
            </span>
          )}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/40 text-white/80 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">
          <span
            className={`inline-block mb-2 px-2.5 py-1 rounded-md text-[10px] font-pixel uppercase tracking-wide border ${
              vendor.status === "pending"
                ? "bg-[#FACC15]/15 border-[#FACC15]/40 text-[#FACC15]"
                : "bg-[#A855F7]/15 border-[#A855F7]/40 text-[#A855F7]"
            }`}
          >
            {vendor.status === "pending" ? "Held · pending payment" : "Confirmed vendor"}
          </span>
          <h4 className="font-bold text-white text-lg">{vendor.business}</h4>
          {vendor.instagram && (
            <p className="flex items-center gap-1.5 text-sm text-[#A855F7] mt-1">
              <AtSign size={13} /> {vendor.instagram}
            </p>
          )}
          {vendor.bio && <p className="text-sm text-[#E5E7EB]/70 leading-relaxed mt-3">{vendor.bio}</p>}
          <div className="mt-4 pt-4 border-t border-white/5">
            <p className="text-xs font-semibold text-[#E5E7EB]/40 uppercase tracking-widest mb-2">
              {tableIds.length > 1 ? "Tables" : "Table"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tableIds.map((id) => (
                <span key={id} className="px-2.5 py-1 rounded-lg bg-[#A855F7]/15 border border-[#A855F7]/30 text-xs font-bold text-[#A855F7]">
                  {id}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({
  className,
  label,
  striped,
}: {
  className: string;
  label: string;
  striped?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-[#E5E7EB]/70">
      <span
        className={`w-4 h-3 rounded-[3px] border ${className}`}
        style={
          striped
            ? {
                backgroundImage:
                  "repeating-linear-gradient(45deg, rgba(255,255,255,.15), rgba(255,255,255,.15) 2px, transparent 2px, transparent 4px)",
              }
            : undefined
        }
      />
      {label}
    </span>
  );
}
