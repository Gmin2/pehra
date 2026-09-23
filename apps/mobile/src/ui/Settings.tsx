// settings' drawers (tmp/claude/preview/drw-1.png): a ruler from liquidation to safe with your open
// positions riding it, and the guard's shield you drag along it; the same ruler with a second handle
// for where the guard brings a position back to; and the daily limit as coin stacks.
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Ellipse, G } from "react-native-svg";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming, ZoomIn, ReduceMotion } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Text } from "./Text";
import { Coin } from "./Coin";
import { Shield } from "./Home";

const ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  violet = "#9E4DFD",
  green = "#23765A",
  red = "#B4474D",
  well = "#F0EDF3";

export type Rider = { symbol: string; away: number };
export const MAX_PCT = 30;
const spring = { duration: 320, dampingRatio: 0.8, reduceMotion: ReduceMotion.System };

// a coin on the ruler; it shakes while the red zone reaches it
function RiderCoin({ r, x, hit }: { r: Rider; x: number; hit: boolean }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(hit ? withRepeat(withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 120 }), withTiming(0, { duration: 60 })), 3) : 0);
  }, [hit, k]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: k.get() * 2.5 }] }));
  return (
    <Animated.View style={[{ position: "absolute", left: x - 16, top: 0, width: 32, alignItems: "center" }, style]}>
      <Text style={{ fontSize: 10.5, fontWeight: "700", color: hit ? red : ink, fontVariant: ["tabular-nums"] }}>{r.away.toFixed(r.away < 10 ? 1 : 0)}%</Text>
      <View style={{ marginTop: 3, borderRadius: 16, borderWidth: 2.5, borderColor: hit ? red : "white" }}>
        <Coin symbol={r.symbol} size={26} />
      </View>
      <View style={{ width: 1.5, height: 14, backgroundColor: faint, marginTop: 2 }} />
    </Animated.View>
  );
}

// the ruler. `value` is the handle being dragged; `fixed` is the other line, drawn but not movable
export function Ruler({ riders, value, onChange, fixed, mode, min = 1, max = MAX_PCT }: { riders: Rider[]; value: number; onChange: (v: number) => void; fixed?: number; mode: "step" | "back"; min?: number; max?: number }) {
  const [w, setW] = useState(0);
  const pad = 20;
  const at = (p: number) => pad + (Math.min(p, MAX_PCT) / MAX_PCT) * (w - pad * 2);
  const knob = useSharedValue(0);
  useEffect(() => {
    if (w) knob.set(withSpring(at(value), spring));
  }, [value, w]);
  const choose = (x: number) => {
    const p = Math.round(((x - pad) / (w - pad * 2)) * MAX_PCT);
    const v = Math.max(min, Math.min(max, p));
    if (v !== value) {
      Haptics.selectionAsync();
      onChange(v);
    }
  };
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((e) => scheduleOnRN(choose, e.x))
        .onUpdate((e) => scheduleOnRN(choose, e.x)),
    [w, value, min, max],
  );
  const step = mode === "step" ? value : fixed ?? 0;
  const back = mode === "back" ? value : fixed;
  // worklets can't call at(), so the fixed line's x is worked out here
  const stepX = at(step);
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.get() }] }));
  const redW = useAnimatedStyle(() => ({ width: mode === "step" ? Math.max(0, knob.get() - pad) : Math.max(0, stepX - pad) }));
  const band = useAnimatedStyle(() => (mode === "back" ? { left: stepX - pad, width: Math.max(0, knob.get() - stepX) } : { left: 0, width: 0 }));
  const ticks = [0, 5, 10, 15, 20, 25, 30];
  return (
    <View style={{ backgroundColor: "white", borderRadius: 24, paddingTop: 16, paddingBottom: 14 }}>
      <GestureDetector gesture={pan}>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 120 }}>
          {w > 0 &&
            riders.map((r) => (
              <RiderCoin key={r.symbol + r.away} r={r} x={at(r.away)} hit={r.away < step} />
            ))}
          <View style={{ position: "absolute", left: pad, right: pad, top: 86, height: 10, borderRadius: 5, backgroundColor: well, overflow: "hidden" }}>
            <Animated.View style={[{ position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "#F2C6CB" }, redW]} />
            {mode === "back" && <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, backgroundColor: "#C9A6FF" }, band]} />}
          </View>
          {mode === "back" && w > 0 && (
            <View style={{ position: "absolute", left: at(step) - 13, top: 78, width: 26, height: 26, borderRadius: 13, backgroundColor: violet, borderWidth: 3, borderColor: "white", alignItems: "center", justifyContent: "center" }}>
              <Shield size={12} color="white" cut={violet} />
            </View>
          )}
          {mode === "step" && back !== undefined && w > 0 && <View style={{ position: "absolute", left: at(back) - 1, top: 80, width: 2, height: 22, borderRadius: 1, backgroundColor: green }} />}
          <Animated.View style={[{ position: "absolute", left: -17, top: 74, width: 34, height: 34, borderRadius: 17, backgroundColor: mode === "step" ? violet : "white", borderWidth: 3, borderColor: mode === "step" ? "white" : green, alignItems: "center", justifyContent: "center" }, knobStyle]}>
            {mode === "step" ? <Shield size={17} color="white" cut={violet} /> : <Text style={{ color: green, fontSize: 14, fontWeight: "700" }}>✓</Text>}
          </Animated.View>
        </View>
      </GestureDetector>
      {/* ticks, with liquidation and safe named under the ends so nothing riding above can touch them */}
      <View style={{ height: 34, marginTop: 2 }}>
        {w > 0 &&
          ticks.map((p) => (
            <View key={p} style={{ position: "absolute", left: at(p) - 22, width: 44, alignItems: "center" }}>
              <View style={{ width: 1.5, height: 6, backgroundColor: faint }} />
              <Text style={{ fontSize: 10.5, fontWeight: "600", color: faint, marginTop: 3 }}>{p === 30 ? "30%+" : p + "%"}</Text>
            </View>
          ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: pad - 4 }}>
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: red }}>liquidation</Text>
        <Text style={{ fontSize: 11.5, fontWeight: "700", color: muted }}>safe</Text>
      </View>
    </View>
  );
}

// the daily limit as stacks of five coins, each coin a rim and a face with a ring, dropping in
const COIN_FACE = "#C9B25A",
  COIN_RIM = "#8C7A2E",
  COIN_RING = "#EADFA8";
function Stack({ size }: { size: number }) {
  const h = size * 0.34,
    gap = size * 0.2;
  const coins = 5,
    total = h + gap * (coins - 1) + 4;
  return (
    <Svg width={size + 2} height={total}>
      {Array.from({ length: coins }, (_, i) => {
        const y = total - h / 2 - 2 - i * gap;
        return (
          <G key={i}>
            <Ellipse cx={size / 2 + 1} cy={y + 3} rx={size / 2} ry={h / 2} fill={COIN_RIM} />
            <Ellipse cx={size / 2 + 1} cy={y} rx={size / 2} ry={h / 2} fill={COIN_FACE} />
            <Ellipse cx={size / 2 + 1} cy={y} rx={size * 0.32} ry={h * 0.3} fill="none" stroke={COIN_RING} strokeWidth={1.3} />
          </G>
        );
      })}
    </Svg>
  );
}
export function CoinStacks({ amount }: { amount: number }) {
  const stacks = Math.max(1, Math.round(amount / 5));
  const size = stacks > 6 ? 30 : 48;
  return (
    <View style={{ backgroundColor: "white", borderRadius: 24, height: 150, paddingHorizontal: 12, alignItems: "center", justifyContent: "flex-end", paddingBottom: 20 }}>
      <Text style={{ position: "absolute", top: 12, fontSize: 11.5, fontWeight: "600", color: faint }}>each stack is 5 ausd</Text>
      <View style={{ flexDirection: "row", gap: stacks > 6 ? 5 : 16, alignItems: "flex-end" }}>
        {Array.from({ length: stacks }, (_, i) => (
          <Animated.View key={i + ":" + stacks} entering={ZoomIn.delay(i * 45).springify().damping(12).reduceMotion(ReduceMotion.System)}>
            <Stack size={size} />
          </Animated.View>
        ))}
      </View>
      <View style={{ position: "absolute", left: 24, right: 24, bottom: 16, height: 1, backgroundColor: "#EEEAF2" }} />
    </View>
  );
}

// a toggle that springs
export function Toggle({ on, onChange, light = false }: { on: boolean; onChange: (v: boolean) => void; light?: boolean }) {
  const x = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    x.set(withSpring(on ? 1 : 0, spring));
  }, [on, x]);
  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * 18 }] }));
  return (
    <GestureDetector gesture={Gesture.Tap().onEnd(() => scheduleOnRN(onChange, !on))}>
      <View accessibilityRole="switch" accessibilityState={{ checked: on }} style={{ width: 48, height: 30, borderRadius: 15, padding: 3, backgroundColor: on ? (light ? "#ffffff55" : violet) : "#D9D3E2" }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: "white" }, dot]} />
      </View>
    </GestureDetector>
  );
}
