// the art on home, in the same language as the onboarding trays: a flat violet card, a faint rail
// behind, real coins in front, and a skeleton of the list it stands for fading out at the bottom.
// markets: every market is a coin on a line, up today floats above it, down today sinks below.
// positions: the bird in the white circle is the guard, your positions sit either side of it.
import { useEffect } from "react";
import { View } from "react-native";
import Svg, { Rect, Line, Circle, Path, Defs, LinearGradient, Stop, Mask, G, Text as SvgText } from "react-native-svg";
import Animated, { Easing, ReduceMotion, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { Text } from "./Text";
import { Coin } from "./Coin";
import { PehraBird } from "./PehraBird";
import type { LiveMarket } from "../live";
import type { PositionHealth } from "../guard";

const violet = "#9E4DFD",
  ink = "#28243E",
  muted = "#706A7D",
  green = "#23765A",
  red = "#B4474D",
  amber = "#9A6B1C",
  line = "#EEEAF2";
export const CARD_H = 236;
const spring = { duration: 700, dampingRatio: 0.75, reduceMotion: ReduceMotion.System };

export const distanceColor = (away: number, threshold: number) => (away < threshold ? red : away < 15 ? amber : green);

// nucleo's shield-check, filled, the check cut out in the background colour
export function Shield({ size = 14, color = violet, cut = "white" }: { size?: number; color?: string; cut?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20.3777 12.9014L21 4.5L20.4499 4.445C17.508 4.1508 14.6445 3.32223 12 2C9.35553 3.32223 6.49199 4.1508 3.55006 4.44499L3 4.5L3.62236 12.9014C3.85658 16.0632 5.73712 18.8685 8.57285 20.2864L12.0001 22L15.4272 20.2864C18.263 18.8685 20.1435 16.0632 20.3777 12.9014Z"
        fill={color}
      />
      <Path d="M8.5 12L11 14.5L16 9.5" stroke={cut} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

// the rail and the skeleton list behind the coins, fading out towards the bottom
function Backdrop({ width, id, bars }: { width: number; id: string; bars: [number, number][] }) {
  const h = CARD_H,
    top = id === "m" ? 150 : 158;
  return (
    <Svg width={width} height={h} style={{ position: "absolute" }}>
      <Defs>
        <LinearGradient id={id + "g"} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="white" stopOpacity={1} />
          <Stop offset="0.55" stopColor="white" stopOpacity={1} />
          <Stop offset="1" stopColor="white" stopOpacity={0} />
        </LinearGradient>
        <Mask id={id} x={0} y={0} width={width} height={h} maskUnits="userSpaceOnUse">
          <Rect x={0} y={0} width={width} height={h} fill={`url(#${id}g)`} />
        </Mask>
      </Defs>
      <G mask={`url(#${id})`}>
        <Rect x={14} y={16} width={width - 28} height={h + 60} rx={40} fill="none" stroke="#ffffff1f" strokeWidth={10} />
        <Rect x={28} y={top} width={width - 56} height={bars.length * 26 + 40} rx={16} fill="#ffffff1f" />
        {bars.map(([a, b], i) => {
          const y = top + 22 + i * 26;
          return (
            <G key={i}>
              <SvgText x={46} y={y + 9} fontSize={10.5} fontWeight="600" fill="#ffffff80" textAnchor="middle">
                {i + 1}
              </SvgText>
              <Rect x={62} y={y} width={a} height={10} rx={5} fill="#ffffff55" />
              <Rect x={width - 46 - b} y={y} width={b} height={10} rx={5} fill="#ffffff40" />
              <Line x1={62} x2={width - 46} y1={y + 17} y2={y + 17} stroke="#ffffff1c" />
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

const pctLabel = (c: number) => (c >= 0 ? "+" : "−") + Math.abs(c).toFixed(1) + "%";

function Floater({ m, x, base, scale, top, index }: { m: LiveMarket; x: number; base: number; scale: number; top: boolean; index: number }) {
  const lift = useSharedValue(0);
  const target = -m.change24h * scale;
  useEffect(() => {
    lift.set(withDelay(index * 50, withSpring(target, spring)));
  }, [target, index, lift]);
  const r = top ? 17 : 14,
    ring = top ? 7 : 4,
    up = m.change24h >= 0;
  const coin = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() }] }));
  const stem = useAnimatedStyle(() => {
    const d = lift.get();
    return { top: base + Math.min(0, d), height: Math.abs(d) };
  });
  const pillY = up ? -(r + ring + 20) : r + ring + 4;
  return (
    <>
      <Animated.View style={[{ position: "absolute", left: x - 1, width: 2, backgroundColor: "#ffffff59" }, stem]} />
      <Animated.View style={[{ position: "absolute", left: x - r - ring, top: base - r - ring, alignItems: "center" }, coin]}>
        <View style={{ padding: ring, borderRadius: 99, backgroundColor: top ? "white" : violet }}>
          <Coin symbol={m.symbol} size={r * 2} />
        </View>
        <View style={{ position: "absolute", top: pillY + r + ring - 9, width: 44, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: top ? "white" : "#ffffff2e" }}>
          <Text style={{ fontSize: 10.5, fontWeight: "700", color: top ? green : "white", fontVariant: ["tabular-nums"] }}>{pctLabel(m.change24h)}</Text>
        </View>
      </Animated.View>
    </>
  );
}

export function MarketsArt({ markets, width }: { markets: LiveMarket[]; width: number }) {
  const list = markets.slice(0, 7);
  const base = 96;
  const most = Math.max(0.1, ...list.map((m) => Math.abs(m.change24h)));
  const scale = 34 / most;
  const mover = list.reduce<LiveMarket | null>((a, b) => (!a || Math.abs(b.change24h) > Math.abs(a.change24h) ? b : a), null);
  const gap = list.length > 1 ? (width - 64) / (list.length - 1) : 0;
  return (
    <View style={{ width, height: CARD_H, borderRadius: 28, backgroundColor: violet, overflow: "hidden" }}>
      <Backdrop width={width} id="m" bars={[[92, 40], [70, 46], [84, 36], [64, 42]]} />
      <Svg width={width} height={CARD_H} style={{ position: "absolute" }}>
        <Line x1={20} x2={width - 20} y1={base} y2={base} stroke="white" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 7" strokeLinecap="round" />
      </Svg>
      {list.map((m, i) => (
        <Floater key={m.id} m={m} x={list.length > 1 ? 32 + i * gap : width / 2} base={base} scale={scale} top={m.id === mover?.id} index={i} />
      ))}
    </View>
  );
}

// the bird in the middle opens its eyes by how close the closest position is, the two positions
// nearest liquidation sit either side, two markets you dont hold fade at the edges
export function PositionsArt({ health, markets, threshold, open, width }: { health: PositionHealth[]; markets: LiveMarket[]; threshold: number; open: number; width: number }) {
  const eyes = useSharedValue(0),
    glance = useSharedValue(0);
  useEffect(() => {
    eyes.set(withSpring(open, { duration: 500, dampingRatio: 0.7 }));
  }, [open, eyes]);
  const cx = width / 2,
    cy = 92;
  const near = [...health].sort((a, b) => a.distance - b.distance).slice(0, 2);
  const held = new Set(health.map((h) => h.symbol));
  const edge = markets.filter((m) => !held.has(m.symbol)).slice(0, 2);
  const side = (h: PositionHealth, x: number) => {
    const away = h.distance * 100;
    return (
      <View key={h.pid} style={{ position: "absolute", left: x - 26, top: cy - 26, alignItems: "center" }}>
        <View style={{ padding: 4, borderRadius: 99, backgroundColor: violet }}>
          <Coin symbol={h.symbol} size={44} />
        </View>
        <View style={{ marginTop: 4, width: 54, height: 20, borderRadius: 10, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: distanceColor(away, threshold), fontVariant: ["tabular-nums"] }}>{away.toFixed(1)}%</Text>
        </View>
      </View>
    );
  };
  return (
    <View style={{ width, height: CARD_H, borderRadius: 28, backgroundColor: violet, overflow: "hidden" }}>
      <Backdrop width={width} id="p" bars={[[60, 52], [88, 40], [72, 48], [80, 36]]} />
      <Svg width={width} height={CARD_H} style={{ position: "absolute" }}>
        <Circle cx={cx} cy={cy} r={76} fill="none" stroke="#ffffff40" strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={48} fill="#ffffff3a" />
        <Circle cx={cx} cy={cy} r={42} fill="white" />
      </Svg>
      {edge.map((m, i) => (
        <View key={m.id} style={{ position: "absolute", left: (i === 0 ? 30 : width - 30) - 13, top: cy - 13, opacity: 0.5 }}>
          <Coin symbol={m.symbol} size={26} />
        </View>
      ))}
      {near[0] && side(near[0], 94)}
      {near[1] && side(near[1], width - 94)}
      <View style={{ position: "absolute", left: cx - 28, top: cy - 28 }}>
        <PehraBird size={56} open={eyes} shift={glance} body={violet} face="white" />
      </View>
      <View style={{ position: "absolute", left: cx + 14, top: cy + 22, width: 30, height: 30, borderRadius: 15, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
        <Shield size={15} color="white" cut={ink} />
      </View>
    </View>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

// the ring around the coin fills by how far the position is from liquidation, a quarter of the way
// to the right counts as fully safe
function Ring({ away, color }: { away: number; color: string }) {
  const r = 25,
    c = 2 * Math.PI * r;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.set(withTiming(Math.max(0.03, Math.min(1, away / 40)), { duration: 700, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System }));
  }, [away, fill]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - fill.get()) }));
  return (
    <Svg width={58} height={58} style={{ position: "absolute" }}>
      <Circle cx={29} cy={29} r={r} fill="none" stroke={line} strokeWidth={4} />
      <ACircle cx={29} cy={29} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={props} transform="rotate(-90 29 29)" />
    </Svg>
  );
}

function SideBadge({ long }: { long: boolean }) {
  return (
    <View style={{ position: "absolute", right: -1, bottom: -1, width: 22, height: 22, borderRadius: 11, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Circle cx={9} cy={9} r={9} fill={long ? green : red} />
        <Path d={long ? "M5.5 10.5 L9 7 L12.5 10.5" : "M5.5 7.5 L9 11 L12.5 7.5"} stroke="white" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export function PositionCard({ h, threshold }: { h: PositionHealth; threshold: number }) {
  const away = h.distance * 100;
  const long = h.side === "long";
  const pnl = (long ? 1 : -1) * (h.mark - h.entry) * h.size;
  const col = distanceColor(away, threshold);
  const stepping = away < threshold;
  return (
    <View style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, paddingHorizontal: 14, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 14 }}>
      <View style={{ width: 58, height: 58, alignItems: "center", justifyContent: "center" }}>
        <Ring away={away} color={col} />
        <Coin symbol={h.symbol} size={38} />
        <SideBadge long={long} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: ink }}>
          {h.symbol.toLowerCase()} {h.side} {h.lv / 100}x
        </Text>
        <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted, fontVariant: ["tabular-nums"] }}>
          {h.size} {h.symbol.toLowerCase()} · {h.collateral.toFixed(2)} margin
        </Text>
        <Text style={{ fontSize: 12, fontWeight: "600", color: col, fontVariant: ["tabular-nums"] }}>{away.toFixed(1)}% from liquidation</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 10 }}>
        <View style={{ backgroundColor: pnl >= 0 ? "#23765A1a" : "#B4474D1a", borderRadius: 16, paddingHorizontal: 12, height: 32, justifyContent: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>
            {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Shield size={13} color={stepping ? red : violet} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: stepping ? red : violet }}>{stepping ? "stepping in" : "guarded"}</Text>
        </View>
      </View>
    </View>
  );
}
