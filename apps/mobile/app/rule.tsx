// the builder (tmp/claude/preview/build-c.png): one rule as a sentence with numbers you tap, the same
// numbers as lines you drag on the chart, and what it would have done over the last 30 days next to just
// holding. arming signs the sentence under the button with the passkey. the guard tab saves the guard's
// own settings, nothing to sign there
import { useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, type LayoutChangeEvent } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Svg, { Path, Line, Circle, Rect } from "react-native-svg";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { validate, type Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton, Keypad } from "../src/ui/components";
import { enterDigit } from "../src/ui/model";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Segmented, Tray } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { useAccount, useMarkets } from "../src/live";
import { useCandles, type Point } from "../src/candles";
import { createRule, describeRule, replayRule, type ReplayResult } from "../src/rules";
import { updateGuard } from "../src/guard";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { violet, ink, muted, green, red, faint, well } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF", deep = "#7C3AED", pink = "#FBE4E6";
const TABS = ["stop", "take profit", "guard", "funding"] as const;
const SHORT: Record<string, string> = { "take profit": "profit" };
type Tab = (typeof TABS)[number];
type Step = { px: number; share: number };
type Draft = { px: number; floor: number; backstop: number; slices: number; steps: Step[]; threshold: number; target: number; maxDay: number; floorPct: number };
type Field = { key: string; label: string; value: number; kind: "price" | "int" | "pct" | "ausd" };

// prices kept to four significant figures, what a person reads and types
function rounder(mark: number, decimals: number) {
  const e = Math.floor(Math.log10(mark || 1)) - 3;
  const dec = Math.min(decimals, Math.max(0, -e));
  return { dec, round: (v: number) => Number(v.toFixed(dec)) };
}

function Chip({ text, onPress, bad }: { text: string; onPress: () => void; bad?: boolean }) {
  return (
    <Tap onPress={onPress} innerStyle={{ height: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: bad ? pink : mist, justifyContent: "center", marginHorizontal: 4, marginVertical: 3 }}>
      <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 19, color: bad ? red : violet }}>{text}</Text>
    </Tap>
  );
}
const Words = ({ children }: { children: string }) => <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 19, color: ink, marginVertical: 3 }}>{children}</Text>;

type ChartLine = { key: string; label: string; value: number; color: string; dash?: boolean };
const CH = 210;

// the price line on top, the rule's levels as lines a finger can drag. the scale stays put while a line
// is held so it doesn't run away from the finger
function LevelChart({ points, mark, liq, side, lines, fmt, onMove, onEnd }: { points: Point[]; mark: number; liq: number; side: "long" | "short"; lines: ChartLine[]; fmt: (v: number) => string; onMove: (key: string, v: number) => void; onEnd: () => void }) {
  const [w, setW] = useState(0);
  const held = useRef<string | null>(null);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const series = points.length ? [...points.map((p) => p.p), mark] : [mark];
  const vals = [...series, ...lines.map((l) => l.value)];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const liqIn = side === "long" ? liq > lo - (hi - lo) * 0.25 : liq < hi + (hi - lo) * 0.25;
  if (liqIn && liq > 0) { lo = Math.min(lo, liq); hi = Math.max(hi, liq); }
  const pad = (hi - lo) * 0.14 || hi * 0.01;
  // the scale only grows while the same lines are on screen, so a line let go of stays where it was
  // dropped instead of the chart refitting around it
  const tabKey = lines.map((l) => l.key).join();
  const sticky = useRef<{ key: string; lo: number; hi: number } | null>(null);
  if (sticky.current?.key !== tabKey) sticky.current = null;
  const fit = { lo: Math.min(lo - pad, sticky.current?.lo ?? Infinity), hi: Math.max(hi + pad, sticky.current?.hi ?? -Infinity) };
  if (!frozen.current && series.length > 1) sticky.current = { key: tabKey, ...fit };
  const range = frozen.current ?? fit;
  const top = 14, bottom = liqIn ? 14 : 40, ph = CH - top - bottom, pw = w - 8;
  const Y = (v: number) => top + ph - ((v - range.lo) / (range.hi - range.lo)) * ph;
  const V = (y: number) => range.lo + ((top + ph - y) / ph) * (range.hi - range.lo);
  const X = (i: number) => 4 + (series.length > 1 ? (i / (series.length - 1)) * pw : pw);
  const d = series.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p).toFixed(1)).join("");

  const begin = (y: number) => {
    if (!lines.length) return;
    frozen.current = range;
    const near = lines.reduce((a, b) => (Math.abs(Y(b.value) - y) < Math.abs(Y(a.value) - y) ? b : a));
    held.current = near.key;
    Haptics.selectionAsync();
    onMove(near.key, V(y));
  };
  const move = (y: number) => held.current && onMove(held.current, V(Math.max(top, Math.min(top + ph, y))));
  const end = () => {
    if (!held.current) return;
    held.current = null;
    frozen.current = null;
    onEnd();
  };
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => scheduleOnRN(begin, e.y))
    .onUpdate((e) => scheduleOnRN(move, e.y))
    .onFinalize(() => scheduleOnRN(end));

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: CH }}>
        {w > 0 && (
          <>
            <Svg width={w} height={CH}>
              <Path d={d} stroke={ink} strokeWidth={2.2} fill="none" strokeLinejoin="round" />
              <Circle cx={X(series.length - 1)} cy={Y(mark)} r={4.5} fill={ink} />
              {liqIn && liq > 0 && <Line x1={4} x2={w - 4} y1={Y(liq)} y2={Y(liq)} stroke={red} strokeWidth={1.5} strokeDasharray="2 4" />}
              {lines.map((l) => (
                <Line key={l.key} x1={4} x2={w - 4} y1={Y(l.value)} y2={Y(l.value)} stroke={l.color} strokeWidth={2.2} strokeDasharray={l.dash ? "6 5" : undefined} />
              ))}
              {lines[0] && <Circle cx={w / 2} cy={Y(lines[0].value)} r={9} fill="white" stroke={lines[0].color} strokeWidth={3} />}
              {!liqIn && <Rect x={4} y={side === "long" ? CH - 26 : 2} width={w - 8} height={22} rx={6} fill={pink} />}
            </Svg>
            {lines.map((l, i) => (
              <View key={l.key} pointerEvents="none" style={{ position: "absolute", top: Y(l.value) - 12, ...(i % 2 ? { left: 4 } : { right: 4 }), height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: l.color, justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>{l.label} {fmt(l.value)}</Text>
              </View>
            ))}
            {liqIn && liq > 0 && (
              <Text pointerEvents="none" style={{ position: "absolute", left: 8, top: Y(liq) + (side === "long" ? 4 : -18), fontSize: 11.5, fontWeight: "600", color: red }}>
                liquidation {fmt(liq)}
              </Text>
            )}
            {!liqIn && (
              <Text pointerEvents="none" style={{ position: "absolute", left: 12, top: side === "long" ? CH - 22 : 5, fontSize: 11.5, fontWeight: "600", color: red }}>
                liquidation {fmt(liq)} is far {side === "long" ? "below" : "above"}
              </Text>
            )}
          </>
        )}
      </View>
    </GestureDetector>
  );
}

function sinceLine(r: ReplayResult, tab: Tab) {
  const n = (w: string) => r.fires.filter((f) => f.what === w).length;
  if (r.withRule.liquidated) return "still liquidated";
  if (tab === "stop") {
    const parts = [n("stop") && `sold in ${n("stop")} slice${n("stop") === 1 ? "" : "s"}`, n("backstop") && "the backstop fired"].filter(Boolean);
    return parts.length ? `${parts.join(", ")}${n("stop") ? ", floor held" : ""}` : "never needed to sell";
  }
  if (tab === "take profit") return n("step") ? `${n("step")} step${n("step") === 1 ? "" : "s"} filled` : "no step reached";
  return n("add") ? `added ${r.added.toFixed(2)} ausd, ${n("add")} time${n("add") === 1 ? "" : "s"}` : "never needed to add";
}

export default function RuleBuilder() {
  const a = useApp(),
    // a suggested rule opens with its own numbers: px floor bs for a stop, steps "px:share,..." for a
    // ladder, th tg max for the guard
    { pid: pidParam, kind, ...given } = useLocalSearchParams<{ pid?: string; kind?: string; px?: string; floor?: string; bs?: string; steps?: string; th?: string; tg?: string; max?: string }>(),
    pid = Number(pidParam),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    markets = useMarkets();
  const h = account?.health?.find((x) => x.pid === pid);
  const m = markets.find((x) => x.id === h?.mkt);
  const points = useCandles(m?.market, "1d");
  const side: "long" | "short" = h?.side === "short" ? "short" : "long";
  const long = side === "long", dir = long ? 1 : -1;
  const mark = m?.mark || h?.mark || 0;
  const { dec, round } = rounder(mark, m?.priceDecimals ?? 6);
  const fmt = (v: number) => v.toFixed(dec);
  const sym = h?.symbol.toLowerCase() ?? "";

  const [tab, setTab] = useState<Tab>(kind === "ladder" ? "take profit" : kind === "guard" ? "guard" : kind === "funding" ? "funding" : "stop");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<Field | null>(null);
  const [text, setText] = useState("");
  // the number shown when the tray opens is replaced by the first key, not appended to
  const [fresh, setFresh] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [replayErr, setReplayErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // starting numbers from the price now: a stop 5% away, take profit 5% and 10% past entry or the price
  useEffect(() => {
    if (draft || !h || !mark) return;
    const px = round(mark * (1 - dir * 0.05)), floor = round(px * (1 - dir * 0.02)), backstop = round(floor * (1 - dir * 0.03));
    const base = long ? Math.max(mark, h.entry) : Math.min(mark, h.entry);
    const g = account?.settings;
    const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);
    const steps = given.steps
      ?.split(",")
      .map((x) => x.split(":").map(Number))
      .filter(([p, sh]) => p > 0 && sh > 0)
      .map(([p, sh]) => ({ px: round(p), share: sh }));
    setDraft({
      px: round(num(given.px, px)), floor: round(num(given.floor, floor)), backstop: round(num(given.bs, backstop)), slices: 4,
      steps: steps?.length ? steps : [{ px: round(base * (1 + dir * 0.05)), share: 50 }, { px: round(base * (1 + dir * 0.1)), share: 50 }],
      threshold: num(given.th, g?.thresholdPct ?? 30), target: num(given.tg, g?.targetPct ?? 45), maxDay: num(given.max, g?.maxAddAusdPerDay ?? 50), floorPct: 1,
    });
  }, [h, mark, draft]);

  const rule: Rule | null = useMemo(() => {
    if (!draft || !h) return null;
    const base = { v: 1 as const, id: "", pid, mkt: h.mkt, forMs: 0 };
    if (tab === "stop") return { ...base, id: `stop-${pid}`, kind: "stop", px: draft.px, floor: draft.floor, backstopPx: draft.backstop, slices: draft.slices };
    if (tab === "take profit") return { ...base, id: `ladder-${pid}`, kind: "ladder", steps: draft.steps.map((s) => ({ px: s.px, share: s.share, floor: round(s.px * (1 - dir * 0.01)) })) };
    if (tab === "funding") return { ...base, id: `funding-${pid}`, kind: "funding", floorPct: draft.floorPct };
    return { ...base, id: `guard-${pid}`, kind: "guard", threshold: draft.threshold, target: draft.target, maxAddDay: draft.maxDay };
  }, [draft, tab, h, pid]);
  const check = rule && h ? validate(rule, { mark, side, size: h.size, entry: h.entry, resting: 0 }) : null;

  // replay after the numbers settle, never while a line is held
  useEffect(() => {
    if (!rule || !address || dragging || (check && !check.ok) || rule.kind === "funding") return;
    let alive = true;
    setReplay(null);
    setReplayErr(null);
    const t = setTimeout(() => {
      replayRule(address, rule, 30)
        .then((r) => alive && setReplay(r))
        .catch((e) => alive && setReplayErr(e instanceof Error ? e.message : String(e)));
    }, 600);
    return () => { alive = false; clearTimeout(t); };
  }, [JSON.stringify(rule), address, dragging, check?.ok]);

  if (!h || !draft) {
    return (
      <Screen>
        <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
          <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        </View>
        <View style={{ padding: 24, gap: 14 }}>
          <View style={{ width: 220, height: 20, borderRadius: 10, backgroundColor: well }} />
          <View style={{ width: 280, height: 20, borderRadius: 10, backgroundColor: well }} />
          <View style={{ height: CH, borderRadius: 26, backgroundColor: well }} />
        </View>
      </Screen>
    );
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const apply = (key: string, v: number) => {
    if (key === "px") set({ px: round(v) });
    else if (key === "floor") set({ floor: round(v) });
    else if (key === "backstop") set({ backstop: round(v) });
    else if (key === "slices") set({ slices: Math.max(1, Math.min(8, Math.round(v))) });
    else if (key === "threshold") set({ threshold: Math.max(1, Math.min(99, Math.round(v))) });
    else if (key === "target") set({ target: Math.max(1, Math.min(100, Math.round(v))) });
    else if (key === "maxDay") set({ maxDay: Math.max(1, Math.round(v)) });
    else if (key === "floorPct") set({ floorPct: Math.max(0.1, Math.min(5, Math.round(v * 10) / 10)) });
    else if (key.startsWith("step")) {
      const [, i, what] = key.split(":");
      setDraft((d) => d && { ...d, steps: d.steps.map((s, j) => (j === Number(i) ? (what === "px" ? { ...s, px: round(v) } : { ...s, share: Math.max(1, Math.min(100, Math.round(v))) }) : s)) });
    }
  };
  const open = (f: Field) => { setEditing(f); setText(f.kind === "price" ? fmt(f.value) : String(f.value)); setFresh(true); };
  const nudge = (k: number) => {
    if (!editing) return;
    const cur = Number(text) || editing.value;
    const next = editing.kind === "price" ? cur * (1 + k / 100) : cur + k;
    setText(editing.kind === "price" ? fmt(next) : String(Math.round(next)));
    setFresh(false);
  };
  const commit = () => {
    if (editing && Number(text) > 0) apply(editing.key, Number(text));
    setEditing(null);
  };

  // the lines on the chart: price levels on the stop and the ladder, and on the guard the price where it
  // steps in, worked out from how far liquidation is
  const stepsIn = (pct: number) => (long ? h.liq / (1 - pct / 100) : h.liq / (1 + pct / 100));
  const fromStepsIn = (p: number) => Math.round(Math.abs(p - h.liq) / p * 100);
  const lines: ChartLine[] =
    tab === "stop"
      ? [{ key: "px", label: "stop", value: draft.px, color: violet }, { key: "floor", label: "floor", value: draft.floor, color: deep, dash: true }, { key: "backstop", label: "backstop", value: draft.backstop, color: green }]
      : tab === "take profit"
        ? draft.steps.map((s, i) => ({ key: `step:${i}:px`, label: `${s.share}% at`, value: s.px, color: i ? green : violet }))
        : tab === "funding"
          ? []
          : [{ key: "threshold", label: "steps in", value: stepsIn(draft.threshold), color: violet }];
  const onMove = (key: string, v: number) => (key === "threshold" ? set({ threshold: Math.max(1, Math.min(draft.target - 1, fromStepsIn(v))) }) : apply(key, v));

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const arm = async () => {
    if (!rule || !check?.ok || !address) return;
    setBusy(true);
    try {
      if (rule.kind === "guard") {
        await updateGuard(address, { enabled: true, thresholdPct: draft.threshold, targetPct: draft.target, maxAddAusdPerDay: draft.maxDay });
        log(`guard saved ${draft.threshold}% to ${draft.target}%, ${draft.maxDay} a day`);
        a.toast("the guard is set");
      } else {
        const r = await createRule(await session(), { ...rule, id: `${rule.kind}-${pid}-${Date.now().toString(36)}` }, h.symbol);
        log(`rule ${r.rule.id} ${r.rule.state} (${r.rule.mode})`);
        a.toast(rule.kind === "stop" ? "the stop is armed" : rule.kind === "funding" ? "pehra is watching funding" : "the ladder is on perpl");
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // back to the list the builder came from, or onto it when the builder was opened directly
      router.dismissTo(`/rules?pid=${pid}`);
    } catch (e) {
      log(`arm failed: ${e instanceof Error ? e.message : e}`);
      a.toast(e instanceof Error ? e.message : "couldn’t arm it");
    }
    setBusy(false);
  };

  const bad = check && !check.ok ? check.why : null;
  const total = draft.steps.reduce((s, x) => s + x.share, 0);
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>protect {sym} {side}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled">
        <Segmented options={TABS} value={tab} onChange={setTab} render={(v, on) => <Text style={{ fontSize: 14, fontWeight: "700", color: on ? ink : muted }}>{SHORT[v] ?? v}</Text>} />

        <Animated.View key={tab} entering={FadeIn.duration(220)} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: 4, marginTop: 18, columnGap: 4 }}>
          {tab === "stop" && (
            <>
              <Words>{`if ${sym} ${long ? "falls" : "rises"} to`}</Words>
              <Chip text={fmt(draft.px)} bad={!!bad} onPress={() => open({ key: "px", label: "the stop", value: draft.px, kind: "price" })} />
              <Words>sell in</Words>
              <Chip text={String(draft.slices)} onPress={() => open({ key: "slices", label: "slices", value: draft.slices, kind: "int" })} />
              <Words>{`slices, never ${long ? "below" : "above"}`}</Words>
              <Chip text={fmt(draft.floor)} onPress={() => open({ key: "floor", label: "the floor", value: draft.floor, kind: "price" })} />
              <Words>backstop on perpl at</Words>
              <Chip text={fmt(draft.backstop)} onPress={() => open({ key: "backstop", label: "the backstop", value: draft.backstop, kind: "price" })} />
            </>
          )}
          {tab === "take profit" &&
            draft.steps.map((s, i) => (
              <View key={i} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                <Words>{i ? "then sell" : "sell"}</Words>
                <Chip text={`${s.share}%`} onPress={() => open({ key: `step:${i}:share`, label: "how much", value: s.share, kind: "pct" })} />
                <Words>at</Words>
                <Chip text={fmt(s.px)} onPress={() => open({ key: `step:${i}:px`, label: "the price", value: s.px, kind: "price" })} />
                {draft.steps.length > 1 && (
                  <Tap onPress={() => set({ steps: draft.steps.filter((_, j) => j !== i) })} innerStyle={{ width: 30, height: 30, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18, fontWeight: "700", color: faint }}>×</Text>
                  </Tap>
                )}
              </View>
            ))}
          {tab === "take profit" && draft.steps.length < 4 && (
            <Tap onPress={() => { const last = draft.steps[draft.steps.length - 1]; const next = [...draft.steps, { px: round(last.px * (1 + dir * 0.05)), share: 0 }]; const k = next.length, each = Math.floor(Math.min(100, Math.max(total, 1)) / k); set({ steps: next.map((s, j) => ({ ...s, share: j === k - 1 ? Math.min(100, Math.max(total, 1)) - each * (k - 1) : each })) }); }} innerStyle={{ height: 30, justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: violet }}>+ add a step</Text>
            </Tap>
          )}
          {tab === "funding" && (
            <>
              <Words>{`close my ${sym} ${side} if funding turns against it, never more than`}</Words>
              <Chip text={`${draft.floorPct}%`} onPress={() => open({ key: "floorPct", label: "from the price", value: draft.floorPct, kind: "pct" })} />
              <Words>from the price</Words>
            </>
          )}
          {tab === "guard" && (
            <>
              <Words>add margin when it gets</Words>
              <Chip text={`${draft.threshold}%`} bad={!!bad} onPress={() => open({ key: "threshold", label: "steps in at", value: draft.threshold, kind: "pct" })} />
              <Words>from liquidation, back to</Words>
              <Chip text={`${draft.target}%`} onPress={() => open({ key: "target", label: "back to", value: draft.target, kind: "pct" })} />
              <Words>and spend at most</Words>
              <Chip text={`${draft.maxDay}`} onPress={() => open({ key: "maxDay", label: "ausd a day", value: draft.maxDay, kind: "ausd" })} />
              <Words>ausd a day</Words>
            </>
          )}
        </Animated.View>
        {bad && <Text style={{ marginTop: 6, paddingHorizontal: 8, fontSize: 12.5, fontWeight: "600", color: red }}>{bad}</Text>}

        {tab !== "funding" && (
        <>
        <View style={{ marginTop: 16, backgroundColor: "white", borderRadius: 26, borderWidth: 1, borderColor: line, padding: 12 }}>
          <LevelChart points={points} mark={mark} liq={h.liq} side={side} lines={lines} fmt={fmt} onMove={(k, v) => { if (!dragging) setDragging(true); onMove(k, v); }} onEnd={() => setDragging(false)} />
        </View>
        <Text style={{ marginTop: 8, textAlign: "center", fontSize: 11.5, fontWeight: "600", color: muted }}>drag a line or tap a number, both move the same rule</Text>
        </>
        )}

        {tab === "funding" ? (
          <View style={{ marginTop: 18, backgroundColor: mist, borderRadius: 22, padding: 16, gap: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: violet }}>funding on {sym} now</Text>
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 23, color: ink }}>{m ? `${m.fundingRate >= 0 ? "+" : "−"}${Math.abs(m.fundingRate * 100).toFixed(4)}%` : "—"}</Text>
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>
              {!m ? " " : (m.fundingRate > 0) === long && m.fundingRate !== 0 ? `your ${side} pays funding right now. pehra waits for it to flip your way, then closes it the moment it turns against you again` : `your ${side} earns funding right now. pehra closes it the moment that flips and you start paying`}
            </Text>
          </View>
        ) : (
        <>
        <Text style={{ marginTop: 18, paddingHorizontal: 8, fontSize: 13, fontWeight: "700", color: muted }}>if you had this over the last 30 days</Text>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
          {replay && !bad ? (
            <>
              <Animated.View entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)} style={{ flex: 1, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, padding: 16, gap: 4 }}>
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted }}>holding</Text>
                <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 23, color: replay.without.pnl < 0 ? red : green }}>{replay.without.pnl >= 0 ? "+" : "−"}{Math.abs(replay.without.pnl).toFixed(2)}</Text>
                <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{replay.without.liquidated ? "got liquidated" : "held the whole way"}</Text>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(80).duration(240).reduceMotion(ReduceMotion.System)} style={{ flex: 1, backgroundColor: mist, borderRadius: 22, padding: 16, gap: 4 }}>
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: violet }}>with this {tab === "take profit" ? "ladder" : tab}</Text>
                <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 23, color: ink }}>{replay.withRule.pnl >= 0 ? "+" : "−"}{Math.abs(replay.withRule.pnl).toFixed(2)}</Text>
                <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{sinceLine(replay, tab)}</Text>
              </Animated.View>
            </>
          ) : replayErr || bad ? (
            <View style={{ flex: 1, height: 100, borderRadius: 22, backgroundColor: well, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted, textAlign: "center" }}>{bad ? "fix the numbers to see the replay" : `the replay didn’t load: ${replayErr}`}</Text>
            </View>
          ) : (
            [0, 1].map((i) => (
              <View key={i} style={{ flex: 1, height: 100, borderRadius: 22, backgroundColor: i ? mist : "white", borderWidth: i ? 0 : 1, borderColor: line, padding: 16, gap: 10 }}>
                <View style={{ width: 60, height: 10, borderRadius: 5, backgroundColor: well }} />
                <View style={{ width: 90, height: 18, borderRadius: 9, backgroundColor: well }} />
                <View style={{ width: 110, height: 10, borderRadius: 5, backgroundColor: well }} />
              </View>
            ))
          )}
        </View>
        <Text style={{ marginTop: 10, textAlign: "center", fontSize: 11, fontWeight: "500", color: faint }}>trade candles, worst price first, funding left out</Text>
        </>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, gap: 8 }}>
        <Tap onPress={busy || bad ? undefined : arm} innerStyle={{ height: 58, borderRadius: 29, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, opacity: busy || bad ? 0.45 : 1 }}>
          {tab !== "guard" && <Glyph name="lock" size={22} color="white" />}
          <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{busy ? "arming…" : tab === "guard" ? "save the guard" : "arm with fingerprint"}</Text>
        </Tap>
        <Text numberOfLines={2} style={{ textAlign: "center", fontSize: 11, fontWeight: "500", color: faint, paddingHorizontal: 8 }}>
          {tab === "guard" ? "the guard covers every position on this account" : rule ? `you sign: ${describeRule(rule, h.symbol)}` : ""}
        </Text>
      </View>

      <Tray visible={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: ink, paddingHorizontal: 4 }}>{editing.label}</Text>
            <View style={{ height: 64, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: line, paddingHorizontal: 18, justifyContent: "center" }}>
              <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 28, color: fresh ? faint : violet }}>{text || "0"}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {(editing.kind === "price" ? [-1, -0.25, 0.25, 1] : [-5, -1, 1, 5]).map((k) => (
                <Tap key={k} onPress={() => nudge(k)} style={{ flex: 1 }} innerStyle={{ height: 44, borderRadius: 22, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: ink }}>{k > 0 ? "+" : "−"}{Math.abs(k)}{editing.kind === "price" ? "%" : ""}</Text>
                </Tap>
              ))}
            </View>
            {editing.kind === "price" && <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted, paddingHorizontal: 4 }}>{sym} is at {fmt(mark)} now, liquidation {fmt(h.liq)}</Text>}
            <View style={{ marginHorizontal: -16 }}>
              <Keypad onKey={(k) => { setText(enterDigit(fresh && k !== "back" ? "0" : text, k)); setFresh(false); }} />
            </View>
            <Tap onPress={commit} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>done</Text>
            </Tap>
          </View>
        )}
      </Tray>
    </Screen>
  );
}
