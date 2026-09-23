// position detail's pieces, from tmp/claude/preview/position-anim.mp4: the coin with its distance
// ring, a number that rolls when it changes, the one line chart that draws itself, the quiet rows,
// the coin that drops into the ring on a margin add, and the button you hold to close.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Pressable } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Coin } from "./Coin";
import { Glyph } from "./Glyph";
import { Chevron } from "./components";
import type { Point } from "../candles";

export const violet = "#9E4DFD",
  ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  green = "#23765A",
  red = "#B4474D",
  amber = "#9A6B1C",
  line = "#EEEAF2",
  well = "#F0EDF3",
  paper = "#FAF8F2";

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

// the coin inside a thin ring that fills by distance to liquidation, a quarter away counts as full.
// a ripple goes out when `pulse` changes (a margin add landing)
export function CoinRing({ symbol, long, away, pulse }: { symbol: string; long: boolean; away: number; pulse: number }) {
  const r = 31,
    c = 2 * Math.PI * r,
    size = 74;
  const fill = useSharedValue(0),
    ripple = useSharedValue(1);
  const color = away < 5 ? red : away < 15 ? amber : green;
  useEffect(() => {
    fill.set(withTiming(Math.max(0.03, Math.min(1, away / 40)), { duration: 800, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [away, fill]);
  useEffect(() => {
    if (!pulse) return;
    ripple.set(0);
    ripple.set(withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
  }, [pulse, ripple]);
  const arc = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - fill.get()) }));
  const wave = useAnimatedStyle(() => ({ opacity: 1 - ripple.get(), transform: [{ scale: 1 + ripple.get() * 0.5 }] }));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={[{ position: "absolute", width: size - 8, height: size - 8, borderRadius: size, borderWidth: 2.5, borderColor: green }, wave]} />
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={line} strokeWidth={3.5} />
        <ACircle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={arc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Coin symbol={symbol} size={48} />
      <View style={{ position: "absolute", right: 4, bottom: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
        <Svg width={18} height={18} viewBox="0 0 18 18">
          <Circle cx={9} cy={9} r={9} fill={long ? green : red} />
          <Path d={long ? "M5.5 10.5 L9 7 L12.5 10.5" : "M5.5 7.5 L9 11 L12.5 7.5"} stroke="white" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
    </View>
  );
}

// a piece of text that rolls up to its new value, like a counter
export function Roll({ text, style }: { text: string; style: object }) {
  return (
    <View style={{ overflow: "hidden" }}>
      <Animated.Text key={text} entering={FadeInDown.duration(220).reduceMotion(ReduceMotion.System)} exiting={FadeOutUp.duration(160)} style={style}>
        {text}
      </Animated.Text>
    </View>
  );
}

// a money figure that counts up the first time it shows, then rolls on changes
export function CountUp({ value, style, prefix = "$" }: { value: number; style: object; prefix?: string }) {
  const [shown, setShown] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current) return setShown(value);
    first.current = false;
    const t0 = Date.now();
    const id = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / 800);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k >= 1) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <Roll text={prefix + shown.toFixed(2)} style={style} />;
}

// the chart as family draws it: one line, a dot where you came in, a pulsing dot for now
export function LineSince({ points, entryAt, width, height = 64 }: { points: Point[]; entryAt?: number; width: number; height?: number }) {
  const { d, len, entry, last } = useMemo(() => {
    if (points.length < 2) return { d: "", len: 0, entry: null, last: null };
    const lo = Math.min(...points.map((p) => p.p)),
      hi = Math.max(...points.map((p) => p.p)),
      span = hi - lo || hi * 0.001 || 1;
    const X = (i: number) => (i / (points.length - 1)) * (width - 8) + 4,
      Y = (v: number) => 4 + (height - 8) - ((v - lo) / span) * (height - 8);
    let dd = "",
      l = 0,
      px = 0,
      py = 0;
    points.forEach((p, i) => {
      const x = X(i),
        y = Y(p.p);
      dd += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
      if (i) l += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    });
    const ei = entryAt ? points.findIndex((p) => p.t >= entryAt) : -1;
    return { d: dd, len: l, entry: ei > 0 ? { x: X(ei), y: Y(points[ei].p) } : null, last: { x: X(points.length - 1), y: Y(points[points.length - 1].p) } };
  }, [points, entryAt, width, height]);
  const draw = useSharedValue(0),
    pulse = useSharedValue(0),
    drawn = useRef(false);
  useEffect(() => {
    if (!len || drawn.current) return;
    drawn.current = true;
    draw.set(withTiming(1, { duration: 1000, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
    pulse.set(withRepeat(withTiming(1, { duration: 1300 }), -1, false));
  }, [len, draw, pulse]);
  const stroke = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - draw.get()) }));
  const dot = useAnimatedStyle(() => ({ opacity: draw.get() > 0.98 ? 1 : 0 }));
  const halo = useAnimatedStyle(() => ({ opacity: draw.get() > 0.98 ? 0.3 * (1 - pulse.get()) : 0, transform: [{ scale: 1 + pulse.get() * 1.8 }] }));
  if (!d)
    return (
      <View style={{ width, height, justifyContent: "center" }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: well }} />
      </View>
    );
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={{ position: "absolute" }}>
        <APath d={d} stroke={violet} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${len} ${len}`} animatedProps={stroke} />
      </Svg>
      {entry && <Animated.View style={[{ position: "absolute", left: entry.x - 5, top: entry.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: "white", borderWidth: 2, borderColor: ink }, dot]} />}
      {last && (
        <>
          <Animated.View style={[{ position: "absolute", left: last.x - 5, top: last.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: violet }, halo]} />
          <Animated.View style={[{ position: "absolute", left: last.x - 5, top: last.y - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: violet }, dot]} />
        </>
      )}
    </View>
  );
}

// one quiet row: a two tone glyph, the label, the value, a chevron when it opens a tray
export function Row({ glyph, label, value, color = ink, onPress, index = 0, back }: { glyph: string; label: string; value: ReactNode; color?: string; onPress?: () => void; index?: number; back?: string }) {
  const body = (
    <View style={{ height: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Glyph name={glyph} size={22} color={glyph === "flame" ? red : violet} back={back} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: muted }}>{label}</Text>
      {typeof value === "string" ? <Roll text={value} style={{ fontFamily: "Manrope_600SemiBold", fontSize: 14, color }} /> : value}
      {onPress && <Chevron />}
    </View>
  );
  return (
    <Animated.View entering={FadeInDown.delay(420 + index * 70).springify().damping(20).reduceMotion(ReduceMotion.System)}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Animated.View>
  );
}

// hold to close: the button fills red while held, lets go if released early, fires when full
export function HoldButton({ label, holding, done, onDone, disabled }: { label: string; holding: string; done: string | null; onDone: () => void; disabled?: boolean }) {
  const [w, setW] = useState(0),
    [held, setHeld] = useState(false);
  const k = useSharedValue(0);
  const start = () => {
    if (disabled || done) return;
    setHeld(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    k.set(
      withTiming(1, { duration: 1000, easing: Easing.linear }, (ok) => {
        if (ok) scheduleOnRN(fire);
      }),
    );
  };
  const fire = () => {
    setHeld(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDone();
  };
  const stop = () => {
    if (k.get() >= 1) return;
    cancelAnimation(k);
    k.set(withTiming(0, { duration: 180 }));
    setHeld(false);
  };
  const bar = useAnimatedStyle(() => ({ width: k.get() * w }));
  return (
    <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="press and hold" onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flex: 1 }}>
      <View style={{ height: 56, borderRadius: 28, overflow: "hidden", backgroundColor: done ? green : disabled ? faint : ink, justifyContent: "center" }}>
        {!done && <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: red }, bar]} />}
        <Text style={{ textAlign: "center", fontSize: 15.5, fontWeight: "600", color: "white" }}>{done ?? (held ? holding : label)}</Text>
      </View>
    </Pressable>
  );
}

// the ausd coin that arcs from the add margin button into the ring
export function DropCoin({ from, to, run, onLand }: { from: { x: number; y: number } | null; to: { x: number; y: number } | null; run: number; onLand: () => void }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!run || !from || !to) return;
    t.set(0);
    t.set(
      withSequence(
        withSpring(0.02, { duration: 120 }),
        withTiming(1, { duration: 560, easing: Easing.inOut(Easing.cubic) }, (ok) => {
          if (ok) scheduleOnRN(onLand);
        }),
      ),
    );
  }, [run]);
  const a = from ?? { x: 0, y: 0 },
    b = to ?? { x: 0, y: 0 };
  const style = useAnimatedStyle(() => {
    const v = t.get();
    const x = a.x + (b.x - a.x) * v,
      y = a.y + (b.y - a.y) * v - Math.sin(v * Math.PI) * 120;
    const s = v < 0.85 ? 1 : 1 - (v - 0.85) / 0.15;
    return { opacity: v > 0 && v < 1 ? 1 : 0, transform: [{ translateX: x - 13 }, { translateY: y - 13 }, { scale: 0.4 + 0.6 * s }] };
  });
  if (!from || !to) return null;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: 0, top: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: "white", padding: 2 }, style]}>
      <Coin symbol="AUSD" size={22} />
    </Animated.View>
  );
}
