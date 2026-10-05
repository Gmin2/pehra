// how you trade (tmp/claude/preview/profile-a.png): what pehra reads from the account's own perpl history,
// three numbers behind it, and the rules that fit each open position with what they would have done over the
// last 30 days. add signs the rule with the passkey, tapping the card opens it in the builder to change first
import { useCallback, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { Profile, Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { useApp } from "../src/ui/store";
import { useAccount } from "../src/live";
import { readProfile, replayRule, createRule, type ReplayResult } from "../src/rules";
import { updateGuard } from "../src/guard";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { ink, muted, green, red, faint, well } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
type Suggestion = Profile["suggest"][number];

const hours = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${h.toFixed(1)}h` : `${Math.round(h / 24)}d`);

function title(s: Suggestion, sym: string, side: string) {
  const r = s.rule;
  if (r.kind === "stop") return { glyph: "crosshairs", text: `hidden stop on ${sym} ${side}` };
  if (r.kind === "ladder") return { glyph: "flame", text: `take profit on ${sym} ${side}` };
  return { glyph: "shield", text: `guard on ${sym} ${side}` };
}

// the suggestion's numbers for the builder to open with
function given(r: Rule) {
  if (r.kind === "stop") return `px=${r.px}&floor=${r.floor}&bs=${r.backstopPx}`;
  if (r.kind === "ladder") return `steps=${r.steps.map((s) => `${s.px}:${s.share}`).join(",")}`;
  if (r.kind === "guard") return `th=${r.threshold}&tg=${r.target}&max=${r.maxAddDay}`;
  return "";
}

// what the replay says, in one line, good or bad
function verdict(r: ReplayResult | undefined, kind: Rule["kind"]): { text: string; color: string } | null {
  if (!r) return null;
  const diff = r.withRule.pnl - r.without.pnl;
  if (kind === "guard" && r.without.liquidated && !r.withRule.liquidated) return { text: `kept it alive, ${r.withRule.pnl >= 0 ? "+" : "−"}${Math.abs(r.withRule.pnl).toFixed(2)} in 30 days`, color: green };
  if (Math.abs(diff) < 0.01) return { text: "would not have changed the last 30 days", color: muted };
  return diff > 0 ? { text: `would have saved ${diff.toFixed(2)} in 30 days`, color: green } : { text: `would have cost ${Math.abs(diff).toFixed(2)} in 30 days`, color: red };
}

function Skeleton() {
  return (
    <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, flexDirection: "row", gap: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: well }} />
      <View style={{ flex: 1, gap: 10, paddingTop: 4 }}>
        <View style={{ width: "60%", height: 12, borderRadius: 6, backgroundColor: well }} />
        <View style={{ width: "80%", height: 10, borderRadius: 5, backgroundColor: well }} />
        <View style={{ width: "45%", height: 10, borderRadius: 5, backgroundColor: well, marginTop: 6 }} />
      </View>
    </View>
  );
}

export default function You() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    [p, setP] = useState<Profile | null>(null),
    [err, setErr] = useState<string | null>(null),
    [replays, setReplays] = useState<Record<string, ReplayResult>>({}),
    [busy, setBusy] = useState<string | null>(null);
  const health = account?.health ?? [];

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const got = await readProfile(address);
      setP(got);
      setErr(null);
      for (const s of got.suggest)
        replayRule(address, s.rule, 30)
          .then((r) => setReplays((m) => ({ ...m, [s.rule.id]: r })))
          .catch((e) => log(`profile replay ${s.rule.id} failed: ${e instanceof Error ? e.message : e}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [address]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const add = async (s: Suggestion, symbol: string) => {
    if (!address) return;
    const r = s.rule;
    setBusy(r.id);
    try {
      if (r.kind === "guard") await updateGuard(address, { enabled: true, thresholdPct: r.threshold, targetPct: r.target, maxAddAusdPerDay: r.maxAddDay });
      else await createRule(await session(), { ...r, id: `${r.kind}-${r.pid}-${Date.now().toString(36)}` }, symbol);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`profile added ${r.kind} on ${r.pid}`);
      a.toast(r.kind === "stop" ? "the stop is armed" : r.kind === "ladder" ? "the ladder is on perpl" : "the guard is set");
      await load();
    } catch (e) {
      log(`profile add failed: ${e instanceof Error ? e.message : e}`);
      a.toast(e instanceof Error ? e.message : "couldn’t add it");
    }
    setBusy(null);
  };

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 28, lineHeight: 36, color: ink, letterSpacing: -0.5 };
  const [first, ...rest] = p?.labels ?? [];
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: muted }}>how you trade</Text>
          {p === null ? (
            err ? (
              <Text style={[heading, { marginTop: 6 }]}>couldn’t read your trades.</Text>
            ) : (
              <View style={{ gap: 12, marginTop: 12 }}>
                <View style={{ width: 230, height: 26, borderRadius: 13, backgroundColor: well }} />
                <View style={{ width: 180, height: 26, borderRadius: 13, backgroundColor: well }} />
              </View>
            )
          ) : (
            <Animated.View entering={FadeIn.duration(240)} style={{ marginTop: 6 }}>
              {rest.length ? <Text style={heading}>{first},</Text> : null}
              <View style={{ alignSelf: "flex-start" }}>
                <Rough type="underline" padding={2} strokeWidth={2.2} delay={300} duration={700}>
                  <Text style={heading}>{(rest.length ? rest.join(", ") : first) + "."}</Text>
                </Rough>
              </View>
              <Text style={{ marginTop: 10, fontSize: 14, fontWeight: "500", color: muted }}>
                {p.trades ? `from your last ${p.trades} trade${p.trades === 1 ? "" : "s"} on perpl` : "make a few trades and pehra reads how you trade"}
              </Text>
            </Animated.View>
          )}
          {err && <Text style={{ marginTop: 8, fontSize: 12.5, fontWeight: "600", color: red }}>{err}</Text>}
        </View>

        {p && p.trades > 0 && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 22 }}>
            {[
              { v: `${p.avgLeverage.toFixed(1)}x`, l: "average" },
              { v: hours(p.avgHoldHours), l: "held for" },
              p.liquidations ? { v: String(p.liquidations), l: p.liquidations === 1 ? "liquidation" : "liquidations" } : { v: String(p.topUps), l: p.topUps === 1 ? "top up by hand" : "top ups by hand" },
            ].map((x, i) => (
              <Animated.View key={x.l} entering={FadeInDown.delay(80 * i).duration(240).reduceMotion(ReduceMotion.System)} style={{ flex: 1, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, paddingVertical: 16, alignItems: "center", gap: 4 }}>
                <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 22, color: ink }}>{x.v}</Text>
                <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>{x.l}</Text>
              </Animated.View>
            ))}
          </View>
        )}

        <Text style={{ marginTop: 26, paddingHorizontal: 8, fontSize: 14, fontWeight: "700", color: muted }}>rules that fit you</Text>
        <View style={{ gap: 12, marginTop: 12 }}>
          {p === null && !err ? (
            [0, 1].map((i) => <Skeleton key={i} />)
          ) : p && p.suggest.length ? (
            p.suggest.map((s, i) => {
              const h = health.find((x) => x.pid === s.rule.pid);
              const sym = h?.symbol.toLowerCase() ?? "", side = h?.side ?? "";
              const t = title(s, sym, side), v = verdict(replays[s.rule.id], s.rule.kind);
              const kind = s.rule.kind === "ladder" ? "ladder" : s.rule.kind;
              return (
                <Animated.View key={s.rule.id} entering={FadeInDown.delay(80 * i).duration(260).reduceMotion(ReduceMotion.System)}>
                  <Tap onPress={() => a.go(`/rule?pid=${s.rule.pid}&kind=${kind}&${given(s.rule)}`)} innerStyle={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, flexDirection: "row", gap: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
                      <Glyph name={t.glyph} size={24} />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={{ fontSize: 15.5, fontWeight: "700", color: ink }}>{t.text}</Text>
                      <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{s.why}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 10 }}>
                        {v ? (
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: "700", color: v.color }}>{v.text}</Text>
                        ) : (
                          <View style={{ flex: 1 }}><View style={{ width: 150, height: 10, borderRadius: 5, backgroundColor: well }} /></View>
                        )}
                        <Tap onPress={busy ? undefined : () => add(s, h?.symbol ?? "")} innerStyle={{ height: 34, paddingHorizontal: 18, borderRadius: 17, backgroundColor: ink, justifyContent: "center", opacity: busy && busy !== s.rule.id ? 0.4 : 1 }}>
                          <Text style={{ fontSize: 13.5, fontWeight: "600", color: "white" }}>{busy === s.rule.id ? "adding…" : "add"}</Text>
                        </Tap>
                      </View>
                    </View>
                  </Tap>
                </Animated.View>
              );
            })
          ) : p ? (
            <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 18, gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{health.length ? "your positions are covered" : "nothing open right now"}</Text>
              <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{health.length ? "every open position already has the rules that fit it." : "open a position and pehra suggests the rules that fit it."}</Text>
            </View>
          ) : null}
        </View>
        {p && p.suggest.length > 0 && <Text style={{ marginTop: 12, textAlign: "center", fontSize: 11, fontWeight: "500", color: faint }}>tap a rule to change it first. add asks for your fingerprint</Text>}
      </ScrollView>
    </Screen>
  );
}
