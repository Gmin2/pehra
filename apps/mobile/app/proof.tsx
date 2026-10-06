// proof (tmp/claude/preview/proof-a1.png): how much of the week pehra was up, how fast one action goes from
// the price moving to a receipt on monad, this account's runs (each opens on monadscan), and a button that
// checks the hash chain again and links the last time its head went onchain
import { useCallback, useState } from "react";
import { View, ScrollView, Linking } from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Shield } from "../src/ui/Home";
import { useApp } from "../src/ui/store";
import { useMarkets } from "../src/live";
import { readProof, verifyChain, week, type Proof, type Receipt } from "../src/proof";
import { log } from "../src/log";
import { violet, ink, muted, green, red, faint, well } from "../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF", pale = "#C9A6FF", upFill = "#CFE9DD", downFill = "#F2C6CB";
const px = (v: number) => v.toFixed(Math.max(0, 3 - Math.floor(Math.log10(Math.abs(v) || 1))));
const ago = (at: number) => { const m = Math.round((Date.now() - at) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
const when = (at: number) => { const d = new Date(at); return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase()} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const secs = (ms: number | null) => (ms === null ? "—" : ms < 100 ? `${Math.max(1, Math.round(ms))} ms` : `${(ms / 1000).toFixed(1)} s`);

function describe(r: Receipt, sym: string) {
  if (r.what === "add") return { icon: <Shield size={24} color={violet} />, title: `added ${(r.ausd ?? 0).toFixed(2)} ausd`, sub: r.before !== undefined && r.after !== undefined ? `${r.before.toFixed(1)}% → ${r.after.toFixed(1)}% from liquidation` : "more margin, further from liquidation" };
  if (r.what === "open") return { icon: <Glyph name="flame" size={24} />, title: `opened ${r.side ?? ""} ${r.size} ${sym}`.replace("  ", " "), sub: `your price was reached, filled at ${px(r.price ?? 0)}${r.limit ? `, limit ${px(r.limit)}` : ""}` };
  if (r.what === "close" && r.ruleKind === "funding") return { icon: <Glyph name="magic-wand-sparkle" size={24} />, title: `closed ${r.size} ${sym}`, sub: `funding turned against it, sold at ${px(r.price ?? 0)}` };
  if (r.what === "close") return { icon: <Glyph name="crosshairs" size={24} />, title: `stop sold ${r.size} ${sym}`, sub: `at ${px(r.price ?? 0)}, never below the floor` };
  if (r.what === "backstop") return { icon: <Glyph name="crosshairs" size={24} />, title: `backstop sold ${r.size} ${sym}`, sub: `fired on perpl at ${px(r.price ?? 0)}` };
  if (r.what === "step") return { icon: <Glyph name="flame" size={24} />, title: `take profit, ${r.size} ${sym}`, sub: `fired on perpl at ${px(r.price ?? 0)}` };
  return { icon: <Glyph name="gauge" size={24} />, title: r.what, sub: r.rule ?? "" };
}

// one action as a journey: the price moves, pehra decides, perpl fills, monad records it
function Journey({ p }: { p: Proof }) {
  const l = p.latency;
  const steps = [
    { big: "tick", small: "price moves", c: pale },
    { big: secs(l.decideMs.p50), small: "pehra decides", c: violet },
    { big: secs(l.fillMs.p50), small: "perpl fills", c: violet },
    { big: l.blocks.p50 === null ? "—" : `${l.blocks.p50} blocks`, small: "on monad", c: green },
  ];
  return (
    <View style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingTop: 22, paddingBottom: 14, paddingHorizontal: 8 }}>
      <View style={{ position: "absolute", left: "12.5%", right: "12.5%", top: 30, height: 4, flexDirection: "row" }}>
        <View style={{ flex: 1, backgroundColor: pale, borderRadius: 2 }} />
        <View style={{ flex: 1, backgroundColor: violet }} />
        <View style={{ flex: 1, backgroundColor: green, borderRadius: 2 }} />
      </View>
      <View style={{ flexDirection: "row" }}>
        {steps.map((s, i) => (
          <View key={s.small} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "white", borderWidth: 3, borderColor: i === 3 ? green : violet }} />
            <Text style={{ marginTop: 10, fontSize: 15.5, fontWeight: "700", color: i === 0 ? muted : ink }}>{s.big}</Text>
            <Text style={{ marginTop: 2, fontSize: 11.5, fontWeight: "500", color: muted }}>{s.small}</Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 12, textAlign: "center", fontSize: 11, fontWeight: "500", color: faint }}>
        {l.fillMs.n ? `median of the last ${l.fillMs.n} action${l.fillMs.n === 1 ? "" : "s"} · slowest ${secs(l.fillMs.p99)}` : "no action timed yet"}
      </Text>
    </View>
  );
}

export default function ProofScreen() {
  const a = useApp(),
    // any account's proof can be opened by address, a run is public once it is on the chain
    { address: other } = useLocalSearchParams<{ address?: string }>(),
    address = (other && /^0x[0-9a-fA-F]{40}$/.test(other) ? other : null) ?? a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    [p, setP] = useState<Proof | null>(null),
    [err, setErr] = useState<string | null>(null),
    [checking, setChecking] = useState(false),
    [checked, setChecked] = useState<Proof["chain"] | null>(null);

  const load = useCallback(() => {
    if (!address) return;
    readProof(address).then((x) => { setP(x); setErr(null); }).catch((e) => { setErr(e instanceof Error ? e.message : String(e)); log(`proof load failed: ${e}`); });
  }, [address]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const check = async () => {
    setChecking(true);
    try {
      const [c] = await Promise.all([verifyChain(), new Promise((r) => setTimeout(r, 700))]);
      setChecked(c);
      Haptics.notificationAsync(c.ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
      log(`proof verify ${c.ok ? "ok" : "broken"} ${c.rows}`);
    } catch (e) { a.toast("couldn’t reach the server to check"); log(`proof verify failed: ${e}`); }
    setChecking(false);
  };
  const open = (tx: string | null) => { if (tx) { Haptics.selectionAsync(); void Linking.openURL(`${NETWORKS.testnet.explorer}/tx/${tx}`); } };
  const sym = (mkt: number | null) => markets.find((m) => m.id === mkt)?.symbol.toLowerCase() ?? "";

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  const label = { marginTop: 22, marginBottom: 10, marginLeft: 8, fontSize: 13, fontWeight: "700" as const, color: muted };
  const w = p ? week(p) : null;
  const chain = checked ?? p?.chain ?? null;
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>proof</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
        <View style={{ paddingHorizontal: 8, marginTop: 8 }}>
          <Text style={heading}>everything pehra did,</Text>
          <Text style={heading}>on the record.</Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: "500", color: muted }}>each run is hashed onto the one before it</Text>
        </View>

        <Animated.View entering={FadeInDown.delay(60).duration(300).reduceMotion(ReduceMotion.System)} style={{ marginTop: 20, backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: muted }}>up this week</Text>
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 22, color: ink }}>{w ? `${w.pct.toFixed(1)}%` : "—"}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
            {(w ? w.days : Array.from({ length: 7 }, () => null)).map((d, i) => (
              <View key={i} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ alignSelf: "stretch", height: 22, borderRadius: 6, overflow: "hidden", backgroundColor: d?.started ? upFill : well }}>
                  {d?.started && d.spans.map((x, k) => (
                    <View key={k} style={{ position: "absolute", top: 0, bottom: 0, left: `${x.from * 100}%`, width: `${Math.max(x.kind === "down" ? 3 : 0, (x.to - x.from) * 100)}%`, backgroundColor: x.kind === "down" ? downFill : well }} />
                  ))}
                </View>
                <Text style={{ fontSize: 10.5, fontWeight: "600", color: faint }}>{d?.label ?? " "}</Text>
              </View>
            ))}
          </View>
        </Animated.View>

        <Text style={label}>how fast it acts</Text>
        <Animated.View entering={FadeInDown.delay(120).duration(300).reduceMotion(ReduceMotion.System)}>
          {p ? <Journey p={p} /> : <View style={{ height: 118, borderRadius: 24, backgroundColor: well }} />}
        </Animated.View>

        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text style={label}>{other ? `runs of ${address?.slice(0, 6)}…${address?.slice(-4)}` : "your runs"}</Text>
          {!!p?.receipts.length && <Text style={{ marginRight: 8, fontSize: 12, fontWeight: "600", color: violet }}>tap one for monadscan</Text>}
        </View>
        <Animated.View entering={FadeInDown.delay(180).duration(300).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingVertical: 6 }}>
          {p === null ? (
            [0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: "row", gap: 14, padding: 14 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: well }} />
                <View style={{ flex: 1, gap: 8 }}><View style={{ width: "55%", height: 12, borderRadius: 6, backgroundColor: well }} /><View style={{ width: "75%", height: 10, borderRadius: 5, backgroundColor: well }} /></View>
              </View>
            ))
          ) : p.receipts.length === 0 ? (
            <View style={{ padding: 16, gap: 3 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>nothing has fired yet</Text>
              <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>when a rule sells or adds margin for you, its receipt lands here with the transaction on monad.</Text>
            </View>
          ) : (
            p.receipts.slice(0, 20).map((r) => {
              const d = describe(r, sym(r.mkt));
              return (
                <Tap key={r.seq} onPress={r.tx ? () => open(r.tx) : undefined} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 11 }}>
                  <View style={{ width: 28, alignItems: "center" }}>{d.icon}</View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14.5, fontWeight: "700", color: ink }}>{d.title}</Text>
                    <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{d.sub}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: r.tx ? mist : well, justifyContent: "center" }}>
                      <Text style={{ fontFamily: "monospace", fontSize: 11, fontWeight: "600", color: r.tx ? violet : faint }}>{r.tx ? `${r.tx.slice(0, 6)}… ↗` : "settling"}</Text>
                    </View>
                    <Text style={{ fontSize: 10.5, fontWeight: "500", color: faint }}>{when(r.at)}</Text>
                  </View>
                </Tap>
              );
            })
          )}
        </Animated.View>
        {err && <Text style={{ marginTop: 10, textAlign: "center", fontSize: 12, fontWeight: "600", color: red }}>couldn’t load the proof: {err}</Text>}
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
        {checked && (
          <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Glyph name={checked.ok ? "shield" : "flame"} size={18} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: checked.ok ? green : red }}>{checked.ok ? `checked just now: ${checked.rows.toLocaleString("en-US")} runs, chain unbroken` : `the chain breaks at run ${checked.at}: ${checked.why}`}</Text>
          </Animated.View>
        )}
        <Tap onPress={checking || !p ? undefined : check} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center", opacity: checking ? 0.6 : 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>{checking ? "checking every run…" : checked ? "check it again" : "check the chain yourself"}</Text>
        </Tap>
        <Tap onPress={p?.anchor ? () => open(p.anchor!.tx) : undefined} innerStyle={{ alignItems: "center", paddingVertical: 2 }}>
          <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>
            {chain ? `${chain.rows.toLocaleString("en-US")} runs · head ${(chain.head ?? "").slice(0, 8)}` : " "}
            {p?.anchor ? <Text style={{ fontSize: 11.5, fontWeight: "600", color: violet }}>{` · on monad ${ago(p.anchor.at)} ↗`}</Text> : null}
          </Text>
        </Tap>
      </View>
    </Screen>
  );
}
