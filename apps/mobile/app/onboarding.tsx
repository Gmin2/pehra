import Success from "../src/ui/Success";
import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  Screen,
  Header,
  Button,
  Check,
  WalletCard,
  Tap,
  Icon,
  MorphText,
  s,
} from "../src/ui/components";
import { useApp, pehraAccount } from "../src/ui/store";
import { colors, space } from "../src/ui/theme";
import { createAccount, signIn, type Session } from "../src/account";
import { prepareAccount } from "../src/trade";
import { enrollGuard } from "../src/guard";
import { registerPush } from "../src/push";
import { log } from "../src/log";
import { setOnboarded } from "../src/keys";

const titles: Record<string, string> = {
  welcome: "Your face is your account",
  terms: "Before you start",
  creating: "Creating your account",
  ready: "Your account is ready",
  guard: "Let pehra keep watch",
  delegating: "Setting up the guard",
  done: "You’re all set",
};
const subtitles: Record<string, string> = {
  welcome:
    "One tap with your fingerprint or face. No seed phrase, no email, no gas. Wipe the app and sign in again, same account.",
  terms: "Three things worth knowing. Tap each one.",
  creating: "Your passkey makes the account. Then we fund it and open your perpl account.",
  ready: "Testnet dollars are in and perpl knows you. One more step.",
  guard:
    "The guard watches your positions while your phone is in your pocket and adds margin before the venue can liquidate you. It needs one signature to hold a session for you.",
  delegating: "One signature from your passkey, no prompt.",
  done: "Face id in, dollars in, the guard is awake.",
};
const stages = ["welcome", "terms", "creating", "ready", "guard", "done"];

export default function Onboarding() {
  const a = useApp(),
    step = a.onboarding,
    next = a.setOnboarding,
    [terms, setTerms] = useState<number[]>([]),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [returning, setReturning] = useState(false),
    session = useRef<Session | null>(null);
  const accent = step === "guard" || step === "delegating" ? colors.purple : colors.blue;
  const card = pehraAccount(session.current?.address ?? a.stored?.address ?? null);
  useEffect(() => {
    if (!stages.includes(step) && step !== "delegating") next("welcome");
  }, []);
  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    log(`onboarding ${step} failed: ${msg.slice(0, 200)}`);
    setError(msg.includes("Cancelled") || msg.includes("cancel") ? "Cancelled. Try again when you are ready." : msg.slice(0, 160));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };
  // the passkey ceremony, then funding and the perpl account. the card fills in as it goes.
  const create = async (existing: boolean) => {
    setError("");
    setReturning(existing);
    next("creating");
    try {
      // a retry after a failed funding step signs in with the passkey already made
      const reuse = existing || !!a.stored;
      setProgress(reuse ? "waiting for your passkey" : "making your passkey");
      log(reuse ? "onboarding: sign in with the stored passkey" : "onboarding: creating a passkey");
      const t0 = Date.now();
      const sess = reuse ? await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined) : await createAccount();
      log(`onboarding: account ${sess.address} in ${Date.now() - t0}ms`);
      session.current = sess;
      a.setSession(sess);
      a.setStored({ address: sess.address, credentialId: sess.credentialId });
      Haptics.selectionAsync();
      const t1 = Date.now();
      await prepareAccount(sess, (p) => { setProgress(p); log(`onboarding: ${p}`); });
      log(`onboarding: ready in ${Date.now() - t1}ms`);
      setProgress("");
      next("ready");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
      next(existing ? "welcome" : "terms");
    }
  };
  const delegate = async () => {
    const sess = session.current;
    if (!sess) return next("welcome");
    setError("");
    next("delegating");
    try {
      const t2 = Date.now();
      const r = await enrollGuard(sess);
      log(`onboarding: guard holds account ${r.account}, ${Date.now() - t2}ms`);
      registerPush(sess.address, log).catch(() => {});
      await setOnboarded(true);
      next("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
      next("guard");
    }
  };
  let action: undefined | { label: string; press: () => void; disabled?: boolean };
  if (step === "welcome") action = { label: "Continue with face id", press: () => next("terms") };
  if (step === "terms") action = { label: "Create account", press: () => create(false), disabled: terms.length !== 3 };
  if (step === "ready") action = { label: "Set up the guard", press: () => next("guard") };
  if (step === "guard") action = { label: "Let it watch", press: delegate };
  if (step === "done") action = { label: "Let’s go", press: () => a.go("/portfolio") };
  const busy = step === "creating" || step === "delegating";
  return (
    <Screen>
      <Header
        center={
          <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
            {stages.map((st, i) => (
              <View
                key={st}
                style={{
                  height: 3,
                  borderRadius: 2,
                  width: st === (step === "delegating" ? "guard" : step) ? 32 : 16,
                  backgroundColor: i <= stages.indexOf(step === "delegating" ? "guard" : step) ? accent : "#ddd",
                }}
              />
            ))}
          </View>
        }
        left={step === "welcome" ? "close" : "back"}
        onLeft={() => {
          if (busy) return;
          const map: Record<string, string> = { terms: "welcome", ready: "terms", guard: "ready", done: "guard" };
          if (map[step]) next(map[step]);
          else a.back();
        }}
        onRight={() => a.open("education", "Your account")}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 48, paddingBottom: 20 }}
      >
        <Animated.View key={step} entering={FadeIn.duration(160)} style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.6, marginTop: 40, marginBottom: 16 }}>
            {titles[step] || "Your account"}
          </Text>
          {subtitles[step] && (
            <Text style={[space.copy, { fontSize: 17, lineHeight: 24 }]}>{subtitles[step]}</Text>
          )}
          {step === "welcome" && (
            <View style={{ flex: 1, justifyContent: "center", minHeight: 300, gap: 24 }}>
              <WalletCard wallet={{ ...card, balance: "perps in your pocket" }} large />
              <Tap onPress={() => create(true)} innerStyle={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 15 }}>
                  Already have a pehra account? <Text style={{ color: accent, fontWeight: "600" }}>Sign in</Text>
                </Text>
              </Tap>
            </View>
          )}
          {step === "terms" && (
            <View style={{ marginTop: 35, gap: 10 }}>
              {[
                "My passkey is my account. There is no seed phrase to lose and no password to reset.",
                "The guard may add margin from my balance to keep a position alive. I set the limits.",
                "This is monad testnet. The dollars are test dollars, the trades are real trades on perpl testnet.",
              ].map((t, i) => (
                <Tap
                  key={t}
                  accessibilityLabel={t}
                  onPress={() => {
                    setTerms((old) => (old.includes(i) ? old.filter((x) => x !== i) : [...old, i]));
                    Haptics.selectionAsync();
                  }}
                  innerStyle={{ flexDirection: "row", alignItems: "center", gap: 15, paddingVertical: 18 }}
                >
                  <Check checked={terms.includes(i)} color={accent} />
                  <Text style={{ flex: 1, fontSize: 17, lineHeight: 24 }}>{t}</Text>
                </Tap>
              ))}
            </View>
          )}
          {step === "done" && <Success />}
          {["creating", "ready", "done", "delegating"].includes(step) && (
            <View style={{ flex: 1, justifyContent: "center", minHeight: 350, gap: 24 }}>
              <WalletCard
                wallet={{
                  ...card,
                  icon: step === "done" ? "pehra-watching-two-tone" : step === "delegating" ? "pehra-alert-two-tone" : "pehra-dozing-two-tone",
                  balance: step === "creating" ? (returning ? "signing in" : "new account") : card.balance,
                }}
                large
              />
              {busy ? (
                <View style={{ alignItems: "center", gap: 14 }}>
                  <ActivityIndicator color={accent} size="large" />
                  {!!progress && <MorphText text={progress} size={15} color={colors.muted} />}
                </View>
              ) : (
                <View style={{ alignSelf: "center", padding: 15, backgroundColor: step === "done" ? "#f1e9ff" : "#eaffed", borderRadius: 30 }}>
                  <Icon name={step === "done" ? "shield" : "check"} color={step === "done" ? colors.purple : colors.green} size={30} />
                </View>
              )}
            </View>
          )}
          {step === "guard" && (
            <View style={{ alignItems: "center", paddingVertical: 40, gap: 26 }}>
              <View style={{ padding: 30, borderRadius: 32, backgroundColor: "#f1e9ff" }}>
                <Icon name="shield" size={72} color={colors.purple} />
              </View>
              <View style={{ gap: 12, alignSelf: "stretch" }}>
                {[
                  ["Alerts at 5% from liquidation", "bell"],
                  ["Adds up to 20 AUSD a day, off any time", "rocket"],
                  ["Never withdraws. Only your passkey can", "lock"],
                ].map(([t, icon]) => (
                  <View key={t} style={[space.row, { gap: 14 }]}>
                    <Icon name={icon} size={18} color={colors.purple} />
                    <Text style={{ fontSize: 15, color: colors.ink, flex: 1 }}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          {!!error && (
            <Text style={{ color: colors.red, marginTop: 18, fontSize: 14, lineHeight: 20 }}>{error}</Text>
          )}
        </Animated.View>
      </ScrollView>
      {action && (
        <View style={[s.footer, { paddingHorizontal: 40 }]}>
          <Button color={accent} disabled={action.disabled} onPress={action.press}>
            {action.label}
          </Button>
        </View>
      )}
      {step === "guard" && (
        <Tap onPress={() => { void setOnboarded(true); next("done"); }} innerStyle={{ alignItems: "center", paddingBottom: 14 }}>
          <Text style={{ color: colors.muted, fontSize: 14 }}>Not now</Text>
        </Tap>
      )}
    </Screen>
  );
}
