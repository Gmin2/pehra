// settings (tmp/claude/preview/set-a.png): the guard's card with its switch, the guard's three numbers
// as rows that open drawers built from your own positions (drw-1.png), then your account.
import { useEffect, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack, router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, ReduceMotion, useSharedValue } from "react-native-reanimated";
import { getPerplAccount, publicClient } from "@pehra/perpl";
import { Screen, Tap, IconButton, Chevron } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { PehraBird } from "../src/ui/PehraBird";
import { Shield } from "../src/ui/Home";
import { Tray } from "../src/ui/Trade";
import { Roll } from "../src/ui/Position";
import { Ruler, CoinStacks, Toggle, type Rider } from "../src/ui/Settings";
import { useApp } from "../src/ui/store";
import { useAccount } from "../src/live";
import { updateGuard, type GuardPatch } from "../src/guard";
import { forgetStored } from "../src/account";
import { log } from "../src/log";
import { forget as forgetSession } from "../src/session";

const ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  violet = "#9E4DFD",
  red = "#B4474D",
  line = "#EEEAF2",
  well = "#F0EDF3",
  mist = "#EFE5FF";

type Drawer = "step" | "back" | "limit" | "signout" | null;
const DAY = 24 * 3600_000;

export default function Settings() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    [drawer, setDrawer] = useState<Drawer>(null),
    [perplId, setPerplId] = useState<string | null>(null),
    [saving, setSaving] = useState(false);
  const eyes = useSharedValue(1),
    glance = useSharedValue(0);
  const st = account?.settings;
  const riders: Rider[] = (account?.health ?? []).map((h) => ({ symbol: h.symbol, away: h.distance * 100 }));
  const steps = (account?.events ?? []).filter((e) => e.kind === "added");
  const today = steps.filter((e) => Date.now() - e.at < DAY).length;

  useEffect(() => {
    if (!address) return;
    getPerplAccount(publicClient("testnet"), address).then((x) => setPerplId(x ? String(x.accountId) : null)).catch(() => {});
  }, [address]);

  const save = async (patch: GuardPatch) => {
    if (!address) return;
    setSaving(true);
    try {
      const r = await updateGuard(address, patch);
      log(`settings ${JSON.stringify(patch)} -> ${JSON.stringify(r.settings)}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      log(`settings failed: ${e instanceof Error ? e.message : e}`);
      a.toast("couldn’t save that, try again");
    }
    setSaving(false);
    setDrawer(null);
  };

  const signOut = async () => {
    if (address) await forgetSession(address);
    await forgetStored();
    a.setSession(null);
    a.setStored?.(null);
    // the onboarding step lives in the store, a sign out starts it from the first screen
    a.setOnboarding("choose");
    log("signed out of this phone");
    router.replace("/onboarding");
  };

  const row = (glyph: React.ReactNode, label: string, value: string, onPress?: () => void, right?: React.ReactNode, last = false) => (
    <Tap onPress={onPress} innerStyle={{ flexDirection: "row", alignItems: "center", gap: 14, height: 52, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: line, marginLeft: 0 }}>
      <View style={{ width: 24, alignItems: "center" }}>{glyph}</View>
      <Text style={{ flex: 1, fontSize: 14.5, fontWeight: "500", color: ink }}>{label}</Text>
      {!!value && <Text style={{ fontSize: 14, fontWeight: "600", color: onPress ? ink : muted, fontVariant: ["tabular-nums"] }}>{value}</Text>}
      {right ?? (onPress ? <Chevron /> : null)}
    </Tap>
  );

  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
        <Text style={{ flex: 1, textAlign: "center", marginRight: 40, fontSize: 16, fontWeight: "700", color: ink }}>settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
        <Animated.View entering={FadeInDown.duration(360).reduceMotion(ReduceMotion.System)}>
        <Tap onPress={() => a.go("/key")} innerStyle={{ backgroundColor: st?.enabled === false || (account && !account.enrolled) ? "#B9B2C5" : violet, borderRadius: 24, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "#ffffff26", alignItems: "center", justifyContent: "center" }}>
            <PehraBird size={44} open={eyes} shift={glance} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>{account && !account.enrolled ? "the guard is off" : !st ? "reading the guard" : st.enabled ? "the guard is on" : "the guard is paused"}</Text>
            <Text style={{ fontSize: 12.5, fontWeight: "500", color: "#ffffffcc" }}>{account && !account.enrolled ? "no watch key. tap to turn it on" : !st ? " " : st.enabled ? (today ? `stepped in ${today === 1 ? "once" : today + " times"} today · its key` : "watching · tap to see its key") : "your positions are on their own"}</Text>
          </View>
          {st && <Toggle on={st.enabled} light onChange={(v) => { Haptics.selectionAsync(); void save({ enabled: v }); }} />}
        </Tap>
        </Animated.View>

        <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 8, fontSize: 13, fontWeight: "700", color: muted }}>the guard</Text>
        <Animated.View entering={FadeInDown.delay(80).duration(360).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, overflow: "hidden" }}>
          {row(<Shield size={22} color={violet} />, "steps in at", st ? `${st.thresholdPct}% from liquidation` : "—", st ? () => setDrawer("step") : undefined)}
          {row(<Glyph name="gauge" size={22} />, "brings it back to", st ? `${st.targetPct}% away` : "—", st ? () => setDrawer("back") : undefined)}
          {row(<Glyph name="circle-coin" size={22} />, "daily limit", st ? `${st.maxAddAusdPerDay} ausd` : "—", st ? () => setDrawer("limit") : undefined, undefined, true)}
        </Animated.View>

        <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 8, fontSize: 13, fontWeight: "700", color: muted }}>alerts</Text>
        <Animated.View entering={FadeInDown.delay(120).duration(360).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, overflow: "hidden" }}>
          {row(<Glyph name="bell" size={22} />, "what pehra tells you", "pushes and quiet hours", () => a.go("/alerts"), undefined, true)}
        </Animated.View>

        <Text style={{ marginTop: 22, marginBottom: 8, marginLeft: 8, fontSize: 13, fontWeight: "700", color: muted }}>your account</Text>
        <Animated.View entering={FadeInDown.delay(160).duration(360).reduceMotion(ReduceMotion.System)} style={{ backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, overflow: "hidden" }}>
          {row(<Glyph name="copies" size={22} />, "address", address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—", address ? () => { Clipboard.setStringAsync(address); Haptics.selectionAsync(); a.toast("address copied"); } : undefined)}
          {row(<Glyph name="lock" size={22} />, "passkey", "google password manager")}
          {row(<Glyph name="circle-coin" size={22} />, "perpl account", perplId ? `#${perplId} · testnet` : "—", undefined, undefined, true)}
        </Animated.View>

        <Tap onPress={() => setDrawer("signout")} innerStyle={{ marginTop: 12, height: 52, borderRadius: 22, backgroundColor: "white", borderWidth: 1, borderColor: line, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 14.5, fontWeight: "600", color: red }}>sign out of this phone</Text>
        </Tap>
        <Text style={{ textAlign: "center", marginTop: 14, fontSize: 11.5, fontWeight: "500", color: faint }}>pehra 0.1 · monad testnet · your money stays yours</Text>
      </ScrollView>

      <Tray visible={!!drawer} onClose={() => setDrawer(null)}>
        {drawer === "step" && st && <StepDrawer initial={st.thresholdPct} back={st.targetPct} riders={riders} saving={saving} onSave={(v) => save({ thresholdPct: v, targetPct: Math.max(st.targetPct, v + 2) })} />}
        {drawer === "back" && st && <BackDrawer initial={st.targetPct} step={st.thresholdPct} riders={riders} health={account?.health ?? []} saving={saving} onSave={(v) => save({ targetPct: v })} />}
        {drawer === "limit" && st && <LimitDrawer initial={st.maxAddAusdPerDay} avg={steps.length ? steps.reduce((t, e) => t + (e.addAusd ?? 0), 0) / steps.length : 0} saving={saving} onSave={(v) => save({ maxAddAusdPerDay: v })} />}
        {drawer === "signout" && (
          <View style={{ paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>sign out of this phone?</Text>
            <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>your money stays in your wallet and perpl account, and the guard keeps watching. sign back in any time with your passkey.</Text>
            <Tap onPress={signOut} innerStyle={{ marginTop: 20, height: 54, borderRadius: 27, backgroundColor: red, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>sign out</Text>
            </Tap>
            <Tap onPress={() => setDrawer(null)} innerStyle={{ height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: muted }}>stay signed in</Text>
            </Tap>
          </View>
        )}
      </Tray>
    </Screen>
  );
}

const bigNum = { fontFamily: "Manrope_700Bold", fontSize: 44, color: ink, letterSpacing: -1 };

function Head({ label, value, unit, mark }: { label: string; value: string; unit: string; mark?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: muted }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 }}>
        {mark ? (
          <Rough type="circle" padding={2} paddingX={6} strokeWidth={2.2} delay={250} duration={600}>
            <Roll text={value} style={bigNum} />
          </Rough>
        ) : (
          <Roll text={value} style={bigNum} />
        )}
        <Text style={{ fontSize: 15, fontWeight: "600", color: muted }}>{unit}</Text>
      </View>
    </View>
  );
}

function Note({ strong, rest, tone = "mist" }: { strong: string; rest: string; tone?: "mist" | "red" | "white" }) {
  const bg = tone === "red" ? "#FBE9EB" : tone === "white" ? "white" : mist;
  return (
    <View style={{ marginTop: 14, backgroundColor: bg, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, gap: 3 }}>
      <Text style={{ fontSize: 13, fontWeight: "700", color: tone === "red" ? red : violet }}>{strong}</Text>
      <Text style={{ fontSize: 12.5, fontWeight: "500", color: ink }}>{rest}</Text>
    </View>
  );
}

function SaveButton({ label, onPress, saving }: { label: string; onPress: () => void; saving: boolean }) {
  return (
    <Tap onPress={saving ? undefined : onPress} innerStyle={{ marginTop: 16, height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center", opacity: saving ? 0.6 : 1 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{saving ? "saving…" : label}</Text>
    </Tap>
  );
}

function StepDrawer({ initial, back, riders, saving, onSave }: { initial: number; back: number; riders: Rider[]; saving: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(initial);
  const first = [...riders].sort((x, y) => x.away - y.away)[0];
  const caught = riders.filter((r) => r.away < v);
  return (
    <View>
      <Head label="the guard steps in at" value={`${v}%`} unit="from liquidation" mark />
      <View style={{ marginTop: 16 }}>
        <Ruler riders={riders} value={v} onChange={setV} fixed={back} mode="step" min={1} max={25} />
      </View>
      {!first ? (
        <Note strong="you have nothing open." rest={`when you do, the guard steps in at ${v}% from liquidation.`} />
      ) : caught.length ? (
        <Note tone="red" strong={`it would step in right away for ${caught.map((c) => c.symbol.toLowerCase()).join(" and ")}.`} rest={`${caught.length === 1 ? "that position is" : "those are"} already closer than ${v}%.`} />
      ) : (
        <Note strong="nothing of yours is that close." rest={`${first.symbol.toLowerCase()} would be first, ${(first.away - v).toFixed(first.away - v < 10 ? 1 : 0)}% more to fall.`} />
      )}
      <SaveButton label={v === initial ? `keep ${v}%` : `set ${v}%`} saving={saving} onPress={() => onSave(v)} />
    </View>
  );
}

function BackDrawer({ initial, step, riders, health, saving, onSave }: { initial: number; step: number; riders: Rider[]; health: { symbol: string; size: number; mark: number; side: string }[]; saving: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(initial);
  // what one rescue would cost for the biggest position: moving its distance from the line back to v
  // takes about notional times the gap
  const big = [...health].sort((x, y) => y.size * y.mark - x.size * x.mark)[0];
  const cost = big ? (big.size * big.mark * (v - step)) / 100 : 0;
  return (
    <View>
      <Head label="and brings it back to" value={`${v}%`} unit="from liquidation" />
      <View style={{ marginTop: 16 }}>
        <Ruler riders={riders} value={v} onChange={setV} fixed={step} mode="back" min={step + 2} max={30} />
      </View>
      {big ? (
        <Note tone="white" strong={`about ${cost.toFixed(2)} ausd each time`} rest={`for your ${big.symbol.toLowerCase()} ${big.side}, from ${step}% back to ${v}%.`} />
      ) : (
        <Note tone="white" strong="further back means bigger adds." rest={`each rescue lifts a position from ${step}% to ${v}%.`} />
      )}
      <SaveButton label={v === initial ? `keep ${v}%` : `set ${v}%`} saving={saving} onPress={() => onSave(v)} />
    </View>
  );
}

function LimitDrawer({ initial, avg, saving, onSave }: { initial: number; avg: number; saving: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(initial);
  const each = avg > 0 ? avg : 1;
  return (
    <View>
      <Head label="the guard can spend up to" value={String(v)} unit="ausd a day" />
      <View style={{ marginTop: 16 }}>
        <CoinStacks amount={v} />
      </View>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 14 }}>
        {[5, 10, 20, 50].map((x) => (
          <Tap key={x} onPress={() => { Haptics.selectionAsync(); setV(x); }} innerStyle={{ width: 72, height: 42, borderRadius: 21, backgroundColor: v === x ? ink : well, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: v === x ? "white" : ink }}>{x}</Text>
          </Tap>
        ))}
      </View>
      <Text style={{ textAlign: "center", marginTop: 12, fontSize: 13, fontWeight: "600", color: ink }}>
        {avg > 0 ? `enough for about ${Math.floor(v / each)} rescues like the last one` : `enough for about ${Math.floor(v / each)} one-ausd rescues`}
      </Text>
      <SaveButton label={v === initial ? `keep ${v} ausd` : `set ${v} ausd`} saving={saving} onPress={() => onSave(v)} />
    </View>
  );
}
