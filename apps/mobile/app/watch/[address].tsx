// watching any address: its open positions read from the chain with how far each is from liquidation,
// its recent trades, how it trades, and if it runs pehra its proof. a star keeps it on the watch list,
// which pushes when it trades or gets close to liquidation. their stops live with perpl, off chain, so
// they show as unknown, never as none
import { useCallback, useState } from "react";
import { View, ScrollView, Linking } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../../src/ui/components";
import { Text } from "../../src/ui/Text";
import { Coin } from "../../src/ui/Coin";
import { Glyph } from "../../src/ui/Glyph";
import { useApp } from "../../src/ui/store";
import { readWatch, setWatch, myWatches, listRules, createRule, cancelRule, describeRule, type WatchRead, type RuleRow } from "../../src/rules";
import { Tray } from "../../src/ui/Trade";
import { signIn, type Session } from "../../src/account";
import type { Rule } from "@pehra/perpl";
import { log } from "../../src/log";
import { violet, ink, muted, green, red, faint, well } from "../../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const cut = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ago = (t: number) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 60 ? `${Math.max(1, m)}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

export default function Watch() {
  const a = useApp(),
    { address } = useLocalSearchParams<{ address: string }>(),
    me = a.stored?.address ?? a.session?.address ?? null,
    [w, setW] = useState<WatchRead | null>(null),
    [err, setErr] = useState<string | null>(null),
    [starred, setStarred] = useState(false),
    [copies, setCopies] = useState<RuleRow[]>([]),
    [sheet, setSheet] = useState(false),
    [cm, setCm] = useState(10), [cl, setCl] = useState(3), [cClose, setCClose] = useState(true), [cStop, setCStop] = useState(true),
    [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!address) return;
    readWatch(address).then((x) => { setW(x); setErr(null); }).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    if (me) myWatches(me).then((l) => setStarred(l.some((x) => x.target === address.toLowerCase()))).catch(() => {});
    if (me) listRules(me).then((rs) => setCopies(rs.filter((r) => r.rule.kind === "copy" && r.rule.target.toLowerCase() === address.toLowerCase() && ["armed", "held", "firing", "working"].includes(r.state)))).catch(() => {});
  }, [address, me]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 10_000); return () => clearInterval(t); }, [load]));

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

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  const open = w?.positions ?? [];
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink }}>{address ? cut(address) : ""}</Text>
        <Tap onPress={star} innerStyle={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: starred ? violet : mist, justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: starred ? "white" : violet }}>{starred ? "watching" : "watch"}</Text>
        </Tap>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}>
        <View style={{ paddingHorizontal: 8, marginTop: 4 }}>
          {w === null ? (
            err ? <Text style={heading}>couldn’t read that account.</Text> : <View style={{ gap: 10 }}><View style={{ width: 240, height: 24, borderRadius: 12, backgroundColor: well }} /><View style={{ width: 170, height: 24, borderRadius: 12, backgroundColor: well }} /></View>
          ) : w.accountId === null ? (
            <Text style={heading}>this address has no perpl account yet.</Text>
          ) : (
            <>
              <Text style={heading}>{open.length ? `${open.length} position${open.length === 1 ? "" : "s"} open,` : "nothing open right now,"}</Text>
              <Text style={heading}>{w.profile.labels.join(", ")}.</Text>
              <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>{w.balance.toFixed(2)} ausd free on perpl · last {w.profile.trades} trades read from monad</Text>
            </>
          )}
          {err && <Text style={{ marginTop: 6, fontSize: 12.5, fontWeight: "600", color: red }}>{err}</Text>}
        </View>

        {open.map((p, i) => (
          <Animated.View key={p.mkt} entering={FadeInDown.delay(60 * i).duration(240).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Coin symbol={p.symbol} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{p.symbol.toLowerCase()} {p.side}</Text>
                <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{p.size} {p.symbol.toLowerCase()} · entry {p.entry} · {p.collateral.toFixed(2)} margin</Text>
              </View>
              <Text style={{ fontSize: 14, fontWeight: "700", color: p.pnl >= 0 ? green : red }}>{p.pnl >= 0 ? "+" : "−"}{Math.abs(p.pnl).toFixed(2)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: p.distance < 0.1 ? red : muted }}>{(p.distance * 100).toFixed(1)}% from liquidation at {Number(p.liq.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 8 })}</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: faint }}>stops unknown</Text>
            </View>
          </Animated.View>
        ))}

        {w && w.accountId !== null && me && address?.toLowerCase() !== me.toLowerCase() && (
          copies.length ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#E4F3EC", borderRadius: 22, padding: 14 }}>
              <Glyph name="gauge" size={24} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: green }}>you copy them · {copies[0].rule.kind === "copy" ? `${copies[0].rule.margin} ausd a trade` : ""}</Text>
              <Tap onPress={() => void stopCopy(copies[0])} innerStyle={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "white", justifyContent: "center" }}>
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: ink }}>stop</Text>
              </Tap>
            </View>
          ) : (
            <Tap onPress={() => setSheet(true)} innerStyle={{ height: 52, borderRadius: 26, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: "white" }}>copy their next trades</Text>
            </Tap>
          )
        )}
        {w && w.onPehra && (
          <Tap onPress={() => a.go(`/proof?address=${address}`)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: mist, borderRadius: 22, padding: 14 }}>
            <Glyph name="shield" size={24} />
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: violet }}>runs pehra · {w.receipts} rule{w.receipts === 1 ? "" : "s"} fired, see the proof</Text>
          </Tap>
        )}

        {w && w.recent.length > 0 && (
          <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingVertical: 6 }}>
            <Text style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, fontSize: 13, fontWeight: "700", color: muted }}>recent on chain</Text>
            {w.recent.map((r, i) => (
              <Tap key={i} onPress={r.tx ? () => Linking.openURL(`${NETWORKS.testnet.explorer}/tx/${r.tx}`) : undefined} innerStyle={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 9 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "600", color: ink }}>{r.kind}{r.side ? ` ${r.side}` : ""}</Text>
                <Text style={{ fontSize: 12, fontWeight: "500", color: faint }}>{ago(r.timestamp)}{r.tx ? " ↗" : ""}</Text>
              </Tap>
            ))}
          </View>
        )}
      </ScrollView>
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
