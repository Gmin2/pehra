// top traders on perpl, read from monad. the first three stand on a podium like home's biggest moves, the
// rest are a list you can sort. tap anyone to see them, or copy straight from their row
import { useCallback, useEffect, useMemo, useState } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import Animated, { FadeIn, ReduceMotion, Easing, useSharedValue, useAnimatedStyle, withDelay, withTiming, withRepeat } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Segmented } from "../src/ui/Trade";
import { Avatar } from "../src/ui/Avatar";
import { AddressText } from "../src/ui/AddressText";
import { Glyph } from "../src/ui/Glyph";
import { useApp } from "../src/ui/store";
import { readLeaders, type Leader } from "../src/rules";
import { ink, muted, green, red, faint, well, violet } from "../src/ui/Position";

const RANGES = ["24h", "7 days", "30 days"] as const;
const DAYS: Record<(typeof RANGES)[number], number> = { "24h": 1, "7 days": 7, "30 days": 30 };
const SORTS = ["most profit", "best win rate", "most trades", "never liquidated"] as const;
const SORT_GLYPH: Record<(typeof SORTS)[number], string> = { "most profit": "award", "best win rate": "thumbs-up", "most trades": "bolt", "never liquidated": "shield" };
type Sort = (typeof SORTS)[number];
const line = "#EEEAF2", mist = "#EFE5FF", redTint = "#F6DCDE";
const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const money = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
const won = (l: Leader) => l.wins / l.closed;

// a win rate means little on one or two trades, so that sort only ranks traders with a few closes
function sorted(list: Leader[], by: Sort) {
  if (by === "best win rate") return list.filter((l) => l.closed >= 3).sort((x, y) => won(y) - won(x) || y.closed - x.closed);
  if (by === "most trades") return [...list].sort((x, y) => y.closed - x.closed);
  if (by === "never liquidated") return list.filter((l) => l.liquidations === 0 && l.pnl > 0);
  return list;
}

const CARD_H = 236;
const PODIUM = [
  { rank: 2, h: 62, face: 40 },
  { rank: 1, h: 90, face: 50 },
  { rank: 3, h: 44, face: 40 },
];

function Step({ rank, h, face, x, w, base, l, by, onPress }: { rank: number; h: number; face: number; x: number; w: number; base: number; l?: Leader; by: Sort; onPress: () => void }) {
  const rise = useSharedValue(0), drop = useSharedValue(0);
  const order = rank === 3 ? 0 : rank === 2 ? 1 : 2;
  useEffect(() => {
    rise.set(withDelay(order * 60, withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System })));
  }, [rise, order]);
  useEffect(() => {
    if (!l) return;
    drop.set(0);
    drop.set(withDelay(220 + order * 60, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System })));
  }, [l?.address, drop, order]);
  const block = useAnimatedStyle(() => ({ height: h * rise.get(), top: base - h * rise.get() }));
  const onTop = useAnimatedStyle(() => ({ opacity: drop.get(), transform: [{ translateY: -(1 - drop.get()) * 8 }] }));
  const label = !l ? "" : by === "best win rate" ? `${Math.round(won(l) * 100)}% won` : by === "most trades" ? `${l.closed} closed` : money(l.pnl);
  return (
    <>
      <Animated.View style={[{ position: "absolute", left: x - w / 2, width: w, borderRadius: 14, backgroundColor: rank === 1 ? "#ffffff40" : "#ffffff26", alignItems: "center", paddingTop: 6, overflow: "hidden" }, block]}>
        <Text style={{ fontSize: rank === 1 ? 26 : 20, fontWeight: "700", color: "#ffffffe6" }}>{rank}</Text>
      </Animated.View>
      {l && (
        <Animated.View style={[{ position: "absolute", left: x - w / 2, top: 0, width: w, height: base - h - 2, alignItems: "center", justifyContent: "flex-end" }, onTop]}>
          <Tap onPress={onPress} innerStyle={{ alignItems: "center", width: w }}>
            <View style={{ padding: 3, borderRadius: 40, backgroundColor: "white" }}><Avatar address={l.address} size={face} /></View>
            <Text style={{ marginTop: 4, fontFamily: "Manrope_700Bold", fontSize: 11, color: "#ffffffd9" }}>{cut(l.address)}</Text>
            <View style={{ marginTop: 4, minWidth: 64, paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: by === "most profit" || by === "never liquidated" ? (l.pnl >= 0 ? green : red) : ink, fontVariant: ["tabular-nums"] }}>{label}</Text>
            </View>
          </Tap>
        </Animated.View>
      )}
    </>
  );
}

function Podium({ top, width, by, loading, go }: { top: Leader[]; width: number; by: Sort; loading: boolean; go: (l: Leader) => void }) {
  const byRank = [top[1], top[0], top[2]];
  const base = CARD_H - 16, w = 96, gap = 8, cx = width / 2;
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(loading ? withRepeat(withTiming(0.5, { duration: 800 }), -1, true) : 1);
  }, [loading, k]);
  const breathe = useAnimatedStyle(() => ({ opacity: loading ? 0.6 + 0.4 * k.get() : 1 }));
  return (
    <View style={{ width, height: CARD_H, borderRadius: 28, backgroundColor: violet, overflow: "hidden" }}>
      <Svg width={width} height={CARD_H} style={{ position: "absolute" }}>
        <Rect x={14} y={16} width={width - 28} height={CARD_H + 60} rx={40} fill="none" stroke="#ffffff1f" strokeWidth={10} />
      </Svg>
      <Animated.View style={[{ position: "absolute", left: 0, top: 0, width, height: CARD_H }, breathe]}>
        {PODIUM.map((p, i) => (
          <Step key={p.rank} {...p} w={w} x={cx + (i - 1) * (w + gap)} base={base} l={byRank[i]} by={by} onPress={() => byRank[i] && go(byRank[i])} />
        ))}
      </Animated.View>
    </View>
  );
}

export default function Leaders() {
  const a = useApp(),
    { width } = useWindowDimensions(),
    me = (a.stored?.address ?? a.session?.address ?? "").toLowerCase(),
    [range, setRange] = useState<(typeof RANGES)[number]>("7 days"),
    [by, setBy] = useState<Sort>("most profit"),
    [list, setList] = useState<Leader[] | null>(null),
    [shownRange, setShownRange] = useState(range),
    [err, setErr] = useState<string | null>(null);
  // a new range keeps the old board up, dimmed, until the new one lands
  const load = useCallback(() => {
    readLeaders(DAYS[range]).then((l) => { setList(l); setShownRange(range); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [range]);
  const stale = list !== null && shownRange !== range;
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const shown = useMemo(() => (list ? sorted(list, by).slice(0, 25) : []), [list, by]);
  const go = (l: Leader) => a.go(`/watch/${l.address}`);
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <View style={{ flex: 1 }} />
        <Tap onPress={() => a.go("/watch")} innerStyle={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: mist, justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>find an address</Text>
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={heading}>top traders on perpl</Text>
          <Text style={{ marginTop: 4, fontSize: 14, fontWeight: "500", color: muted }}>closed trades, read from monad. copy anyone at your own size.</Text>
        </View>
        <Segmented options={RANGES} value={range} onChange={setRange} />
        {err && <Text style={{ paddingHorizontal: 8, fontSize: 13, fontWeight: "600", color: red }}>couldn’t load the board: {err}</Text>}
        <View style={{ opacity: stale ? 0.55 : 1 }}>
          <Podium top={shown.slice(0, 3)} width={width - 32} by={by} loading={list === null && !err} go={go} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {SORTS.map((s) => (
            <Tap key={s} onPress={() => { if (s !== by) Haptics.selectionAsync(); setBy(s); }} innerStyle={{ height: 38, paddingLeft: 10, paddingRight: 14, borderRadius: 19, backgroundColor: by === s ? mist : well, flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Glyph name={SORT_GLYPH[s]} size={20} color={by === s ? violet : ink} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: by === s ? violet : ink }}>{s}</Text>
            </Tap>
          ))}
        </ScrollView>
        <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingVertical: 4, opacity: stale ? 0.55 : 1 }}>
          {list === null && !err
            ? [0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: well }} />
                  <View style={{ flex: 1, gap: 6 }}><View style={{ width: 110, height: 12, borderRadius: 6, backgroundColor: well }} /><View style={{ width: 150, height: 6, borderRadius: 3, backgroundColor: well }} /></View>
                  <View style={{ width: 52, height: 12, borderRadius: 6, backgroundColor: well }} />
                </View>
              ))
            : shown.length <= 3
              ? <Text style={{ padding: 16, fontSize: 14, fontWeight: "500", color: muted }}>{shown.length ? "that’s everyone in this window" : by === "best win rate" ? "no one has three closed trades in this window yet" : "no closed trades in this window yet"}</Text>
              : shown.slice(3).map((l, i) => (
                  <Animated.View key={`${by}-${shownRange}-${l.accountId}`} entering={FadeIn.delay(25 * i).duration(200).reduceMotion(ReduceMotion.System)} style={i ? { borderTopWidth: 1, borderTopColor: line } : undefined}>
                    <Tap onPress={() => go(l)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
                      <Text style={{ width: 20, fontFamily: "Manrope_700Bold", fontSize: 13, color: faint }}>{i + 4}</Text>
                      <Avatar address={l.address} size={36} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text><AddressText address={l.address} size={14} />{l.address.toLowerCase() === me ? <Text style={{ fontSize: 12, fontWeight: "700", color: violet }}>  you</Text> : null}</Text>
                        <View style={{ height: 5, width: "88%", borderRadius: 3, backgroundColor: well, flexDirection: "row", overflow: "hidden" }}>
                          <View style={{ flex: won(l), backgroundColor: green }} />
                          <View style={{ flex: 1 - won(l), backgroundColor: redTint }} />
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: l.pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{money(l.pnl)}</Text>
                        <Text style={{ fontSize: 11, fontWeight: "500", color: muted }}>{l.closed} closed{l.liquidations ? ` · ${l.liquidations} liq` : ""}</Text>
                      </View>
                      {l.address.toLowerCase() !== me && (
                        <Tap onPress={() => a.go(`/watch/${l.address}?copy=1`)} innerStyle={{ height: 30, paddingHorizontal: 11, borderRadius: 15, backgroundColor: mist, justifyContent: "center" }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: violet }}>copy</Text>
                        </Tap>
                      )}
                    </Tap>
                  </Animated.View>
                ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
