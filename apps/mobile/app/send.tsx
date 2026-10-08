// send money out of the pehra wallet to any address on monad. money in perpl comes out with withdraw on
// fund first, this moves what is in the wallet. one fingerprint, the tx opens on monadscan
import { useEffect, useState } from "react";
import { View, ScrollView, TextInput, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Stack } from "expo-router";
import * as Haptics from "expo-haptics";
import { NETWORKS } from "@pehra/perpl";
import { Screen, Tap, IconButton, Keypad } from "../src/ui/components";
import { enterDigit } from "../src/ui/model";
import { Text } from "../src/ui/Text";
import { Segmented } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { walletBalances, sendOut, type Asset, type Wallet } from "../src/fund";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";
import { violet, ink, muted, red, faint, green } from "../src/ui/Position";

const ASSETS = ["ausd", "usdc", "mon"] as const;
const line = "#EEEAF2", mist = "#EFE5FF";
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());
// a send of all the mon keeps this back for its own gas
const MON_GAS = 0.02;

export default function Send() {
  const a = useApp(),
    me = a.stored?.address ?? a.session?.address ?? null,
    [asset, setAsset] = useState<Asset>("ausd"),
    [to, setTo] = useState(""),
    [amount, setAmount] = useState("0"),
    [w, setW] = useState<Wallet | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<{ hash: string; amount: number } | null>(null);
  useEffect(() => { if (me) walletBalances(me).then(setW).catch(() => {}); }, [me, done]);
  const have = w ? (asset === "mon" ? Math.max(0, w.mon - MON_GAS) : w[asset]) : 0;
  const n = Number(amount) || 0;
  const bad = !isAddress(to) ? (to ? "that is not an address" : null) : to.toLowerCase() === me?.toLowerCase() ? "that is this wallet" : n > have ? `only ${have.toFixed(asset === "mon" ? 4 : 2)} ${asset} here` : null;
  const ok = isAddress(to) && n > 0 && !bad && (w?.mon ?? 0) > 0.005;

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const send = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      const r = await sendOut(await session(), asset, to.trim() as `0x${string}`, n);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      log(`sent ${n} ${asset} to ${to.slice(0, 10)} in ${r.hashes[0]}`);
      setDone({ hash: r.hashes[0], amount: n });
      setAmount("0");
    } catch (e) {
      log(`send failed: ${e instanceof Error ? e.message : e}`);
      a.toast(/cancel|NotAllowed/i.test(String(e)) ? "cancelled, nothing sent" : "it didn’t go through, nothing was sent");
    }
    setBusy(false);
  };

  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: ink, marginRight: 44 }}>send</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Segmented options={ASSETS} value={asset} onChange={(v) => { setAsset(v); setAmount("0"); }} />
        <View style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, padding: 14, gap: 8 }}>
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: muted }}>to</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput value={to} onChangeText={setTo} placeholder="0x… address on monad" placeholderTextColor={faint} autoCapitalize="none" autoCorrect={false}
              style={{ flex: 1, fontFamily: "Manrope_600SemiBold", fontSize: 14, color: ink, paddingVertical: 4 }} />
            <Tap onPress={async () => setTo((await Clipboard.getStringAsync()).trim())} innerStyle={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: mist, justifyContent: "center" }}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: violet }}>paste</Text>
            </Tap>
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 4, paddingVertical: 6 }}>
          <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 40, color: bad && n > have ? red : ink }}>{amount} <Text style={{ fontSize: 18, color: muted }}>{asset}</Text></Text>
          <Tap onPress={() => setAmount(String(Math.floor(have * (asset === "mon" ? 1e4 : 100)) / (asset === "mon" ? 1e4 : 100)))} innerStyle={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: violet }}>max {have.toFixed(asset === "mon" ? 4 : 2)}</Text>
          </Tap>
          {bad && <Text style={{ fontSize: 12.5, fontWeight: "600", color: red }}>{bad}</Text>}
          {w && w.mon <= 0.005 && <Text style={{ fontSize: 12.5, fontWeight: "600", color: red }}>no mon left for gas. get some from fund first</Text>}
        </View>
        {done && (
          <Tap onPress={() => Linking.openURL(`${NETWORKS.testnet.explorer}/tx/${done.hash}`)} innerStyle={{ backgroundColor: "#E4F3EC", borderRadius: 18, padding: 14 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: green }}>sent {done.amount} {asset}. see it on monadscan ↗</Text>
          </Tap>
        )}
        <Text style={{ paddingHorizontal: 8, fontSize: 12, fontWeight: "500", color: muted }}>this sends what is in your wallet. money in perpl comes out first with withdraw on fund.</Text>
      </ScrollView>
      <Keypad onKey={(k) => setAmount(enterDigit(amount, k))} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <Tap onPress={busy || !ok ? undefined : send} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center", opacity: ok && !busy ? 1 : 0.4 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{busy ? "sending…" : `send ${n || ""} ${asset}`.replace("  ", " ")}</Text>
        </Tap>
      </View>
    </Screen>
  );
}
