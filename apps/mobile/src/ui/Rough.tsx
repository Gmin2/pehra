// rough-notation for react native. rough-notation itself needs a browser dom, so this uses its
// engine, rough.js, with the same settings (roughness 1.5, bowing 1, maxRandomnessOffset 2, a
// stable seed per mark, highlight at roughness 3 and 95% of the text height) and draws each
// stroke in turn by animating its dash offset, the way the library does with css keyframes.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, { Easing, ReduceMotion, useAnimatedProps, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { RoughGenerator } from "roughjs/bin/generator";

export type RoughType = "underline" | "circle" | "highlight" | "box" | "strike-through";
const APath = Animated.createAnimatedComponent(Path);
const gen = new RoughGenerator();
let seeds = 1;

type Stroke = { d: string; length: number; width: number };

function strokes(type: RoughType, w: number, h: number, pad: number, padX: number, strokeWidth: number, iterations: number, seed: number): Stroke[] {
  const base = { maxRandomnessOffset: 2, bowing: 1, curveFitting: 0.95, curveStepCount: 9, roughness: 1.5, disableMultiStroke: true, seed, stroke: "#000", strokeWidth };
  const out: Stroke[] = [];
  const push = (drawable: ReturnType<RoughGenerator["line"]>, length: number, width = strokeWidth) =>
    gen.toPaths(drawable).forEach((p) => out.push({ d: p.d, length, width }));
  for (let i = 0; i < iterations; i++) {
    const ltr = i % 2 === 0;
    if (type === "underline") {
      const y = h + pad;
      push(ltr ? gen.line(0, y, w, y, base) : gen.line(w, y, 0, y, base), w * 1.15);
    }
    if (type === "strike-through") {
      const y = h / 2;
      push(ltr ? gen.line(0, y, w, y, base) : gen.line(w, y, 0, y, base), w * 1.15);
    }
    if (type === "highlight") {
      const y = h / 2;
      const o = { ...base, roughness: 3, strokeWidth: h * 0.95 };
      push(ltr ? gen.line(0, y, w, y, o) : gen.line(w, y, 0, y, o), w * 1.2, h * 0.95);
    }
    if (type === "box") push(gen.rectangle(-padX, -pad, w + padX * 2, h + pad * 2, base), (w + h + pad * 4) * 2.3);
    if (type === "circle") {
      const cw = w + padX * 2,
        ch = h + pad * 2;
      const e = gen.ellipse(w / 2, h / 2, cw, ch, { ...base, disableMultiStroke: i < iterations - 1 ? false : true });
      push(e, Math.PI * (cw + ch) * 0.62);
    }
  }
  return out;
}

function Stroke({ s, color, delay, duration, run, opacity }: { s: Stroke; color: string; delay: number; duration: number; run: number; opacity: number }) {
  const off = useSharedValue(s.length),
    reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      off.set(0);
      return;
    }
    off.set(s.length);
    off.set(withDelay(delay, withTiming(0, { duration, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System })));
  }, [off, s.length, delay, duration, run, reduced]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: off.get() }));
  return (
    <APath
      d={s.d}
      stroke={color}
      strokeWidth={s.width}
      fill="none"
      strokeLinecap="round"
      strokeDasharray={`${s.length} ${s.length}`}
      opacity={opacity}
      animatedProps={props}
    />
  );
}

// wraps one piece of text; the mark is drawn after it has a size, then replays when `run` changes
export function Rough({
  children,
  type,
  color = "#8B5CF6",
  padding = 5,
  paddingX,
  strokeWidth = 2,
  iterations = 2,
  delay = 200,
  duration = 800,
  run = 0,
}: {
  children: ReactNode;
  type: RoughType;
  color?: string;
  padding?: number;
  paddingX?: number;
  strokeWidth?: number;
  iterations?: number;
  delay?: number;
  duration?: number;
  run?: number;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const seed = useMemo(() => seeds++ * 7919, []);
  const list = useMemo(() => (size ? strokes(type, size.w, size.h, padding, paddingX ?? padding, strokeWidth, iterations, seed) : []), [size, type, padding, paddingX, strokeWidth, iterations, seed]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
  };
  const m = Math.max(padding, paddingX ?? 0, strokeWidth) + 12;
  const each = duration / Math.max(1, list.length);
  const svg = size && (
    <Svg
      pointerEvents="none"
      width={size.w + m * 2}
      height={size.h + m * 2}
      viewBox={`${-m} ${-m} ${size.w + m * 2} ${size.h + m * 2}`}
      style={{ position: "absolute", left: -m, top: -m }}
    >
      {list.map((s, i) => (
        <Stroke key={i + ":" + run} s={s} color={color} delay={delay + i * each} duration={each} run={run} opacity={type === "highlight" ? 0.35 : 1} />
      ))}
    </Svg>
  );
  return (
    <View onLayout={onLayout} style={{ alignSelf: "flex-start" }}>
      {type === "highlight" && svg}
      {children}
      {type !== "highlight" && svg}
    </View>
  );
}
