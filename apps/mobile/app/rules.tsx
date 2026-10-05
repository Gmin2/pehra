// the rules on one position (tmp/claude/preview/rules-a.png): what each does, the last thing it did, who
// holds it (pehra, perpl, or pehra with a backstop on perpl), and a switch. pausing signs with the passkey,
// the guard follows its own on/off setting
import { useCallback, useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, ReduceMotion, Easing, useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { Coin } from "../src/ui/Coin";
import { useApp } from "../src/ui/store";
import { useAccount } from "../src/live";
import { listRules, holdRule, cancelRule, type RuleRow } from "../src/rules";
import { updateGuard } from "../src/guard";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { violet, ink, muted, green, faint, well } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF", amber = "#9A6B1C";
const LIVE = ["armed", "firing", "working", "held", "paused"];

const holder = { pehra: { label: "run by pehra", bg: mist, fg: violet }, both: { label: "backstop on perpl", bg: "#FBF0DA", fg: amber }, perpl: { label: "held by perpl", bg: "#E4F3EC", fg: green } };

function describe(r: Rule): { glyph: string; title: string; line: string } {
  if (r.kind === "guard") return { glyph: "shield", title: "guard", line: `adds margin under ${r.threshold}%, back to ${r.target}%` };
  if (r.kind === "stop") return { glyph: "crosshairs", title: `hidden stop at ${r.px}`, line: `${r.slices} slices, never below ${r.floor}, backstop ${r.backstopPx}` };
  if (r.kind === "ladder") return { glyph: "flame", title: "take profit ladder", line: r.steps.map((s) => `${s.share}% at ${s.px}`).join(" · ") };
  return { glyph: "bell", title: "price alert", line: `when it goes above ${r.above}` };
}

function lastLine(r: RuleRow) {
  const when = r.lastRun ? new Date(r.lastRun).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase() : null;
  if (r.state === "paused") return r.rule.kind === "stop" ? "paused · the backstop on perpl still holds" : "paused, not watching";
  if (r.state === "held") return "held at the floor, waiting for the book";
  if (r.state === "firing" || r.state === "working") return "acting right now";
  if (r.rule.kind === "guard") return r.fires ? `stepped in ${r.fires} time${r.fires === 1 ? "" : "s"}, last ${when}` : "watching, not needed yet";
  if (r.rule.kind === "stop") return "armed · nobody can see it on the book";
  if (r.rule.kind === "ladder") return "waiting · resting on perpl";
  return "watching";
}

function Switch({ on, busy, onPress }: { on: boolean; busy: boolean; onPress: () => void }) {
  const x = useSharedValue(on ? 18 : 0);
  useEffect(() => { x.set(withTiming(on ? 18 : 0, { duration: 180, easing: Easing.out(Easing.quad) })); }, [on, x]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return (
    <Tap onPress={busy ? undefined : onPress} innerStyle={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? violet : line, justifyContent: "center", paddingHorizontal: 3, opacity: busy ? 0.5 : 1 }}>
      <Animated.View style={[{ width: 20, height: 20, borderRadius: 10, backgroundColor: "white" }, knob]} />
    </Tap>
  );
}

// a ladder lives on perpl as trigger orders, pausing it on pehra would change nothing, so it has no switch
function Card({ r, index, busy, onToggle, onRemove }: { r: RuleRow; index: number; busy: boolean; onToggle: () => void; onRemove: () => void }) {
  const d = describe(r.rule), h = holder[r.mode];
  return (
    <Animated.View entering={FadeInDown.delay(80 * index).duration(260).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
          <Glyph name={d.glyph} size={22} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{d.title}</Text>
          <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>{d.line}</Text>
          <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>{lastLine(r)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ height: 24, paddingHorizontal: 11, borderRadius: 12, backgroundColor: h.bg, justifyContent: "center" }}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: h.fg }}>{h.label}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {r.rule.kind !== "guard" && (
            <Tap onPress={busy ? undefined : onRemove} innerStyle={{ height: 32, paddingHorizontal: 10, justifyContent: "center" }}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: busy ? faint : muted }}>remove</Text>
            </Tap>
          )}
          {r.rule.kind !== "ladder" && <Switch on={r.state !== "paused"} busy={busy} onPress={onToggle} />}
        </View>
      </View>
    </Animated.View>
  );
}

function Skeleton() {
  return (
    <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: well }} />
        <View style={{ flex: 1, gap: 8, paddingTop: 2 }}>
          <View style={{ width: 120, height: 12, borderRadius: 6, backgroundColor: well }} />
          <View style={{ width: 190, height: 10, borderRadius: 5, backgroundColor: well }} />
        </View>
      </View>
      <View style={{ width: 110, height: 22, borderRadius: 11, backgroundColor: well }} />
    </View>
  );
}

export default function Rules() {
  const a = useApp(),
    { pid: pidParam } = useLocalSearchParams<{ pid?: string }>(),
    pid = Number(pidParam),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    [rows, setRows] = useState<RuleRow[] | null>(null),
    [busy, setBusy] = useState<string | null>(null);
  const h = account?.health?.find((x) => x.pid === pid);

  const load = useCallback(async () => {
    if (!address) return;
    try { setRows((await listRules(address)).filter((r) => r.rule.pid === pid && LIVE.includes(r.state))) } catch (e) { log(`rules load failed: ${e instanceof Error ? e.message : e}`) }
  }, [address, pid]);
  useEffect(() => {
    void load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const toggle = async (r: RuleRow) => {
    setBusy(r.id);
    const off = r.state !== "paused";
    try {
      if (r.rule.kind === "guard") await updateGuard(address ?? "", { enabled: !off });
      else await holdRule(await session(), r.id, off);
      Haptics.selectionAsync();
      log(`rule ${r.id} ${off ? "paused" : "resumed"}`);
      await load();
    } catch (e) {
      a.toast(off ? "couldn’t pause it, nothing changed" : "couldn’t turn it back on");
      log(`rule ${r.id} toggle failed: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  };

  const remove = async (r: RuleRow) => {
    setBusy(r.id);
    try {
      await cancelRule(await session(), r.id);
      Haptics.selectionAsync();
      log(`rule ${r.id} removed`);
      a.toast(r.rule.kind === "ladder" ? "the ladder is off perpl" : "the stop is gone, backstop too");
      await load();
    } catch (e) {
      a.toast("couldn’t remove it, nothing changed");
      log(`rule ${r.id} remove failed: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  };

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };
  const n = rows?.length ?? 0;
  const onPehra = rows?.filter((r) => r.mode !== "perpl").length ?? 0;
  const onPerpl = rows?.filter((r) => r.mode !== "pehra").length ?? 0;
  const sym = h?.symbol.toLowerCase() ?? "";
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>your rules</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, gap: 12 }}>
        {h && (
          <Animated.View entering={FadeIn.duration(240)} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, padding: 14 }}>
            <Coin symbol={h.symbol} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{sym} {h.side} · {h.lv / 100}x</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{h.size} {sym} · entry {h.entry}</Text>
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted }}>{(h.distance * 100).toFixed(1)}% from liq</Text>
          </Animated.View>
        )}

        <View style={{ paddingHorizontal: 8, marginTop: 8 }}>
          {rows === null ? (
            <Text style={heading}>reading your rules…</Text>
          ) : n === 0 ? (
            <Text style={heading}>nothing watches this position yet.</Text>
          ) : (
            <>
              <Text style={heading}>{n === 1 ? "1 rule watches this" : `${n} rules watch this`}</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={heading}>position </Text>
                <Rough type="circle" padding={3} paddingX={8} strokeWidth={2.2} delay={350} duration={700}>
                  <Text style={heading}>for you.</Text>
                </Rough>
              </View>
              <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20, fontWeight: "500", color: muted }}>
                {onPerpl
                  ? `${onPehra ? `${onPehra} run${onPehra === 1 ? "s" : ""} on pehra. ` : ""}${onPerpl} ${onPerpl === 1 ? "has orders" : "have orders"} on perpl that fire even if pehra is down.`
                  : `${n === 1 ? "it runs" : "they run"} on pehra, with a key that can’t withdraw.`}
              </Text>
            </>
          )}
        </View>

        {rows === null ? [0, 1, 2].map((i) => <Skeleton key={i} />) : rows.map((r, i) => <Card key={r.id} r={r} index={i} busy={busy === r.id} onToggle={() => toggle(r)} onRemove={() => remove(r)} />)}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
        <Tap onPress={() => a.go(`/rule?pid=${pid}`)} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>add a rule</Text>
        </Tap>
      </View>
    </Screen>
  );
}
