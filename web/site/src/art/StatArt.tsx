import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";
import { Column, Defs, G, Stack } from "./pp";

// small pixel-perfect style objects that sit on the proof numbers
export type StatKind = "fill" | "signin" | "distance" | "added";

export function CountUp({ to, decimals, suffix = "" }: { to: number; decimals: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const [v, setV] = useState(reduced ? to : 0);
  useEffect(() => {
    if (!inView || reduced) return;
    const a = animate(0, to, { duration: 1.2, ease: [0.19, 1, 0.22, 1], onUpdate: setV });
    return () => a.stop();
  }, [inView, reduced, to]);
  return (
    <span ref={ref}>
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

const GLYPH: Record<StatKind, keyof typeof G> = { fill: "bolt", signin: "finger", distance: "shield", added: "coin" };

export default function StatArt({ kind }: { kind: StatKind }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduced = useReducedMotion();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!inView || reduced) return;
    const id = setInterval(() => setOn((o) => !o), 1600);
    return () => clearInterval(id);
  }, [inView, reduced]);

  return (
    <svg ref={ref} viewBox="0 0 120 80" className="h-16 w-24" aria-hidden>
      <Defs />
      {kind === "distance" ? (
        <Column cx={60} groundY={74} w={30} h={on ? 30 : 16} glyph={G[GLYPH[kind]]} active={on} />
      ) : (
        <Stack cx={60} cy={48} size={46} tiers={[1, 0.72]} gap={6} lift={4} glyph={G[GLYPH[kind]]} active={on} hover={on ? 4 : 0} />
      )}
    </svg>
  );
}
