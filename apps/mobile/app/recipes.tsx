// recipes: a few rules that work together, armed with one fingerprint. with ?pid= the ones that protect
// that position, without it the ones that open something or watch the whole account. chips pick one, the
// month of price shows where it got in and out, the two endings sit side by side, then what you arm
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, Share, useWindowDimensions } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { RECIPES, instantiate, type Recipe, type Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { ReplayChart } from "../src/ui/ReplayChart";
import { useCandles } from "../src/candles";
import { Coin } from "../src/ui/Coin";
import { Avatar } from "../src/ui/Avatar";
import { AddressText } from "../src/ui/AddressText";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { useApp } from "../src/ui/store";
import { useAccount, useMarkets } from "../src/live";
import { createRule, createRules, describeRule, replayMany, shareRecipe, markCopied, type ManyResult } from "../src/rules";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { ink, muted, green, red, faint, well, violet } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const GLYPH: Record<string, string> = { dip: "flame", breakout: "gauge", run: "crosshairs", lock: "shield", sleep: "lock", depeg: "circle-coin", stack: "magic-wand-sparkle" };

export default function Recipes() {
  const a = useApp(),
    // a shared link opens with only, from (the link), by (who shared it), margin and lev
    { pid: pidParam, symbol: symParam, only, from, by, copies, margin: marginParam, lev: levParam } = useLocalSearchParams<{ pid?: string; symbol?: string; only?: string; from?: string; by?: string; copies?: string; margin?: string; lev?: string }>(),
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
  const [picked, setPicked] = useState<string | null>(null);
  const { width } = useWindowDimensions();
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
  // the best replay is picked until you pick one yourself
  const best = [...shown].sort((x, y) => (gain(y.id) ?? -1e9) - (gain(x.id) ?? -1e9))[0];
  const cur = onlyRecipe ?? shown.find((r) => r.id === picked) ?? best;
  const rp = cur ? replays[cur.id] : undefined;
  const points = useCandles(m?.market, "1m");
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
  // one rule can carry its stop and take profits with it, so its sentence is cut where each part starts
  const steps = (r: Recipe) => (make(r) ?? []).flatMap((x) => describeRule(x, m?.symbol ?? "MON").split(/, then |, (?=take profit|the stop moves|trailing)/).map((t) => t.trim().replace(/^trailing (\S+)$/, "the stop trails $1 behind and never loosens")).filter(Boolean));
  const story = (x: ManyResult) => {
    const f = x.fires, moves = f.filter((y) => y.what === "move").length, steps = f.filter((y) => y.what === "step").length;
    if (!x.withRules.opened) return "never got in";
    if (x.withRules.liquidated) return "liquidated";
    const bits = [moves ? `stop moved ${moves}x` : "", steps ? `took profit ${steps}x` : "", f.some((y) => ["stop", "backstop", "close"].includes(y.what)) ? "out early" : "still in"].filter(Boolean);
    return bits.join(", ");
  };
  const half = (width - 32 - 10) / 2;

  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>{pid ? `protect ${sym} ${h?.side ?? ""}` : by ? "recipe for you" : "recipes"}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120, gap: 14 }}>
        {by && (
          <View style={{ marginHorizontal: 16, backgroundColor: mist, borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 }}>
            {/^0x[0-9a-fA-F]{40}$/.test(by) ? <Avatar address={by} size={42} /> : null}
            <View style={{ flex: 1, gap: 2 }}>
              {/^0x[0-9a-fA-F]{40}$/.test(by) ? <AddressText address={by} size={15} /> : <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{by}</Text>}
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: violet }}>sent you this{Number(copies) > 0 ? ` · ${copies} ${Number(copies) === 1 ? "person" : "people"} copied it` : ""}</Text>
            </View>
          </View>
        )}
        {onlyRecipe && (
          <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
              <Glyph name={GLYPH[onlyRecipe.id] ?? "shield"} size={26} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 15.5, fontWeight: "700", color: ink }}>{onlyRecipe.name}</Text>
              <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }} numberOfLines={2}>{onlyRecipe.blurb}</Text>
            </View>
          </View>
        )}
        {h && (
          <View style={{ marginHorizontal: 16, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <Coin symbol={h.symbol} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{sym} {h.side}{h.lv ? ` · ${Math.round(h.lv / 100)}x` : ""}</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{Number(h.size.toPrecision(5))} {sym} · entry {h.entry}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: (h.side === "short" ? h.entry - h.mark : h.mark - h.entry) >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{signed((h.side === "short" ? h.entry - h.mark : h.mark - h.entry) * h.size)}</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>{(h.distance * 100).toFixed(1)}% from liq</Text>
            </View>
          </View>
        )}
        {!onlyRecipe && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
            {shown.map((r) => {
              const on = r.id === cur?.id;
              return (
                <Tap key={r.id} onPress={() => { if (!on) Haptics.selectionAsync(); setPicked(r.id); }} innerStyle={{ height: 40, paddingLeft: 10, paddingRight: 14, borderRadius: 20, backgroundColor: on ? mist : well, flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Glyph name={GLYPH[r.id] ?? "shield"} size={20} color={on ? violet : ink} />
                  <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? violet : ink }}>{r.name.split(",")[0]}</Text>
                </Tap>
              );
            })}
          </ScrollView>
        )}
        {blocked && <Text style={{ paddingHorizontal: 22, fontSize: 13.5, fontWeight: "600", color: red }}>{blocked}</Text>}

        {cur && (
          <Animated.View key={cur.id} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)} style={{ paddingHorizontal: 16, gap: 14 }}>
            <View style={{ backgroundColor: "white", borderRadius: 28, borderWidth: 1, borderColor: line, padding: 16, paddingBottom: 30, gap: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Coin symbol={m?.symbol ?? "MON"} size={24} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: ink }}>{sym}, last 30 days</Text>
                {points.length > 1 && <Text style={{ fontSize: 13.5, fontWeight: "700", color: points[points.length - 1].p >= points[0].p ? green : red }}>{signed(((points[points.length - 1].p / points[0].p) - 1) * 100)}%</Text>}
              </View>
              <ReplayChart points={points} fires={rp && rp !== "none" ? rp.fires : []} from={rp && rp !== "none" ? rp.from : undefined} width={width - 32 - 34} entry={h && points.length ? points[0].p : undefined} liq={h && points.length ? points[0].p * (h.liq / h.entry) : undefined} />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ width: half, backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 14, gap: 4 }}>
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted }}>just holding</Text>
                {rp === undefined ? <View style={{ width: 90, height: 28, borderRadius: 10, backgroundColor: well, marginVertical: 4 }} />
                  : <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 26, color: rp === "none" ? faint : rp.without.pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{rp === "none" ? "—" : signed(rp.without.pnl)}</Text>}
                <Text style={{ fontSize: 11.5, fontWeight: "500", color: muted }}>{rp && rp !== "none" ? (rp.without.liquidated ? "liquidated on the way" : "rode it to the end") : " "}</Text>
              </View>
              <View style={{ width: half, backgroundColor: mist, borderRadius: 24, padding: 14, gap: 4 }}>
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: violet }} numberOfLines={1}>{pid ? `with ${cur.name}` : "with the recipe"}</Text>
                {rp === undefined ? <View style={{ width: 90, height: 28, borderRadius: 10, backgroundColor: "#E3D6FB", marginVertical: 4 }} />
                  : <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 26, color: rp === "none" ? faint : ink, fontVariant: ["tabular-nums"] }}>{rp === "none" ? "—" : signed(rp.withRules.pnl)}</Text>}
                <Text style={{ fontSize: 11.5, fontWeight: "500", color: muted }}>{rp && rp !== "none" ? story(rp) : rp === "none" ? "no replay for this one" : " "}</Text>
              </View>
            </View>

            <View style={{ gap: 2, paddingHorizontal: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: ink }}>what you arm</Text>
              <View style={{ width: 96, height: 3, borderRadius: 2, backgroundColor: violet, opacity: 0.6 }} />
            </View>
            <View style={{ paddingHorizontal: 6 }}>
              {steps(cur).map((t, k, all) => (
                <View key={k} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ alignItems: "center", width: 26 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: mist, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: violet }}>{k + 1}</Text>
                    </View>
                    {k < all.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: mist, marginVertical: 3 }} />}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: ink, lineHeight: 20, paddingTop: 3, paddingBottom: 14 }}>{t}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {cur && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: "#FAF8F2", flexDirection: "row", gap: 10 }}>
          {!from && (
            <Tap onPress={() => void share(cur)} style={{ flex: 1 }} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: ink }}>share</Text>
            </Tap>
          )}
          <Tap onPress={busy || !make(cur) || blocked ? undefined : () => void arm(cur)} style={{ flex: 2.3 }} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: blocked ? 0.4 : 1 }}>
            <Glyph name="lock" size={18} color="white" />
            <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>{busy === cur.id ? "arming…" : from ? "arm it with your fingerprint" : "arm with fingerprint"}</Text>
          </Tap>
        </View>
      )}
    </Screen>
  );
}
