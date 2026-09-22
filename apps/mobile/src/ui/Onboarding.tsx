// the pieces of family's onboarding, drawn from the reference recordings in ui/references
// (clips 17, 36 and 45): the stacked card hero, square checks, the grid that works while the
// account is made, the account card with its pill and tooltip, the education trays, the done card.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, Image, Modal, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Rect, Path, Circle, G, Line, Defs, LinearGradient, Stop, Mask, Text as SvgText } from "react-native-svg";
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withSpring,
  withRepeat,
  withDelay,
  withSequence,
  Easing,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Tap, Icon } from "./components";
import { images } from "./assets";
import logoData from "./logos.json";

// family's onboarding violet, shifted a little toward pehra dusk. measured off clip 36 at full size.
export const ink = "#1a1a1a",
  muted = "#999",
  violet = "#8B5CF6",
  dusk = violet,
  accent = violet,
  mist = "#EFEAFB",
  paleGrid = "#ECE8F5";

const spring = { duration: 300, dampingRatio: 0.8, overshootClamping: true, reduceMotion: ReduceMotion.System };

// three cards fanned behind each other, the front one lifts in (clip 17, frame one)
export function CardStack({ width }: { width: number }) {
  const rise = useSharedValue(24),
    reduced = useReducedMotion();
  useEffect(() => {
    rise.set(withSpring(0, { ...spring, duration: 500 }));
  }, [rise]);
  const front = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : rise.get() }] }));
  const w = Math.min(width - 96, 300);
  const card = (color: string, top: number, inset: number) => (
    <View
      style={{
        position: "absolute",
        top,
        left: inset,
        right: inset,
        height: w * 0.52,
        borderRadius: 18,
        backgroundColor: color,
      }}
    />
  );
  return (
    <View style={{ height: w * 0.52 + 36, width: w, alignSelf: "center" }}>
      {card("#D9CCFD", 0, 26)}
      {card("#B79BFB", 12, 13)}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 26,
            left: 0,
            right: 0,
            height: w * 0.52,
            borderRadius: 18,
            backgroundColor: accent,
            padding: 16,
            justifyContent: "space-between",
          },
          front,
        ]}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Image source={images["pehra-mark-paper"]} style={{ width: 34, height: 34 }} />
          <View style={{ width: 70, height: 12, borderRadius: 6, backgroundColor: "#ffffff40" }} />
        </View>
        <View style={{ gap: 6 }}>
          <View style={{ width: 90, height: 10, borderRadius: 5, backgroundColor: "#ffffff55" }} />
          <View style={{ width: 54, height: 8, borderRadius: 4, backgroundColor: "#ffffff30" }} />
        </View>
      </Animated.View>
    </View>
  );
}

// a rounded grey choice card with a round icon, title, subtitle, and family's three dots
export function ChoiceCard({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={title}
      innerStyle={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        backgroundColor: "#f6f5f8",
        borderRadius: 20,
        paddingVertical: 16,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={16} color="white" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: muted }}>{subtitle}</Text>
      </View>
      <Text style={{ color: "#c8c4d0", fontSize: 14, letterSpacing: 1 }}>⋮</Text>
    </Tap>
  );
}

// the rounded square checkbox from the terms screen, the tick pops in
export function SquareCheck({ checked, color = accent }: { checked: boolean; color?: string }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 7,
        borderWidth: checked ? 0 : 2,
        borderColor: "#dcd8e3",
        backgroundColor: checked ? color : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && (
        <Animated.View entering={ZoomIn.springify().damping(14).stiffness(320).reduceMotion(ReduceMotion.System)}>
          <Icon name="check" size={14} color="white" />
        </Animated.View>
      )}
    </View>
  );
}

// the faint card sized grid, cells flicker as work happens (clip 36, "creating your wallet")
function GridCell({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  const o = useSharedValue(0),
    reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    o.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 700 })),
          -1,
          false,
        ),
      ),
    );
  }, [o, delay, reduced]);
  const props = useAnimatedProps(() => ({ opacity: o.get() * 0.55 }));
  return <ACell animatedProps={props} x={x + 2} y={y + 2} width={size - 4} height={size - 4} rx={3} fill={dusk} />;
}
const ACell = Animated.createAnimatedComponent(Rect);

export function WorkingGrid({ width }: { width: number }) {
  const w = Math.min(width - 72, 320),
    h = w * 0.6,
    cols = 12,
    size = w / cols,
    rows = Math.floor(h / size);
  const lit = useMemo(
    () => Array.from({ length: 16 }, (_, i) => ({ c: (i * 7 + 3) % cols, r: (i * 5 + 1) % rows, d: i * 170 })),
    [rows],
  );
  return (
    <View style={{ width: w, height: rows * size, alignSelf: "center", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: paleGrid }}>
      <Svg width={w} height={rows * size}>
        <G>
          {Array.from({ length: cols + 1 }, (_, i) => (
            <Line key={"v" + i} x1={i * size} x2={i * size} y1={0} y2={rows * size} stroke={paleGrid} strokeWidth={1} />
          ))}
          {Array.from({ length: rows + 1 }, (_, i) => (
            <Line key={"h" + i} y1={i * size} y2={i * size} x1={0} x2={w} stroke={paleGrid} strokeWidth={1} />
          ))}
        </G>
        {lit.map((c, i) => (
          <GridCell key={i} x={c.c * size} y={c.r * size} size={size} delay={c.d} />
        ))}
      </Svg>
    </View>
  );
}

const short = (a?: string) => (a ? `${a.slice(0, 6)}····${a.slice(-4)}` : "");

// family's highlight: each letter takes a step of the violet to pink gradient
const FROM = [124, 92, 255],
  TO = [225, 71, 196];
const mix = (t: number) => `rgb(${FROM.map((f, i) => Math.round(f + (TO[i] - f) * t)).join(",")})`;
export function GradientText({ children, weight = "500" }: { children: string; weight?: "500" | "600" }) {
  const chars = Array.from(children);
  return (
    <Text>
      {chars.map((c, i) => (
        <Text key={i} style={{ color: mix(chars.length > 1 ? i / (chars.length - 1) : 0), fontWeight: weight }}>
          {c}
        </Text>
      ))}
    </Text>
  );
}
export const Em = ({ children }: { children: string }) => <GradientText>{children}</GradientText>;

// the soft arc under a word, violet into pink, drawn left to right
function Swash({ width, delay = 250 }: { width: number; delay?: number }) {
  const draw = useSharedValue(0);
  useEffect(() => {
    draw.set(withDelay(delay, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })));
  }, [draw, delay]);
  const clip = useAnimatedStyle(() => ({ width: width * draw.get() }));
  return (
    <Animated.View style={[{ height: 8, overflow: "hidden", marginTop: -2 }, clip]}>
      <Svg width={width} height={8}>
        <Defs>
          <LinearGradient id="swash" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#7C5CFF" />
            <Stop offset="1" stopColor="#E147C4" />
          </LinearGradient>
        </Defs>
        <Path d={`M2 5 Q ${width / 2} 1.5 ${width - 2} 4.5`} stroke="url(#swash)" strokeWidth={3} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

// a heading that wraps word by word, with one phrase in the gradient and a swash under it
export type Heading = (string | { u: string })[];
export function HeadingText({ parts, size = 23, center = false }: { parts: Heading; size?: number; center?: boolean }) {
  const words: { w: string; u: boolean }[] = [];
  for (const p of parts) {
    if (typeof p === "string") p.split(" ").filter(Boolean).forEach((w) => words.push({ w, u: false }));
    else words.push({ w: p.u, u: true });
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start", columnGap: size * 0.26 }}>
      {words.map((x, i) => (
        <Underlinable key={i} word={x.w} underline={x.u} size={size} />
      ))}
    </View>
  );
}
function Underlinable({ word, underline, size }: { word: string; underline: boolean; size: number }) {
  const [w, setW] = useState(0);
  const style = { fontSize: size, lineHeight: size * 1.27, fontWeight: "600" as const, letterSpacing: -0.4, color: ink };
  if (!underline) return <Text style={style}>{word}</Text>;
  const trail = /[.,!?…]$/.test(word) ? word.slice(-1) : "";
  const core = trail ? word.slice(0, -1) : word;
  return (
    <View style={{ flexDirection: "row" }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <Text style={style}>
          <GradientText weight="600">{core}</GradientText>
        </Text>
        {w > 0 && <Swash width={w} />}
      </View>
      {!!trail && <Text style={style}>{trail}</Text>}
    </View>
  );
}

// the account card from clip 36 at 5.2s: vivid violet, a soft diagonal sheen, the glyph, the
// address with its copy mark, name and balance, and the double ringed white pill
export function AccountCard({
  address,
  name = "pehra",
  balance,
  pill,
  onPill,
  badge,
  glyph = "pehra-mark-paper",
  width,
}: {
  address?: string;
  name?: string;
  balance: string;
  pill?: string;
  onPill?: () => void;
  badge?: string;
  glyph?: string;
  width: number;
}) {
  const w = Math.round(width * 0.876),
    h = Math.round(w * 0.62);
  return (
    <View style={{ width: w, height: h, alignSelf: "center", borderRadius: 26, backgroundColor: violet, boxShadow: "0 14px 30px #8b5cf633", overflow: "hidden" }}>
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.55">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="0.2" stopColor="#ffffff" stopOpacity={0.02} />
            <Stop offset="0.3" stopColor="#ffffff" stopOpacity={0.16} />
            <Stop offset="0.38" stopColor="#ffffff" stopOpacity={0.04} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.12} />
            <Stop offset="0.25" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill="url(#sheen)" />
        <Rect x={0} y={0} width={w} height={h} fill="url(#edge)" />
      </Svg>
      <View style={{ flex: 1, padding: 20, paddingTop: 22, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Image source={images[glyph] || images["pehra-mark-paper"]} style={{ width: 38, height: 38 }} />
          {!!address && (
            <Tap
              accessibilityLabel="Copy address"
              onPress={async () => {
                await Clipboard.setStringAsync(address);
                Haptics.selectionAsync();
              }}
              innerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 }}
            >
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"], letterSpacing: -0.2 }}>{short(address)}</Text>
              <Icon name="copy" size={15} color="#ffffffcc" />
            </Tap>
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={{ gap: 3 }}>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600", letterSpacing: -0.3 }}>{name}</Text>
            <Text style={{ color: "#ffffff99", fontSize: 16, fontWeight: "500" }}>{balance}</Text>
          </View>
          {!!pill && (
            <Tap onPress={onPill} accessibilityLabel={pill} innerStyle={{ borderRadius: 24, borderWidth: 2, borderColor: "#ffffffcc", padding: 3 }}>
              <View style={{ backgroundColor: "white", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ color: violet, fontSize: 15, fontWeight: "600", letterSpacing: -0.2 }}>{pill}</Text>
              </View>
            </Tap>
          )}
          {!!badge && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#ffffff2e", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}>
              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
                <Icon name="check" size={10} color={violet} />
              </View>
              <Text style={{ color: "white", fontSize: 13, fontWeight: "600" }}>{badge}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// the grey tooltip under the card, its rounded pointer under the pill
export function Tooltip({ title, body, width }: { title: string; body: string; width: number }) {
  const card = Math.round(width * 0.876),
    right = (width - card) / 2 + 12;
  return (
    <Animated.View
      entering={FadeIn.delay(420).duration(240).reduceMotion(ReduceMotion.System)}
      style={{ alignSelf: "flex-end", marginRight: right, marginTop: 12, width: Math.round(width * 0.75) }}
    >
      <Svg width={28} height={12} style={{ alignSelf: "flex-end", marginRight: 42 }}>
        <Path d="M0 12 C8 12 10 2 14 2 C18 2 20 12 28 12 Z" fill="#333" />
      </Svg>
      <View style={{ backgroundColor: "#333", borderRadius: 24, paddingHorizontal: 19, paddingVertical: 17, gap: 6, boxShadow: "0 12px 28px #00000026" }}>
        <Text style={{ color: "white", fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }}>{title}</Text>
        <Text style={{ color: "#b3b3b3", fontSize: 14.5, lineHeight: 20.5 }}>{body}</Text>
      </View>
    </Animated.View>
  );
}

// "your account is ready." centred, the word in the gradient with its swash
export function HighlightTitle({ before, word, after = "" }: { before: string; word: string; after?: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <HeadingText parts={[before, { u: word + after }]} size={21} center />
    </View>
  );
}

// the education trays, drawn in family's own pixel space (clip 36 at 1180 wide, the tray is 847
// by 670 inside it) and scaled to the phone, so every stroke and gap keeps its proportion
export type Lesson = { art: "shield" | "session" | "lock"; title: Heading; body: ReactNode };
const VW = 847,
  VH = 670;
const soft = "#ffffff2e",
  softer = "#ffffff1f",
  rail = "#ffffff38";
const logos = logoData as Record<string, { vb: string; d: string[] }>;

function Logo({ name, cx, cy, size }: { name: string; cx: number; cy: number; size: number }) {
  const l = logos[name],
    [, , vw, vh] = l.vb.split(" ").map(Number),
    k = size / Math.max(vw, vh);
  return (
    <G transform={`translate(${cx - (vw * k) / 2} ${cy - (vh * k) / 2}) scale(${k})`}>
      {l.d.map((d, i) => (
        <Path key={i} d={d} fill="white" fillRule="evenodd" />
      ))}
    </G>
  );
}
function Coin({ cx, cy, r, o, logo }: { cx: number; cy: number; r: number; o: number; logo: string }) {
  return (
    <G opacity={o}>
      <Circle cx={cx} cy={cy} r={r} fill="#a98bff" />
      <Logo name={logo} cx={cx} cy={cy} size={r * 1.05} />
    </G>
  );
}
function Fade({ id, from = 0.62 }: { id: string; from?: number }) {
  return (
    <Defs>
      <LinearGradient id={id + "g"} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="white" stopOpacity={1} />
        <Stop offset={from} stopColor="white" stopOpacity={1} />
        <Stop offset="1" stopColor="white" stopOpacity={0} />
      </LinearGradient>
      <Mask id={id} x={0} y={0} width={VW} height={VH} maskUnits="userSpaceOnUse">
        <Rect x={0} y={0} width={VW} height={VH} fill={`url(#${id}g)`} />
      </Mask>
    </Defs>
  );
}
function Art({ kind, width }: { kind: Lesson["art"]; width: number }) {
  const h = (width * VH) / VW;
  return (
    <Svg width={width} height={h} viewBox={`0 0 ${VW} ${VH}`}>
      <Rect x={0} y={0} width={VW} height={VH} fill={violet} />
      {kind === "shield" && (
        <G>
          <Fade id="f1" from={0.7} />
          <G mask="url(#f1)">
            <Rect x={155} y={103} width={552} height={700} rx={118} fill="none" stroke={rail} strokeWidth={26} />
            <Rect x={330} y={148} width={187} height={56} rx={28} fill={soft} />
            <Rect x={197} y={360} width={453} height={280} rx={32} fill={soft} />
            <Circle cx={253} cy={416} r={33} fill="#ffffff33" />
            <Rect x={472} y={392} width={145} height={25} rx={12.5} fill="#ffffff33" />
            <Rect x={220} y={556} width={170} height={25} rx={12.5} fill="#ffffff33" />
            <Rect x={220} y={596} width={94} height={22} rx={11} fill="#ffffff26" />
          </G>
          <Path d="M423 244 C451 262 479 270 508 272 L508 318 C508 370 470 408 423 428 C376 408 338 370 338 318 L338 272 C367 270 395 262 423 244 Z" fill="white" />
          <Path d="M384 335 L412 362 L464 306" stroke={violet} strokeWidth={24} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {kind === "session" && (
        <G>
          <Fade id="f2" from={0.72} />
          <G mask="url(#f2)">
            <Rect x={92} y={-120} width={660} height={900} rx={120} fill="none" stroke={softer} strokeWidth={30} />
            <Rect x={149} y={466} width={550} height={250} rx={30} fill={softer} />
            {["add margin", "your order", "stop loss", "take profit"].map((t, i) => (
              <G key={t}>
                <SvgText x={214} y={528 + i * 47} fontSize={26} fill="#ffffff80" textAnchor="middle">{i + 1}</SvgText>
                <SvgText x={241} y={528 + i * 47} fontSize={27} fill="white">{t}</SvgText>
                <Line x1={241} x2={430} y1={544 + i * 47} y2={544 + i * 47} stroke="#ffffff26" strokeWidth={2} />
                <SvgText x={472} y={528 + i * 47} fontSize={26} fill="#ffffff80" textAnchor="middle">{i + 5}</SvgText>
                <SvgText x={500} y={528 + i * 47} fontSize={27} fill="white">{["1 AUSD", "100 MON", "−6%", "+12%"][i]}</SvgText>
                <Line x1={500} x2={690} y1={544 + i * 47} y2={544 + i * 47} stroke="#ffffff26" strokeWidth={2} />
              </G>
            ))}
          </G>
          <Circle cx={423} cy={228} r={168} fill="none" stroke="#ffffff45" strokeWidth={3} />
          <Coin cx={187} cy={228} r={58} o={0.45} logo="btc" />
          <Coin cx={662} cy={228} r={58} o={0.45} logo="eth" />
          <Coin cx={282} cy={228} r={82} o={0.95} logo="ausd" />
          <Coin cx={559} cy={228} r={82} o={0.95} logo="monad" />
          <Circle cx={423} cy={228} r={112} fill="#ffffff3a" />
          <Circle cx={423} cy={228} r={100} fill="white" />
          <G transform="translate(423 228) rotate(-40)">
            <Circle cx={-18} cy={0} r={34} fill={violet} />
            <Circle cx={-18} cy={0} r={13} fill="white" />
            <Rect x={8} y={-13} width={76} height={26} rx={9} fill={violet} />
            <Rect x={48} y={2} width={17} height={30} rx={5} fill={violet} />
            <Rect x={70} y={2} width={14} height={22} rx={5} fill={violet} />
          </G>
        </G>
      )}
      {kind === "lock" && (
        <G>
          <Fade id="f3" from={0.72} />
          <G mask="url(#f3)">
            <Rect x={165} y={155} width={530} height={700} rx={112} fill="none" stroke={rail} strokeWidth={26} />
            <Rect x={334} y={196} width={180} height={56} rx={28} fill={soft} />
            <Rect x={209} y={420} width={428} height={330} rx={32} fill={softer} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <G key={i}>
                <SvgText x={259} y={468 + i * 37} fontSize={22} fill="#ffffff80" textAnchor="middle">{i + 1}</SvgText>
                <Rect x={281} y={452 + i * 37} width={[91, 80, 76, 84, 86, 82][i]} height={17} rx={8.5} fill="#ffffff55" />
                <Line x1={281} x2={400} y1={478 + i * 37} y2={478 + i * 37} stroke="#ffffff1c" strokeWidth={2} />
                <SvgText x={457} y={468 + i * 37} fontSize={22} fill="#ffffff80" textAnchor="middle">{i + 7}</SvgText>
                <Rect x={482} y={452 + i * 37} width={[77, 82, 84, 80, 78, 90][i]} height={17} rx={8.5} fill="#ffffff55" />
                <Line x1={482} x2={600} y1={478 + i * 37} y2={478 + i * 37} stroke="#ffffff1c" strokeWidth={2} />
              </G>
            ))}
          </G>
          <Circle cx={423} cy={367} r={80} fill="white" />
          <G>
            <Path d="M393 368 L393 352 C393 335 406 322 423 322 C440 322 453 335 453 352 L453 368" stroke={violet} strokeWidth={13} fill="none" strokeLinecap="round" />
            <Rect x={380} y={362} width={86} height={62} rx={16} fill={violet} />
            <Line x1={381} y1={318} x2={466} y2={416} stroke="white" strokeWidth={22} strokeLinecap="round" />
            <Line x1={381} y1={318} x2={466} y2={416} stroke={violet} strokeWidth={10} strokeLinecap="round" />
          </G>
        </G>
      )}
    </Svg>
  );
}

// the tray: springs up over a flat grey, one page at a time, its height follows the copy
export function LessonTray({
  lessons,
  visible,
  onDone,
  onClose,
  finalLabel = "Continue",
  startPage = 0,
}: {
  lessons: Lesson[];
  visible: boolean;
  onDone: () => void;
  onClose: () => void;
  finalLabel?: string;
  startPage?: number;
}) {
  const { width } = useWindowDimensions(),
    [page, setPage] = useState(0),
    y = useSharedValue(900),
    alpha = useSharedValue(0);
  const tw = width - 32;
  useEffect(() => {
    if (!visible) return;
    setPage(Math.min(startPage, lessons.length - 1));
    y.set(900);
    alpha.set(withTiming(1, { duration: 200 }));
    y.set(withSpring(0, spring));
  }, [visible, y, alpha, startPage, lessons.length]);
  const leave = (then: () => void) => {
    alpha.set(withTiming(0, { duration: 180 }));
    y.set(withTiming(900, { duration: 220, reduceMotion: ReduceMotion.System }, (f) => { if (f) scheduleOnRN(then); }));
  };
  const drag = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => y.set(e.translationY > 0 ? e.translationY : e.translationY * 0.15))
        .onEnd((e) => {
          if (e.translationY > 110 || e.velocityY > 650) {
            alpha.set(withTiming(0, { duration: 180 }));
            y.set(withTiming(900, { duration: 220 }, () => scheduleOnRN(onClose)));
          } else y.set(withSpring(0, { ...spring, velocity: e.velocityY }));
        }),
    [y, alpha, onClose],
  );
  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] })),
    backdrop = useAnimatedStyle(() => ({ opacity: alpha.get() }));
  if (!visible) return null;
  const lesson = lessons[page],
    last = page === lessons.length - 1;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => leave(onClose)}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#808080" }, backdrop]}>
          <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={() => leave(onClose)} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 34 }} pointerEvents="box-none">
          <GestureDetector gesture={drag}>
            <Animated.View
              layout={LinearTransition.springify().damping(26).stiffness(260).reduceMotion(ReduceMotion.System)}
              style={[{ borderRadius: 38, backgroundColor: "white", overflow: "hidden" }, panel]}
              accessibilityViewIsModal
            >
              <Animated.View key={"art" + page} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)}>
                <Art kind={lesson.art} width={tw} />
              </Animated.View>
              <Animated.View key={"copy" + page} entering={FadeIn.duration(240).delay(40)} style={{ paddingHorizontal: 32, paddingTop: 30, paddingBottom: 26, gap: 10 }}>
                <HeadingText parts={lesson.title} />
                <Text style={{ fontSize: 16.5, lineHeight: 24, color: muted }}>{lesson.body}</Text>
              </Animated.View>
              <View style={{ paddingHorizontal: 24, paddingBottom: 24 }}>
                <Tap
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (last) leave(onDone);
                    else setPage(page + 1);
                  }}
                  innerStyle={{ backgroundColor: "black", borderRadius: 28, minHeight: 50, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "white", fontSize: 18, fontWeight: "600", letterSpacing: -0.2 }}>{last ? finalLabel : "Continue"}</Text>
                </Tap>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
