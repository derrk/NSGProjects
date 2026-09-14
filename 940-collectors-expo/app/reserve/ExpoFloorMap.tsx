"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { TABLE_LAYOUT, CANVAS, ENTRANCES } from "./tables";

export type FloorStatus = Record<number, "held" | "confirmed">;

interface Props {
  status?: FloorStatus; // live pending/confirmed per table (admin / open booking)
  onTableClick?: (id: number) => void;
  selected?: Set<number>; // highlighted tables (cart selection or admin search)
  busyId?: number | null;
  maxHeight?: string;
}

const px = (p: number, D: number) => (p / 100) * D;
const ZOOMS = [1, 1.5, 2, 3];

// Purple palette to match the site (dark ground, darker-purple tables).
const COLORS = {
  paper: "#1A1230", // dark purple panel ground
  wall: "#9A85C9", // light lavender, visible on the dark ground
  tableFill: "#33235C", // darker purple table
  tableStroke: "#7C4DD6",
  tableText: "#EDE7FB",
  selFill: "#6EE04A", // Halloween slime green — selected / booked
  selStroke: "#3F9E1E",
  heldFill: "#F59E0B", // amber — held / pending
  heldStroke: "#B45309",
  soldFill: "#EF4444", // red — sold / confirmed
  soldStroke: "#B91C1C",
};

// Room border insets (percent) — a little outside the outermost tables.
const ROOM = { l: 1.5, r: 85, t: 1.5, b: 97.5 };

export default function ExpoFloorMap({ status, onTableClick, selected, busyId, maxHeight = "76vh" }: Props) {
  const [zoomIdx, setZoomIdx] = useState(0);
  const zoom = ZOOMS[zoomIdx];

  // Wall as segments so the two entrance openings are real gaps.
  const topEnt = ENTRANCES.find((e) => e.side === "top");
  const rightEnt = ENTRANCES.find((e) => e.side === "right");
  const L = px(ROOM.l, CANVAS.w), R = px(ROOM.r, CANVAS.w), T = px(ROOM.t, CANVAS.h), B = px(ROOM.b, CANVAS.h);

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
            role="img" aria-label="Rooms 1-4 floor map">
            {/* Perimeter wall with entrance gaps */}
            {/* top: split around the top entrance */}
            {topEnt ? (
              <>
                <line x1={L} y1={T} x2={px(topEnt.a, CANVAS.w)} y2={T} stroke={COLORS.wall} strokeWidth={4} />
                <line x1={px(topEnt.b, CANVAS.w)} y1={T} x2={R} y2={T} stroke={COLORS.wall} strokeWidth={4} />
                <text x={px((topEnt.a + topEnt.b) / 2, CANVAS.w)} y={T + 22} fill={COLORS.wall} fontSize={15} fontWeight={700} textAnchor="middle" style={{ letterSpacing: 1 }}>ENTRANCE</text>
              </>
            ) : <line x1={L} y1={T} x2={R} y2={T} stroke={COLORS.wall} strokeWidth={4} />}
            {/* left + bottom full */}
            <line x1={L} y1={T} x2={L} y2={B} stroke={COLORS.wall} strokeWidth={4} />
            <line x1={L} y1={B} x2={R} y2={B} stroke={COLORS.wall} strokeWidth={4} />
            {/* right: split around the right entrance */}
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
              let fill = COLORS.tableFill, stroke = COLORS.tableStroke, text = COLORS.tableText;
              if (isSel) { fill = COLORS.selFill; stroke = COLORS.selStroke; text = "#14210A"; }
              else if (live === "confirmed") { fill = COLORS.soldFill; stroke = COLORS.soldStroke; text = "#fff"; }
              else if (live === "held") { fill = COLORS.heldFill; stroke = COLORS.heldStroke; text = "#1A1A1A"; }
              const x = px(t.x, CANVAS.w), y = px(t.y, CANVAS.h), w = px(t.w, CANVAS.w), h = px(t.h, CANVAS.h);
              const cx = x + w / 2, cy = y + h / 2;
              const clickable = !!onTableClick;
              const rot = t.orientation === "vertical";
              const isBusy = busyId === t.id;
              return (
                <g key={t.id}
                   onClick={clickable ? () => onTableClick!(t.id) : undefined}
                   style={{ cursor: clickable ? "pointer" : "default", opacity: isBusy ? 0.45 : 1 }}>
                  <rect x={x} y={y} width={w} height={h} rx={1.5} fill={fill} stroke={stroke} strokeWidth={isSel ? 2 : 1} />
                  <text x={cx} y={cy} fill={text} fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="central"
                        transform={rot ? `rotate(-90 ${cx} ${cy})` : undefined}
                        style={{ pointerEvents: "none", userSelect: "none" }}>{t.id}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
