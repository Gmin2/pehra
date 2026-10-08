// recipes: a few rules that work together, armed with one fingerprint. with ?pid= the ones that protect
// that position, without it the ones that open something or watch the whole account. each card lists
// every sentence it signs and what the last 30 days say
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Share } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { RECIPES, instantiate, type Recipe, type Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { useApp } from "../src/ui/store";
import { useAccount, useMarkets } from "../src/live";
import { createRule, createRules, describeRule, replayMany, shareRecipe, markCopied, type ManyResult } from "../src/rules";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { ink, muted, green, red, faint, well } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
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

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>recipes</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        <View style={{ paddingHorizontal: 8, marginTop: 4, marginBottom: 6 }}>
          {by && <Text style={{ fontSize: 13, fontWeight: "700", color: "#9E4DFD", marginBottom: 6 }}>shared by {by}</Text>}
          <Text style={heading}>{pid ? `a few rules for your ${sym} ${h?.side ?? ""},` : `a few rules that trade ${sym},`}</Text>
          <Text style={heading}>one fingerprint.</Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>each one is written from the price now. you sign every line below it.</Text>
        </View>
        {blocked && <Text style={{ paddingHorizontal: 8, fontSize: 13.5, fontWeight: "600", color: red }}>{blocked}</Text>}
        {shown.map((r, i) => {
          const rules = make(r);
          const rp = replays[r.id];
          return (
            <Animated.View key={r.id} entering={FadeInDown.delay(60 * i).duration(260).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
                  <Glyph name={GLYPH[r.id] ?? "shield"} size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: ink }}>{r.name}</Text>
                  <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>{r.blurb}</Text>
                </View>
              </View>
              <View style={{ gap: 4, backgroundColor: "#FAF8F2", borderRadius: 16, padding: 12 }}>
                {(rules ?? []).map((x, k) => (
                  <Text key={x.id} style={{ fontSize: 11.5, fontWeight: "500", color: muted }}>{rules && rules.length > 1 ? `${k + 1}. ` : ""}{describeRule(x, m?.symbol ?? "MON")}</Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                {rp === undefined ? (
                  <View style={{ width: 160, height: 12, borderRadius: 6, backgroundColor: well }} />
                ) : rp === "none" ? (
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: faint }}>no replay for this one</Text>
                ) : (
                  <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "700", color: rp.withRules.pnl >= rp.without.pnl ? green : red }}>
                    {rp.withRules.pnl >= rp.without.pnl ? "+" : "−"}{Math.abs(rp.withRules.pnl - rp.without.pnl).toFixed(2)} vs holding, last 30 days
                  </Text>
                )}
                {!from && (
                  <Tap onPress={() => void share(r)} innerStyle={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: "#F0EDF3", justifyContent: "center" }}>
                    <Text style={{ fontSize: 13, fontWeight: "600", color: ink }}>share</Text>
                  </Tap>
                )}
                <Tap onPress={busy || !rules || blocked ? undefined : () => arm(r)} innerStyle={{ height: 38, paddingHorizontal: 18, borderRadius: 19, backgroundColor: ink, flexDirection: "row", alignItems: "center", gap: 8, opacity: busy && busy !== r.id ? 0.4 : 1 }}>
                  <Glyph name="lock" size={16} color="white" />
                  <Text style={{ fontSize: 13.5, fontWeight: "600", color: "white" }}>{busy === r.id ? "arming…" : "arm"}</Text>
                </Tap>
              </View>
            </Animated.View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
