// the watch list: everyone you watch with what they hold right now, their open profit, and anything they
// just did in violet. paste any address to look at it. the top traders fill the bottom so the list is
// never empty, and it works before signing up
import { useCallback, useState } from "react";
import { View, ScrollView, TextInput } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack, useFocusEffect } from "expo-router";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton } from "../../src/ui/components";
import { Text } from "../../src/ui/Text";
import { Glyph } from "../../src/ui/Glyph";
import { Coin } from "../../src/ui/Coin";
import { Avatar } from "../../src/ui/Avatar";
import { AddressText } from "../../src/ui/AddressText";
import { Rough } from "../../src/ui/Rough";
import { useApp } from "../../src/ui/store";
import { useMarkets } from "../../src/live";
import { myWatches, readWatch, readTrader, readLeaders, setWatch, type WatchRead, type Trader, type Leader } from "../../src/rules";
import { violet, ink, muted, red, green, faint, well } from "../../src/ui/Position";

const line = "#EEEAF2", mist = "#EFE5FF";
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
const money = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}`;
const ago = (t: number) => { const m = Math.max(1, Math.round((Date.now() / 1000 - t) / 60)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const FRESH_S = 3600;

type Row = { target: string; w: WatchRead | null; tr: Trader | null };

export default function WatchIndex() {
  const a = useApp(),
    me = a.stored?.address ?? a.session?.address ?? null,
    markets = useMarkets(),
    [text, setText] = useState(""),
    [rows, setRows] = useState<Row[] | null>(null),
    [top, setTop] = useState<Leader[]>([]);
  const load = useCallback(() => {
    readLeaders(7).then(setTop).catch(() => {});
    if (!me) { setRows([]); return; }
    myWatches(me).then((list) => {
      setRows((prev) => list.map((x) => prev?.find((p) => p.target === x.target) ?? { target: x.target, w: null, tr: null }));
      for (const x of list) {
        Promise.all([readWatch(x.target).catch(() => null), readTrader(x.target, 7).catch(() => null)]).then(([w, tr]) =>
          setRows((prev) => (prev ?? []).map((p) => (p.target === x.target ? { target: x.target, w, tr } : p))));
      }
    }).catch(() => setRows([]));
  }, [me]);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]));

  const go = (addr: string) => a.go(`/watch/${addr.trim().toLowerCase()}`);
  const paste = async () => { const t = (await Clipboard.getStringAsync()).trim(); setText(t); if (isAddress(t)) go(t); };
  const sym = (mkt: number) => (markets.find((m) => m.id === mkt)?.symbol ?? "MON").toLowerCase();
  const last = (tr: Trader | null) => tr?.trades[tr.trades.length - 1] ?? null;
  const fresh = (r: Row) => { const l = last(r.tr); return !!l && Date.now() / 1000 - l.at < FRESH_S; };
  const sentence = (r: Row) => {
    const l = last(r.tr), open = r.w?.positions.length ?? 0;
    if (l && fresh(r)) return l.kind === "open" ? `opened a ${sym(l.mkt)} ${l.side ?? ""}${l.lev ? ` ${l.lev}x` : ""} · ${ago(l.at)}` : l.kind === "close" ? `closed ${sym(l.mkt)} ${l.side ?? ""} · ${ago(l.at)}` : `liquidated on ${sym(l.mkt)} · ${ago(l.at)}`;
    const won = r.tr && r.tr.closed ? ` · ${Math.round((r.tr.wins / r.tr.closed) * 100)}% won` : "";
    if (l) return `traded ${ago(l.at)}${won}`;
    if (!open && r.tr) return `nothing open · ${money(r.tr.pnl)} this week`;
    return r.w ? "no trades this week" : "";
  };
  const star = async (addr: string) => {
    if (!me) { a.toast("sign in to keep a watch list"); return; }
    Haptics.selectionAsync();
    try { await setWatch(me, addr, true); a.toast("watching. you’ll hear when they trade"); load(); } catch { a.toast("couldn’t change the watch list"); }
  };

  const watched = rows ?? [];
  const justNow = watched.filter(fresh).length;
  const suggestions = top.filter((l) => l.address.toLowerCase() !== me?.toLowerCase() && !watched.some((r) => r.target === l.address.toLowerCase())).slice(0, 3);
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 26, lineHeight: 34, color: ink, letterSpacing: -0.5 };
  const card = { backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line, paddingHorizontal: 14 } as const;

  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>watching</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: 8 }}>
          {watched.length ? (
            <>
              <Text style={heading}>{watched.length} trader{watched.length === 1 ? "" : "s"},</Text>
              <View style={{ flexDirection: "row" }}>
                <Rough type="circle" padding={3} paddingX={8} strokeWidth={2.2} delay={300} duration={700}>
                  <Text style={heading}>{justNow ? `${justNow === 1 ? "one" : justNow} just traded.` : "all quiet."}</Text>
                </Rough>
              </View>
            </>
          ) : (
            <>
              <Text style={heading}>watch any trader</Text>
              <Text style={heading}>on perpl.</Text>
              <Text style={{ marginTop: 6, fontSize: 13.5, fontWeight: "500", color: muted }}>see what they hold, hear when they trade.</Text>
            </>
          )}
        </View>

        <View style={{ backgroundColor: "white", borderRadius: 26, borderWidth: 1, borderColor: line, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 8, height: 54 }}>
          <Glyph name="magnifier" size={22} color={muted} />
          <TextInput value={text} onChangeText={setText} placeholder="paste any address" placeholderTextColor={faint} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => isAddress(text) && go(text)}
            style={{ flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 14.5, color: ink }} />
          <Tap onPress={isAddress(text) ? () => go(text) : paste} innerStyle={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: isAddress(text) ? ink : mist, justifyContent: "center" }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: isAddress(text) ? "white" : violet }}>{isAddress(text) ? "look" : "paste"}</Text>
          </Tap>
        </View>
        {text.length > 0 && !isAddress(text) && <Text style={{ paddingHorizontal: 8, fontSize: 12, fontWeight: "600", color: red }}>that is not an address yet</Text>}

        {watched.length > 0 && <Text style={{ fontSize: 13, fontWeight: "700", color: ink, paddingHorizontal: 6, marginTop: 4 }}>you watch</Text>}
        {watched.length > 0 && (
          <View style={card}>
            {watched.map((r, i) => {
              const open = r.w?.positions ?? [];
              const pnl = open.reduce((s, p) => s + p.pnl, 0);
              const f = fresh(r);
              return (
                <Animated.View key={r.target} entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
                  <Tap onPress={() => go(r.target)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                    <View>
                      <Avatar address={r.target} size={44} />
                      {f && <View style={{ position: "absolute", right: -1, top: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: violet, borderWidth: 2, borderColor: "white" }} />}
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <AddressText address={r.target} size={15} />
                      {r.w === null ? <View style={{ width: 150, height: 10, borderRadius: 5, backgroundColor: well, marginTop: 3 }} />
                        : <Text style={{ fontSize: 12.5, fontWeight: "600", color: f ? violet : muted }}>{sentence(r)}</Text>}
                      {open.length > 0 && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 }}>
                          {open.slice(0, 4).map((p) => <Coin key={p.mkt} symbol={p.symbol} size={15} />)}
                          <Text style={{ marginLeft: 4, fontSize: 11.5, fontWeight: "600", color: faint }}>{open.length} open</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: "800", color: open.length ? (pnl >= 0 ? green : red) : faint, fontVariant: ["tabular-nums"] }}>{open.length ? money(pnl) : "—"}</Text>
                  </Tap>
                </Animated.View>
              );
            })}
          </View>
        )}
        {rows === null && (
          <View style={card}>
            {[0, 1].map((i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: well }} />
                <View style={{ flex: 1, gap: 7 }}><View style={{ width: 120, height: 12, borderRadius: 6, backgroundColor: well }} /><View style={{ width: 170, height: 10, borderRadius: 5, backgroundColor: well }} /></View>
              </View>
            ))}
          </View>
        )}

        {suggestions.length > 0 && (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingHorizontal: 6, marginTop: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: ink }}>worth a look</Text>
            <Tap onPress={() => a.go("/leaders")}><Text style={{ fontSize: 12.5, fontWeight: "700", color: violet }}>top traders ›</Text></Tap>
          </View>
        )}
        {suggestions.length > 0 && (
          <View style={card}>
            {suggestions.map((l, i) => (
              <Tap key={l.accountId} onPress={() => go(l.address)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                <Avatar address={l.address} size={40} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AddressText address={l.address} size={14.5} />
                  <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{money(l.pnl)} this week · {l.liquidations ? `${l.closed} closed` : "never liquidated"}</Text>
                </View>
                <Tap onPress={() => void star(l.address)} innerStyle={{ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: mist, justifyContent: "center" }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: violet }}>watch</Text>
                </Tap>
              </Tap>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
