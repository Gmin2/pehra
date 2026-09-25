import { useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { RoughGenerator } from "roughjs/bin/generator";

// a hand drawn arrow, the same rough.js settings rough-notation uses, drawn stroke by stroke
// when it scrolls into view. points run from the tail to the tip, in the svg's own units.
const gen = new RoughGenerator();

type Pt = [number, number];

export default function Arrow({
  points,
  width,
  height,
  color = "#28243E",
  strokeWidth = 2,
  head = 16,
  seed = 7,
  delay = 0,
  duration = 0.9,
  className = "",
}: {
  points: Pt[];
  width: number;
  height: number;
  color?: string;
  strokeWidth?: number;
  head?: number;
  seed?: number;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();

  const { body, tips } = useMemo(() => {
    const o = { roughness: 1.4, bowing: 1.2, strokeWidth, seed, disableMultiStroke: true };
    const body = gen.toPaths(gen.curve(points, o)).map((p) => p.d);
    const [x1, y1] = points[points.length - 2];
    const [x2, y2] = points[points.length - 1];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const wing = (turn: number): Pt => [x2 - head * Math.cos(a + turn), y2 - head * Math.sin(a + turn)];
    const tips = [wing(0.5), wing(-0.5)].flatMap((w, i) => gen.toPaths(gen.line(w[0], w[1], x2, y2, { ...o, seed: seed + i + 1 })).map((p) => p.d));
    return { body, tips };
  }, [points, strokeWidth, head, seed]);

  const draw = (i: number, len: number, start: number) => ({
    initial: { pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0 },
    animate: inView ? { pathLength: 1, opacity: 1 } : undefined,
    transition: { pathLength: { duration: len, delay: start + i * 0.05, ease: [0.45, 0, 0.2, 1] as const }, opacity: { duration: 0.01, delay: start } },
  });

  return (
    <svg ref={ref} viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={`overflow-visible ${className}`} aria-hidden>
      <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {body.map((d, i) => (
          <motion.path key={`b${i}`} d={d} {...draw(i, duration, delay)} />
        ))}
        {tips.map((d, i) => (
          <motion.path key={`t${i}`} d={d} {...draw(i, 0.18, delay + duration)} />
        ))}
      </g>
    </svg>
  );
}
