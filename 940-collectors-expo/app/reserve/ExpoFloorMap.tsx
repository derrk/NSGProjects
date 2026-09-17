"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2, X, AtSign } from "lucide-react";
import { TABLE_LAYOUT, CANVAS, ENTRANCES } from "./tables";
import { instagramHandle, instagramUrl } from "../lib/instagram";

export type FloorStatus = Record<number, "held" | "confirmed">;

export interface FloorVendor {
  business: string;
  photo?: string;
  instagram?: string;
  bio?: string;
  resId?: string;
  status?: "held" | "confirmed";
}

interface Props {
  status?: FloorStatus; // live pending/confirmed per table (admin / open booking)
  vendors?: Record<number, FloorVendor>; // per-table vendor info (logos + spotlight)
  onTableClick?: (id: number) => void;
  spotlightOnBooked?: boolean; // click a booked table -> show who's there
  showLogos?: boolean; // draw the vendor's logo on their table
  selected?: Set<number>;
  busyId?: number | null;
  maxHeight?: string;
}

const px = (p: number, D: number) => (p / 100) * D;
const ZOOMS = [1, 1.5, 2, 3];

// Purple palette to match the site (dark ground, darker-purple tables).
const COLORS = {
  paper: "#1A1230",
  wall: "#9A85C9",
  tableFill: "#33235C",
  tableStroke: "#7C4DD6",
  tableText: "#EDE7FB",
  selFill: "#A855F7", // bright purple — selected (in your cart)
  selStroke: "#D8B4FE",
  heldFill: "#F97316", // orange — pending payment
  heldStroke: "#C2410C",
  soldFill: "#6EE04A", // slime green — sold / booked
  soldStroke: "#3F9E1E",
};

const ROOM = { l: 3, r: 94, t: 1.5, b: 97 };

export default function ExpoFloorMap({
  status,
  vendors,
  onTableClick,
  spotlightOnBooked,
  showLogos,
  selected,
  busyId,
  maxHeight = "76vh",
}: Props) {
  const [zoomIdx, setZoomIdx] = useState(0);
  const [spotlight, setSpotlight] = useState<{ id: number; v: FloorVendor } | null>(null);
  const zoom = ZOOMS[zoomIdx];

  const topEnt = ENTRANCES.find((e) => e.side === "top");
  const rightEnt = ENTRANCES.find((e) => e.side === "right");
  const L = px(ROOM.l, CANVAS.w), R = px(ROOM.r, CANVAS.w), T = px(ROOM.t, CANVAS.h), B = px(ROOM.b, CANVAS.h);

  // Tables sharing the spotlighted vendor's reservation.
  const spotlightTables = spotlight
    ? Object.entries(vendors ?? {})
        .filter(([, v]) => (spotlight.v.resId ? v.resId === spotlight.v.resId : false))
        .map(([k]) => Number(k))
        .sort((a, b) => a - b)
    : [];

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 mb-2">
        <button onClick={() => setZoomIdx((i) => Math.max(0, i - 1))} disabled={zoomIdx === 0}
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[#E5E7EB]/70 hover:text-white disabled:opacity-30" aria-label="Zoom out"><ZoomOut size={15} /></button>
        <button onClick={() => setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1))} disabled={zoomIdx === ZOOMS.length - 1}
          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[#E5E7EB]/70 hover:text-white disabled:opacity-30" aria-label="Zoom in"><ZoomIn size={15} /></button>
        <button onClick={() => setZoomIdx(0)} className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-[#E5E7EB]/70 hover:text-white" aria-label="Reset view"><Maximize2 size={15} /></button>
      </div>
      <div className="overflow-auto rounded-lg border border-white/10" style={{ maxHeight, background: COLORS.paper }}>
        <div style={{ width: `${zoom * 100}%`, minWidth: zoom > 1 ? `${zoom * 100}%` : undefined }}>
          <svg viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`} style={{ display: "block", width: "100%", height: "auto" }}
            role="img" aria-label="Show floor map">
            {topEnt ? (
              <>
                <line x1={L} y1={T} x2={px(topEnt.a, CANVAS.w)} y2={T} stroke={COLORS.wall} strokeWidth={4} />
                <line x1={px(topEnt.b, CANVAS.w)} y1={T} x2={R} y2={T} stroke={COLORS.wall} strokeWidth={4} />
                <text x={px((topEnt.a + topEnt.b) / 2, CANVAS.w)} y={T + 22} fill={COLORS.wall} fontSize={15} fontWeight={700} textAnchor="middle" style={{ letterSpacing: 1 }}>ENTRANCE</text>
              </>
            ) : <line x1={L} y1={T} x2={R} y2={T} stroke={COLORS.wall} strokeWidth={4} />}
            <line x1={L} y1={T} x2={L} y2={B} stroke={COLORS.wall} strokeWidth={4} />
            <line x1={L} y1={B} x2={R} y2={B} stroke={COLORS.wall} strokeWidth={4} />
            {rightEnt ? (
              <>
                <line x1={R} y1={T} x2={R} y2={px(rightEnt.a, CANVAS.h)} stroke={COLORS.wall} strokeWidth={4} />
                <line x1={R} y1={px(rightEnt.b, CANVAS.h)} x2={R} y2={B} stroke={COLORS.wall} strokeWidth={4} />
                <text x={R - 16} y={px((rightEnt.a + rightEnt.b) / 2, CANVAS.h)} fill={COLORS.wall} fontSize={15} fontWeight={700} textAnchor="middle" transform={`rotate(90 ${R - 16} ${px((rightEnt.a + rightEnt.b) / 2, CANVAS.h)})`} style={{ letterSpacing: 1 }}>ENTRANCE</text>
              </>
            ) : <line x1={R} y1={T} x2={R} y2={B} stroke={COLORS.wall} strokeWidth={4} />}

            {TABLE_LAYOUT.map((t) => {
              const live = status?.[t.id];
              const isSel = selected?.has(t.id);
              const vendor = vendors?.[t.id];
              let fill = COLORS.tableFill, stroke = COLORS.tableStroke, text = COLORS.tableText;
              if (isSel) { fill = COLORS.selFill; stroke = COLORS.selStroke; text = "#FFFFFF"; }
              else if (live === "confirmed") { fill = COLORS.soldFill; stroke = COLORS.soldStroke; text = "#14210A"; }
              else if (live === "held") { fill = COLORS.heldFill; stroke = COLORS.heldStroke; text = "#14210A"; }
              const x = px(t.x, CANVAS.w), y = px(t.y, CANVAS.h), w = px(t.w, CANVAS.w), h = px(t.h, CANVAS.h);
              const cx = x + w / 2, cy = y + h / 2;
              const rot = t.orientation === "vertical";
              const isBusy = busyId === t.id;
              const logo = showLogos && vendor?.photo && vendor.photo.startsWith("data:image/") ? vendor.photo : null;

              // Click: booked -> spotlight (if enabled), else select/manage via onTableClick.
              const doSpotlight = spotlightOnBooked && !!vendor;
              const clickable = doSpotlight || (!!onTableClick && !(spotlightOnBooked && vendor));
              const onClick = clickable
                ? () => (doSpotlight ? setSpotlight({ id: t.id, v: vendor! }) : onTableClick?.(t.id))
                : undefined;

              return (
                <g key={t.id} onClick={onClick}
                   style={{ cursor: clickable ? "pointer" : "default", opacity: isBusy ? 0.45 : 1 }}>
                  {logo ? (
                    <>
                      <image href={logo} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
                      <rect x={x} y={y} width={w} height={h} rx={1.5} fill="none" stroke={stroke} strokeWidth={2} />
                    </>
                  ) : (
                    <>
                      <rect x={x} y={y} width={w} height={h} rx={1.5} fill={fill} stroke={stroke} strokeWidth={isSel || live ? 2 : 1} />
                      <text x={cx} y={cy} fill={text} fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central"
                            transform={rot ? `rotate(-90 ${cx} ${cy})` : undefined}
                            style={{ pointerEvents: "none", userSelect: "none" }}>{t.id}</text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {spotlight && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setSpotlight(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs retro-panel p-6 text-center">
            <button onClick={() => setSpotlight(null)} className="absolute right-4 top-4 text-[#E5E7EB]/40 hover:text-white" aria-label="Close"><X size={18} /></button>
            {spotlight.v.photo && spotlight.v.photo.startsWith("data:image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={spotlight.v.photo} alt={spotlight.v.business} className="w-24 h-24 rounded-xl object-cover mx-auto mb-3 border border-white/10" />
            ) : (
              <div className="w-24 h-24 rounded-xl bg-[#33235C] border border-white/10 flex items-center justify-center mx-auto mb-3 text-3xl font-black text-[#A855F7]">
                {(spotlight.v.business || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <p className="font-bold text-white text-lg">{spotlight.v.business || "Reserved"}</p>
            <p className="text-xs text-[#E5E7EB]/50 mt-1">
              {spotlight.v.status === "confirmed" ? "Confirmed vendor" : "Reserved (pending)"} · Table
              {spotlightTables.length > 1 ? "s " : " "}
              {(spotlightTables.length ? spotlightTables : [spotlight.id]).join(", ")}
            </p>
            {(() => {
              const handle = instagramHandle(spotlight.v.instagram);
              return handle ? (
                <a href={instagramUrl(handle)} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-1.5 mt-3 text-sm text-[#A855F7] hover:underline">
                  <AtSign size={14} /> {handle}
                </a>
              ) : null;
            })()}
            {spotlight.v.bio && <p className="text-sm text-[#E5E7EB]/70 leading-relaxed mt-3">{spotlight.v.bio}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
