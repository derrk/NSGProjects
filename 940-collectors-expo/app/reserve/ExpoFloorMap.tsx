"use client";

import { TABLE_LAYOUT, CANVAS, ENTRANCES, type TableDef } from "./tables";

export type FloorStatus = Record<number, "held" | "confirmed">;

interface Props {
  status?: FloorStatus; // live pending/confirmed per table (admin / open booking)
  onTableClick?: (id: number, category: string) => void;
  selected?: Set<number>; // highlighted selection (admin)
  busyId?: number | null; // table currently being toggled
  maxHeight?: string;
}

// Percent -> px in the canvas coordinate space.
const px = (p: number, D: number) => (p / 100) * D;

function tileColors(state: string) {
  // available | selected | held | confirmed | reserved | ticket | hq | seating
  switch (state) {
    case "selected": return { fill: "#A855F7", stroke: "#A855F7", text: "#0B0713" };
    case "confirmed": return { fill: "rgba(168,85,247,0.20)", stroke: "#A855F7", text: "#C4B5FD" };
    case "held": return { fill: "rgba(250,204,21,0.12)", stroke: "#FACC15", text: "#FACC15" };
    case "reserved": return { fill: "rgba(249,115,22,0.16)", stroke: "#F97316", text: "#FDBA74" };
    case "ticket": return { fill: "rgba(236,72,153,0.16)", stroke: "#EC4899", text: "#F9A8D4" };
    case "hq": return { fill: "rgba(250,204,21,0.20)", stroke: "#E0A100", text: "#FACC15" };
    case "seating": return { fill: "rgba(250,204,21,0.10)", stroke: "#C99A2E", text: "#C99A2E" };
    default: return { fill: "#120C1F", stroke: "rgba(255,255,255,0.24)", text: "#E5E7EB" };
  }
}

export default function ExpoFloorMap({ status, onTableClick, selected, busyId, maxHeight = "76vh" }: Props) {
  return (
    <div className="retro-panel p-3 overflow-auto" style={{ maxHeight }}>
      <svg
        viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
        style={{ display: "block", width: "100%", height: "auto", minWidth: 360 }}
        role="img"
        aria-label="Rooms 1-4 floor map"
      >
        {/* Room border */}
        <rect
          x={px(5, CANVAS.w)} y={px(3, CANVAS.h)}
          width={px(89.5, CANVAS.w)} height={px(93.5, CANVAS.h)}
          rx={6} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={2} strokeDasharray="3 5"
        />

        {/* Entrances */}
        {ENTRANCES.map((e, i) => {
          if (e.side === "top") {
            const y = px(3, CANVAS.h);
            return (
              <g key={i}>
                <line x1={px(e.a, CANVAS.w)} y1={y} x2={px(e.b, CANVAS.w)} y2={y} stroke="#FACC15" strokeWidth={5} strokeDasharray="7 5" />
                <text x={px((e.a + e.b) / 2, CANVAS.w)} y={y - 8} fill="#FACC15" fontSize={16} fontWeight={700} textAnchor="middle" style={{ letterSpacing: 1 }}>▼ ENTRANCE</text>
              </g>
            );
          }
          const x = px(94.5, CANVAS.w);
          return (
            <g key={i}>
              <line x1={x} y1={px(e.a, CANVAS.h)} x2={x} y2={px(e.b, CANVAS.h)} stroke="#FACC15" strokeWidth={5} strokeDasharray="7 5" />
              <text x={x + 14} y={px((e.a + e.b) / 2, CANVAS.h)} fill="#FACC15" fontSize={16} fontWeight={700} textAnchor="middle" transform={`rotate(90 ${x + 14} ${px((e.a + e.b) / 2, CANVAS.h)})`} style={{ letterSpacing: 1 }}>▲ ENTRANCE</text>
            </g>
          );
        })}

        {/* Seating zone label */}
        <text x={px(50, CANVAS.w)} y={px(20.5, CANVAS.h)} fill="#C99A2E" fontSize={15} fontWeight={700} textAnchor="middle" style={{ letterSpacing: 2 }}>CUSTOMER SEATING</text>

        {TABLE_LAYOUT.map((t) => {
          const cat = t.category ?? "vendor";
          const bookable = cat === "vendor";
          const live = status?.[t.id];
          let state = "available";
          if (cat === "ticket") state = "ticket";
          else if (cat === "hq") state = "hq";
          else if (cat === "seating") state = "seating";
          else if (cat === "reserved") state = "reserved";
          else if (selected?.has(t.id)) state = "selected";
          else if (live === "confirmed") state = "confirmed";
          else if (live === "held") state = "held";
          const c = tileColors(state);
          const x = px(t.x, CANVAS.w), y = px(t.y, CANVAS.h), w = px(t.w, CANVAS.w), h = px(t.h, CANVAS.h);
          const cx = x + w / 2, cy = y + h / 2;
          const clickable = !!onTableClick && bookable;
          const label = cat === "ticket" ? "TIX" : cat === "hq" ? "HQ" : cat === "reserved" ? "RES" : cat === "seating" ? "" : String(t.id);
          const rot = t.orientation === "vertical" && cat !== "seating";
          const isBusy = busyId === t.id;

          const shape = t.shape === "round"
            ? <circle cx={cx} cy={cy} r={Math.min(w, h) / 2} fill={c.fill} stroke={c.stroke} strokeWidth={1.6} />
            : <rect x={x} y={y} width={w} height={h} rx={3} fill={c.fill} stroke={c.stroke} strokeWidth={state === "available" ? 1.2 : 2} />;

          return (
            <g key={t.id}
               onClick={clickable ? () => onTableClick!(t.id, cat) : undefined}
               style={{ cursor: clickable ? "pointer" : "default", opacity: isBusy ? 0.45 : 1 }}>
              {shape}
              {label && (
                <text x={cx} y={cy} fill={c.text} fontSize={cat === "ticket" || cat === "hq" ? 13 : 16} fontWeight={700}
                      textAnchor="middle" dominantBaseline="central"
                      transform={rot ? `rotate(-90 ${cx} ${cy})` : undefined}
                      style={{ pointerEvents: "none", userSelect: "none" }}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
