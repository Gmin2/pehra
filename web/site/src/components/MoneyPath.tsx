import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import Phone from "./Phone";
import Mark from "./Mark";

// where the money goes, in the language of the studio sphere cards case study: real screens
// stitched together by one thin rail (their "payment process" board), then a user flow map of
// plain pills with curved connectors (their flow board). a dot rides the rail through the phones
const RAIL = "#C3CAD9";
const DOT = "#9E4DFD";

// the board is laid out in a 1000 x 700 space; phones are 220 wide, 475 tall
const PHONES = [
  { x: 180, name: "fund", label: "add dollars", note: "usdc in, 1:1 to ausd" },
  { x: 500, name: "trade", label: "trade", note: "filled on perpl in ~1s" },
  { x: 820, name: "position", label: "the guard steps in", note: "13% to 30% from liquidation" },
];
const TOP = 110;
const H = 475;
const R = 30;
const BOTTOM = 700;
// the rail drops into each phone left of centre and leaves it right of the step label
const IN = (x: number) => x - 50;
const OUT = (x: number) => x + 100;
const RAIL_PATH = [
  `M0,50 H${IN(180) - R} Q${IN(180)},50 ${IN(180)},${50 + R} V${TOP + 40}`,
  `M${OUT(180)},${TOP + H - 40} V${BOTTOM - R} Q${OUT(180)},${BOTTOM} ${OUT(180) + R},${BOTTOM} H${IN(500) - R} Q${IN(500)},${BOTTOM} ${IN(500)},${BOTTOM - R} V${TOP + H - 40}`,
  `M${OUT(500)},${TOP + 40} V${50 + R} Q${OUT(500)},50 ${OUT(500) + R},50 H${IN(820) - R} Q${IN(820)},50 ${IN(820)},${50 + R} V${TOP + 40}`,
  `M${OUT(820)},${TOP + H - 40} V${BOTTOM - R} Q${OUT(820)},${BOTTOM} ${OUT(820) + R},${BOTTOM} H1000`,
].join(" ");

export default function MoneyPath() {
  const ref = useRef<HTMLDivElement>(null);
  const run = useInView(ref, { amount: 0.25 });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="rounded-[32px] bg-[#F1F5FF] px-4 pt-12 pb-10 shadow-[inset_0_0_0_1px_#E1E9FB] md:px-10 md:pt-16">
      <div className="mx-auto max-w-[700px] text-center">
        <h3 className="h-display text-[30px] leading-[1.1] md:text-[40px]">
          where your{" "}
          <Mark type="circle" color="#9E4DFD" padding={[0, 3]} strokeWidth={1.8}>
            money
          </Mark>{" "}
          goes
        </h3>
        <p className="mt-3 text-[15px] leading-[22px]">follow a dollar from your passkey to a filled order. the guard can top it up, it can never take it out.</p>
      </div>

      {/* the payment board: three real screens on one rail */}
      <div className="relative mx-auto mt-8 hidden aspect-[1000/730] w-full max-w-[1000px] md:block">
        <svg viewBox="0 0 1000 730" className="absolute inset-0 h-full w-full" aria-hidden>
          <path d={RAIL_PATH} fill="none" stroke={RAIL} strokeWidth={1.4} strokeLinecap="round" />
          {run && !reduced &&
            RAIL_PATH.split(" M")
              .map((seg, i) => (i ? "M" + seg : seg))
              .map((seg, i) => (
                <circle key={i} r={4} fill={DOT}>
                  <animateMotion dur="2.2s" begin={`${i * 0.55}s`} repeatCount="indefinite" path={seg} />
                </circle>
              ))}
        </svg>
        {PHONES.map((p, i) => (
          <div key={p.name} className="absolute flex flex-col items-center" style={{ left: `${(p.x - 110) / 10}%`, top: `${(TOP / 730) * 100}%`, width: "22%" }}>
            <Phone name={p.name} className="w-full" />
            <div className="mt-3 text-center">
              <div className="text-[14px] font-semibold text-ink">
                <span className="mr-1.5 text-muted tabular-nums">0{i + 1}</span>
                {p.label}
              </div>
              <div className="text-[12.5px] text-muted">{p.note}</div>
            </div>
          </div>
        ))}
      </div>

      {/* on a phone the board is a simple column of the same screens */}
      <div className="mt-8 flex flex-col items-center gap-8 md:hidden">
        {PHONES.map((p, i) => (
          <div key={p.name} className="flex w-[70%] flex-col items-center">
            <Phone name={p.name} className="w-full" />
            <div className="mt-3 text-center text-[14px] font-semibold text-ink">
              <span className="mr-1.5 text-muted">0{i + 1}</span>
              {p.label}
            </div>
            <div className="text-[12.5px] text-muted">{p.note}</div>
          </div>
        ))}
      </div>

      <FlowMap />
    </div>
  );
}

/* ---------- the user flow map: plain pills, curved connectors, the key path filled ---------- */

type Node = { id: string; x: number; y: number; w: number; label: string; hl?: boolean; ghost?: boolean };
const NODES: Node[] = [
  { id: "passkey", x: 70, y: 150, w: 104, label: "Passkey", hl: true },
  { id: "account", x: 215, y: 150, w: 104, label: "Account" },
  { id: "add", x: 385, y: 60, w: 126, label: "Add dollars" },
  { id: "trade", x: 385, y: 150, w: 90, label: "Trade", hl: true },
  { id: "withdraw", x: 385, y: 240, w: 112, label: "Withdraw" },
  { id: "agora", x: 565, y: 60, w: 136, label: "Agora · 1:1" },
  { id: "perpl", x: 565, y: 150, w: 126, label: "Perpl order" },
  { id: "wallet", x: 565, y: 240, w: 124, label: "Your wallet" },
  { id: "position", x: 745, y: 150, w: 110, label: "Position", hl: true },
  { id: "envio", x: 918, y: 150, w: 122, label: "Envio receipt" },
  { id: "guard", x: 745, y: 262, w: 100, label: "The guard", hl: true },
  { id: "nope", x: 918, y: 262, w: 136, label: "✕ cant withdraw", ghost: true },
];
const EDGES: [string, string, "h" | "up"][] = [
  ["passkey", "account", "h"],
  ["account", "add", "h"],
  ["account", "trade", "h"],
  ["account", "withdraw", "h"],
  ["add", "agora", "h"],
  ["trade", "perpl", "h"],
  ["withdraw", "wallet", "h"],
  ["perpl", "position", "h"],
  ["position", "envio", "h"],
  ["guard", "position", "up"],
  ["guard", "nope", "h"],
];
const MAIN = ["passkey", "account", "trade", "perpl", "position"];

function edgePath(a: Node, b: Node, kind: "h" | "up") {
  if (kind === "up") return `M${a.x},${a.y - 17} L${b.x},${b.y + 17}`;
  const x1 = a.x + a.w / 2;
  const x2 = b.x - b.w / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`;
}

function FlowMap() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (MAIN.length + 1)), 900);
    return () => clearInterval(id);
  }, [inView, reduced]);
  const lit = new Set(MAIN.slice(0, step));
  const by = (id: string) => NODES.find((n) => n.id === id)!;

  return (
    <div className="mt-10 overflow-x-auto md:mt-4">
      <svg ref={ref} viewBox="0 0 1000 310" className="h-auto w-full min-w-[720px]" aria-hidden>
        {EDGES.map(([a, b, kind], i) => {
          const na = by(a);
          const nb = by(b);
          const on = lit.has(a) && lit.has(b);
          return (
            <motion.path
              key={a + b}
              d={edgePath(na, nb, kind)}
              fill="none"
              strokeWidth={1.3}
              strokeDasharray={nb.ghost ? "4 4" : undefined}
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={inView ? { pathLength: 1, stroke: on ? DOT : RAIL } : undefined}
              transition={{ pathLength: { duration: 0.6, delay: 0.1 + i * 0.06 }, stroke: { duration: 0.3 } }}
            />
          );
        })}
        <text x={760} y={214} fill={DOT} fontSize={11} fontWeight={600} fontFamily="Manrope, sans-serif">
          + margin
        </text>
        {NODES.map((n, i) => {
          const on = lit.has(n.id);
          const fill = n.ghost ? "#F1F5FF" : on ? "#E7DBFF" : n.hl ? "#DFE3EE" : "#FFFFFF";
          return (
            <motion.g key={n.id} initial={{ opacity: reduced ? 1 : 0 }} animate={inView ? { opacity: 1 } : undefined} transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}>
              <rect x={n.x - n.w / 2} y={n.y - 17} width={n.w} height={34} rx={17} fill={fill} stroke={n.ghost ? "#B9C0D0" : on ? "#C9A2FF" : "#C3CAD9"} strokeWidth={1.1} strokeDasharray={n.ghost ? "4 3" : undefined} />
              <text x={n.x} y={n.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fontFamily="Manrope, sans-serif" fill={n.ghost ? "#8B93A7" : "#3A3650"}>
                {n.label}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
