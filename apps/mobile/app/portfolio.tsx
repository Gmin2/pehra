// home, built from family's portfolio screen: the account header, the big balance that morphs, the
// two tabs (tokens and collectibles there, markets and positions here), rows that press, and the
// receive and send footer (fund and trade here). the bird in the header carries the risk.
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import Animated, { FadeIn, FadeInDown, LinearTransition, ReduceMotion, ZoomIn, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, Button, MorphText, Tabs, IconButton, s } from "../src/ui/components";
import { PodiumArt, PositionsArt, PositionCard, Shield, SuggestionCard, GhostRow, type Suggestion } from "../src/ui/Home";
import { freshLiquidationPrice, maxLeverage } from "@pehra/perpl";
import { Segmented } from "../src/ui/Trade";

const SORTS = ["calm", "movers", "leverage"] as const;
import { Text } from "../src/ui/Text";
import { useApp } from "../src/ui/store";
import { colors, space } from "../src/ui/theme";
import { Coin } from "../src/ui/Coin";
import { PehraBird } from "../src/ui/PehraBird";
import { useMarkets, useAccount, money, pct, price, type LiveMarket } from "../src/live";
import { prefetchCandles } from "../src/candles";
import type { PositionHealth } from "../src/guard";

const ink = colors.ink,
  muted = colors.muted,
  dusk = colors.blue,
  green = colors.green,
  red = colors.red;

// how the bird looks at the account: no positions, asleep. far from liquidation, dozing.
// getting close, watching. under the guard threshold, alert.
function riskOpenness(health: PositionHealth[] | undefined, threshold: number) {
  if (!health || health.length === 0) return 0;
  const worst = Math.min(...health.map((h) => h.distance * 100));
  if (worst < threshold) return 1.15;
  if (worst < 25) return 1;
  return 0.25;
}

function Header({ address, open }: { address?: string; open: number }) {
  const a = useApp();
  const eyes = useSharedValue(0),
    glance = useSharedValue(0);
  useEffect(() => {
    eyes.set(withSpring(open, { duration: 500, dampingRatio: 0.7 }));
  }, [open, eyes]);
  return (
    <View style={[space.between, { height: 64, paddingHorizontal: 20 }]}>
      <Tap onPress={() => a.go("/settings")} innerStyle={[space.row, { gap: 10 }]}>
        <View style={{ backgroundColor: dusk, borderRadius: 14, padding: 3 }}>
          <PehraBird size={30} open={eyes} shift={glance} />
        </View>
        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: ink, letterSpacing: -0.5 }}>pehra</Text>
          {!!address && <Text style={{ fontSize: 12, color: muted, fontWeight: "500" }}>{address.slice(0, 6) + "····" + address.slice(-4)}</Text>}
        </View>
      </Tap>
      <View style={space.row}>
        <IconButton name="bell" label="Guard activity" onPress={() => a.go("/activity")} />
        <IconButton name="scan" label="Fund" onPress={() => a.go("/fund")} />
      </View>
    </View>
  );
}

// room at 3x: how far liquidation would sit if you opened here at 3x (or the market's max if lower)
const roomAt3 = (m: LiveMarket) => {
  const lev = Math.min(3, maxLeverage(m.market));
  const liq = freshLiquidationPrice(m.market, "long", m.mark, lev);
  return m.mark > 0 ? ((m.mark - liq) / m.mark) * 100 : 0;
};

function MarketRow({ m, index, onPress }: { m: LiveMarket; index: number; onPress: () => void }) {
  const up = m.change24h >= 0;
  const room = roomAt3(m);
  const col = room < 15 ? "#9A6B1C" : green;
  return (
    <Animated.View entering={FadeIn.delay(index * 30).duration(200).reduceMotion(ReduceMotion.System)} layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}>
      <Tap onPress={onPress} onPressIn={() => prefetchCandles(m.market)} accessibilityLabel={`${m.symbol} perp`} innerStyle={{ height: 68, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Coin symbol={m.symbol} />
        <View style={{ flex: 1, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>{m.symbol.toLowerCase()}</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>up to {maxLeverage(m.market)}x</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 84, height: 5, borderRadius: 3, backgroundColor: "#F0EDF3", overflow: "hidden" }}>
              <View style={{ width: `${Math.min(100, (room / 30) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: col }} />
            </View>
            <Text style={{ fontSize: 11.5, fontWeight: "600", color: col, fontVariant: ["tabular-nums"] }}>{room.toFixed(0)}% room at 3x</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: ink, fontVariant: ["tabular-nums"] }}>${price(m, m.mark)}</Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: up ? green : red, fontVariant: ["tabular-nums"] }}>{pct(m.change24h, 1)}</Text>
        </View>
      </Tap>
    </Animated.View>
  );
}

export default function Portfolio() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    { account } = useAccount(address),
    [tab, setTab] = useState<"markets" | "positions">("markets"),
    { width } = useWindowDimensions();
  const threshold = account?.settings?.thresholdPct ?? 5;
  const health = account?.health ?? [];
  const balance = account?.balance ?? null;
  const inPositions = health.reduce((t, h) => t + h.collateral, 0);
  const pnl = health.reduce((t, h) => t + (h.side === "long" ? 1 : -1) * (h.mark - h.entry) * h.size, 0);
  const total = balance === null ? null : balance + inPositions + pnl;
  const open = riskOpenness(health, threshold);
  const sorted = useMemo(() => [...markets].sort((x, y) => (x.symbol === "MON" ? -1 : y.symbol === "MON" ? 1 : 0)), [markets]);
  const [sort, setSort] = useState<(typeof SORTS)[number]>("calm");
  const listed = useMemo(() => {
    const l = [...markets];
    if (sort === "calm") l.sort((x, y) => roomAt3(y) - roomAt3(x));
    if (sort === "movers") l.sort((x, y) => Math.abs(y.change24h) - Math.abs(x.change24h));
    if (sort === "leverage") l.sort((x, y) => maxLeverage(y.market) - maxLeverage(x.market));
    return l;
  }, [markets, sort]);
  const held = health.map((h) => h.symbol).join();
  // two first trades for an empty tab: mon and the next market by 24h move, long at up to 3x
  const suggestions = useMemo<Suggestion[]>(() => {
    const free = balance ?? 0;
    const margin = Math.max(1, Math.min(10, Math.floor(free)));
    const picks = [sorted.find((x) => x.symbol === "MON"), [...sorted].filter((x) => x.symbol !== "MON").sort((x, y) => y.change24h - x.change24h)[0]].filter((x): x is LiveMarket => !!x);
    return picks.map((x) => {
      const lev = Math.min(3, maxLeverage(x.market));
      const liq = freshLiquidationPrice(x.market, "long", x.mark, lev);
      return { m: x, side: "long" as const, lev, margin, away: x.mark > 0 ? ((x.mark - liq) / x.mark) * 100 : 0 };
    });
  }, [sorted, balance]);
  useEffect(() => {
    for (const x of sorted) if (held.includes(x.symbol)) prefetchCandles(x.market);
  }, [held, sorted.length]);
  useEffect(() => {
    if (health.length && tab === "markets" && a.tab !== "markets") setTab("positions");
  }, [health.length]);
  const openTrade = (symbol: string) => {
    Haptics.selectionAsync();
    a.go(`/trade?symbol=${symbol}`);
  };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "none" }} />
      <Header address={address ?? undefined} open={open} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 18 }}>
        <Tap onPress={() => a.setStealth(!a.stealth)} innerStyle={{ marginTop: 10, marginBottom: 22 }}>
          <MorphText text={a.stealth ? "✱✱✱✱✱" : total === null ? "$—" : "$" + money(total)} size={44} />
          <View style={[space.row, { gap: 8, marginTop: 8 }]}>
            <Text style={{ color: muted, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
              {balance === null ? "loading your account" : health.length ? `${money(balance)} free · ${money(inPositions)} in positions` : `${money(balance)} free · nothing open`}
            </Text>
            {!!health.length && (
              <Text style={{ color: pnl >= 0 ? green : red, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
              </Text>
            )}
          </View>
        </Tap>
        <View style={{ marginHorizontal: -8, marginBottom: 10 }}>
          {tab === "markets" ? <PodiumArt markets={sorted} width={width - 32} /> : <PositionsArt health={health} markets={sorted} threshold={threshold} open={open} width={width - 32} />}
        </View>
        <View style={[space.between, { height: 52 }]}>
          <View style={[space.row, { gap: 18 }]}>
            {(["markets", "positions"] as const).map((t) => (
              <Tap
                key={t}
                onPress={() => {
                  setTab(t);
                  Haptics.selectionAsync();
                }}
              >
                <View style={[space.row, { gap: 6 }]}>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: tab === t ? ink : "#B9B2C5" }}>{t}</Text>
                  {t === "positions" && health.length > 0 && (
                    <Animated.View key={health.length} entering={FadeIn.duration(180)}>
                      <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: tab === t ? ink : "#B9B2C5", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: "white", fontVariant: ["tabular-nums"] }}>{health.length}</Text>
                      </View>
                    </Animated.View>
                  )}
                </View>
              </Tap>
            ))}
          </View>
          <View style={[space.row, { gap: 6, backgroundColor: account?.live ? "#EFE5FF" : "#F0EDF3", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }]}>
            <Shield size={13} color={account?.live ? dusk : muted} cut={account?.live ? "#EFE5FF" : "#F0EDF3"} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: account?.live ? dusk : muted }}>{account?.enrolled ? (account.live ? "guard on" : "guard waking") : "guard off"}</Text>
          </View>
        </View>
        {tab === "markets" ? (
          <Animated.View key="markets" entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}>
            <View style={{ marginBottom: 6 }}>
              <Segmented options={SORTS} value={sort} onChange={setSort} dark={false} />
            </View>
            {sorted.length === 0 ? (
              <View style={{ marginHorizontal: -14 }}>
                {[0, 1, 2, 3].map((i) => (
                  <GhostRow key={i} opacity={1 - i * 0.2} />
                ))}
              </View>
            ) : (
              listed.map((m, i) => <MarketRow key={m.id} m={m} index={i} onPress={() => openTrade(m.symbol)} />)
            )}
          </Animated.View>
        ) : (
          <Animated.View key="positions" entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}>
            {health.length === 0 ? (
              <View style={{ marginHorizontal: -8, gap: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: muted, marginHorizontal: 8, marginBottom: 2 }}>nothing open. a place to start:</Text>
                {suggestions.length === 0 && <GhostRow />}
                {suggestions.map((x, i) => (
                  <Animated.View key={x.m.id} entering={FadeIn.delay(i * 40).duration(220).reduceMotion(ReduceMotion.System)}>
                    <Tap
                      onPressIn={() => prefetchCandles(x.m.market)}
                      onPress={() => {
                        Haptics.selectionAsync();
                        a.go(`/trade?symbol=${x.m.symbol}&side=${x.side}&margin=${x.margin}&lev=${x.lev}`);
                      }}
                      accessibilityLabel={`${x.m.symbol} ${x.side} ${x.lev}x with ${x.margin} ausd`}
                    >
                      <SuggestionCard s={x} />
                    </Tap>
                  </Animated.View>
                ))}
                <GhostRow opacity={0.7} />
              </View>
            ) : (
              <View style={{ gap: 10, marginHorizontal: -8, paddingTop: 4 }}>
                {health.map((h) => (
                  <Animated.View key={h.pid} layout={LinearTransition.duration(300)}>
                    <Tap onPress={() => { Haptics.selectionAsync(); a.go(`/position?pid=${h.pid}`); }} onPressIn={() => prefetchCandles(sorted.find((x) => x.symbol === h.symbol)?.market)} accessibilityLabel={`${h.symbol} ${h.side}`}>
                      <PositionCard h={h} threshold={threshold} />
                    </Tap>
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
      <View style={[s.footer, { flexDirection: "row", gap: 12 }]}>
        <Button style={{ flex: 1 }} variant="secondary" onPress={() => a.go("/fund")}>
          fund
        </Button>
        <Button style={{ flex: 1 }} variant="black" onPress={() => openTrade(sorted[0]?.symbol ?? "MON")}>
          trade
        </Button>
      </View>
      <Tabs active="portfolio" />
    </Screen>
  );
}
