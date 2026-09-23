// home, built from family's portfolio screen: the account header, the big balance that morphs, the
// two tabs (tokens and collectibles there, markets and positions here), rows that press, and the
// receive and send footer (fund and trade here). the bird in the header carries the risk.
import { useEffect, useMemo, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack } from "expo-router";
import Animated, { FadeIn, LinearTransition, ReduceMotion, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, Button, MorphText, Tabs, IconButton, Icon, s } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { useApp } from "../src/ui/store";
import { colors, space } from "../src/ui/theme";
import { Coin } from "../src/ui/Coin";
import { PehraBird } from "../src/ui/PehraBird";
import { useMarkets, useAccount, money, pct, price, type LiveMarket } from "../src/live";
import type { PositionHealth } from "../src/guard";

const ink = colors.ink,
  muted = colors.muted,
  dusk = colors.blue,
  green = colors.green,
  red = colors.red,
  amber = "#8A601B";

// how the bird looks at the account: no positions, asleep. far from liquidation, dozing.
// getting close, watching. under the guard threshold, alert.
function riskOpenness(health: PositionHealth[] | undefined, threshold: number) {
  if (!health || health.length === 0) return 0;
  const worst = Math.min(...health.map((h) => h.distance * 100));
  if (worst < threshold) return 1.15;
  if (worst < 25) return 1;
  return 0.25;
}

const distanceColor = (pctAway: number, threshold: number) => (pctAway < threshold ? red : pctAway < 15 ? amber : green);

function Header({ address, open }: { address?: string; open: number }) {
  const a = useApp();
  const eyes = useSharedValue(0),
    glance = useSharedValue(0);
  useEffect(() => {
    eyes.set(withSpring(open, { duration: 500, dampingRatio: 0.7 }));
  }, [open, eyes]);
  return (
    <View style={[space.between, { height: 64, paddingHorizontal: 20 }]}>
      <Tap onPress={() => a.go("/wallet")} innerStyle={[space.row, { gap: 10 }]}>
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
        <IconButton name="scan" label="Fund" onPress={() => a.go("/receive")} />
      </View>
    </View>
  );
}

function MarketRow({ m, onPress }: { m: LiveMarket; onPress: () => void }) {
  const up = m.change24h >= 0;
  return (
    <Tap onPress={onPress} accessibilityLabel={`${m.symbol} perp`} innerStyle={{ height: 72, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Coin symbol={m.symbol} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>{m.symbol.toLowerCase()}</Text>
        <Text style={{ fontSize: 13, color: muted, fontWeight: "500" }}>up to {Math.round(10000 / m.market.config.initial_margin / 10) / 10}x · funding {(m.fundingRate * 100).toFixed(3)}%</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: ink, fontVariant: ["tabular-nums"] }}>${price(m, m.mark)}</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: up ? green : red, fontVariant: ["tabular-nums"] }}>{pct(m.change24h)}</Text>
      </View>
    </Tap>
  );
}

function PositionRow({ h, threshold, onPress }: { h: PositionHealth; threshold: number; onPress: () => void }) {
  const away = h.distance * 100;
  const sign = h.side === "long" ? 1 : -1;
  const pnl = sign * (h.mark - h.entry) * h.size;
  const pnlPct = h.collateral > 0 ? (pnl / h.collateral) * 100 : 0;
  const col = distanceColor(away, threshold);
  const bar = Math.max(0.04, Math.min(1, away / 40));
  return (
    <Tap onPress={onPress} accessibilityLabel={`${h.symbol} ${h.side}`} innerStyle={{ paddingVertical: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Coin symbol={h.symbol} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[space.row, { gap: 8 }]}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>{h.symbol.toLowerCase()}</Text>
            <View style={{ backgroundColor: h.side === "long" ? "#23765A1f" : "#B4474D1f", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: h.side === "long" ? green : red }}>
                {h.side} {h.lv / 100}x
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 13, color: muted, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
            {h.size} at {h.entry} · margin {h.collateral.toFixed(2)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>
            {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: "600", color: muted, fontVariant: ["tabular-nums"] }}>{pct(pnlPct, 1)}</Text>
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <View style={space.between}>
          <Text style={{ fontSize: 12, color: muted, fontWeight: "500" }}>{away.toFixed(1)}% from liquidation</Text>
          <View style={[space.row, { gap: 4 }]}>
            <Icon name="shield" size={12} color={col} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: col }}>{away < threshold ? "guard stepping in" : "guarded"}</Text>
          </View>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: "#F0EDF3", overflow: "hidden" }}>
          <Animated.View layout={LinearTransition.duration(300)} style={{ width: `${bar * 100}%`, height: 5, borderRadius: 3, backgroundColor: col }} />
        </View>
      </View>
    </Tap>
  );
}

export default function Portfolio() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    { account } = useAccount(address),
    [tab, setTab] = useState<"markets" | "positions">("markets");
  const threshold = account?.settings?.thresholdPct ?? 5;
  const health = account?.health ?? [];
  const balance = account?.balance ?? null;
  const inPositions = health.reduce((t, h) => t + h.collateral, 0);
  const pnl = health.reduce((t, h) => t + (h.side === "long" ? 1 : -1) * (h.mark - h.entry) * h.size, 0);
  const total = balance === null ? null : balance + inPositions + pnl;
  const open = riskOpenness(health, threshold);
  const sorted = useMemo(() => [...markets].sort((x, y) => (x.symbol === "MON" ? -1 : y.symbol === "MON" ? 1 : 0)), [markets]);
  useEffect(() => {
    if (health.length && tab === "markets" && a.tab !== "markets") setTab("positions");
  }, [health.length]);
  const openTrade = (symbol: string) => {
    Haptics.selectionAsync();
    a.toast(`${symbol.toLowerCase()} ticket is the next screen`);
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
              {balance === null ? "loading your account" : `${money(balance)} free · ${money(inPositions)} in positions`}
            </Text>
            {!!health.length && (
              <Text style={{ color: pnl >= 0 ? green : red, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                {pnl >= 0 ? "+" : "−"}${Math.abs(pnl).toFixed(2)}
              </Text>
            )}
          </View>
        </Tap>
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
                <Text style={{ fontSize: 17, fontWeight: "600", color: tab === t ? ink : "#B9B2C5" }}>
                  {t}
                  {t === "positions" && health.length ? ` ${health.length}` : ""}
                </Text>
              </Tap>
            ))}
          </View>
          <View style={[space.row, { gap: 6, backgroundColor: account?.live ? "#EFE5FF" : "#F0EDF3", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }]}>
            <Icon name="shield" size={12} color={account?.live ? dusk : muted} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: account?.live ? dusk : muted }}>{account?.enrolled ? (account.live ? "guard on" : "guard waking") : "guard off"}</Text>
          </View>
        </View>
        {tab === "markets" ? (
          <Animated.View key="markets" entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}>
            {sorted.length === 0 ? (
              <Text style={[space.copy, { paddingVertical: 30, textAlign: "center" }]}>loading markets from perpl…</Text>
            ) : (
              sorted.map((m) => <MarketRow key={m.id} m={m} onPress={() => openTrade(m.symbol)} />)
            )}
          </Animated.View>
        ) : (
          <Animated.View key="positions" entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}>
            {health.length === 0 ? (
              <View style={{ alignItems: "center", paddingTop: 50, gap: 14 }}>
                <MorphText text="nothing open, the bird is asleep" size={18} />
                <Text style={[space.copy, { textAlign: "center" }]}>open a position and the guard starts watching it.</Text>
                <Button variant="secondary" onPress={() => setTab("markets")}>
                  see markets
                </Button>
              </View>
            ) : (
              health.map((h) => <PositionRow key={h.pid} h={h} threshold={threshold} onPress={() => openTrade(h.symbol)} />)
            )}
          </Animated.View>
        )}
      </ScrollView>
      <View style={[s.footer, { flexDirection: "row", gap: 12 }]}>
        <Button style={{ flex: 1 }} variant="secondary" onPress={() => a.go("/receive")}>
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
