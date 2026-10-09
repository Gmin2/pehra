// recipes: a few rules that work together, armed with one fingerprint. with ?pid= the ones that protect
// that position, without it the ones that open something or watch the whole account. the one that did best
// over the last 30 days leads, big and violet, the rest are rows that open their steps in a tray
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Share } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { RECIPES, instantiate, type Recipe, type Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Tray } from "../src/ui/Trade";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { useApp } from "../src/ui/store";
import { useAccount, useMarkets } from "../src/live";
import { createRule, createRules, describeRule, replayMany, shareRecipe, markCopied, type ManyResult } from "../src/rules";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { ink, muted, green, red, faint, well, violet } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const SHORT: Record<string, string> = { dip: "long 3% under the price, protected", breakout: "long on a 2% break, stop trails 4%", run: "stop trails 4%, a third off at +6%", lock: "half off at +5%, the rest at +10%", sleep: "funding, margin and a morning note", depeg: "closes everything if ausd slips", stack: "a small long every morning" };
const GLYPH: Record<string, string> = { dip: "flame", breakout: "gauge", run: "crosshairs", lock: "shield", sleep: "lock", depeg: "circle-coin", stack: "magic-wand-sparkle" };

export default function Recipes() {
  const a = useApp(),
    // a shared link opens with only, from (the link), by (who shared it), margin and lev
    { pid: pidParam, symbol: symParam, only, from, by, margin: marginParam, lev: levParam } = useLocalSearchParams<{ pid?: string; symbol?: string; only?: string; from?: string; by?: string; margin?: string; lev?: string }>(),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    markets = useMarkets();
  const onlyRecipe = RECIPES.find((r) => r.id === only);
  // a shared recipe that protects a position picks the first open one on its market
  const pid = Number(pidParam) || (onlyRecipe?.needs === "position" ? account?.health?.find((x) => x.symbol === (symParam ?? "MON"))?.pid ?? 0 : 0);
  const h = account?.health?.find((x) => x.pid === pid);
  const m = markets.find((x) => (h ? x.id === h.mkt : x.symbol === (symParam ?? "MON")));
  const sym = (m?.symbol ?? "MON").toLowerCase();
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [replays, setReplays] = useState<Record<string, ManyResult | "none">>({});
  const tag = useMemo(() => Date.now().toString(36), []);

  const shown = onlyRecipe ? [onlyRecipe] : RECIPES.filter((r) => (pid ? r.needs === "position" : r.needs === "none"));
  const margin = Number(marginParam) > 0 ? Number(marginParam) : 10;
  const blocked = onlyRecipe?.needs === "position" && !h ? `${onlyRecipe.name} protects an open position. open a ${(symParam ?? "mon").toLowerCase()} position first` : null;
  const make = (r: Recipe): Rule[] | null => {
    if (!m) return null;
    try {
      return instantiate(r.id, {
        mkt: m.id, mark: m.mark, tz: -new Date().getTimezoneOffset(), margin, leverage: Math.min(Number(levParam) > 0 ? Number(levParam) : 3, Math.floor(m.market.config.initial_margin / 100)),
        pos: h ? { pid: h.pid, side: h.side === "short" ? "short" : "long", entry: h.entry, size: h.size } : undefined,
      }, tag);
    } catch { return null; }
  };

  useEffect(() => {
    if (!address || !m) return;
    for (const r of shown) {
      const rules = make(r);
      if (!rules || replays[r.id]) continue;
      replayMany(address, rules, pid ? null : { side: "long", margin: 10, leverage: 3 })
        .then((x) => setReplays((p) => ({ ...p, [r.id]: x.withRules.opened || x.without.opened ? x : "none" })))
        .catch(() => setReplays((p) => ({ ...p, [r.id]: "none" })));
    }
  }, [address, m?.id, pid]);

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const arm = async (r: Recipe) => {
    const rules = make(r);
    if (!rules || !m) return;
    setBusy(r.id);
    try {
      const s = await session();
      if (rules.length === 1) await createRule(s, rules[0], m.symbol);
      else await createRules(s, r.name, rules, m.symbol);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`recipe ${r.id} armed, ${rules.length} rules${from ? `, copied from ${from}` : ""}`);
      if (from) void markCopied(from);
      a.toast(`${r.name} is on`);
      router.dismissTo(pid ? `/rules?pid=${pid}` : `/trade?symbol=${m.symbol}`);
    } catch (e) {
      log(`recipe ${r.id} failed: ${e instanceof Error ? e.message : e}`);
      a.toast(e instanceof Error ? e.message : "couldn’t arm it");
    }
    setBusy(null);
  };

  const share = async (r: Recipe) => {
    if (!address || !m) return;
    try {
      const link = await shareRecipe(address, { recipe: r.id, symbol: m.symbol, margin, leverage: 3 });
      log(`recipe ${r.id} shared as ${link.id}`);
      await Share.share({ message: `${r.name} on pehra, the rules i run on ${sym}: ${link.url}` });
    } catch (e) { a.toast("couldn’t make the link"); log(`share failed: ${e instanceof Error ? e.message : e}`); }
  };

  const gain = (id: string) => { const rp = replays[id]; return rp && rp !== "none" ? rp.withRules.pnl - rp.without.pnl : null; };
  // the lead is the best replay so far, the first recipe until any replay lands
  const lead = onlyRecipe ?? [...shown].sort((x, y) => (gain(y.id) ?? -1e9) - (gain(x.id) ?? -1e9))[0];
  const rest = shown.filter((r) => r.id !== lead?.id);
  const open = shown.find((r) => r.id === detail) ?? null;
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
  // one rule can carry its stop and take profits with it, so its sentence is cut where each part starts
  const steps = (r: Recipe) => (make(r) ?? []).flatMap((x) => describeRule(x, m?.symbol ?? "MON").split(/, then |, (?=take profit|the stop moves|trailing)/).map((t) => t.trim()).filter(Boolean));
  const leadGain = lead ? gain(lead.id) : null;

  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>recipes</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        <View style={{ paddingHorizontal: 6 }}>
          <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 24, lineHeight: 31, color: ink, letterSpacing: -0.5 }}>{pid ? `rules for your ${sym} ${h?.side ?? ""}, one fingerprint.` : `rules that trade ${sym}, one fingerprint.`}</Text>
          <Text style={{ marginTop: 4, fontSize: 13.5, fontWeight: "500", color: muted }}>written from the price now, replayed on the last 30 days.</Text>
        </View>
        {blocked && <Text style={{ paddingHorizontal: 6, fontSize: 13.5, fontWeight: "600", color: red }}>{blocked}</Text>}

        {lead && (
          <Animated.View key={lead.id} entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: violet, borderRadius: 28, padding: 18, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: "#ffffff33", justifyContent: "center" }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "white" }}>{by ? `shared by ${by}` : leadGain !== null && !onlyRecipe ? "best last 30 days" : "recipe"}</Text>
              </View>
              <Glyph name={GLYPH[lead.id] ?? "shield"} size={34} color="white" />
            </View>
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 24, color: "white", letterSpacing: -0.5 }}>{lead.name}</Text>
            <Text style={{ fontSize: 13.5, fontWeight: "500", color: "#ffffffd9", lineHeight: 19 }}>{lead.blurb}</Text>
            {replays[lead.id] === undefined ? <View style={{ width: 170, height: 26, borderRadius: 10, backgroundColor: "#ffffff33" }} />
              : leadGain === null ? <Text style={{ fontSize: 13, fontWeight: "600", color: "#ffffffb3" }}>no replay for this one</Text>
              : <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 28, color: "white", fontVariant: ["tabular-nums"] }}>{signed(leadGain)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#ffffffcc" }}>ausd {leadGain >= 0 ? "better" : "worse"} than holding</Text>
                </View>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Tap onPress={() => setDetail(lead.id)} style={{ flex: 1 }} innerStyle={{ height: 46, borderRadius: 23, backgroundColor: "#ffffff33", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "white" }}>see the steps</Text>
              </Tap>
              <Tap onPress={busy || !make(lead) || blocked ? undefined : () => arm(lead)} style={{ flex: 1.4 }} innerStyle={{ height: 46, borderRadius: 23, backgroundColor: "white", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy && busy !== lead.id ? 0.5 : 1 }}>
                <Glyph name="lock" size={18} color={ink} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: ink }}>{busy === lead.id ? "arming…" : "arm"}</Text>
              </Tap>
            </View>
          </Animated.View>
        )}

        {rest.length > 0 && <Text style={{ fontSize: 13, fontWeight: "700", color: ink, paddingHorizontal: 6, marginTop: 4 }}>more</Text>}
        {rest.length > 0 && (
          <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingHorizontal: 14 }}>
            {rest.map((r, i) => {
              const g = gain(r.id);
              return (
                <Tap key={r.id} onPress={() => setDetail(r.id)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
                    <Glyph name={GLYPH[r.id] ?? "shield"} size={26} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{r.name}</Text>
                    <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>{SHORT[r.id] ?? r.blurb}</Text>
                  </View>
                  {replays[r.id] === undefined ? <View style={{ width: 44, height: 12, borderRadius: 6, backgroundColor: well }} />
                    : <Text style={{ fontSize: 14, fontWeight: "700", color: g === null || Math.abs(g) < 0.005 ? faint : g >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{g === null ? "—" : Math.abs(g) < 0.005 ? "0.00" : signed(g)}</Text>}
                  <Text style={{ fontSize: 16, fontWeight: "600", color: faint }}>›</Text>
                </Tap>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Tray visible={!!open} onClose={() => setDetail(null)}>
        {open && (
          <View style={{ gap: 12, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
                <Glyph name={GLYPH[open.id] ?? "shield"} size={30} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: "700", color: ink }}>{open.name}</Text>
                {gain(open.id) !== null && <Text style={{ fontSize: 13, fontWeight: "700", color: (gain(open.id) ?? 0) >= 0 ? green : red }}>{signed(gain(open.id) ?? 0)} vs holding, last 30 days</Text>}
              </View>
            </View>
            <View style={{ backgroundColor: "white", borderRadius: 20, borderWidth: 1, borderColor: line, paddingHorizontal: 12 }}>
              {steps(open).map((t, k) => (
                <View key={k} style={{ flexDirection: "row", gap: 10, paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderTopColor: line }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: mist, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: "800", color: violet }}>{k + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: "500", color: ink, lineHeight: 18 }}>{t}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint, paddingHorizontal: 4 }}>you sign every step above with one fingerprint.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {!from && (
                <Tap onPress={() => void share(open)} style={{ flex: 1 }} innerStyle={{ height: 54, borderRadius: 27, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: ink }}>share</Text>
                </Tap>
              )}
              <Tap onPress={busy || !make(open) || blocked ? undefined : () => { setDetail(null); void arm(open); }} style={{ flex: 2 }} innerStyle={{ height: 54, borderRadius: 27, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Glyph name="lock" size={18} color="white" />
                <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>{busy === open.id ? "arming…" : "arm with fingerprint"}</Text>
              </Tap>
            </View>
          </View>
        )}
      </Tray>
    </Screen>
  );
}
