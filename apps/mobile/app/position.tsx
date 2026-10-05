// one position, family quiet: the coin and a sentence about how far liquidation is, what it is worth
// now, one line of chart, a few rows, add margin and hold to close. stop and take profit, and the
// margin amount, open in trays.
import { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView, TextInput, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams, useFocusEffect } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeOutUp, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Rough } from "../src/ui/Rough";
import { useApp } from "../src/ui/store";
import { useMarkets, useAccount, money } from "../src/live";
import { useCandles } from "../src/candles";
import { relayAddMargin, relayBrackets, relayClose, type PositionHealth } from "../src/guard";
import { log } from "../src/log";
import { Tray } from "../src/ui/Trade";
import { listRules } from "../src/rules";
import { CoinRing, Roll, CountUp, LineSince, Row, HoldButton, DropCoin, violet, ink, muted, green, red, well, faint } from "../src/ui/Position";

const DAY = 24 * 3600_000;

export default function Position() {
  const a = useApp(),
    { pid: pidParam } = useLocalSearchParams<{ pid?: string }>(),
    pid = Number(pidParam),
    { width } = useWindowDimensions(),
    address = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    { account } = useAccount(address);
  const live = account?.health?.find((h) => h.pid === pid);
  // the last known state stays on screen after the position closes
  const last = useRef<PositionHealth | undefined>(undefined);
  if (live) last.current = live;
  const h = live ?? last.current;
  const m = markets.find((x) => x.symbol === h?.symbol);
  const points = useCandles(m?.market, "1d");
  const events = (account?.events ?? []).filter((e) => e.pid === pid);
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  const [backstop, setBackstop] = useState<number | null>(null);
  // read again each time the screen comes back, a rule may have been added or removed on the way
  useFocusEffect(useCallback(() => {
    if (!address) return;
    listRules(address)
      .then((rs) => {
        const live = rs.filter((r) => r.rule.pid === pid && r.state !== "done" && r.state !== "failed" && r.state !== "draft");
        setRuleCount(live.length);
        // perpl's stop on this position may be a hidden stop's backstop, not a plain stop
        const stop = live.find((r) => r.rule.kind === "stop")?.rule;
        setBackstop(stop?.kind === "stop" ? stop.backstopPx : null);
      })
      .catch(() => setRuleCount(null));
  }, [address, pid]));
  const openedAt = events.find((e) => e.kind === "opened")?.at;
  const guardToday = events.filter((e) => e.kind === "added" && Date.now() - e.at < DAY).reduce((t, e) => t + (e.addAusd ?? 0), 0);
  const youToday = events.filter((e) => e.kind === "manual" && Date.now() - e.at < DAY).reduce((t, e) => t + (e.addAusd ?? 0), 0);
  const threshold = account?.settings?.thresholdPct ?? 5;

  const [closed, setClosed] = useState<{ pnl: number; back: number } | null>(null),
    [closeError, setCloseError] = useState(""),
    [marginTray, setMarginTray] = useState(false),
    [bracketTray, setBracketTray] = useState(false),
    [dropRun, setDropRun] = useState(0),
    [landed, setLanded] = useState(0),
    [from, setFrom] = useState<{ x: number; y: number } | null>(null),
    [to, setTo] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<View>(null),
    ring = useRef<View>(null),
    addBtn = useRef<View>(null);

  const measure = useCallback(() => {
    root.current?.measureInWindow((rx, ry) => {
      addBtn.current?.measureInWindow((bx, by, bw, bh) => setFrom({ x: bx - rx + bw / 2, y: by - ry + bh / 2 }));
      ring.current?.measureInWindow((cx, cy, cw, ch) => setTo({ x: cx - rx + cw / 2 + 20, y: cy - ry + ch / 2 - 18 }));
    });
  }, []);

  if (!h || !address)
    return (
      <Screen>
        <View style={{ height: 60, justifyContent: "center", paddingHorizontal: 12 }}>
          <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        </View>
        <View style={{ padding: 28, gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: well }} />
          <View style={{ width: 220, height: 22, borderRadius: 8, backgroundColor: well }} />
          <View style={{ width: 160, height: 22, borderRadius: 8, backgroundColor: well }} />
        </View>
      </Screen>
    );

  const long = h.side === "long",
    sym = h.symbol.toLowerCase(),
    away = h.distance * 100,
    pnl = (long ? 1 : -1) * (h.mark - h.entry) * h.size,
    value = h.collateral + pnl,
    pnlPct = h.collateral > 0 ? (pnl / h.collateral) * 100 : 0,
    decimals = m?.priceDecimals ?? 5,
    fmt = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const pct = away >= 10 ? away.toFixed(0) : away.toFixed(1);

  const guardLine =
    guardToday > 0
      ? `it added ${money(guardToday)} ausd today${youToday ? `, you added ${money(youToday)}` : ""}.`
      : youToday > 0
        ? `you added ${money(youToday)} ausd today.`
        : "it hasn’t needed to step in.";

  const add = async (ausd: number) => {
    setMarginTray(false);
    measure();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => setDropRun((r) => r + 1), 60);
    try {
      await relayAddMargin(address, pid, ausd);
      log(`position ${sym} ${pid} added ${ausd} ausd`);
    } catch (e) {
      log(`position ${sym} ${pid} add failed: ${e instanceof Error ? e.message : e}`);
      a.toast("margin add failed, try again");
    }
  };

  const close = async () => {
    try {
      const r = await relayClose(address, pid);
      log(`position ${sym} ${pid} closed at ${r.price}, pnl ${r.pnl}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setClosed({ pnl: r.pnl, back: r.collateral + r.pnl });
      setTimeout(() => a.go("/portfolio"), 2600);
    } catch (e) {
      log(`position ${sym} ${pid} close failed: ${e instanceof Error ? e.message : e}`);
      setCloseError(e instanceof Error ? e.message : "close failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(() => setCloseError(""), 2400);
    }
  };

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };
  const bw = width - 56;
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={measure}>
        <View style={{ height: 60, justifyContent: "center", paddingHorizontal: 12 }}>
          <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 20 }}>
          {!closed ? (
            <Animated.View exiting={FadeOutUp.duration(260)}>
              <View ref={ring} collapsable={false} style={{ alignSelf: "flex-start", marginLeft: -13 }}>
                <CoinRing symbol={h.symbol} long={long} away={away} pulse={landed} />
              </View>
              <Animated.View entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)} style={{ marginTop: 18 }}>
                <Text style={heading}>
                  your {sym} {h.side} is
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
                  <Rough type="circle" padding={5} paddingX={9} strokeWidth={2.2} delay={500} duration={700} run={landed}>
                    <Roll text={`${pct}%`} style={heading} />
                  </Rough>
                  <Text style={heading}> from liquidation.</Text>
                </View>
                <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>
                  the guard adds margin before {threshold}%. {guardLine}
                </Text>
              </Animated.View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(200).springify().damping(18)} style={{ marginTop: 74 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={heading}>you </Text>
                <Rough type="underline" padding={1} strokeWidth={2.4} delay={600} duration={500}>
                  <Text style={heading}>closed</Text>
                </Rough>
                <Text style={heading}> your</Text>
              </View>
              <Text style={heading}>
                {sym} {h.side}.
              </Text>
            </Animated.View>
          )}

          <View style={{ alignItems: "center", marginTop: 34, gap: 6 }}>
            <CountUp value={closed ? closed.back : value} style={{ fontFamily: "Manrope_700Bold", fontSize: 46, color: ink, letterSpacing: -1.2 }} />
            {closed ? (
              <Animated.View entering={FadeIn.delay(250)} style={{ height: 30, borderRadius: 15, paddingHorizontal: 14, justifyContent: "center", backgroundColor: closed.pnl >= 0 ? "#23765A1a" : "#B4474D1a" }}>
                <Text style={{ fontSize: 14, fontWeight: "700", color: closed.pnl >= 0 ? green : red }}>
                  back in your balance · {closed.pnl >= 0 ? "+" : "−"}${Math.abs(closed.pnl).toFixed(2)}
                </Text>
              </Animated.View>
            ) : (
              <Roll text={`${pnl >= 0 ? "+" : "−"}$${Math.abs(pnl).toFixed(2)} · ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% since you opened`} style={{ fontFamily: "Manrope_600SemiBold", fontSize: 14, color: pnl >= 0 ? green : red }} />
            )}
          </View>

          {!closed && (
            <Animated.View exiting={FadeOutUp.duration(240)}>
              <View style={{ marginTop: 24 }}>
                <LineSince points={points} entryAt={openedAt} width={bw} />
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>{openedAt ? "entry" : "24h"}</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>now</Text>
                </View>
              </View>
              <View style={{ marginTop: 22 }}>
                <Row index={0} glyph="gauge" label="size" value={`${h.size} ${sym} · ${h.lv / 100}x`} />
                <Row index={1} glyph="circle-coin" label="margin" value={`${h.collateral.toFixed(2)} ausd`} />
                <Row index={2} glyph="flame" label="liquidation" value={fmt(h.liq)} />
                <Row
                  index={3}
                  glyph="crosshairs"
                  label="stop and take profit"
                  value={h.stop || h.take ? [h.stop ? (backstop !== null && Math.abs(h.stop - backstop) < h.stop * 0.001 ? `backstop ${fmt(h.stop)}` : fmt(h.stop)) : "", h.take ? fmt(h.take) : ""].filter(Boolean).join(" · ") : "set one"}
                  color={h.stop || h.take ? ink : violet}
                  onPress={() => setBracketTray(true)}
                />
                <Row
                  index={4}
                  glyph="shield"
                  label="rules"
                  value={ruleCount === null ? "" : ruleCount ? `${ruleCount} watching` : "add one"}
                  color={ruleCount ? ink : violet}
                  onPress={() => a.go(`/rules?pid=${pid}`)}
                />
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <View ref={addBtn} collapsable={false} style={{ flex: 1 }}>
            <Tap onPress={closed ? undefined : () => setMarginTray(true)} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: well, alignItems: "center", justifyContent: "center", opacity: closed ? 0.4 : 1 }}>
              <Text style={{ fontSize: 15.5, fontWeight: "600", color: ink }}>add margin</Text>
            </Tap>
          </View>
          <HoldButton label="close" holding="keep holding" done={closed ? "closed" : closeError ? "didn’t close" : null} onDone={close} />
        </View>
        <DropCoin from={from} to={to} run={dropRun} onLand={() => { setLanded((n) => n + 1); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
      </View>

      <MarginTray visible={marginTray} onClose={() => setMarginTray(false)} onAdd={add} balance={account?.balance ?? 0} sym={sym} />
      <BracketTray visible={bracketTray} onClose={() => setBracketTray(false)} h={h} fmt={fmt} decimals={decimals} onSet={async (b) => {
        setBracketTray(false);
        try {
          const r = await relayBrackets(address, pid, b);
          log(`position ${sym} ${pid} brackets ${JSON.stringify(r)}`);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
          a.toast("couldn’t set that, try again");
          log(`position ${sym} ${pid} brackets failed: ${e instanceof Error ? e.message : e}`);
        }
      }} />
    </Screen>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Tap onPress={() => { Haptics.selectionAsync(); onPress(); }} innerStyle={{ height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: on ? ink : well, justifyContent: "center" }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: on ? "white" : ink, fontVariant: ["tabular-nums"] }}>{label}</Text>
    </Tap>
  );
}

function MarginTray({ visible, onClose, onAdd, balance, sym }: { visible: boolean; onClose: () => void; onAdd: (ausd: number) => void; balance: number; sym: string }) {
  const [amt, setAmt] = useState(1);
  useEffect(() => {
    if (visible) setAmt(1);
  }, [visible]);
  return (
    <Tray visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 8, gap: 6 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>add margin</Text>
        <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>more ausd behind your {sym} position moves liquidation further away.</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 18, paddingHorizontal: 8 }}>
        {[1, 5, 10, 25].filter((x) => x <= balance).map((x) => (
          <Chip key={x} label={`${x} ausd`} on={amt === x} onPress={() => setAmt(x)} />
        ))}
      </View>
      <Text style={{ marginTop: 12, paddingHorizontal: 8, fontSize: 12.5, fontWeight: "500", color: faint }}>{money(balance)} ausd free</Text>
      <Tap onPress={() => onAdd(amt)} innerStyle={{ marginTop: 18, height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>add {amt} ausd</Text>
      </Tap>
    </Tray>
  );
}

// stop loss and take profit. perpl won't cancel a resting trigger yet, so each is set once
function BracketTray({ visible, onClose, onSet, h, fmt, decimals }: { visible: boolean; onClose: () => void; onSet: (b: { stop?: number; take?: number }) => void; h: PositionHealth; fmt: (v: number) => string; decimals: number }) {
  const long = h.side === "long";
  const at = (pct: number) => Number((h.mark * (1 + (long ? pct : -pct) / 100)).toFixed(decimals));
  const [stop, setStop] = useState(""),
    [take, setTake] = useState("");
  useEffect(() => {
    if (!visible) return;
    setStop(h.stop ? "" : String(at(-7)));
    setTake(h.take ? "" : String(at(10)));
  }, [visible]);
  const field = (label: string, value: string, set: (v: string) => void, locked: number | undefined, color: string, quick: number[]) => (
    <View style={{ backgroundColor: "white", borderRadius: 20, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{label}</Text>
        {locked ? (
          <Text style={{ fontSize: 14, fontWeight: "700", color }}>set at {fmt(locked)}</Text>
        ) : (
          <TextInput value={value} onChangeText={(t) => set(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" accessibilityLabel={label} style={{ fontFamily: "Manrope_700Bold", fontSize: 18, color, padding: 0, minWidth: 90, textAlign: "right" }} />
        )}
      </View>
      {!locked && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {quick.map((q) => (
            <Chip key={q} label={`${q > 0 ? "+" : ""}${q}%`} on={Number(value) === at(q)} onPress={() => set(String(at(q)))} />
          ))}
        </View>
      )}
    </View>
  );
  const s = Number(stop),
    t = Number(take);
  const ok = (!h.stop && s > 0) || (!h.take && t > 0);
  return (
    <Tray visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 8, gap: 6, marginBottom: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>stop and take profit</Text>
        <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>they close the position for you at these prices. once set they stay until it closes.</Text>
      </View>
      <View style={{ gap: 10 }}>
        {field("stop loss", stop, setStop, h.stop, red, [-3, -5, -10])}
        {field("take profit", take, setTake, h.take, green, [5, 10, 20])}
      </View>
      <Tap
        onPress={ok ? () => onSet({ stop: !h.stop && s > 0 ? s : undefined, take: !h.take && t > 0 ? t : undefined }) : undefined}
        innerStyle={{ marginTop: 18, height: 54, borderRadius: 27, backgroundColor: ok ? ink : faint, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{ok ? "set" : "both are set"}</Text>
      </Tap>
    </Tray>
  );
}
