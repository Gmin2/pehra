// activity: what the guard did and what you did, day by day (tmp/claude/preview/act-a.png). the top is
// one sentence about the guard's day with a hand drawn mark, the rows open a tray, and a margin add's
// tray shows the position before and after (act-e.png) with the chain tx behind it.
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Linking } from "react-native";
import { Stack } from "expo-router";
import Animated, { FadeInDown, ReduceMotion, useSharedValue, withDelay, withTiming, useAnimatedProps, Easing } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, Tabs } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Coin } from "../src/ui/Coin";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { PehraBird } from "../src/ui/PehraBird";
import { Shield } from "../src/ui/Home";
import { useApp } from "../src/ui/store";
import { useAccount, useMarkets, money } from "../src/live";
import { useChain, merge } from "../src/chain";
import { Segmented, Tray } from "../src/ui/Trade";
import type { GuardEvent } from "../src/guard";

const ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  violet = "#9E4DFD",
  green = "#23765A",
  red = "#B4474D",
  amber = "#9A6B1C",
  line = "#EEEAF2",
  well = "#F0EDF3",
  mist = "#EFE5FF";

const FILTERS = ["all", "guard", "trades"] as const;
type Filter = (typeof FILTERS)[number];
const GUARD = new Set(["warn", "added", "failed"]);
const SHOWN = new Set(["warn", "added", "failed", "opened", "closed", "manual", "bracket", "funded", "withdrew"]);
const DAY = 24 * 3600_000;

const sym = (e: GuardEvent) => (e.symbol ?? "").toLowerCase();
const time = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
const signed = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2);
const words = ["no times", "once", "twice"];

// events from before the server kept side, size and pnl as fields still say them in their text
function backfill(e: GuardEvent): GuardEvent {
  if (e.side) return e;
  let m;
  if (e.kind === "closed" && (m = e.text.match(/closed (long|short) ([\d.]+) \w+ at ([\d.]+), ([+-]?)([\d.]+)/)))
    return { ...e, side: m[1], amount: Number(m[2]), price: Number(m[3]), pnl: (m[4] === "-" ? -1 : 1) * Number(m[5]) };
  if (e.kind === "opened" && (m = e.text.match(/(long|short) ([\d.]+) \w+ at ([\d.]+)x, filled at ([\d.]+)/)))
    return { ...e, side: m[1], amount: Number(m[2]), lv: Number(m[3]) * 100, price: Number(m[4]) };
  if (e.kind === "manual" && (m = e.text.match(/collateral now ([\d.]+) AUSD, ([\d.]+)% from/)))
    return { ...e, after: { collateral: Number(m[1]), distancePct: Number(m[2]) } };
  return e;
}

// what a row says for each kind
function describe(e: GuardEvent): { title: string; sub: string; right: string; color: string } {
  const pos = `${sym(e)} ${e.side ?? ""}`.trim();
  switch (e.kind) {
    case "added":
      return { title: `the guard added ${money(e.addAusd ?? 0)} ausd`, sub: e.before && e.after ? `${pos} was ${e.before.distancePct.toFixed(1)}% away, now ${e.after.distancePct.toFixed(1)}%` : pos, right: "+" + money(e.addAusd ?? 0), color: violet };
    case "warn":
      return { title: `${pos || sym(e)} got close`, sub: `${(e.distancePct ?? 0).toFixed(1)}% from liquidation, guard watching`, right: "", color: ink };
    case "failed":
      if (/liquidated/.test(e.text)) return { title: `${pos} liquidated`, sub: "perpl closed it at the liquidation price", right: e.pnl !== undefined ? signed(e.pnl) : "", color: red };
      if (e.rule === "floor") return { title: `${pos || sym(e)} stop held at its floor`, sub: e.text, right: "", color: amber };
      if (/margin/.test(e.text)) return { title: "the guard couldn’t add margin", sub: e.text, right: "", color: red };
      return { title: "a rule couldn’t act", sub: e.text, right: "", color: red };
    case "manual":
      return { title: `you added ${money(e.addAusd ?? 0)} ausd`, sub: e.after ? `${pos}, now ${e.after.distancePct.toFixed(1)}% away` : pos, right: "+" + money(e.addAusd ?? 0), color: ink };
    case "opened":
      if (e.rule === "entry") return { title: `pehra opened ${pos}${e.lv ? " " + e.lv / 100 + "x" : ""}`, sub: `your price was reached, ${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""}`, right: "", color: violet };
      return { title: `opened ${pos}${e.lv ? " " + e.lv / 100 + "x" : ""}`, sub: `${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""}`, right: "", color: ink };
    case "closed":
      if (e.rule === "funding") return { title: `pehra closed ${pos}`, sub: `funding turned against it, ${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""}`, right: e.pnl !== undefined ? signed(e.pnl) : "", color: violet };
      if (e.rule === "stop") return { title: `the stop sold ${pos}`, sub: `${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""}, never below the floor`, right: e.pnl !== undefined ? signed(e.pnl) : "", color: violet };
      if (e.rule === "backstop" || e.rule === "step") return { title: e.rule === "step" ? "take profit filled" : `the backstop sold ${pos}`.trim(), sub: `${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""} on perpl`, right: "", color: violet };
      return { title: `closed ${pos}`, sub: `${e.amount ?? ""} ${sym(e)} at ${e.price ?? ""}`, right: e.pnl !== undefined ? signed(e.pnl) : "", color: (e.pnl ?? 0) >= 0 ? green : red };
    case "bracket":
      return { title: "stop and take profit set", sub: e.text.replace(/^[A-Z]+: /, ""), right: "", color: ink };
    case "funded":
      return { title: "added money", sub: e.text, right: "+" + money(e.amount ?? 0), color: green };
    case "withdrew":
      return { title: "withdrew", sub: e.text, right: "−" + money(e.amount ?? 0), color: ink };
    default:
      return { title: e.kind, sub: e.text, right: "", color: ink };
  }
}

function Icon({ e }: { e: GuardEvent }) {
  const box = (bg: string, child: React.ReactNode) => <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>{child}</View>;
  if (e.kind === "added") return box(mist, <Shield size={22} color={violet} />);
  if (e.kind === "warn") return box("#FFF3D9", <Glyph name="triangle-warning" size={22} color={amber} />);
  if (e.kind === "failed") return box("#FBE9EB", <Glyph name="triangle-warning" size={22} color={red} />);
  if (e.kind === "manual") return box(well, <Glyph name="circle-coin" size={22} />);
  if (e.kind === "opened") return box(well, <Glyph name="rocket" size={22} />);
  if (e.kind === "bracket") return box(well, <Glyph name="crosshairs" size={22} />);
  if (e.kind === "funded" || e.kind === "withdrew") return box(well, <Coin symbol="USDC" size={28} />);
  return box(well, <Coin symbol={e.symbol ?? "MON"} size={28} />);
}

function dayLabel(at: number) {
  const d = new Date(at),
    today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at >= start) return "today";
  if (at >= start - DAY) return "yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase();
}

export default function Activity() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    chain = useChain(address),
    markets = useMarkets(),
    [filter, setFilter] = useState<Filter>("all"),
    [open, setOpen] = useState<GuardEvent | null>(null);
  const eyes = useSharedValue(1),
    glance = useSharedValue(0);
  const events = useMemo(
    () => merge((account?.events ?? []).map(backfill), chain, markets.map((m) => m.market)).filter((e) => SHOWN.has(e.kind)),
    [account?.events, chain, markets.length],
  );
  const shown = events.filter((e) => (filter === "all" ? true : filter === "guard" ? GUARD.has(e.kind) : !GUARD.has(e.kind)));
  const groups = useMemo(() => {
    const out: { label: string; items: GuardEvent[] }[] = [];
    for (const e of shown) {
      const l = dayLabel(e.at);
      if (!out.length || out[out.length - 1].label !== l) out.push({ label: l, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [shown]);

  // the sentence: how often the guard stepped in today, and whether it was at night
  const todays = events.filter((e) => Date.now() - e.at < DAY);
  const steps = todays.filter((e) => e.kind === "added");
  const night = steps.some((e) => new Date(e.at).getHours() < 7);
  const spent = steps.reduce((t, e) => t + (e.addAusd ?? 0), 0);
  const limit = account?.settings?.maxAddAusdPerDay ?? 20;
  const watched = new Set([...todays.map((e) => e.pid).filter(Boolean), ...(account?.health ?? []).map((h) => h.pid)]).size;
  const n = steps.length;
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };

  return (
    <Screen>
      <Stack.Screen options={{ animation: "none" }} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 }}>
        <Animated.View entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: violet, alignItems: "center", justifyContent: "center" }}>
              <PehraBird size={38} open={eyes} shift={glance} />
            </View>
            <Tap onPress={() => a.go("/proof")} innerStyle={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: "#EFE5FF", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Shield size={16} color={violet} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>proof</Text>
            </Tap>
          </View>
          {n === 0 ? (
            <>
              <Text style={[heading, { marginTop: 18 }]}>the guard hasn’t needed</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={heading}>to step in </Text>
                <Rough type="underline" padding={1} strokeWidth={2.4} delay={450} duration={500}>
                  <Text style={heading}>today.</Text>
                </Rough>
              </View>
            </>
          ) : (
            <>
              <Text style={[heading, { marginTop: 18 }]}>the guard stepped in</Text>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                <Rough type="circle" padding={4} paddingX={9} strokeWidth={2.2} delay={450} duration={700}>
                  <Text style={heading}>{words[n] ?? `${n} times`}</Text>
                </Rough>
                <Text style={heading}> {night ? "while you slept." : "today."}</Text>
              </View>
            </>
          )}
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>
            {account ? `it watched ${watched} position${watched === 1 ? "" : "s"} today and spent ${money(spent)} of your ${limit} ausd daily limit. every row is read from monad through envio.` : "reading the guard’s day"}
          </Text>
        </Animated.View>

        <View style={{ marginTop: 18 }}>
          <Segmented options={FILTERS} value={filter} onChange={setFilter} dark={false} />
        </View>

        {!account ? (
          <View style={{ marginTop: 18 }}>
            {[0, 1, 2, 3].map((i) => (
              <Ghost key={i} opacity={1 - i * 0.2} />
            ))}
          </View>
        ) : groups.length === 0 ? (
          <View style={{ marginTop: 18 }}>
            <Ghost />
            <Ghost opacity={0.6} />
            <Text style={{ textAlign: "center", marginTop: 12, fontSize: 14, fontWeight: "500", color: muted }}>{filter === "guard" ? "nothing from the guard yet. it steps in before 5%." : "nothing here yet. your trades and the guard’s moves land here."}</Text>
          </View>
        ) : (
          groups.map((g, gi) => (
            <View key={g.label} style={{ marginTop: 20 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: muted, marginBottom: 4 }}>{g.label}</Text>
              {g.items.map((e, i) => {
                const d = describe(e);
                return (
                  <Animated.View key={e.at + e.kind + i} entering={FadeInDown.delay(Math.min(8, gi * 3 + i) * 50).springify().damping(20).reduceMotion(ReduceMotion.System)}>
                    <Tap
                      onPress={() => {
                        Haptics.selectionAsync();
                        setOpen(e);
                      }}
                      innerStyle={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}
                    >
                      <Icon e={e} />
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: "600", color: ink }}>{d.title}</Text>
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "500", color: muted }}>{d.sub}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 3 }}>
                        {!!d.right && <Text style={{ fontSize: 14, fontWeight: "700", color: d.color, fontVariant: ["tabular-nums"] }}>{d.right}</Text>}
                        {(e as { onchain?: boolean }).onchain ? <OnChain /> : <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>{e.tx ? "settling…" : time(e.at)}</Text>}
                      </View>
                    </Tap>
                  </Animated.View>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
      <Tabs active="activity" />
      <Tray visible={!!open} onClose={() => setOpen(null)}>
        {open && (
          <Detail
            e={open}
            live={(account?.health ?? []).some((h) => h.pid === open.pid)}
            onPosition={() => {
              const pid = open.pid;
              setOpen(null);
              if (pid) a.go(`/position?pid=${pid}`);
            }}
          />
        )}
      </Tray>
    </Screen>
  );
}

// the row's proof: envio has this transaction from monad
function OnChain() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 18, paddingHorizontal: 7, borderRadius: 9, backgroundColor: "#23765A14" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: green }} />
      <Text style={{ fontSize: 10, fontWeight: "700", color: green }}>on chain</Text>
    </View>
  );
}

function Ghost({ opacity = 1 }: { opacity?: number }) {
  const bar = (w: number, h = 11) => <View style={{ width: w, height: h, borderRadius: 6, backgroundColor: well }} />;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10, opacity }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: well }} />
      <View style={{ flex: 1, gap: 9 }}>
        {bar(140, 12)}
        {bar(90)}
      </View>
      <View style={{ alignItems: "flex-end", gap: 9 }}>
        {bar(56, 12)}
        {bar(40)}
      </View>
    </View>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

// a ring that fills to its distance when the tray opens, a quarter away counts as full
function DistanceRing({ symbol, pct, color, delay = 0 }: { symbol: string; pct: number; color: string; delay?: number }) {
  const r = 30,
    c = 2 * Math.PI * r;
  const k = useSharedValue(0);
  useEffect(() => {
    k.set(withDelay(delay, withTiming(Math.max(0.03, Math.min(1, pct / 40)), { duration: 700, easing: Easing.out(Easing.cubic) })));
  }, [pct, delay, k]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - k.get()) }));
  return (
    <View style={{ width: 72, height: 72, alignItems: "center", justifyContent: "center" }}>
      <Svg width={72} height={72} style={{ position: "absolute" }}>
        <Circle cx={36} cy={36} r={r} fill="none" stroke={line} strokeWidth={6} />
        <ACircle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${c} ${c}`} animatedProps={props} transform="rotate(-90 36 36)" />
      </Svg>
      <Coin symbol={symbol} size={40} />
    </View>
  );
}

function Kv({ k, v, color = ink, onPress }: { k: string; v: string; color?: string; onPress?: () => void }) {
  const body = (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
      <Text style={{ fontSize: 13.5, fontWeight: "500", color: muted }}>{k}</Text>
      <Text style={{ fontSize: 13.5, fontWeight: "600", color, fontVariant: ["tabular-nums"] }}>{v}</Text>
    </View>
  );
  return onPress ? <Tap onPress={onPress}>{body}</Tap> : body;
}

// the tray for one event. a margin add (the guard's or yours) is before and after; the rest is the
// moment with its numbers
function Detail({ e, live, onPosition }: { e: GuardEvent; live: boolean; onPosition: () => void }) {
  const d = describe(e);
  const explorer = e.tx ? `${NETWORKS.testnet.explorer}/tx/${e.tx}` : null;
  const txRow = explorer && <Kv k="on chain" v={`${e.tx!.slice(0, 6)}…${e.tx!.slice(-4)} ↗`} color={violet} onPress={() => Linking.openURL(explorer)} />;
  const isAdd = (e.kind === "added" || e.kind === "manual") && e.before && e.after;
  const card = (label: string, s: { distancePct: number; collateral: number }, color: string, delay: number) => (
    <View style={{ flex: 1, backgroundColor: "white", borderRadius: 24, padding: 16, alignItems: "center", gap: 6 }}>
      <Text style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: "600", color: muted }}>{label}</Text>
      <DistanceRing symbol={e.symbol ?? "MON"} pct={s.distancePct} color={color} delay={delay} />
      <Text style={{ fontSize: 18, fontWeight: "700", color, fontVariant: ["tabular-nums"] }}>{s.distancePct.toFixed(1)}%</Text>
      <Text style={{ fontSize: 11.5, fontWeight: "500", color: muted }}>{s.collateral.toFixed(2)} margin</Text>
    </View>
  );
  const colorOf = (p: number) => (p < 5 ? red : p < 15 ? amber : green);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8 }}>
        <Icon e={e} />
        <Text style={{ flex: 1, fontSize: 17, fontWeight: "700", color: ink }}>{d.title}</Text>
        <Text style={{ fontSize: 12.5, fontWeight: "500", color: faint }}>{time(e.at)}</Text>
      </View>
      {isAdd ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}>
          {card("before", e.before!, colorOf(e.before!.distancePct), 150)}
          <View style={{ position: "absolute", left: "50%", marginLeft: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: violet, alignItems: "center", justifyContent: "center", zIndex: 2 }}>
            <Text style={{ color: "white", fontSize: 16, fontWeight: "700" }}>→</Text>
          </View>
          {card("after", e.after!, colorOf(e.after!.distancePct), 450)}
        </View>
      ) : (
        <View style={{ backgroundColor: "white", borderRadius: 24, paddingVertical: 22, alignItems: "center", marginTop: 16, gap: 6 }}>
          <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 36, color: d.right ? d.color : ink }}>{d.right || (e.kind === "opened" ? `${e.lv ? e.lv / 100 + "x " : ""}${e.side ?? ""}` : "—")}</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: muted, textAlign: "center", paddingHorizontal: 16 }}>{d.sub}</Text>
        </View>
      )}
      <View style={{ marginTop: 14, paddingHorizontal: 8 }}>
        {e.kind === "added" && <Kv k="why" v={`${sym(e)} ${e.side ?? ""} went under your line`} />}
        {e.symbol && e.kind !== "funded" && e.kind !== "withdrew" && <Kv k="position" v={`${sym(e)} ${e.side ?? ""}${e.lv ? " " + e.lv / 100 + "x" : ""}`} />}
        {e.price !== undefined && <Kv k="price" v={String(e.price)} />}
        {txRow}
      </View>
      {e.pid && live ? (
        <Tap onPress={onPosition} innerStyle={{ marginTop: 16, height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>see position</Text>
        </Tap>
      ) : null}
    </View>
  );
}
