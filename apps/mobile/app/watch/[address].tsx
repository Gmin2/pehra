// a trader's page: their profit on closed trades as a number and a line, what they hold now with how far
// each is from liquidation, and every open and close by day.
// watch pushes when they trade, copy opens their next trades on your account. their stops live with
// perpl, off chain, so they show as unknown, never as none
import { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Linking, useWindowDimensions } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import Svg, { Path, Line, Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../../src/ui/components";
import { Text } from "../../src/ui/Text";
import { Coin } from "../../src/ui/Coin";
import { Glyph } from "../../src/ui/Glyph";
import { useApp } from "../../src/ui/store";
import { readWatch, readTrader, setWatch, myWatches, listRules, createRule, cancelRule, describeRule, type WatchRead, type RuleRow, type Trader } from "../../src/rules";
import { Tray, Segmented } from "../../src/ui/Trade";
import { useMarkets } from "../../src/live";
import { signIn, type Session } from "../../src/account";
import type { Rule } from "@pehra/perpl";
import { log } from "../../src/log";
import { violet, ink, muted, green, red, faint, well } from "../../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const RANGES = ["24h", "7d", "30d"] as const;
const DAYS: Record<(typeof RANGES)[number], number> = { "24h": 1, "7d": 7, "30d": 30 };
const RANGE_WORDS: Record<(typeof RANGES)[number], string> = { "24h": "today", "7d": "7 days", "30d": "30 days" };
const amber = "#9A6B1C";
const money = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const dayOf = (t: number) => { const d = new Date(t * 1000), now = new Date(); const k = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000); return k === 0 ? "today" : k === 1 ? "yesterday" : k < 7 ? `${k} days ago` : `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const dateOf = (t: number) => { const d = new Date(t * 1000); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const clock = (t: number) => { const d = new Date(t * 1000); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };

// the running total of closed trades as a line, with a faint zero line. flat colour, no glow
function ProfitLine({ trader, width }: { trader: Trader; width: number }) {
  const closes = trader.trades.filter((t) => t.kind !== "open");
  const h = 128, padY = 10;
  if (closes.length < 2) return <View style={{ height: h, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{closes.length ? "one closed trade so far" : "no closed trades in this window"}</Text></View>;
  let run = 0;
  const pts = closes.map((t) => { run += t.pnl ?? 0; return { t: t.at, v: run }; });
  const t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 1);
  const lo = Math.min(0, ...pts.map((p) => p.v)), hi = Math.max(0, ...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * (width - 8) + 4;
  const y = (v: number) => padY + (1 - (v - lo) / span) * (h - padY * 2);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const end = pts[pts.length - 1], up = end.v >= 0;
  const stroke = up ? violet : red;
  return (
    <View>
    <Svg width={width} height={h}>
      <Line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#DDD8E6" strokeWidth={1} strokeDasharray="4 4" />
      <Path d={`${d} L${x(end.t).toFixed(1)} ${y(0).toFixed(1)} L${x(t0).toFixed(1)} ${y(0).toFixed(1)} Z`} fill={up ? mist : "#FBE9EA"} />
      <Path d={d} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(end.t)} cy={y(end.v)} r={4.5} fill={stroke} />
    </Svg>
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{dateOf(t0)}</Text>
      <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{dayOf(t1) === "today" ? "today" : dateOf(t1)}</Text>
    </View>
    </View>
  );
}

const ago = (t: number) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 60 ? `${Math.max(1, m)}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export default function Watch() {
  const a = useApp(),
    { address, copy: copyParam } = useLocalSearchParams<{ address: string; copy?: string }>(),
    me = a.stored?.address ?? a.session?.address ?? null,
    [w, setW] = useState<WatchRead | null>(null),
    [err, setErr] = useState<string | null>(null),
    [starred, setStarred] = useState(false),
    [copies, setCopies] = useState<RuleRow[]>([]),
    [sheet, setSheet] = useState(false),
    [cm, setCm] = useState(10), [cl, setCl] = useState(3), [cClose, setCClose] = useState(true), [cStop, setCStop] = useState(true),
    [busy, setBusy] = useState(false),
    [range, setRange] = useState<(typeof RANGES)[number]>("7d"),
    [tr, setTr] = useState<Trader | null>(null),
    markets = useMarkets(),
    { width } = useWindowDimensions();
  useEffect(() => {
    if (!address) return;
    let live = true;
    readTrader(address, DAYS[range]).then((x) => live && setTr(x)).catch(() => live && setTr({ days: DAYS[range], pnl: 0, closed: 0, wins: 0, liquidations: 0, trades: [] }));
    return () => { live = false; };
  }, [address, range]);

  const load = useCallback(() => {
    if (!address) return;
    readWatch(address).then((x) => { setW(x); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    if (me) myWatches(me).then((l) => setStarred(l.some((x) => x.target === address.toLowerCase()))).catch(() => {});
    if (me) listRules(me).then((rs) => setCopies(rs.filter((r) => r.rule.kind === "copy" && r.rule.target.toLowerCase() === address.toLowerCase() && ["armed", "held", "firing", "working"].includes(r.state)))).catch(() => {});
  }, [address, me]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]));

  // the leaderboard's copy button lands here with the sheet already open
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (copyParam && !asked && w && w.accountId !== null) { setAsked(true); setSheet(true); }
  }, [copyParam, asked, w]);

  const star = async () => {
    if (!me || !address) { a.toast("sign in to keep a watch list"); return; }
    const next = !starred;
    setStarred(next);
    Haptics.selectionAsync();
    try { await setWatch(me, address, next); a.toast(next ? "watching. you’ll hear when they trade" : "not watching any more"); log(`watch ${address} ${next}`); }
    catch (e) { setStarred(!next); a.toast("couldn’t change the watch list"); log(`watch failed: ${e instanceof Error ? e.message : e}`); }
  };

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const copyRule: Rule | null = address && me ? { v: 1, id: `copy-${address.slice(2, 8)}-${Date.now().toString(36)}`, pid: 0, mkt: 64, forMs: 0, kind: "copy", target: address.toLowerCase(), margin: cm, maxLeverage: cl, limitPct: 1, ...(cClose ? { closeWithThem: true } : {}), ...(cStop ? { stopPct: 5 } : {}) } : null;
  const startCopy = async () => {
    if (!copyRule) return;
    setBusy(true);
    try {
      await createRule(await session(), copyRule, "MON");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`copying ${address}`);
      a.toast("copying. their next trade opens on your account");
      setSheet(false);
      load();
    } catch (e) { a.toast(e instanceof Error ? e.message : "couldn’t start the copy"); log(`copy failed: ${e instanceof Error ? e.message : e}`); }
    setBusy(false);
  };
  const stopCopy = async (r: RuleRow) => {
    try { await cancelRule(await session(), r.id); a.toast("stopped copying"); load(); } catch { a.toast("couldn’t stop it, nothing changed"); }
  };

  const open = w?.positions ?? [];
  const mine = !!me && address?.toLowerCase() === me.toLowerCase();
  const sym = (mkt: number) => markets.find((m) => m.id === mkt)?.symbol ?? "MON";
  const winPct = tr && tr.closed ? Math.round((tr.wins / tr.closed) * 100) : null;
  // newest first, grouped by day, at most 40 so a market maker does not scroll forever
  const groups: { day: string; items: Trader["trades"] }[] = [];
  for (const t of (tr?.trades ?? []).slice().reverse().slice(0, 40)) {
    const day = dayOf(t.at), g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(t); else groups.push({ day, items: [t] });
  }
  const what = (t: Trader["trades"][number]) => {
    const s = sym(t.mkt).toLowerCase();
    return t.kind === "open" ? `opened ${s} ${t.side ?? ""}${t.lev ? ` ${t.lev}x` : ""}` : t.kind === "close" ? `closed ${s} ${t.side ?? ""}` : `liquidated on ${s}`;
  };
  const section = { fontSize: 13, fontWeight: "700" as const, color: ink, paddingHorizontal: 6, marginTop: 6 };
  const card = { backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line } as const;
  const mark = (t: Trader["trades"][number]) => {
    const up = t.side !== "short";
    if (t.kind === "liquidated") return <Glyph name="triangle-warning" size={22} color={red} />;
    return <Glyph name={up ? "circle-arrow-up" : "circle-arrow-down"} size={22} color={t.kind === "open" ? violet : (t.pnl ?? 0) >= 0 ? green : red} />;
  };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontFamily: "monospace", fontSize: 15, fontWeight: "700", color: ink }}>{address ? cut(address) : ""}{mine ? " (you)" : ""}</Text>
        {!mine && w && w.accountId !== null ? (
          <Tap onPress={star} innerStyle={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: starred ? violet : mist, justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: starred ? "white" : violet }}>{starred ? "watching" : "watch"}</Text>
          </Tap>
        ) : <View style={{ width: 44 }} />}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 10 }}>
        <View style={{ paddingHorizontal: 6, marginTop: 2 }}>
          <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>{w?.accountId === null ? "this address has no perpl account yet" : `closed trades, ${RANGE_WORDS[range]}`}</Text>
          {tr ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 40, letterSpacing: -1, color: tr.pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{money(tr.pnl)}</Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>ausd{winPct !== null ? ` · ${winPct}% won` : ""}{tr.liquidations ? ` · ${tr.liquidations} liquidated` : ""}</Text>
            </View>
          ) : <View style={{ width: 200, height: 36, borderRadius: 12, backgroundColor: well, marginVertical: 8 }} />}
          {w && w.accountId !== null && <Text style={{ fontSize: 13, fontWeight: "600", color: muted }}>{w.profile.labels.join(", ")}</Text>}
        </View>

        <View style={{ ...card, padding: 14, gap: 12 }}>
          {tr ? <Animated.View key={range} entering={FadeIn.duration(220).reduceMotion(ReduceMotion.System)}><ProfitLine trader={tr} width={width - 32 - 30} /></Animated.View>
            : <View style={{ height: 148, borderRadius: 16, backgroundColor: well }} />}
          <Segmented options={RANGES} value={range} onChange={(r) => { setTr(null); setRange(r); }} />
        </View>

        {err && <Text style={{ paddingHorizontal: 6, fontSize: 12.5, fontWeight: "600", color: red }}>couldn’t read that account: {err}</Text>}
        {w?.onPehra && (
          <Tap onPress={() => a.go(`/proof?address=${address}`)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: mist, borderRadius: 20, padding: 12 }}>
            <Glyph name="shield" size={22} />
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: violet }}>runs pehra · {w.receipts} rule{w.receipts === 1 ? "" : "s"} fired, see the proof</Text>
          </Tap>
        )}
        {copies.length > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#E4F3EC", borderRadius: 20, padding: 12 }}>
            <Glyph name="gauge" size={22} color={green} />
            <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: green }}>you copy them · {copies[0].rule.kind === "copy" ? `${copies[0].rule.margin} ausd a trade` : ""}</Text>
          </View>
        )}

        {open.length > 0 && <Text style={section}>{open.length} open</Text>}
        {open.length > 0 && (
          <View style={{ ...card, paddingHorizontal: 14 }}>
            {open.map((p, i) => {
              const away = p.distance * 100;
              return (
                <Animated.View key={p.mkt} entering={FadeIn.delay(40 * i).duration(220).reduceMotion(ReduceMotion.System)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                  <Coin symbol={p.symbol} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{p.symbol.toLowerCase()} {p.side} <Text style={{ fontSize: 13, fontWeight: "500", color: away < 10 ? red : away < 20 ? amber : muted }}>{Math.round(away)}% to liq</Text></Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>entry {p.entry.toLocaleString("en-US", { maximumFractionDigits: 8 })} · liq {Number(p.liq.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 8 })} · stops unknown</Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: p.pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{money(p.pnl)}</Text>
                </Animated.View>
              );
            })}
          </View>
        )}

        {groups.map((g) => (
          <View key={g.day} style={{ gap: 10 }}>
            <Text style={section}>{g.day}</Text>
            <View style={{ ...card, paddingHorizontal: 14 }}>
              {g.items.map((t, i) => (
                <Tap key={t.tx + i} onPress={() => Linking.openURL(`${NETWORKS.testnet.explorer}/tx/${t.tx}`)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                  {mark(t)}
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: t.kind === "liquidated" ? red : ink }}>{what(t)}</Text>
                  {t.pnl !== null
                    ? <Text style={{ fontSize: 14, fontWeight: "700", color: Math.abs(t.pnl) < 0.005 ? faint : t.pnl >= 0 ? green : red, fontVariant: ["tabular-nums"] }}>{Math.abs(t.pnl) < 0.005 ? "0.00" : money(t.pnl)}</Text>
                    : <Text style={{ fontSize: 13, fontWeight: "600", color: faint }}>↗</Text>}
                </Tap>
              ))}
            </View>
          </View>
        ))}
        {tr && groups.length === 0 && w?.accountId !== null && <Text style={{ paddingHorizontal: 6, fontSize: 13, fontWeight: "500", color: muted }}>no trades in this window</Text>}
      </ScrollView>

      {w && w.accountId !== null && !mine && (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, backgroundColor: "#FAF8F2" }}>
          {copies.length ? (
            <Tap onPress={() => void stopCopy(copies[0])} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: ink }}>stop copying</Text>
            </Tap>
          ) : (
            <Tap onPress={() => setSheet(true)} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>copy their next trades</Text>
            </Tap>
          )}
        </View>
      )}
      <Tray visible={sheet} onClose={() => setSheet(false)}>
        <View style={{ gap: 14, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 21, fontWeight: "700", color: ink }}>copy {address ? cut(address) : ""}</Text>
          <Text style={{ fontSize: 13.5, fontWeight: "500", color: muted }}>when they open a position on perpl, pehra opens the same side on your account, at your size. it runs on your account through a key that can trade but never withdraw. their money and yours never mix.</Text>
          {([["each trade", [5, 10, 25], cm, setCm, " ausd"], ["leverage up to", [1, 2, 3], cl, setCl, "x"]] as const).map(([label, opts, v, set, unit]) => (
            <View key={label} style={{ gap: 8 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted }}>{label}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {opts.map((o) => (
                  <Tap key={o} onPress={() => set(o)} style={{ flex: 1 }} innerStyle={{ height: 42, borderRadius: 21, backgroundColor: v === o ? ink : "#F0EDF3", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: v === o ? "white" : ink }}>{o}{unit}</Text>
                  </Tap>
                ))}
              </View>
            </View>
          ))}
          {([["close when they close", cClose, setCClose], ["a hidden stop 5% away on each copy", cStop, setCStop]] as const).map(([label, on, set]) => (
            <Tap key={label} onPress={() => set(!on)} innerStyle={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
              <Text style={{ fontSize: 14.5, fontWeight: "700", color: ink }}>{label}</Text>
              <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? violet : line, justifyContent: "center", paddingHorizontal: 3 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "white", alignSelf: on ? "flex-end" : "flex-start" }} />
              </View>
            </Tap>
          ))}
          <Text style={{ fontSize: 11, fontWeight: "500", color: faint }}>you sign: {copyRule ? describeRule(copyRule, "MON") : ""}</Text>
          <Tap onPress={busy ? undefined : startCopy} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.5 : 1 }}>
            <Glyph name="lock" size={20} color="white" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{busy ? "starting…" : "copy with fingerprint"}</Text>
          </Tap>
        </View>
      </Tray>
    </Screen>
  );
}
