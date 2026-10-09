// send money out of the pehra wallet to any address on monad. with no address yet it lists the people this
// phone sent to before, once one is picked their birds sit on top to switch, and the fingerprint only
// comes on a tray that shows the fee, what is left, and a warning the first time an address gets money
import { useEffect, useState } from "react";
import { View, ScrollView, TextInput, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, IconButton, Keypad } from "../src/ui/components";
import { enterDigit } from "../src/ui/model";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Coin } from "../src/ui/Coin";
import { Avatar } from "../src/ui/Avatar";
import { AddressText } from "../src/ui/AddressText";
import { Segmented, Tray } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { walletBalances, sendOut, sendFee, recentSends, rememberSend, type Asset, type Wallet, type Sent } from "../src/fund";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { violet, ink, muted, red, faint, green, well } from "../src/ui/Position";

const ASSETS = ["ausd", "usdc", "mon"] as const;
const line = "#EEEAF2", mist = "#EFE5FF", amberBg = "#FBEFD8", amber = "#9A6B1C";
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
// a send of all the mon keeps this back for its own gas
const MON_GAS = 0.02;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const when = (ms: number) => { const d = Math.floor((Date.now() - ms) / 86_400_000); if (d < 1) return "today"; if (d < 7) return `${d}d ago`; const t = new Date(ms); return `${MONTHS[t.getMonth()]} ${t.getDate()}`; };
const fmt = (n: number, asset: Asset) => (asset === "mon" ? n.toFixed(4) : n.toFixed(2));

export default function Send() {
  const a = useApp(),
    me = a.stored?.address ?? a.session?.address ?? null,
    [asset, setAsset] = useState<Asset>("ausd"),
    [to, setTo] = useState(""),
    [amount, setAmount] = useState("0"),
    [w, setW] = useState<Wallet | null>(null),
    [recent, setRecent] = useState<Sent[]>([]),
    [review, setReview] = useState(false),
    [fee, setFee] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<{ hash: string; amount: number; asset: Asset } | null>(null);
  useEffect(() => { if (me) walletBalances(me).then(setW).catch(() => {}); }, [me, done]);
  useEffect(() => { recentSends().then(setRecent).catch(() => {}); }, [done]);
  useEffect(() => { if (review) { setFee(null); sendFee(asset).then(setFee).catch(() => setFee(null)); } }, [review, asset]);

  const picked = isAddress(to);
  const have = w ? (asset === "mon" ? Math.max(0, w.mon - MON_GAS) : w[asset]) : 0;
  const n = Number(amount) || 0;
  const bad = to && !picked ? "that is not an address" : picked && to.toLowerCase() === me?.toLowerCase() ? "that is this wallet" : n > have ? `only ${fmt(have, asset)} ${asset} here` : null;
  const ok = picked && n > 0 && !bad && (w?.mon ?? 0) > 0.005;
  const known = recent.some((r) => r.to.toLowerCase() === to.trim().toLowerCase());
  const last = recent[0];

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const pick = (addr: string, as?: Asset) => { Haptics.selectionAsync(); setTo(addr); if (as) setAsset(as); setAmount("0"); };
  const send = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const r = await sendOut(await session(), asset, to.trim() as `0x${string}`, n);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`sent ${n} ${asset} to ${to.slice(0, 10)} in ${r.hashes[0]}`);
      await rememberSend({ to: to.trim().toLowerCase(), amount: n, asset, at: Date.now() }).catch(() => {});
      setReview(false);
      setDone({ hash: r.hashes[0], amount: n, asset });
      setAmount("0");
    } catch (e) {
      log(`send failed: ${e instanceof Error ? e.message : e}`);
      a.toast(/cancel|NotAllowed/i.test(String(e)) ? "cancelled, nothing sent" : "it didn’t go through, nothing was sent");
    }
    setBusy(false);
  };

  const card = { backgroundColor: "white", borderRadius: 24, borderWidth: 1, borderColor: line } as const;
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>send</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Segmented options={ASSETS} value={asset} onChange={(v) => { setAsset(v); setAmount("0"); }}
          render={(v, on) => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Coin symbol={v.toUpperCase()} size={18} />
              <Text style={{ fontSize: 15, fontWeight: "700", color: on ? ink : muted }}>{v}</Text>
            </View>
          )} />

        {picked && recent.length > 1 && (
          <Animated.View entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: mist, borderRadius: 26, paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>send again</Text>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flexDirection: "row", flex: 1 }}>
                {recent.slice(0, 4).map((r, i) => {
                  const on = r.to === to.trim().toLowerCase();
                  return (
                    <Tap key={r.to} onPress={() => pick(r.to, r.asset)} style={{ marginLeft: i ? -8 : 0 }} innerStyle={{ padding: 2, borderRadius: 30, backgroundColor: on ? violet : mist }}>
                      <Avatar address={r.to} size={38} />
                    </Tap>
                  );
                })}
                {recent.length > 4 && (
                  <View style={{ marginLeft: -8, width: 42, height: 42, borderRadius: 21, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: violet }}>+{recent.length - 4}</Text>
                  </View>
                )}
              </View>
              {last && (
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>last: {last.to.slice(2, 6)}…{last.to.slice(-4)}</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: "500", color: faint }}>{fmt(last.amount, last.asset)} {last.asset} · {when(last.at)}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {picked ? (
          <View style={{ ...card, borderColor: violet, borderWidth: 2, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 12, paddingRight: 8, height: 58 }}>
            <Avatar address={to} size={34} />
            <View style={{ flex: 1 }}><AddressText address={to} size={15} /></View>
            <Tap onPress={() => { setTo(""); setAmount("0"); }} innerStyle={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: well, justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: ink }}>clear</Text>
            </Tap>
          </View>
        ) : (
          <View style={{ ...card, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 8, height: 58 }}>
            <TextInput value={to} onChangeText={setTo} placeholder="0x… address on monad" placeholderTextColor={faint} autoCapitalize="none" autoCorrect={false}
              style={{ flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 14.5, color: ink }} />
            <Tap onPress={async () => setTo((await Clipboard.getStringAsync()).trim())} innerStyle={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: mist, justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>paste</Text>
            </Tap>
          </View>
        )}
        {bad && !picked && <Text style={{ paddingHorizontal: 8, fontSize: 12.5, fontWeight: "600", color: red }}>{bad}</Text>}

        {!picked && recent.length > 0 && (
          <>
            <Text style={{ fontSize: 13, fontWeight: "700", color: ink, paddingHorizontal: 6, marginTop: 4 }}>send again</Text>
            <View style={{ ...card, paddingHorizontal: 14 }}>
              {recent.map((r, i) => (
                <Tap key={r.to} onPress={() => pick(r.to, r.asset)} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                  <Avatar address={r.to} size={40} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AddressText address={r.to} size={15} />
                    <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{fmt(r.amount, r.asset)} {r.asset} · {when(r.at)}</Text>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: "600", color: faint }}>›</Text>
                </Tap>
              ))}
            </View>
            <Text style={{ textAlign: "center", fontSize: 12.5, fontWeight: "600", color: faint }}>or paste an address above</Text>
          </>
        )}
        {!picked && recent.length === 0 && (
          <Text style={{ paddingHorizontal: 8, fontSize: 13, fontWeight: "500", color: muted }}>paste the address you want to send to. this sends what is in your wallet, money in perpl comes out first with withdraw on fund.</Text>
        )}

        {picked && (
          <View style={{ alignItems: "center", gap: 4, paddingVertical: 6 }}>
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 44, color: bad && n > have ? red : ink }}>{amount} <Text style={{ fontSize: 18, color: muted }}>{asset}</Text></Text>
            <Tap onPress={() => setAmount(String(Math.floor(have * (asset === "mon" ? 1e4 : 100)) / (asset === "mon" ? 1e4 : 100)))} innerStyle={{ paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>max {fmt(have, asset)}</Text>
            </Tap>
            {bad && <Text style={{ fontSize: 12.5, fontWeight: "600", color: red }}>{bad}</Text>}
            {w && w.mon <= 0.005 && <Text style={{ fontSize: 12.5, fontWeight: "600", color: red }}>no mon left for gas. get some from fund first</Text>}
          </View>
        )}
        {done && (
          <Tap onPress={() => Linking.openURL(`${NETWORKS.testnet.explorer}/tx/${done.hash}`)} innerStyle={{ backgroundColor: "#E4F3EC", borderRadius: 18, padding: 14 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: green }}>sent {done.amount} {done.asset}. see it on monadscan ↗</Text>
          </Tap>
        )}
      </ScrollView>
      {picked && <Keypad onKey={(k) => setAmount(enterDigit(amount, k))} />}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: picked ? 0 : 8 }}>
        <Tap onPress={ok ? () => setReview(true) : undefined} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: ok ? 1 : 0.35 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>review</Text>
        </Tap>
      </View>

      <Tray visible={review} onClose={() => setReview(false)}>
        <View style={{ gap: 12, paddingHorizontal: 4 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>check before it goes</Text>
          <View style={{ ...card, paddingHorizontal: 14 }}>
            {[
              ["sending", <View key="s" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Coin symbol={asset.toUpperCase()} size={18} /><Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{fmt(n, asset)} {asset}</Text></View>],
              ["to", <View key="t" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Avatar address={to || "0x0"} size={22} /><AddressText address={to || "0x0000000000000000000000000000000000000000"} size={14.5} /></View>],
              ["network fee", <Text key="f" style={{ fontSize: 15, fontWeight: "700", color: ink }}>{fee === null ? "…" : `about ${fee < 0.0001 ? "0.0001" : fee.toFixed(4)} mon`}</Text>],
              ["left in your wallet", <Text key="l" style={{ fontSize: 15, fontWeight: "700", color: ink }}>{fmt(Math.max(0, (w ? w[asset] : 0) - n - (asset === "mon" ? fee ?? 0 : 0)), asset)} {asset}</Text>],
            ].map(([label, value], i) => (
              <View key={label as string} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: line }}>
                <Text style={{ fontSize: 14, fontWeight: "500", color: muted }}>{label}</Text>
                {value}
              </View>
            ))}
          </View>
          {!known && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: amberBg, borderRadius: 20, padding: 14 }}>
              <Glyph name="triangle-warning" size={24} color={amber} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: amber, lineHeight: 18 }}>first time sending here. check the start and end of the address, a send can’t be undone.</Text>
            </View>
          )}
          <Tap onPress={busy ? undefined : send} innerStyle={{ height: 58, borderRadius: 29, backgroundColor: ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, opacity: busy ? 0.5 : 1 }}>
            <Glyph name="lock" size={20} color="white" />
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{busy ? "sending…" : "send with fingerprint"}</Text>
          </Tap>
        </View>
      </Tray>
    </Screen>
  );
}
