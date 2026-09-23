// the trade page: pick a side, a margin and a leverage, one tap, filled in about a second. the chart
// shows where liquidation and the guard sit for exactly this trade, and moves as the leverage does.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, TextInput, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { freshLiquidationPrice, maxLeverage } from "@pehra/perpl";
import { Screen, Tap, IconButton, MorphText, s } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Coin } from "../src/ui/Coin";
import { useApp } from "../src/ui/store";
import { useMarkets, useAccount, pct, money } from "../src/live";
import { useCandles, type Range } from "../src/candles";
import { relayOrder } from "../src/guard";
import { log } from "../src/log";
import { PositionCard } from "../src/ui/Home";
import { PriceChart, Segmented, LeverageSlider, TradeButton, FlightLayer, Tray, SkeletonRow, useFlight, flight, violet, ink, muted, green, red, amber, line, type Phase } from "../src/ui/Trade";

const RANGES = ["1h", "1d", "1w", "1m"] as const;
const SIDES = ["long", "short"] as const;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stopsFor(max: number) {
  const s = [1, 2, 3, 5, 10, 15, 20].filter((x) => x <= max);
  if (!s.includes(max)) s.push(max);
  return s;
}

export default function Trade() {
  const a = useApp(),
    { symbol = "MON" } = useLocalSearchParams<{ symbol?: string }>(),
    { width } = useWindowDimensions(),
    address = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    { account } = useAccount(address),
    m = markets.find((x) => x.symbol === symbol);
  const [range, setRange] = useState<Range>("1d"),
    [side, setSide] = useState<"long" | "short">("long"),
    [marginText, setMarginText] = useState("10"),
    [lev, setLev] = useState(3),
    [phase, setPhase] = useState<Phase>("idle"),
    [since, setSince] = useState(0),
    [fillMs, setFillMs] = useState(0),
    [entry, setEntry] = useState<number | undefined>(undefined),
    [error, setError] = useState(""),
    [tray, setTray] = useState(false),
    [from, setFrom] = useState<{ x: number; y: number } | null>(null),
    [to, setTo] = useState<{ x: number; y: number } | null>(null);
  const points = useCandles(m?.market, range);
  const f = useFlight();
  const root = useRef<View>(null),
    chartBox = useRef<View>(null),
    buttonBox = useRef<View>(null),
    dot = useRef({ x: 0, y: 0 });

  const max = m ? maxLeverage(m.market) : 3;
  const stops = useMemo(() => stopsFor(max), [max]);
  useEffect(() => {
    if (!stops.includes(lev)) setLev(Math.min(3, max));
  }, [stops.join()]);

  const balance = account?.balance ?? 0;
  const threshold = (account?.settings?.thresholdPct ?? 5) / 100;
  const margin = Number(marginText.replace(",", ".")) || 0;
  const mark = m?.mark ?? 0;
  const size = m && mark > 0 ? Math.floor(((margin * lev) / mark) * 10 ** m.sizeDecimals) / 10 ** m.sizeDecimals : 0;
  const liq = m ? freshLiquidationPrice(m.market, side, mark, lev) : 0;
  const guard = side === "long" ? liq / (1 - threshold) : liq / (1 + threshold);
  const away = mark > 0 ? Math.abs(mark - liq) / mark : 0;
  const tight = away < threshold * 2;
  const decimals = m?.priceDecimals ?? 2;
  const fmt = useCallback((v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), [decimals]);
  const sym = symbol.toLowerCase();
  const ok = !!m && !!address && margin > 0 && margin <= balance && size > 0 && away > threshold;

  // where the rocket starts and lands, in the root view's coordinates. measured ahead of the tap,
  // whenever the layout or the price dot moves, so the tap never waits on it
  const measure = () =>
    new Promise<void>((done) => {
      root.current?.measureInWindow((rx, ry) => {
        buttonBox.current?.measureInWindow((bx, by, bw) => {
          chartBox.current?.measureInWindow((cx, cy) => {
            setFrom({ x: bx - rx + bw / 2, y: by - ry - 26 });
            setTo({ x: cx - rx + dot.current.x, y: cy - ry + dot.current.y });
            done();
          });
        });
      });
    });
  const onDot = useCallback((x: number, y: number) => {
    dot.current = { x, y };
    requestAnimationFrame(() => void measure());
  }, []);

  const place = async () => {
    if (!ok || !m || !address) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const t0 = Date.now();
    flight.press(f);
    setSince(t0);
    setPhase("sending");
    try {
      const [r] = await Promise.all([relayOrder(address, m.symbol, side, size, lev), wait(380)]);
      if (!r.filled) throw new Error(typeof r.reason === "string" ? r.reason : "not filled");
      const ms = Date.now() - t0;
      setFillMs(ms);
      log(`trade ${m.symbol} ${side} ${size} at ${lev}x filled ${r.price} in ${ms}ms`);
      flight.launch(f, () => {
        setEntry(r.price || mark);
        setPhase("filled");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setTray(true), 1000);
      });
    } catch (e) {
      log(`trade ${m.symbol} ${side} ${size} at ${lev}x failed: ${e instanceof Error ? e.message : e}`);
      flight.fizzle(f);
      setError(e instanceof Error ? e.message : "order failed");
      setPhase("failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => {
        setPhase("idle");
        flight.reset(f);
      }, 2400);
    }
  };

  const again = () => {
    setTray(false);
    setPhase("idle");
    setEntry(undefined);
    flight.reset(f);
  };

  // the position this trade opened, newest of its market and side
  const opened = (account?.health ?? []).filter((h) => h.symbol === symbol && h.side === side).sort((x, y) => y.pid - x.pid)[0];

  const cw = width - 32;
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View ref={root} style={{ flex: 1 }} collapsable={false} onLayout={() => void measure()}>
        <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
          <IconButton name="back" label="Back" onPress={a.back} color={ink} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginRight: 40 }}>
            <View style={{ width: 42, height: 30 }}>
              <View style={{ position: "absolute", left: 20, top: 8, borderRadius: 12, borderWidth: 2, borderColor: "#FAF8F2" }}>
                <Coin symbol="AUSD" size={20} />
              </View>
              <View style={{ borderRadius: 16, borderWidth: 2, borderColor: "#FAF8F2", alignSelf: "flex-start" }}>
                <Coin symbol={symbol} size={28} />
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{sym}/ausd</Text>
              <Text style={{ fontSize: 11.5, fontWeight: "500", color: muted }}>perp · up to {max}x</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: cw, borderRadius: 28, backgroundColor: violet, overflow: "hidden", paddingTop: 18, paddingBottom: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 20 }}>
              <View style={{ gap: 8 }}>
                <MorphText text={m ? fmt(mark) : "$—"} color="white" size={30} />
                <View style={{ alignSelf: "flex-start", height: 24, borderRadius: 12, backgroundColor: "#ffffff26", paddingHorizontal: 10, justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "white", fontVariant: ["tabular-nums"] }}>{m ? pct(m.change24h, 1) + " today" : "loading"}</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 24 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#7EE2B0" }} />
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#ffffffcc" }}>live</Text>
              </View>
            </View>
            <View ref={chartBox} collapsable={false} style={{ marginTop: 6 }}>
              <PriceChart points={points} width={cw} mark={mark} liq={liq} guard={guard} side={side} entry={entry} fmt={fmt} onDot={onDot} />
            </View>
            <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
              <Segmented options={RANGES} value={range} onChange={setRange} dark />
            </View>
          </View>

          <Segmented
            options={SIDES}
            value={side}
            onChange={(v) => phase === "idle" && setSide(v)}
            render={(v, on) => (
              <Text style={{ fontSize: 15, fontWeight: "700", color: on ? (v === "long" ? green : red) : muted }}>
                {v} {v === "long" ? "↑" : "↓"}
              </Text>
            )}
          />

          <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 18, gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>margin</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Coin symbol="AUSD" size={24} />
                <TextInput
                  value={marginText}
                  onChangeText={(t) => setMarginText(t.replace(/[^0-9.,]/g, ""))}
                  keyboardType="decimal-pad"
                  editable={phase === "idle"}
                  accessibilityLabel="Margin in AUSD"
                  style={{ fontFamily: "Manrope_700Bold", fontSize: 30, color: margin > balance ? red : ink, padding: 0, minWidth: 40 }}
                />
                <Text style={{ fontSize: 16, fontWeight: "600", color: muted, flex: 1 }}>ausd</Text>
                <Tap
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMarginText(String(Math.floor(balance * 10) / 10));
                  }}
                  innerStyle={{ height: 28, borderRadius: 14, backgroundColor: "#EFE5FF", paddingHorizontal: 12, justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: violet, fontVariant: ["tabular-nums"] }}>max {money(balance, 1)}</Text>
                </Tap>
              </View>
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>leverage</Text>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: ink }}>{lev}x</Text>
              </View>
              <LeverageSlider stops={stops} value={lev} onChange={setLev} />
            </View>
            <View style={{ height: 1, backgroundColor: line }} />
            <View style={{ gap: 10 }}>
              <Row k="size" v={`${size} ${sym} · ${money(margin * lev, 0)} ausd`} />
              <Row k="liquidation" v={`${fmt(liq)} · ${(away * 100).toFixed(1)}% away`} color={tight ? red : ink} />
              <Row k="guard adds margin at" v={tight ? "right away" : `${fmt(guard)} · ${Math.round(threshold * 100)}% before`} color={tight ? amber : ink} />
            </View>
          </View>
        </ScrollView>

        <View ref={buttonBox} collapsable={false} style={[s.footer, { paddingHorizontal: 16 }]}>
          <TradeButton
            phase={phase}
            f={f}
            since={since}
            disabled={!ok}
            onPress={place}
            label={!address ? "no account" : margin > balance ? "not enough ausd" : away <= threshold ? "too close to liquidation" : `${side} ${sym} · ${money(margin * lev, 0)} ausd`}
            detail={phase === "filled" ? `filled in ${(fillMs / 1000).toFixed(1)}s` : `didn’t fill · ${error}`}
          />
        </View>
        <FlightLayer f={f} from={from} to={to} />
      </View>

      <Tray visible={tray} onClose={again}>
        <View style={{ gap: 4, paddingHorizontal: 8, marginBottom: 16 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>
            you’re {side} {sym}
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>filled in {(fillMs / 1000).toFixed(1)}s. the guard is watching it now.</Text>
        </View>
        {opened ? <PositionCard h={opened} threshold={threshold * 100} /> : <SkeletonRow />}
        <Tap
          onPress={() => {
            setTray(false);
            a.go("/portfolio");
          }}
          innerStyle={{ marginTop: 18, height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>see position</Text>
        </Tap>
        <Tap onPress={again} innerStyle={{ height: 44, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: muted }}>trade again</Text>
        </Tap>
      </Tray>
    </Screen>
  );
}

function Row({ k, v, color = ink }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{k}</Text>
      <Text style={{ fontSize: 13, fontWeight: "600", color, fontVariant: ["tabular-nums"] }}>{v}</Text>
    </View>
  );
}
