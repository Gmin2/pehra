import type { ReactNode } from "react";
import { motion } from "framer-motion";

// the pixel-perfect.space isometric line style: white faces, near black 1px seams, rounded
// plates on the true iso matrix, thickness from a second copy drawn a few px lower,
// glyphs lying flat on the top face, dashed 2 2 construction lines, one accent colour
const INK = "#17161C";
const SIDE = "#F3F3F5";
const ACCENT = "#9E4DFD";

const M = (x: number, y: number) => `matrix(0.866025 0.5 -0.866025 0.5 ${x} ${y})`;

const seam = { stroke: INK, strokeWidth: 1.1, vectorEffect: "non-scaling-stroke" } as const;

// one rounded plate whose top face is centred on (cx, cy)
function Plate({ cx, cy, size, lift, r = 10 }: { cx: number; cy: number; size: number; lift: number; r?: number }) {
  const ty = cy - size / 2;
  return (
    <g>
      <rect width={size} height={size} rx={r} transform={M(cx, ty + lift)} fill="#fff" {...seam} />
      <rect width={size} height={size} rx={r} transform={M(cx, ty)} fill="#fff" {...seam} />
    </g>
  );
}

// the stacked tiers of svg-1, with a glyph lying on the top tier
export function Stack({
  cx,
  cy,
  size,
  tiers = [1, 0.8, 0.6],
  gap = 7,
  lift = 5,
  glyph,
  active = false,
  hover = 0,
}: {
  cx: number;
  cy: number;
  size: number;
  tiers?: number[];
  gap?: number;
  lift?: number;
  glyph?: ReactNode;
  active?: boolean;
  hover?: number;
}) {
  const top = tiers[tiers.length - 1] * size;
  const topY = cy - (tiers.length - 1) * gap;
  const g = top * 0.56;
  return (
    <g>
      {tiers.map((t, i) => {
        const float = i === tiers.length - 1 ? hover : 0;
        return (
          <motion.g key={i} animate={{ y: -float }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
            <Plate cx={cx} cy={cy - i * gap} size={t * size} lift={lift} />
          </motion.g>
        );
      })}
      {glyph && (
        <motion.g animate={{ y: -hover }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
          <g transform={M(cx, topY - top / 2)}>
            <g transform={`translate(${top / 2 - g / 2} ${top / 2 - g / 2}) scale(${g / 24})`}>
              <motion.g
                fill="none"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                animate={{ stroke: active ? ACCENT : INK }}
                transition={{ duration: 0.25 }}
              >
                {glyph}
              </motion.g>
            </g>
          </g>
        </motion.g>
      )}
    </g>
  );
}

// the column of svg-4: square footprint w, height h, standing on (cx, groundY), glyph on the cap
export function Column({ cx, groundY, w, h, glyph, active = false }: { cx: number; groundY: number; w: number; h: number; glyph?: ReactNode; active?: boolean }) {
  const top = groundY - h - w; // top corner of the cap
  const L: [number, number] = [cx - 0.866 * w, top + 0.5 * w];
  const B: [number, number] = [cx, top + w];
  const R: [number, number] = [cx + 0.866 * w, top + 0.5 * w];
  const p = (pts: [number, number][]) => pts.map((q) => q.join(",")).join(" ");
  const g = w * 0.6;
  return (
    <g>
      <polygon points={p([L, B, [B[0], B[1] + h], [L[0], L[1] + h]])} fill={SIDE} strokeLinejoin="round" {...seam} />
      <polygon points={p([B, R, [R[0], R[1] + h], [B[0], B[1] + h]])} fill="#FAFAFB" strokeLinejoin="round" {...seam} />
      <rect width={w} height={w} rx={6} transform={M(cx, top)} fill="#fff" {...seam} />
      {glyph && (
        <g transform={M(cx, top)}>
          <g transform={`translate(${w / 2 - g / 2} ${w / 2 - g / 2}) scale(${g / 24})`}>
            <motion.g fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" animate={{ stroke: active ? ACCENT : INK }}>
              {glyph}
            </motion.g>
          </g>
        </g>
      )}
    </g>
  );
}

export function Defs() {
  return (
    <defs>
      <radialGradient id="pp-shade">
        <stop offset="0" stopColor="#17161C" stopOpacity="0.1" />
        <stop offset="1" stopColor="#17161C" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pp-glow">
        <stop offset="0" stopColor="#9E4DFD" stopOpacity="0.45" />
        <stop offset="1" stopColor="#9E4DFD" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// glyphs in a 24 box, drawn as strokes so they lie flat on a plate like svg-1's coin
export const G = {
  key: (
    <>
      <circle cx="7.5" cy="12" r="4.2" />
      <path d="M11.7 12H21M18 12v3.2M20.8 12v2.2" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M14.6 9.2c-.6-.9-1.6-1.3-2.7-1.3-1.5 0-2.7.8-2.7 2s1.1 1.6 2.7 2 2.9.9 2.9 2.2-1.3 2.1-2.9 2.1c-1.2 0-2.3-.5-2.9-1.4M12 6.3v1.6M12 16.2v1.5" />
    </>
  ),
  book: <path d="M4 6.5h9M4 12h16M4 17.5h6" />,
  receipt: <path d="M6 3h12v18l-2.4-1.6L13.2 21l-2.4-1.6L8.4 21 6 19.4Z M9 8h6M9 12h6" />,
  bird: <path d="M11.4 3.8c3.9 0 5.4 3 6 6.7.4 3.6 1.8 6.2 3.5 8.3.3.4.3.8-.4.6l-1.6-.3c-2.2 1.7-5.6 2.4-9 2.1-4-.3-6.6-1.7-6.5-4.9.1-2.2 1.6-4.9 2.1-7C6.4 5.7 8.5 3.8 11.4 3.8Z M9.2 10.5v.8M13.4 10.5v.8" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.2" />
    </>
  ),
  shield: <path d="M12 3 5 5.7v6c0 4.4 3 7.4 7 9.3 4-1.9 7-4.9 7-9.3v-6Z M8.8 12.2l2.2 2.2 4.4-4.6" />,
  bolt: <path d="M13 2.5 5.5 13.5H12l-1 8 7.5-11H12Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  wick: <path d="M4 7l4.5 4 3-2.5L16 16l4-3M16 16v-4M16 16h4" />,
  finger: <path d="M8.2 5.3A7 7 0 0 1 19 11.3c0 2.7-.4 5.1-1.2 7.2M5 16.3c1.2-2 1.3-4 1.3-4.3 0-1.1.2-2.1.7-3M14.3 14c-.3 2.6-1.1 4.9-2.3 6.8M7.3 18.8C8.7 17 9.8 14.7 9.8 12a2.2 2.2 0 0 1 4.4-.2M10.4 20.5c1.7-2.2 2.8-5.1 2.8-8.5" />,
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4" width="16" height="7" rx="1.6" />
      <rect x="4" y="13" width="16" height="7" rx="1.6" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01" />
    </>
  ),
};
