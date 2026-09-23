// the pieces of family's onboarding, drawn from the reference recordings in ui/references
// (clips 17, 36 and 45): the stacked card hero, square checks, the grid that works while the
// account is made, the account card with its pill and tooltip, the education trays, the done card.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Image, Modal, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { Text } from "./Text";
import Svg, { Rect, Path, Circle, G, Line, Defs, LinearGradient, Stop, Mask, ClipPath, Image as SvgImage, Text as SvgText } from "react-native-svg";
import { coinImages } from "./Coin";
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
import { Rough, type RoughType } from "./Rough";

// the brand kit (brand/README.md): flat dusk, paper, ink and mist, no gradients or glows on brand
// surfaces, one bird at the lower right of a card, manrope throughout
export const ink = "#28243E",
  muted = "#706A7D",
  violet = "#9E4DFD",
  dusk = violet,
  accent = violet,
  mist = "#EFE5FF",
  paper = "#FAF8F2",
  paleGrid = "#E6E0F7";

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
        backgroundColor: "#F0EDF3",
        borderRadius: 24,
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
        borderColor: "#DDD8E6",
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
export const Em = ({ children }: { children: string }) => <Text style={{ color: ink, fontWeight: "600" }}>{children}</Text>;

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

// a heading that wraps word by word; one phrase gets a hand drawn mark (rough.js, see Rough.tsx)
export type Heading = (string | { u: string; mark?: RoughType })[];
export function HeadingText({ parts, size = 23, center = false, markDelay = 350 }: { parts: Heading; size?: number; center?: boolean; markDelay?: number }) {
  const words: { w: string; mark?: RoughType }[] = [];
  for (const p of parts) {
    if (typeof p === "string") p.split(" ").filter(Boolean).forEach((w) => words.push({ w }));
    else words.push({ w: p.u, mark: p.mark ?? "underline" });
  }
  const style = { fontSize: size, lineHeight: size * 1.27, fontWeight: "600" as const, letterSpacing: -0.4, color: ink };
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: center ? "center" : "flex-start", columnGap: size * 0.26 }}>
      {words.map((x, i) => {
        if (!x.mark) return <Text key={i} style={style}>{x.w}</Text>;
        const trail = /[.,!?…]$/.test(x.w) ? x.w.slice(-1) : "";
        const core = trail ? x.w.slice(0, -1) : x.w;
        return (
          <View key={i} style={{ flexDirection: "row", marginHorizontal: x.mark === "circle" ? 10 : x.mark === "highlight" ? 12 : 0 }}>
            <Rough type={x.mark} color={x.mark === "highlight" ? "#E4CCFF" : violet} padding={x.mark === "circle" ? 6 : 3} paddingX={x.mark === "circle" ? 13 : 3} strokeWidth={x.mark === "circle" ? 2.2 : 2.6} iterations={2} delay={markDelay}>
              <Text style={style}>{core}</Text>
            </Rough>
            {!!trail && <Text style={style}>{trail}</Text>}
          </View>
        );
      })}
    </View>
  );
}

// the account card from clip 36 at 5.2s: vivid violet, a soft diagonal sheen, the glyph, the
// address with its copy mark, name and balance, and the double ringed white pill
// the account card: flat dusk like the brand board, the bird large at the lower right, cropped by
// the card edge, and paper type. the pill is paper on dusk.
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
    <View style={{ width: w, height: h, alignSelf: "center", borderRadius: 24, overflow: "hidden", backgroundColor: dusk }}>
      <Image source={images[glyph] || images["pehra-mark-paper"]} style={{ position: "absolute", width: h * 0.92, height: h * 0.92, right: -h * 0.16, bottom: -h * 0.2, opacity: 0.16 }} />
      <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Image source={images["pehra-mark-paper"]} style={{ width: 30, height: 30 }} />
            <Text style={{ color: paper, fontSize: 19, fontWeight: "700", letterSpacing: -0.6 }}>{name}</Text>
          </View>
          {!!address && (
            <Tap
              accessibilityLabel="Copy address"
              onPress={async () => {
                await Clipboard.setStringAsync(address);
                Haptics.selectionAsync();
              }}
              innerStyle={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ color: "#FAF8F2d9", fontSize: 13.5, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{short(address)}</Text>
              <Icon name="copy" size={13} color="#FAF8F2b3" />
            </Tap>
          )}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={{ gap: 1 }}>
            <Text style={{ color: "#FAF8F2b3", fontSize: 13, fontWeight: "500" }}>balance</Text>
            <Text style={{ color: paper, fontSize: 27, fontWeight: "700", letterSpacing: -0.8, fontVariant: ["tabular-nums"] }}>{balance}</Text>
          </View>
          {!!pill && (
            <Tap onPress={onPill} accessibilityLabel={pill} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: paper, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 }}>
              <Icon name="shield" size={14} color={dusk} />
              <Text style={{ color: dusk, fontSize: 14, fontWeight: "600" }}>{pill}</Text>
            </Tap>
          )}
          {!!badge && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FAF8F226", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Icon name="shield" size={13} color={paper} />
              <Text style={{ color: paper, fontSize: 13, fontWeight: "600" }}>{badge}</Text>
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
        <Path d="M0 12 C8 12 10 2 14 2 C18 2 20 12 28 12 Z" fill={ink} />
      </Svg>
      <View style={{ backgroundColor: ink, borderRadius: 24, paddingHorizontal: 19, paddingVertical: 17, gap: 6 }}>
        <Text style={{ color: paper, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 }}>{title}</Text>
        <Text style={{ color: "#B9B2C5", fontSize: 14.5, lineHeight: 20.5 }}>{body}</Text>
      </View>
    </Animated.View>
  );
}

// "your account is ready." centred, the word in the gradient with its swash
export function HighlightTitle({ before, word, after = "" }: { before: string; word: string; after?: string }) {
  return (
    <View style={{ alignItems: "center" }}>
      <HeadingText parts={[before, { u: word + after, mark: "circle" }]} size={22} center markDelay={300} />
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
      <Circle cx={cx} cy={cy} r={r} fill="#B57DFE" />
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
          <Fade id="f1" from={0.72} />
          <Defs>
            <LinearGradient id="risk" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#7EE2B0" />
              <Stop offset="0.55" stopColor="#FFD37A" />
              <Stop offset="1" stopColor="#FF7A8A" />
            </LinearGradient>
          </Defs>
          <G mask="url(#f1)">
            <Rect x={155} y={103} width={552} height={700} rx={118} fill="none" stroke={rail} strokeWidth={26} />
            <Rect x={330} y={148} width={187} height={56} rx={28} fill={soft} />
            <Rect x={197} y={384} width={453} height={300} rx={32} fill={soft} />
            <SvgImage href={coinImages.MON} x={220} y={456} width={60} height={60} />
            <SvgText x={296} y={480} fontSize={28} fontWeight="700" fill="white">MON long</SvgText>
            <SvgText x={296} y={510} fontSize={21} fill="#ffffffaa">3x · 100 AUSD</SvgText>
            <SvgText x={226} y={578} fontSize={21} fill="#ffffffcc">distance to liquidation</SvgText>
            <Rect x={226} y={596} width={395} height={16} rx={8} fill="url(#risk)" opacity={0.9} />
            <Circle cx={560} cy={604} r={15} fill="white" />
            <Circle cx={560} cy={604} r={7} fill="#FF7A8A" />
            <Rect x={226} y={646} width={170} height={20} rx={10} fill="#ffffff33" />
          </G>
          <Circle cx={423} cy={316} r={96} fill="#ffffff26" />
          <Path d="M423 242 C451 260 479 268 508 270 L508 316 C508 368 470 406 423 426 C376 406 338 368 338 316 L338 270 C367 268 395 260 423 242 Z" fill="white" />
          <Path d="M384 333 L412 360 L464 304" stroke={violet} strokeWidth={24} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {kind === "session" && (
        <G>
          <Fade id="f2" from={0.66} />
          <G mask="url(#f2)">
            <Rect x={96} y={-140} width={655} height={940} rx={120} fill="none" stroke={softer} strokeWidth={30} />
            <Rect x={150} y={452} width={548} height={260} rx={30} fill={softer} />
            {[
              ["add margin", "+1 AUSD"],
              ["your order", "100 MON"],
              ["stop loss", "−6%"],
              ["take profit", "+12%"],
            ].map(([a, b], i) => (
              <G key={a}>
                <SvgText x={206} y={514 + i * 46} fontSize={25} fill="#ffffff80" textAnchor="middle">{i + 1}</SvgText>
                <SvgText x={232} y={514 + i * 46} fontSize={27} fontWeight="600" fill="white">{a}</SvgText>
                <SvgText x={640} y={514 + i * 46} fontSize={25} fill="#ffffffb3" textAnchor="end">{b}</SvgText>
                <Line x1={232} x2={640} y1={530 + i * 46} y2={530 + i * 46} stroke="#ffffff22" strokeWidth={2} />
              </G>
            ))}
          </G>
          <Defs>
            {[["cb", 170, 228, 54], ["cl", 288, 228, 74], ["cr", 558, 228, 74], ["ce", 676, 228, 54]].map(([id, cx, cy, r]) => (
              <ClipPath key={id as string} id={id as string}>
                <Circle cx={cx as number} cy={cy as number} r={r as number} />
              </ClipPath>
            ))}
          </Defs>
          <Circle cx={423} cy={228} r={176} fill="none" stroke="#ffffff40" strokeWidth={3} />
          {/* the row of real coins, outer two faded like family's, each with a thin paper ring */}
          <SvgImage href={coinImages.BTC} x={116} y={174} width={108} height={108} clipPath="url(#cb)" />
          <SvgImage href={coinImages.ETH} x={622} y={174} width={108} height={108} clipPath="url(#ce)" />
          <Circle cx={170} cy={228} r={54} fill={violet} opacity={0.5} />
          <Circle cx={676} cy={228} r={54} fill={violet} opacity={0.5} />
          <Circle cx={288} cy={228} r={80} fill={violet} />
          <SvgImage href={coinImages.AUSD} x={214} y={154} width={148} height={148} clipPath="url(#cl)" />
          <Circle cx={558} cy={228} r={80} fill={violet} />
          <SvgImage href={coinImages.MON} x={484} y={154} width={148} height={148} clipPath="url(#cr)" />
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
          <Path d="M398 362 L398 346 C398 332 409 321 423 321 C437 321 448 332 448 346 L448 362" stroke={violet} strokeWidth={12} fill="none" strokeLinecap="round" />
          <Rect x={384} y={356} width={78} height={60} rx={15} fill={violet} />
          <Circle cx={423} cy={381} r={8} fill="white" />
          <Rect x={419.5} y={383} width={7} height={17} rx={3.5} fill="white" />
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
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#86828F" }, backdrop]}>
          <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={() => leave(onClose)} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 16, paddingBottom: 34 }} pointerEvents="box-none">
          <GestureDetector gesture={drag}>
            <Animated.View
              layout={LinearTransition.springify().damping(26).stiffness(260).reduceMotion(ReduceMotion.System)}
              style={[{ borderRadius: 32, backgroundColor: paper, overflow: "hidden" }, panel]}
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
                  innerStyle={{ backgroundColor: ink, borderRadius: 999, minHeight: 52, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: paper, fontSize: 17, fontWeight: "600" }}>{last ? finalLabel : "continue"}</Text>
                </Tap>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// welcome: three open positions fanned like family's card stack, the front one lifts in with its
// distance to liquidation. it shows what pehra is before any sentence does.
function MarketCoin({ logo, size = 30 }: { logo: string; size?: number }) {
  const symbol = logo === "monad" ? "MON" : logo.toUpperCase();
  return <Image source={coinImages[symbol] ?? coinImages.MON} style={{ width: size, height: size, borderRadius: size / 2 }} />;
}
export function PositionStack({ width }: { width: number }) {
  const rise = useSharedValue(26),
    bar = useSharedValue(0),
    reduced = useReducedMotion();
  useEffect(() => {
    rise.set(withSpring(0, { ...spring, duration: 520 }));
    bar.set(withDelay(380, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })));
  }, [rise, bar]);
  const front = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : rise.get() }] }));
  const w = Math.min(width - 88, 310),
    h = w * 0.58;
  const fill = useAnimatedStyle(() => ({ width: `${72 * bar.get()}%` }));
  const back = (color: string, top: number, inset: number, label: string, tag: string, fg: string) => (
    <View style={{ position: "absolute", top, left: inset, right: inset, height: h, borderRadius: 20, backgroundColor: color, paddingHorizontal: 16, paddingTop: 5, flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "600" }}>{label}</Text>
      <Text style={{ color: fg, fontSize: 11, fontWeight: "600", opacity: 0.7 }}>{tag}</Text>
    </View>
  );
  return (
    <View style={{ height: h + 44, width: w, alignSelf: "center" }}>
      {back(mist, 0, 28, "eth long", "−1.2%", ink)}
      {back(ink, 21, 14, "btc short", "+0.8%", paper)}
      <Animated.View style={[{ position: "absolute", top: 42, left: 0, right: 0, height: h, borderRadius: 24, padding: 16, justifyContent: "space-between", overflow: "hidden", backgroundColor: dusk }, front]}>
        <Image source={images["pehra-mark-paper"]} style={{ position: "absolute", width: h * 0.95, height: h * 0.95, right: -h * 0.18, bottom: -h * 0.24, opacity: 0.14 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <MarketCoin logo="monad" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: paper, fontSize: 16, fontWeight: "600" }}>mon long</Text>
            <Text style={{ color: "#ffffffa6", fontSize: 12, fontWeight: "500" }}>3x · 100 AUSD</Text>
          </View>
          <View style={{ backgroundColor: paper, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ color: "#23765A", fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] }}>+4.2%</Text>
          </View>
        </View>
        <View style={{ gap: 7 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: "#ffffffcc", fontSize: 12, fontWeight: "500" }}>28% from liquidation</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="shield" size={12} color={paper} />
              <Text style={{ color: paper, fontSize: 12, fontWeight: "600" }}>guarded</Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "#ffffff2e", overflow: "hidden" }}>
            <Animated.View style={[{ height: 6, borderRadius: 3, backgroundColor: paper }, fill]} />
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

// creating: the three real steps tick as they finish, a stopwatch runs beside them
export type WorkStep = { label: string; done: boolean; active: boolean };
function Tick({ done, active }: { done: boolean; active: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (active) spin.set(withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false));
  }, [active, spin]);
  const rot = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  if (done)
    return (
      <Animated.View entering={ZoomIn.springify().damping(13).stiffness(300).reduceMotion(ReduceMotion.System)} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: violet, alignItems: "center", justifyContent: "center" }}>
        <Icon name="check" size={13} color="white" />
      </Animated.View>
    );
  if (active)
    return (
      <Animated.View style={[{ width: 26, height: 26 }, rot]}>
        <Svg width={26} height={26}>
          <Circle cx={13} cy={13} r={10.5} stroke={mist} strokeWidth={3} fill="none" />
          <Path d="M13 2.5 A10.5 10.5 0 0 1 23.5 13" stroke={violet} strokeWidth={3} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    );
  return <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: "#DDD8E6" }} />;
}
export function WorkSteps({ steps, startedAt }: { steps: WorkStep[]; startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  const finished = steps.every((s) => s.done);
  useEffect(() => {
    if (finished) return;
    const t = setInterval(() => setNow(Date.now()), 60);
    return () => clearInterval(t);
  }, [finished]);
  const secs = Math.max(0, (now - startedAt) / 1000);
  return (
    <View style={{ gap: 26, alignSelf: "center", width: Math.min(300, 320) }}>
      <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: mist, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 }}>
        <Icon name="history" size={14} color={violet} />
        <Text style={{ color: violet, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{secs.toFixed(1)}s</Text>
      </View>
      <View style={{ gap: 22 }}>
        {steps.map((s) => (
          <View key={s.label} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Tick done={s.done} active={s.active} />
            <Text style={{ fontSize: 17, fontWeight: s.active ? "600" : "500", color: s.done || s.active ? ink : "#B9B2C5", letterSpacing: -0.2 }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
