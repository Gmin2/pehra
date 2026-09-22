// the pieces of family's onboarding, drawn from the reference recordings in ui/references
// (clips 17, 36 and 45): the stacked card hero, square checks, the grid that works while the
// account is made, the account card with its pill and tooltip, the education trays, the done card.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, Image, Modal, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Rect, Path, Circle, G, Line } from "react-native-svg";
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
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

export const ink = "#151515",
  muted = "#999",
  dusk = "#7362CE",
  accent = "#6553B9",
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
      {card("#C9BEF0", 0, 26)}
      {card("#A08EE3", 12, 13)}
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
          <Image source={images["pehra-dozing-two-tone"]} style={{ width: 34, height: 34 }} />
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

const short = (a?: string) => (a ? `${a.slice(0, 6)}···${a.slice(-4)}` : "");

// the account card from the "ready" frame: glyph, address with copy, name and balance, a pill
export function AccountCard({
  address,
  name = "pehra",
  balance,
  pill,
  onPill,
  badge,
  glyph = "pehra-dozing-two-tone",
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
  const w = Math.min(width - 64, 340);
  return (
    <View
      style={{
        width: w,
        height: w * 0.56,
        alignSelf: "center",
        borderRadius: 20,
        backgroundColor: accent,
        padding: 16,
        justifyContent: "space-between",
        boxShadow: "0 10px 24px #6553b933",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Image source={images[glyph] || images["pehra-dozing-two-tone"]} style={{ width: 36, height: 36 }} />
        {!!address && (
          <Tap
            accessibilityLabel="Copy address"
            onPress={async () => {
              await Clipboard.setStringAsync(address);
              Haptics.selectionAsync();
            }}
            innerStyle={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <Text style={{ color: "white", fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{short(address)}</Text>
            <Icon name="copy" size={13} color="#ffffffcc" />
          </Tap>
        )}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View style={{ gap: 2 }}>
          <Text style={{ color: "white", fontSize: 17, fontWeight: "600" }}>{name}</Text>
          <Text style={{ color: "#ffffffaa", fontSize: 13 }}>{balance}</Text>
        </View>
        {!!pill && (
          <Tap
            onPress={onPill}
            accessibilityLabel={pill}
            innerStyle={{
              backgroundColor: "white",
              borderRadius: 14,
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderWidth: 1.5,
              borderColor: "#ffffff",
              boxShadow: "0 0 0 2px #ffffff55",
            }}
          >
            <Text style={{ color: accent, fontSize: 12, fontWeight: "700" }}>{pill}</Text>
          </Tap>
        )}
        {!!badge && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ffffff26", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
              <Icon name="check" size={9} color={accent} />
            </View>
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>{badge}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// the dark tooltip under the card, its pointer aimed at the pill
export function Tooltip({ title, body, width }: { title: string; body: string; width: number }) {
  const w = Math.min(width - 150, 250);
  return (
    <Animated.View
      entering={FadeIn.delay(450).duration(220).reduceMotion(ReduceMotion.System)}
      style={{ alignSelf: "flex-end", marginRight: Math.max(32, (width - Math.min(width - 64, 340)) / 2 + 4), marginTop: 10, width: w }}
    >
      <View style={{ alignSelf: "flex-end", marginRight: 30, width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 8, borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#1d1b22" }} />
      <View style={{ backgroundColor: "#1d1b22", borderRadius: 14, padding: 14, gap: 5 }}>
        <Text style={{ color: "white", fontSize: 14, fontWeight: "700" }}>{title}</Text>
        <Text style={{ color: "#b9b5c2", fontSize: 12.5, lineHeight: 17 }}>{body}</Text>
      </View>
    </Animated.View>
  );
}

// "your account is ready." with the one word in purple and a hand drawn underline
export function HighlightTitle({ before, word, after = "" }: { before: string; word: string; after?: string }) {
  const draw = useSharedValue(0);
  useEffect(() => {
    draw.set(withDelay(250, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })));
  }, [draw]);
  const line = useAnimatedStyle(() => ({ transform: [{ scaleX: draw.get() }] }));
  return (
    <View style={{ alignItems: "center", gap: 2 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: ink, textAlign: "center" }}>
        {before}
        <Text style={{ color: accent }}>{word}</Text>
        {after}
      </Text>
      <Animated.View style={[{ width: word.length * 12, height: 3, borderRadius: 2, backgroundColor: accent, marginLeft: before.length * 9, transformOrigin: "left" }, line]} />
    </View>
  );
}

// the education tray: a purple illustration panel on top, copy, a black continue (clip 36)
export type Lesson = { art: "shield" | "session" | "lock"; title: ReactNode; body: ReactNode };

function Art({ kind, width }: { kind: Lesson["art"]; width: number }) {
  const w = width,
    h = 170,
    cx = w / 2;
  return (
    <Svg width={w} height={h}>
      <Rect x={cx - 72} y={18} width={144} height={170} rx={22} fill="none" stroke="#ffffff38" strokeWidth={2} />
      <Rect x={cx - 58} y={34} width={116} height={150} rx={14} fill="#ffffff12" />
      <Rect x={cx - 44} y={112} width={88} height={10} rx={5} fill="#ffffff22" />
      <Rect x={cx - 44} y={130} width={62} height={10} rx={5} fill="#ffffff18" />
      <Circle cx={cx} cy={76} r={30} fill="white" />
      {kind === "shield" && (
        <G>
          <Path d={`M${cx} 58 l16 6 v12 c0 10 -8 16 -16 19 c-8 -3 -16 -9 -16 -19 v-12 z`} fill={accent} />
          <Path d={`M${cx - 6} 76 l4 4 l8 -9`} stroke="white" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      )}
      {kind === "session" && (
        <G>
          <Circle cx={cx - 8} cy={76} r={8} fill="none" stroke={accent} strokeWidth={3.2} />
          <Path d={`M${cx - 2} 70 l14 -12 M${cx + 6} 63 l4 4 M${cx + 10} 59 l4 4`} stroke={accent} strokeWidth={3.2} strokeLinecap="round" />
        </G>
      )}
      {kind === "lock" && (
        <G>
          <Rect x={cx - 12} y={72} width={24} height={18} rx={4} fill={accent} />
          <Path d={`M${cx - 7} 72 v-6 a7 7 0 0 1 14 0 v6`} stroke={accent} strokeWidth={3.2} fill="none" />
        </G>
      )}
    </Svg>
  );
}

export function LessonTray({
  lessons,
  visible,
  onDone,
  onClose,
  finalLabel = "Continue",
}: {
  lessons: Lesson[];
  visible: boolean;
  onDone: () => void;
  onClose: () => void;
  finalLabel?: string;
}) {
  const { width } = useWindowDimensions(),
    [page, setPage] = useState(0),
    y = useSharedValue(900),
    alpha = useSharedValue(0);
  const tw = width - 32;
  useEffect(() => {
    if (!visible) return;
    setPage(0);
    y.set(900);
    alpha.set(withTiming(1, { duration: 180 }));
    y.set(withSpring(0, spring));
  }, [visible, y, alpha]);
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
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#0006" }, backdrop]}>
          <Pressable accessibilityLabel="Dismiss" style={{ flex: 1 }} onPress={() => leave(onClose)} />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: "flex-end", padding: 16, paddingBottom: 24 }} pointerEvents="box-none">
          <GestureDetector gesture={drag}>
            <Animated.View style={[{ borderRadius: 36, backgroundColor: "white", overflow: "hidden" }, panel]} accessibilityViewIsModal>
              <Animated.View key={"art" + page} entering={FadeIn.duration(200)} exiting={FadeOut.duration(120)} style={{ backgroundColor: dusk, height: 170, overflow: "hidden" }}>
                <Art kind={lesson.art} width={tw} />
              </Animated.View>
              <Animated.View key={"copy" + page} entering={FadeIn.duration(220).delay(60)} style={{ padding: 24, gap: 12 }}>
                <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: "600", letterSpacing: -0.4, color: ink }}>{lesson.title}</Text>
                <Text style={{ fontSize: 15, lineHeight: 22, color: muted }}>{lesson.body}</Text>
              </Animated.View>
              <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 14 }}>
                <View style={{ flexDirection: "row", gap: 6, alignSelf: "center" }}>
                  {lessons.map((_, i) => (
                    <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === page ? ink : "#e3e0e8" }} />
                  ))}
                </View>
                <Tap
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (last) leave(onDone);
                    else setPage(page + 1);
                  }}
                  innerStyle={{ backgroundColor: ink, borderRadius: 28, minHeight: 50, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ color: "white", fontSize: 17, fontWeight: "600" }}>{last ? finalLabel : "Continue"}</Text>
                </Tap>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

export const Em = ({ children }: { children: ReactNode }) => <Text style={{ color: accent, fontWeight: "600" }}>{children}</Text>;
