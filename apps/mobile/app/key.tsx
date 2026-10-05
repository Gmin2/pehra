// the watch key (tmp/claude/preview/wk-a.png): what the guard's key can and can't do, and taking it
// back. perpl api keys can never withdraw, and revoking turns order forwarding off onchain, so perpl
// itself refuses the key afterwards (spikes/revoke.ts).
import { useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack } from "expo-router";
import Svg, { Circle, Rect, G, Path } from "react-native-svg";
import Animated, { FadeIn, FadeInDown, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton, Chevron } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { Tray } from "../src/ui/Trade";
import { useApp } from "../src/ui/store";
import { useAccount } from "../src/live";
import { revokeGuard, restoreGuard } from "../src/guard";
import { signIn, type Session } from "../src/account";
import { log } from "../src/log";

const ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  violet = "#9E4DFD",
  green = "#23765A",
  red = "#B4474D",
  line = "#EEEAF2",
  well = "#F0EDF3";

function KeyArt() {
  return (
    <Svg width={110} height={90} viewBox="0 0 110 90">
      <G transform="rotate(-35 55 45) translate(-6 8)">
        <Circle cx={24} cy={40} r={22} fill="white" />
        <Circle cx={24} cy={40} r={8} fill={violet} />
        <Rect x={42} y={33} width={70} height={14} rx={6} fill="white" />
        <Rect x={88} y={44} width={10} height={16} rx={3} fill="white" />
        <Rect x={102} y={44} width={10} height={11} rx={3} fill="white" />
      </G>
    </Svg>
  );
}

function Power({ ok, title, sub, last }: { ok: boolean; title: string; sub: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 14, paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: line, marginLeft: 16, paddingRight: 16 }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: ok ? green : red, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Path d={ok ? "M2.4 6.3 L5 8.8 L9.8 3.4" : "M3 3 L9 9 M9 3 L3 9"} stroke="white" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "700", color: ok ? ink : red }}>{title}</Text>
        <Text style={{ fontSize: 12, fontWeight: "500", color: muted }}>{sub}</Text>
      </View>
    </View>
  );
}

export default function WatchKey() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null,
    { account } = useAccount(address),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState<"" | "revoking" | "restoring">("");
  // perpl decides: with forwarding off (escape hatch, revoke) the key exists but perpl refuses it
  const paused = !!account?.enrolled && account?.forwarding === false;
  const on = !!account?.enrolled && !paused;
  const limit = account?.settings?.maxAddAusdPerDay ?? 20;
  const watching = account?.health?.length ?? 0;
  const made = account?.enrolledAt ? new Date(account.enrolledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toLowerCase() : null;

  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };
  const revoke = async () => {
    setConfirm(false);
    setBusy("revoking");
    try {
      const tx = await revokeGuard(await session());
      log(`watch key revoked, forwarding off in ${tx}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      a.toast("the key is back with you. the guard stopped watching.");
    } catch (e) {
      log(`revoke failed: ${e instanceof Error ? e.message : e}`);
      a.toast("couldn’t revoke, nothing changed");
    }
    setBusy("");
  };
  const restore = async () => {
    setBusy("restoring");
    try {
      await restoreGuard(await session());
      log("watch key restored");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      log(`restore failed: ${e instanceof Error ? e.message : e}`);
      a.toast("couldn’t turn the guard on, try again");
    }
    setBusy("");
  };

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, justifyContent: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
        <Animated.View entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)} style={{ paddingHorizontal: 8 }}>
          <Text style={heading}>it can add margin at 3am.</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={heading}>it </Text>
            <Rough type="circle" padding={3} paddingX={8} strokeWidth={2.2} delay={450} duration={700}>
              <Text style={heading}>can’t withdraw.</Text>
            </Rough>
          </View>
          <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20, fontWeight: "500", color: muted }}>the guard holds a key your fingerprint made. perpl, not pehra, decides what that key is allowed to do.</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(100).duration(300).reduceMotion(ReduceMotion.System)} style={{ marginTop: 20, borderRadius: 28, backgroundColor: on ? violet : faint, padding: 18, flexDirection: "row", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <KeyArt />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: "#ffffffcc" }}>the guard’s key</Text>
            <Text style={{ fontSize: 22, fontWeight: "700", color: "white" }}>{on ? "a watch key" : paused ? "the key is paused" : "no key out"}</Text>
            <Text style={{ fontSize: 12, fontWeight: "500", color: "#ffffffcc" }}>{on ? `made by one fingerprint${made ? ", " + made : ""}` : paused ? "forwarding is off on perpl, it can’t act" : "your account has no trading key"}</Text>
            {on && (
              <View style={{ alignSelf: "flex-start", marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6, height: 22, paddingHorizontal: 10, borderRadius: 11, backgroundColor: "#ffffff26" }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#7EE2B0" }} />
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: "white" }}>{watching ? `watching ${watching} position${watching === 1 ? "" : "s"}` : "watching, nothing open"}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        <View style={{ marginTop: 14, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line }}>
          <Power ok title="add margin to a position" sub={`up to ${limit} ausd a day, before perpl liquidates`} />
          <Power ok title="place and close your trades" sub="the ones you tap, in about a second" />
          <Power ok={false} title="withdraw or move your money" sub="perpl api keys can’t, at any scope. only your passkey can." last />
        </View>

        <Tap onPress={() => a.go("/activity")} innerStyle={{ marginTop: 12, height: 56, borderRadius: 20, backgroundColor: well, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 }}>
          <Glyph name="magnifier" size={22} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: ink }}>see everything it did, on chain</Text>
          <Chevron />
        </Tap>
      </ScrollView>

      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 }}>
        {on ? (
          <Tap onPress={busy ? undefined : () => setConfirm(true)} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: "white", borderWidth: 1, borderColor: "#F2C6CB", alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
            <Text style={{ fontSize: 15.5, fontWeight: "700", color: red }}>{busy === "revoking" ? "taking the key back…" : "revoke the key"}</Text>
          </Tap>
        ) : (
          <Tap onPress={busy ? undefined : restore} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: ink, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>
            <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>{busy === "restoring" ? "making a new key…" : "turn the guard on"}</Text>
          </Tap>
        )}
        <Text style={{ textAlign: "center", fontSize: 11.5, fontWeight: "500", color: faint }}>{on ? "one fingerprint. the guard stops watching at once." : paused ? "one fingerprint turns forwarding back on and makes a fresh key." : "one fingerprint makes a new watch key."}</Text>
      </View>

      <Tray visible={confirm} onClose={() => setConfirm(false)}>
        <View style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>take the key back?</Text>
          <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>
            your passkey switches order forwarding off on perpl, so perpl refuses the guard’s key from then on. your positions stay open, but nobody adds margin to them.
          </Text>
          <Tap onPress={revoke} innerStyle={{ marginTop: 20, height: 54, borderRadius: 27, backgroundColor: red, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>revoke</Text>
          </Tap>
          <Tap onPress={() => setConfirm(false)} innerStyle={{ height: 46, alignItems: "center", justifyContent: "center", marginTop: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: muted }}>keep the guard on</Text>
          </Tap>
        </View>
      </Tray>
    </Screen>
  );
}
