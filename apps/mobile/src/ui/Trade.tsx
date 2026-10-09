// the trade page's pieces: the price chart in the violet card with the guard and liquidation band,
// the range and side switches, the leverage slider, and the rocket that carries the order from the
// button to the price. the look is tmp/claude/preview/trade-b2.png, the motion trade-rocket.mp4.
import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Pressable, StyleSheet, BackHandler, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect, Line, Defs, LinearGradient, Stop, Pattern } from "react-native-svg";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Tap } from "./components";
import { Shield } from "./Home";
import { Glyph } from "./Glyph";
import type { Point } from "../candles";

export const violet = "#9E4DFD",
  ink = "#28243E",
  muted = "#706A7D",
  paper = "#FAF8F2",
  green = "#23765A",
  red = "#B4474D",
  amber = "#9A6B1C",
  line = "#EEEAF2",
  well = "#F0EDF3";
const spring = { duration: 380, dampingRatio: 0.8, reduceMotion: ReduceMotion.System };

// a white pill that slides under the chosen option
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  dark = false,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  dark?: boolean;
  render?: (v: T, on: boolean) => ReactNode;
}) {
  const [w, setW] = useState(0);
  const i = Math.max(0, options.indexOf(value));
  const x = useSharedValue(0);
  const each = options.length ? (w - 8) / options.length : 0;
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!each) return;
    // the first layout puts the pill in place, later picks glide to it
    if (!placed.get()) { x.set(i * each); placed.set(true); return; }
    x.set(withTiming(i * each, { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [i, each, x, placed]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const h = dark ? 32 : 46;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={{ height: h, borderRadius: h / 2, backgroundColor: dark ? "#ffffff1f" : well, flexDirection: "row", padding: 4 }}
    >
      {w > 0 && <Animated.View style={[{ position: "absolute", top: 4, left: 4, width: each, height: h - 8, borderRadius: (h - 8) / 2, backgroundColor: "white", shadowColor: "#28243E", shadowOpacity: dark ? 0 : 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: dark ? 0 : 2 }, pill]} />}
      {options.map((o) => (
        <Pressable
          key={o}
          accessibilityRole="button"
          accessibilityState={{ selected: o === value }}
          onPress={() => {
            if (o !== value) Haptics.selectionAsync();
            onChange(o);
          }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          {render ? (
            render(o, o === value)
          ) : (
            <Text style={{ fontSize: dark ? 12.5 : 15, fontWeight: "700", color: o === value ? (dark ? violet : ink) : dark ? "#ffffffcc" : muted }}>{o}</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

// the chart. the price keeps its own scale up top, the guard and liquidation lines live in a striped
// band under it for a long (over it for a short), with how far away liquidation is written between.
const CH = 186,
  PRICE_H = 104;
export type ChartProps = {
  points: Point[];
  width: number;
  mark: number;
  liq: number;
  guard: number;
  side: "long" | "short";
  entry?: number;
  fmt: (v: number) => string;
  onDot?: (x: number, y: number) => void;
};
export const PriceChart = memo(function PriceChart({ points, width, mark, liq, guard, side, entry, fmt, onDot }: ChartProps) {
  const long = side === "long";
  const top = long ? 22 : 22 + 36 + 18,
    zoneTop = long ? top + PRICE_H + 18 : 18,
    zoneH = 36;
  const pw = width - 22;
  const series = points.length ? [...points.map((p) => p.p), mark] : [];
  const lo = series.length ? Math.min(...series) : 0,
    hi = series.length ? Math.max(...series) : 1;
  const span = hi - lo || hi * 0.001 || 1;
  const Y = (v: number) => top + PRICE_H - ((v - lo) / span) * PRICE_H;
  const X = (i: number) => (series.length > 1 ? (i / (series.length - 1)) * pw : pw);
  const d = series.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p).toFixed(1)).join("");
  const dx = pw,
    dy = series.length ? Y(mark) : top + PRICE_H / 2;
  useEffect(() => {
    if (series.length) onDot?.(dx, dy);
  }, [dx, dy, series.length, onDot]);
  const guardY = long ? zoneTop : zoneTop + zoneH,
    liqY = long ? zoneTop + zoneH : zoneTop;
  const away = mark > 0 ? Math.abs(mark - liq) / mark : 0;

  const [scrub, setScrub] = useState<number | null>(null);
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => scheduleOnRN(pick, e.x))
        .onUpdate((e) => scheduleOnRN(pick, e.x))
        .onFinalize(() => scheduleOnRN(setScrub, null)),
    [series.length, pw],
  );
  function pick(x: number) {
    if (series.length < 2) return;
    const i = Math.max(0, Math.min(series.length - 1, Math.round((x / pw) * (series.length - 1))));
    setScrub((prev) => {
      if (prev !== i) Haptics.selectionAsync();
      return i;
    });
  }

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }), -1, false));
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.35 * (1 - pulse.get()), transform: [{ scale: 1 + pulse.get() * 1.4 }] }));

  const pill = (y: number, color: string, label: string, icon?: boolean) => (
    <View style={{ position: "absolute", left: 14, top: y - 10, height: 20, borderRadius: 10, backgroundColor: "white", paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 4 }}>
      {icon && <Shield size={11} color={color} />}
      <Text style={{ fontSize: 10.5, fontWeight: "700", color, fontVariant: ["tabular-nums"] }}>{label}</Text>
    </View>
  );
  const entryY = entry !== undefined && series.length ? Math.max(top, Math.min(top + PRICE_H, Y(entry))) : null;
  const sx = scrub !== null ? X(scrub) : 0,
    sy = scrub !== null ? Y(series[scrub]) : 0;
  const midY = (dy + (long ? guardY : guardY)) / 2;

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height: CH }}>
        <Svg width={width} height={CH} style={{ position: "absolute" }}>
          <Defs>
            <LinearGradient id="tf" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="white" stopOpacity={0.26} />
              <Stop offset="1" stopColor="white" stopOpacity={0} />
            </LinearGradient>
            <Pattern id="hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={8} stroke="#FFC2CA" strokeWidth={2} strokeOpacity={0.35} />
            </Pattern>
          </Defs>
          <Rect x={0} y={zoneTop} width={width} height={zoneH} fill="url(#hatch)" />
          <Rect x={0} y={zoneTop} width={width} height={zoneH} fill="#FF7A8A" opacity={0.12} />
          <Line x1={0} x2={width} y1={guardY} y2={guardY} stroke="#FFE3A6" strokeWidth={1.4} strokeDasharray="4 5" />
          <Line x1={0} x2={width} y1={liqY} y2={liqY} stroke="#FFC2CA" strokeWidth={1.4} strokeDasharray="4 5" />
          {series.length > 1 && (
            <>
              <Path d={`${d} L${X(series.length - 1)} ${top + PRICE_H + 8} L0 ${top + PRICE_H + 8} Z`} fill="url(#tf)" />
              <Line x1={dx} x2={dx} y1={long ? dy + 8 : dy - 8} y2={liqY} stroke="white" strokeOpacity={0.5} strokeWidth={1.2} strokeDasharray="2 4" />
              {entryY !== null && <Line x1={0} x2={width} y1={entryY} y2={entryY} stroke="white" strokeWidth={1.4} strokeDasharray="4 5" opacity={0.8} />}
              <Path d={d} stroke="white" strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {scrub !== null && <Line x1={sx} x2={sx} y1={top} y2={top + PRICE_H} stroke="white" strokeOpacity={0.4} strokeWidth={1} />}
            </>
          )}
        </Svg>
        {series.length === 0 && <ChartSkeleton top={top} width={pw} />}
        {pill(guardY, amber, "guard " + fmt(guard), true)}
        {pill(liqY, red, "liq " + fmt(liq))}
        {series.length > 1 && (
          <View style={{ position: "absolute", right: 30, top: midY - 11, height: 22, borderRadius: 11, backgroundColor: "white", paddingHorizontal: 10, justifyContent: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: violet, fontVariant: ["tabular-nums"] }}>{(away * 100).toFixed(1)}% to liquidation</Text>
          </View>
        )}
        {entryY !== null && (
          <View style={{ position: "absolute", left: 14, top: entryY - 10, height: 20, borderRadius: 10, backgroundColor: ink, paddingHorizontal: 8, justifyContent: "center" }}>
            <Text style={{ fontSize: 10.5, fontWeight: "700", color: "white", fontVariant: ["tabular-nums"] }}>entry {fmt(entry ?? 0)}</Text>
          </View>
        )}
        {series.length > 1 && (
          <>
            <Animated.View style={[{ position: "absolute", left: dx - 10, top: dy - 10, width: 20, height: 20, borderRadius: 10, backgroundColor: "white" }, ring]} />
            <View style={{ position: "absolute", left: dx - 5, top: dy - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: entry !== undefined ? green : "white", borderWidth: entry !== undefined ? 2 : 0, borderColor: "white" }} />
          </>
        )}
        {scrub !== null && (
          <>
            <View style={{ position: "absolute", left: sx - 6, top: sy - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: "white", borderWidth: 2.5, borderColor: violet }} />
            <View style={{ position: "absolute", left: Math.max(0, Math.min(width - 84, sx - 42)), top: 0, width: 84, height: 22, borderRadius: 11, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: violet, fontVariant: ["tabular-nums"] }}>{fmt(series[scrub])}</Text>
            </View>
          </>
        )}
      </View>
    </GestureDetector>
  );
});

// while the first candles come in: a row of soft bars where the line will be, breathing
function ChartSkeleton({ top, width }: { top: number; width: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [k]);
  const s = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * k.get() }));
  const n = 24,
    gap = 4,
    bw = (width - gap * (n - 1)) / n;
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top, width, height: PRICE_H, flexDirection: "row", alignItems: "flex-end", gap }, s]}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ width: bw, height: PRICE_H * (0.35 + 0.25 * Math.sin(i / 3.2) + 0.12 * Math.sin(i * 1.7)), borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: "#ffffff1f" }} />
      ))}
    </Animated.View>
  );
}

// leverage as a slider that snaps to its stops, a haptic on each
export function LeverageSlider({ stops, value, onChange }: { stops: number[]; value: number; onChange: (v: number) => void }) {
  const [w, setW] = useState(0);
  const at = (i: number) => (stops.length > 1 ? (i / (stops.length - 1)) * w : 0);
  const idx = Math.max(0, stops.indexOf(value));
  const knob = useSharedValue(0);
  useEffect(() => {
    knob.set(withSpring(at(idx), spring));
  }, [idx, w, stops.length]);
  const choose = (x: number) => {
    const i = Math.max(0, Math.min(stops.length - 1, Math.round((x / (w || 1)) * (stops.length - 1))));
    if (stops[i] !== value) {
      Haptics.selectionAsync();
      onChange(stops[i]);
    }
  };
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => scheduleOnRN(choose, e.x))
        .onUpdate((e) => scheduleOnRN(choose, e.x)),
    [w, value, stops.join()],
  );
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() }] }));
  const fill = useAnimatedStyle(() => ({ width: knob.get() }));
  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={{ height: 34, justifyContent: "center" }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: well }} />
          <Animated.View style={[{ position: "absolute", left: 0, height: 6, borderRadius: 3, backgroundColor: ink }, fill]} />
          {stops.map((s, i) => (
            <View key={s} style={{ position: "absolute", left: at(i) - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: i <= idx ? ink : "#D9D3E2" }} />
          ))}
          <Animated.View style={[{ position: "absolute", left: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: "white", borderWidth: 2.5, borderColor: ink }, knobStyle]} />
        </View>
      </GestureDetector>
      <View style={{ height: 16 }}>
        {stops.map((s, i) => (
          <Text key={s} style={{ position: "absolute", left: at(i) - 16, width: 32, textAlign: "center", fontSize: 11.5, fontWeight: "600", color: s === value ? ink : muted }}>
            {s}x
          </Text>
        ))}
      </View>
    </View>
  );
}

// the flight: the bolt on the button squashes into a rocket, the rocket shakes while the order is out,
// then curves up to the price dot, bursts, and the guard's shield pops out of the burst with sparks.
export type Flight = {
  squash: SharedValue<number>;
  grow: SharedValue<number>;
  shake: SharedValue<number>;
  fly: SharedValue<number>;
  burst: SharedValue<number>;
  pop: SharedValue<number>;
  sparks: SharedValue<number>;
};
export function useFlight(): Flight {
  return {
    squash: useSharedValue(0),
    grow: useSharedValue(0),
    shake: useSharedValue(0),
    fly: useSharedValue(0),
    burst: useSharedValue(0),
    pop: useSharedValue(0),
    sparks: useSharedValue(0),
  };
}
export const flight = {
  press(f: Flight) {
    f.squash.set(withTiming(1, { duration: 160 }));
    f.grow.set(withSpring(1, { duration: 420, dampingRatio: 0.5 }));
    f.shake.set(withRepeat(withSequence(withTiming(1, { duration: 45 }), withTiming(-1, { duration: 90 }), withTiming(0, { duration: 45 })), -1));
  },
  launch(f: Flight, done: () => void) {
    f.shake.set(withTiming(0, { duration: 60 }));
    f.fly.set(
      withTiming(1, { duration: 520, easing: Easing.in(Easing.cubic) }, (ok) => {
        if (!ok) return;
        f.burst.set(withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
        f.pop.set(withSpring(1, { duration: 520, dampingRatio: 0.45 }));
        f.sparks.set(withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
        scheduleOnRN(done);
      }),
    );
  },
  fizzle(f: Flight) {
    f.shake.set(withTiming(0, { duration: 60 }));
    f.grow.set(withTiming(0, { duration: 260 }));
  },
  reset(f: Flight) {
    for (const v of Object.values(f)) v.set(0);
  },
};

type Pt = { x: number; y: number };
const bez = (a: number, b: number, c: number, t: number) => {
  "worklet";
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
};

function Drip({ f, from, to, i }: { f: Flight; from: Pt; to: Pt; i: number }) {
  const cx = from.x - 60,
    cy = to.y + (from.y - to.y) * 0.45;
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, f.fly.get() - i * 0.06);
    const wobble = f.fly.get() === 0 ? 1 : 0;
    const x = bez(from.x, cx, to.x, t),
      y = bez(from.y, cy, to.y, t) + wobble * (18 + i * 6);
    const r = 6.5 - i * 0.9;
    const on = f.grow.get() > 0.5 && f.fly.get() < 1 ? 1 : 0;
    return { opacity: on * (1 - i * 0.15), transform: [{ translateX: x - r }, { translateY: y - r }, { scale: 0.6 + Math.abs(f.shake.get()) * 0.4 + (f.fly.get() > 0 ? 0.4 : 0) }] };
  });
  const r = 6.5 - i * 0.9;
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: r * 2, height: r * 2, borderRadius: r, backgroundColor: i % 2 ? "#FFB86B" : violet }, style]} />;
}

function Spark({ f, at, i }: { f: Flight; at: Pt; i: number }) {
  const a = (i / 14) * Math.PI * 2 + 0.3,
    reach = 22 + 48 * (0.7 + (i % 3) * 0.2),
    size = i % 3 === 0 ? 6 : 4;
  const style = useAnimatedStyle(() => {
    const t = f.sparks.get();
    return { opacity: t > 0 && t < 1 ? 1 - t : 0, transform: [{ translateX: at.x + Math.cos(a) * reach * t - size / 2 }, { translateY: at.y + Math.sin(a) * reach * t - size / 2 }] };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: size, height: size, borderRadius: size, backgroundColor: ["white", "#FFD37A", "#C9A6FF"][i % 3] }, style]} />;
}

export const FlightLayer = memo(function FlightLayer({ f, from, to }: { f: Flight; from: Pt | null; to: Pt | null }) {
  const a = from ?? { x: 0, y: 0 },
    b = to ?? { x: 0, y: 0 };
  const cx = a.x - 60,
    cy = b.y + (a.y - b.y) * 0.45;
  const rocket = useAnimatedStyle(() => {
    const t = f.fly.get();
    const x = bez(a.x, cx, b.x, t) + f.shake.get() * 2.2,
      y = bez(a.y, cy, b.y, t);
    const tx = 2 * (1 - t) * (cx - a.x) + 2 * t * (b.x - cx),
      ty = 2 * (1 - t) * (cy - a.y) + 2 * t * (b.y - cy);
    const heading = t > 0.01 ? (Math.atan2(ty, tx) * 180) / Math.PI + 45 : -45 + f.shake.get() * 7;
    const s = f.grow.get() * (1 + 0.3 * t);
    return { opacity: f.grow.get() > 0.02 && t < 1 ? 1 : 0, transform: [{ translateX: x - 20 }, { translateY: y - 20 }, { rotate: `${heading}deg` }, { scale: s }] };
  });
  const burst = useAnimatedStyle(() => {
    const t = f.burst.get();
    return { opacity: t > 0 && t < 1 ? 1 - t : 0, transform: [{ translateX: b.x - 40 }, { translateY: b.y - 40 }, { scale: 0.2 + t }] };
  });
  const core = useAnimatedStyle(() => {
    const t = f.burst.get();
    return { opacity: t > 0 && t < 1 ? 1 : 0, transform: [{ translateX: b.x - 26 }, { translateY: b.y - 26 }, { scale: 1 - t }] };
  });
  const shield = useAnimatedStyle(() => ({ opacity: f.pop.get() > 0.01 ? 1 : 0, transform: [{ translateX: b.x - 34 - 18 }, { translateY: b.y - 18 }, { scale: f.pop.get() }] }));
  if (!from || !to) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Drip key={i} f={f} from={a} to={b} i={i} />
      ))}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 40, height: 40 }, rocket]}>
        <Glyph name="rocket" size={40} back={violet} front={ink} />
      </Animated.View>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 80, height: 80, borderRadius: 40, backgroundColor: "white" }, burst]} />
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 52, height: 52, borderRadius: 26, backgroundColor: violet, borderWidth: 3, borderColor: "white" }, core]} />
      {Array.from({ length: 14 }, (_, i) => (
        <Spark key={i} f={f} at={{ x: b.x - 34, y: b.y }} i={i} />
      ))}
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: 36, height: 36, borderRadius: 18, backgroundColor: "white", alignItems: "center", justifyContent: "center" }, shield]}>
        <Shield size={22} color={violet} />
      </Animated.View>
    </View>
  );
});

// the button under it all: the bolt squashes as it's pressed, the button narrows to a pill with a live
// timer while the order is out, then widens again green with the fill time, or red with the reason
export type Phase = "idle" | "sending" | "filled" | "failed";
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return <>filling {(Math.max(0, now - since) / 1000).toFixed(1)}s</>;
}
export const TradeButton = memo(function TradeButton({ phase, label, detail, since, f, onPress, disabled }: { phase: Phase; label: string; detail: string; since: number; f: Flight; onPress: () => void; disabled?: boolean }) {
  const [w, setW] = useState(0);
  const narrow = useSharedValue(0);
  useEffect(() => {
    narrow.set(withSpring(phase === "sending" ? 1 : 0, { duration: 420, dampingRatio: 0.75 }));
  }, [phase, narrow]);
  const box = useAnimatedStyle(() => ({ width: w ? w - narrow.get() * (w - 190) : "100%" }));
  const bolt = useAnimatedStyle(() => ({ transform: [{ scaleX: 1 + 0.35 * f.squash.get() }, { scaleY: 1 - 0.45 * f.squash.get() }], opacity: 1 - f.squash.get() }));
  const bg = phase === "filled" ? green : phase === "failed" ? red : ink;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ alignItems: "center" }}>
      <Animated.View style={[{ height: 56, borderRadius: 28, backgroundColor: disabled ? "#B9B2C5" : bg, overflow: "hidden" }, box]}>
        <Tap onPress={phase === "idle" && !disabled ? onPress : undefined} accessibilityLabel={label} innerStyle={{ height: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {phase === "idle" && (
            <Animated.View style={bolt}>
              <Glyph name="bolt" size={20} back="#C9A6FF" front="white" />
            </Animated.View>
          )}
          {phase === "sending" && <Spinner />}
          {phase === "filled" && (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
              <Svg width={14} height={14} viewBox="0 0 14 14">
                <Path d="M2.5 7.2 L5.6 10 L11.5 3.8" stroke={green} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          )}
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: phase === "filled" ? "700" : "600", color: "white", fontVariant: ["tabular-nums"] }}>
            {phase === "idle" ? label : phase === "sending" ? <Elapsed since={since} /> : detail}
          </Text>
        </Tap>
      </Animated.View>
    </View>
  );
});

function Spinner() {
  const r = useSharedValue(0);
  useEffect(() => {
    r.set(withRepeat(withTiming(360, { duration: 700, easing: Easing.linear }), -1, false));
  }, [r]);
  const s = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return (
    <Animated.View style={s}>
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Path d="M10 1.5 A8.5 8.5 0 1 1 1.5 10" stroke="#ffffff33" strokeWidth={3} fill="none" />
        <Path d="M10 1.5 A8.5 8.5 0 0 1 18.5 10" stroke="white" strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

// a tray that springs up over a flat grey, like onboarding's. it draws inside the page rather than in
// a modal window: android loses a modal's surface when the passkey sheet (another activity) opens over
// it and the tray comes back black. the back button closes it.
export function Tray({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const y = useSharedValue(700),
    alpha = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    y.set(700);
    alpha.set(withTiming(1, { duration: 200 }));
    y.set(withSpring(0, { duration: 420, dampingRatio: 0.8 }));
  }, [visible, y, alpha]);
  const close = () => {
    alpha.set(withTiming(0, { duration: 180 }));
    y.set(withTiming(700, { duration: 220 }, (ok) => ok && scheduleOnRN(onClose)));
  };
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15))
        .onEnd((e) => {
          if (e.translationY > 110 || e.velocityY > 650) {
            alpha.set(withTiming(0, { duration: 180 }));
            y.set(withTiming(700, { duration: 220 }, () => scheduleOnRN(onClose)));
          } else y.set(withSpring(0, { duration: 380, dampingRatio: 0.8, velocity: e.velocityY }));
        }),
    [y, alpha, onClose],
  );
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] })),
    backdrop = useAnimatedStyle(() => ({ opacity: alpha.get() * 0.55 }));
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible]);
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50, elevation: 50 }]}>
      <View style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#86828F" }, backdrop]}>
          <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={close} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 8, paddingBottom: 24 }} pointerEvents="box-none">
          <GestureDetector gesture={drag}>
            <Animated.View style={[{ borderRadius: 34, backgroundColor: paper, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 }, panel]} accessibilityViewIsModal>
              <View style={{ alignSelf: "center", width: 36, height: 5, borderRadius: 3, backgroundColor: "#D9D3E2", marginBottom: 16 }} />
              {children}
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    </View>
  );
}

// the skeleton row, family's: a pale circle and two bars each side
export function SkeletonRow() {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withRepeat(withTiming(1, { duration: 900 }), -1, true));
  }, [k]);
  const s = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * k.get() }));
  const bar = (w: number, h = 12) => <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: well }} />;
  return (
    <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: 14, height: 84, paddingHorizontal: 14 }, s]}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: well }} />
      <View style={{ flex: 1, gap: 10 }}>
        {bar(120, 14)}
        {bar(60)}
      </View>
      <View style={{ alignItems: "flex-end", gap: 10 }}>
        {bar(64, 14)}
        {bar(40)}
      </View>
    </Animated.View>
  );
}
