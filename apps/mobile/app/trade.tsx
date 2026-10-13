// the trade page: pick a side, a margin and a leverage, one tap, filled in about a second. the chart
// shows where liquidation and the guard sit for exactly this trade, and moves as the leverage does.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, ScrollView, TextInput, useWindowDimensions } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { freshLiquidationPrice, maxLeverage, validateEntry, type Rule } from "@pehra/perpl";
import { Screen, Tap, IconButton, MorphText, Keypad, s } from "../src/ui/components";
import { Glyph } from "../src/ui/Glyph";
import { enterDigit } from "../src/ui/model";
import { createRule, cancelRule, listRules, describeRule, type RuleRow } from "../src/rules";
import { signIn, type Session } from "../src/account";
import { Text } from "../src/ui/Text";
import { Coin } from "../src/ui/Coin";
import { useApp } from "../src/ui/store";
import { useMarkets, useAccount, pct, money } from "../src/live";
import { useCandles, type Range } from "../src/candles";
import { relayOrder } from "../src/guard";
import { token } from "../src/session";
import { log } from "../src/log";
import { PositionCard } from "../src/ui/Home";
import { PriceChart, Segmented, LeverageSlider, TradeButton, FlightLayer, Tray, SkeletonRow, useFlight, flight, violet, ink, muted, green, red, amber, line, type Phase } from "../src/ui/Trade";

const RANGES = ["1h", "1d", "1w", "1m"] as const;
const SIDES = ["long", "short"] as const;
const WHENS = ["now", "at a price"] as const;
// prices kept to four significant figures, what a person reads and types
const sig4 = (v: number) => { const d = Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v) || 1))); return Number(v.toFixed(d)); };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// perpl's reasons in plain words for the button
function plain(msg: string) {
  if (/cancel|NotAllowed/i.test(msg)) return "cancelled, nothing sent";
  if (/AmountExceedsAvailableBalance|insufficient/i.test(msg)) return "not enough ausd free";
  if (/no live session/i.test(msg)) return "the guard is reconnecting, try again";
  if (/timed out/i.test(msg)) return "perpl didn’t answer, try again";
  if (/not filled|OrderDoesNotExist/i.test(msg)) return "no one took the other side";
  return "try again";
}

function stopsFor(max: number) {
  const s = [1, 2, 3, 5, 10, 15, 20].filter((x) => x <= max);
  if (!s.includes(max)) s.push(max);
  return s;
}

export default function Trade() {
  const a = useApp(),
    { symbol = "MON", side: sideParam, margin: marginParam, lev: levParam } = useLocalSearchParams<{ symbol?: string; side?: string; margin?: string; lev?: string }>(),
    { width } = useWindowDimensions(),
    address = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    { account } = useAccount(address),
    m = markets.find((x) => x.symbol === symbol);
  const [range, setRange] = useState<Range>("1d"),
    [side, setSide] = useState<"long" | "short">(sideParam === "short" ? "short" : "long"),
    [marginText, setMarginText] = useState(marginParam && Number(marginParam) > 0 ? marginParam : "10"),
    [lev, setLev] = useState(Number(levParam) > 0 ? Number(levParam) : 3),
    [phase, setPhase] = useState<Phase>("idle"),
    [since, setSince] = useState(0),
    [fillMs, setFillMs] = useState(0),
    [entry, setEntry] = useState<number | undefined>(undefined),
    [error, setError] = useState(""),
    [tray, setTray] = useState(false),
    [when, setWhen] = useState<(typeof WHENS)[number]>("now"),
    [atText, setAtText] = useState(""),
    [limitText, setLimitText] = useState(""),
    [withStop, setWithStop] = useState(true),
    [editing, setEditing] = useState<"at" | "limit" | null>(null),
    [keyText, setKeyText] = useState(""),
    // the number shown when the tray opens is replaced by the first key, not appended to
    [keyFresh, setKeyFresh] = useState(true),
    [arming, setArming] = useState(false),
    [waiting, setWaiting] = useState<RuleRow[]>([]),
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
  const later = when === "at a price";
  // an entry: the price it opens at, which way the mark has to go to get there, and the worst fill
  const at = Number(atText) || 0;
  const limit = Number(limitText) || 0;
  const goes = at < mark ? "below" : "above";
  const base = later && limit > 0 ? limit : mark;
  const size = m && base > 0 ? Math.floor(((margin * lev) / base) * 10 ** m.sizeDecimals) / 10 ** m.sizeDecimals : 0;
  const liq = m ? freshLiquidationPrice(m.market, side, base, lev) : 0;
  const guard = side === "long" ? liq / (1 - threshold) : liq / (1 + threshold);
  const away = base > 0 ? Math.abs(base - liq) / base : 0;
  const tight = away < threshold * 2;
  const decimals = m?.priceDecimals ?? 2;
  const fmt = useCallback((v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }), [decimals]);
  const sym = symbol.toLowerCase();
  const keyed = account ? account.enrolled : true;
  const ok = keyed && !!m && !!address && margin > 0 && margin <= balance && size > 0 && away > threshold;

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

  // a dip 3% away for a long, a rally 3% away for a short, the limit half a percent past it
  useEffect(() => {
    if (!later || !mark) return;
    const p = sig4(side === "long" ? mark * 0.97 : mark * 1.03);
    setAtText(String(p));
    setLimitText(String(sig4(side === "long" ? p * 1.005 : p * 0.995)));
  }, [later, side, m?.id]);

  // the stop sits halfway from the entry to where it would be liquidated, its floor and backstop under it
  const dir = side === "long" ? 1 : -1;
  const stopPx = sig4(limit - (limit - liq) * 0.5);
  const floorPx = sig4(stopPx - (stopPx - liq) * 0.2);
  const backstopPx = sig4(floorPx - (floorPx - liq) * 0.3);
  const entryRule: Rule | null = m && later && at > 0 && limit > 0 ? {
    v: 1, id: `entry-${m.id}-${Date.now().toString(36)}`, pid: 0, mkt: m.id, forMs: 0, kind: "entry", side, when: goes, px: at, limit, margin, leverage: lev,
    ...(withStop ? { stop: { px: stopPx, floor: floorPx, backstopPx, slices: 4 } } : {}),
  } : null;
  const check = entryRule && entryRule.kind === "entry" && m ? validateEntry(entryRule, { mark, balance, maxLeverage: max, maintenance: m.maintenanceMargin, resting: 0 }) : null;

  const loadWaiting = useCallback(() => {
    if (!address || !m) return;
    listRules(address).then((rs) => setWaiting(rs.filter((r) => r.rule.kind === "entry" && r.rule.mkt === m.id && ["armed", "held", "firing", "working", "paused"].includes(r.state)))).catch(() => {});
  }, [address, m?.id]);
  useEffect(() => { loadWaiting(); const t = setInterval(loadWaiting, 5000); return () => clearInterval(t); }, [loadWaiting]);

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const st = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(st);
    return st;
  };
  const arm = async () => {
    if (!entryRule || !check?.ok || !m || arming) return;
    setArming(true);
    try {
      const r = await createRule(await session(), entryRule, m.symbol);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`entry ${r.rule.id} ${r.rule.state} ${side} ${m.symbol} at ${at}`);
      a.toast(`armed. pehra opens it when ${sym} gets to ${at}`);
      loadWaiting();
    } catch (e) {
      log(`entry arm failed: ${e instanceof Error ? e.message : e}`);
      a.toast(e instanceof Error ? e.message : "couldn’t arm it");
    }
    setArming(false);
  };
  const drop = async (r: RuleRow) => {
    try { await cancelRule(await session(), r.id); Haptics.selectionAsync(); log(`entry ${r.id} cancelled`); loadWaiting(); }
    catch (e) { a.toast("couldn’t cancel it, nothing changed"); log(`entry cancel failed: ${e instanceof Error ? e.message : e}`); }
  };
  const openKeys = (k: "at" | "limit") => { setEditing(k); setKeyText(k === "at" ? atText : limitText); setKeyFresh(true); };
  const commitKeys = () => {
    const v = Number(keyText);
    if (v > 0 && editing === "at") {
      setAtText(String(v));
      setLimitText(String(sig4(side === "long" ? v * 1.005 : v * 0.995)));
    }
    if (v > 0 && editing === "limit") setLimitText(String(v));
    setEditing(null);
  };

  const place = async () => {
    if (!ok || !m || !address) return;
    // a passkey prompt, when the device session needs one, comes before the clock starts
    try { await token(address); } catch { return; }
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
      setError(plain(e instanceof Error ? e.message : String(e)));
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
              <PriceChart points={points} width={cw} mark={mark} liq={liq} guard={guard} side={side} entry={later && at > 0 ? at : entry} fmt={fmt} onDot={onDot} />
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

          <Segmented options={WHENS} value={when} onChange={(v) => phase === "idle" && setWhen(v)} />
          <Tap onPress={() => a.go(`/recipes?symbol=${symbol}`)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EFE5FF", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Glyph name="magic-wand-sparkle" size={22} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: violet }}>or pick a recipe: buy the dip, catch the breakout, daily stack</Text>
          </Tap>

          {later && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", paddingHorizontal: 4, columnGap: 4 }}>
                <Text style={sentence}>{`open when ${sym} ${goes === "below" ? "falls" : "rises"} to`}</Text>
                <Chip text={atText || "—"} bad={!!check && !check.ok && /happened/.test(check.why)} onPress={() => openKeys("at")} />
                <Text style={sentence}>{`never ${side === "long" ? "above" : "below"}`}</Text>
                <Chip text={limitText || "—"} bad={!!check && !check.ok && /limit/.test(check.why)} onPress={() => openKeys("limit")} />
              </View>
              <Tap onPress={() => { Haptics.selectionAsync(); setWithStop(!withStop); }} innerStyle={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Glyph name="crosshairs" size={24} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: "700", color: ink }}>{withStop ? `and a hidden stop at ${stopPx}` : "no stop after it opens"}</Text>
                  <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{withStop ? `never ${side === "long" ? "below" : "above"} ${floorPx}, backstop ${backstopPx} on perpl` : "the guard still watches it"}</Text>
                </View>
                <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: withStop ? violet : line, justifyContent: "center", paddingHorizontal: 3 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "white", alignSelf: withStop ? "flex-end" : "flex-start" }} />
                </View>
              </Tap>
              {check && !check.ok && <Text style={{ paddingHorizontal: 8, fontSize: 12.5, fontWeight: "600", color: red }}>{check.why}</Text>}
            </View>
          )}

          {waiting.length > 0 && (
            <View style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, paddingVertical: 4 }}>
              <Text style={{ paddingHorizontal: 16, paddingTop: 10, fontSize: 12.5, fontWeight: "700", color: muted }}>waiting to open</Text>
              {waiting.map((r) => r.rule.kind === "entry" && (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: ink }}>{`${r.rule.side} at ${r.rule.px}`}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{`${r.rule.margin} ausd at ${r.rule.leverage}x${r.rule.stop ? `, stop ${r.rule.stop.px}` : ""}${r.state === "held" ? " · the book was past the limit, trying again" : ""}`}</Text>
                  </View>
                  <Tap onPress={() => void drop(r)} innerStyle={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "#F0EDF3", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: muted }}>cancel</Text>
                  </Tap>
                </View>
              ))}
            </View>
          )}

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
          {later ? (
            <Tap onPress={check?.ok && !arming && keyed ? arm : undefined} innerStyle={{ height: 58, borderRadius: 29, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, opacity: check?.ok && keyed && !arming ? 1 : 0.45 }}>
              <Glyph name="lock" size={22} color="white" />
              <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{arming ? "arming…" : !keyed ? "turn the guard on first" : "arm with fingerprint"}</Text>
            </Tap>
          ) : (
          <TradeButton
            phase={phase}
            f={f}
            since={since}
            disabled={!ok}
            onPress={place}
            label={!address ? "no account" : !keyed ? "turn the guard on to trade" : margin > balance ? "not enough ausd" : away <= threshold ? "too close to liquidation" : `${side} ${sym} · ${money(margin * lev, 0)} ausd`}
            detail={phase === "filled" ? `filled in ${(fillMs / 1000).toFixed(1)}s` : `didn’t fill · ${error}`}
          />
          )}
          {later && (
            <Text numberOfLines={2} style={{ marginTop: 8, textAlign: "center", fontSize: 11, fontWeight: "500", color: "#B9B2C5", paddingHorizontal: 8 }}>
              {entryRule && check?.ok ? `you sign: ${describeRule(entryRule, m?.symbol ?? "")}` : "nothing is spent until the price gets there. pehra opens it, even with the app closed"}
            </Text>
          )}
        </View>
        <FlightLayer f={f} from={from} to={to} />
      </View>

      <Tray visible={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: ink, paddingHorizontal: 4 }}>{editing === "at" ? "open at" : side === "long" ? "pay at most" : "sell at least"}</Text>
            <View style={{ height: 64, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: line, paddingHorizontal: 18, justifyContent: "center" }}>
              <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 28, color: keyFresh ? "#B9B2C5" : violet }}>{keyText || "0"}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[-1, -0.25, 0.25, 1].map((k) => (
                <Tap key={k} onPress={() => { setKeyText(String(sig4((Number(keyText) || mark) * (1 + k / 100)))); setKeyFresh(false); }} style={{ flex: 1 }} innerStyle={{ height: 44, borderRadius: 22, backgroundColor: "#F0EDF3", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: ink }}>{k > 0 ? "+" : "−"}{Math.abs(k)}%</Text>
                </Tap>
              ))}
            </View>
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted, paddingHorizontal: 4 }}>{sym} is at {mark} now</Text>
            <View style={{ marginHorizontal: -16 }}>
              <Keypad onKey={(k) => { setKeyText(enterDigit(keyFresh && k !== "back" ? "0" : keyText || "0", k)); setKeyFresh(false); }} />
            </View>
            <Tap onPress={commitKeys} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>done</Text>
            </Tap>
          </View>
        )}
      </Tray>

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
            a.go(opened ? `/position?pid=${opened.pid}` : "/portfolio");
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

const sentence = { fontFamily: "Manrope_700Bold", fontSize: 18, color: ink, marginVertical: 3 } as const;

function Chip({ text, onPress, bad }: { text: string; onPress: () => void; bad?: boolean }) {
  return (
    <Tap onPress={onPress} innerStyle={{ height: 34, paddingHorizontal: 10, borderRadius: 11, backgroundColor: bad ? "#FBE4E6" : "#EFE5FF", justifyContent: "center", marginHorizontal: 4, marginVertical: 3 }}>
      <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 18, color: bad ? red : violet }}>{text}</Text>
    </Tap>
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
