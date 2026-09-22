import Success from "../src/ui/Success";
import { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, useWindowDimensions } from "react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Header, Button, Tap, MorphText, s } from "../src/ui/components";
import { useLocalSearchParams } from "expo-router";
import { useApp } from "../src/ui/store";
import { space } from "../src/ui/theme";
import {
  CardStack,
  ChoiceCard,
  SquareCheck,
  WorkingGrid,
  AccountCard,
  Tooltip,
  HighlightTitle,
  LessonTray,
  Em,
  accent,
  muted,
  ink,
  type Lesson,
} from "../src/ui/Onboarding";
import { createAccount, signIn, type Session } from "../src/account";
import { prepareAccount } from "../src/trade";
import { enrollGuard } from "../src/guard";
import { registerPush } from "../src/push";
import { log } from "../src/log";
import { setOnboarded } from "../src/keys";

// family's onboarding from the reference recordings: choose, terms, working grid, ready card with
// its tooltip, education trays, the completed card with confetti. only the words are pehra's.
const TERMS = [
  "I understand that my passkey is my account. There is no seed phrase to lose and no password to reset.",
  "I understand that the guard may add margin from my balance to keep a position open, within limits I set.",
  "I understand that this is monad testnet. The dollars are test dollars, the trades are real trades on perpl testnet.",
  "I understand that pehra never holds my keys and cannot move my money out of my account.",
];
const LESSONS: Lesson[] = [
  {
    art: "shield",
    title: ["Before you trade, there’s one thing you should know…"],
    body: (
      <>
        On perpl a position closes by itself when its margin runs out. That is a <Em>liquidation</Em>, and it tends to
        happen while you sleep. The guard watches and tops up the margin first.
      </>
    ),
  },
  {
    art: "session",
    title: ["The guard keeps a trading session for you,", { u: "securely." }],
    body: (
      <>
        One signature from your passkey lets it add margin and place your orders, which is why a trade fills in about a
        second. You can turn it off any time.
      </>
    ),
  },
  {
    art: "lock",
    title: ["One last important thing…"],
    body: (
      <>
        The guard can never withdraw. Only your passkey can move money out of your account, and it <Em>asks you every time</Em>.
      </>
    ),
  },
];

export default function Onboarding() {
  const a = useApp(),
    { width } = useWindowDimensions(),
    step = a.onboarding,
    next = a.setOnboarding,
    [terms, setTerms] = useState<number[]>([]),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [tray, setTray] = useState(false),
    [guardOn, setGuardOn] = useState(false),
    session = useRef<Session | null>(null);
  const address = session.current?.address ?? a.stored?.address;
  // ?step= shows one step for design review without touching the passkey or the server
  const { step: preview, tray: trayPage } = useLocalSearchParams<{ step?: string; tray?: string }>();
  useEffect(() => {
    if (preview) next(preview);
    if (trayPage) setTray(true);
    else if (!["choose", "terms", "creating", "ready", "delegating", "done"].includes(step)) next("choose");
  }, [preview, trayPage]);
  const fail = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    log(`onboarding ${step} failed: ${msg.slice(0, 200)}`);
    setError(/cancel/i.test(msg) ? "Cancelled. Try again when you are ready." : msg.slice(0, 160));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };
  const create = async (existing: boolean) => {
    setError("");
    next("creating");
    try {
      const reuse = existing || !!a.stored;
      setProgress(reuse ? "Waiting for your passkey…" : "Making your passkey…");
      log(reuse ? "onboarding: sign in with the stored passkey" : "onboarding: creating a passkey");
      const t0 = Date.now();
      const sess = reuse ? await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined) : await createAccount();
      log(`onboarding: account ${sess.address} in ${Date.now() - t0}ms`);
      session.current = sess;
      a.setSession(sess);
      a.setStored({ address: sess.address, credentialId: sess.credentialId });
      Haptics.selectionAsync();
      const t1 = Date.now();
      await prepareAccount(sess, (p) => {
        setProgress(p === "funding your account" ? "Adding test dollars…" : p === "opening your perpl account" ? "Opening your perpl account…" : "Almost there…");
        log(`onboarding: ${p}`);
      });
      log(`onboarding: ready in ${Date.now() - t1}ms`);
      next("ready");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
      next(existing ? "choose" : "terms");
    }
  };
  const delegate = async () => {
    const sess = session.current;
    if (!sess) return next("choose");
    setError("");
    next("delegating");
    try {
      const t2 = Date.now();
      const r = await enrollGuard(sess);
      log(`onboarding: guard holds account ${r.account}, ${Date.now() - t2}ms`);
      registerPush(sess.address, log).catch(() => {});
      await setOnboarded(true);
      setGuardOn(true);
      next("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
      next("ready");
    }
  };
  const bare = ["creating", "ready", "delegating", "done"].includes(step);
  let action: undefined | { label: string; press: () => void; disabled?: boolean };
  if (step === "terms") action = { label: "I Understand, Continue", press: () => create(false), disabled: terms.length !== TERMS.length };
  if (step === "ready") action = { label: "Turn On the Guard", press: () => setTray(true) };
  if (step === "done") action = { label: "Done", press: () => a.go("/portfolio") };
  return (
    <Screen>
      {!bare && (
        <Header
          center={
            step === "terms" ? (
              <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={{ height: 3, borderRadius: 2, width: i === 3 ? 32 : 16, backgroundColor: i === 3 ? accent : "#ddd" }} />
                ))}
              </View>
            ) : undefined
          }
          left={step === "choose" ? "close" : "back"}
          onLeft={() => (step === "terms" ? next("choose") : a.back())}
          onRight={() => a.open("education", "Your account")}
        />
      )}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}>
        <Animated.View key={step} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={{ flex: 1 }}>
          {step === "choose" && (
            <View style={{ flex: 1 }}>
              <View style={{ backgroundColor: "#f7f6fa", paddingTop: 30, paddingBottom: 26 }}>
                <CardStack width={width} />
              </View>
              <View style={{ paddingHorizontal: 32, paddingTop: 28, alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: ink }}>Welcome to pehra</Text>
                <Text style={[space.copy, { textAlign: "center", fontSize: 15, lineHeight: 21 }]}>
                  Perps in your pocket. Your fingerprint is your account, no seed phrase and no gas.
                </Text>
              </View>
              <View style={{ paddingHorizontal: 24, paddingTop: 26, gap: 12 }}>
                <ChoiceCard icon="plus" color={accent} title="Create Account" subtitle="Make a passkey and open a funded testnet account." onPress={() => next("terms")} />
                <ChoiceCard icon="key" color="#23765A" title="Sign In" subtitle="Use the passkey you already made on this or another phone." onPress={() => create(true)} />
              </View>
            </View>
          )}
          {step === "terms" && (
            <View style={{ paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.6, marginTop: 36, marginBottom: 12, color: ink }}>Accept Terms</Text>
              <Text style={[space.copy, { fontSize: 16, lineHeight: 23 }]}>Please read and agree to the following terms before you continue.</Text>
              <View style={{ marginTop: 30, gap: 6 }}>
                {TERMS.map((t, i) => (
                  <Tap
                    key={t}
                    accessibilityLabel={t}
                    onPress={() => {
                      setTerms((o) => (o.includes(i) ? o.filter((x) => x !== i) : [...o, i]));
                      Haptics.selectionAsync();
                    }}
                    innerStyle={{ flexDirection: "row", alignItems: "flex-start", gap: 16, paddingVertical: 12 }}
                  >
                    <SquareCheck checked={terms.includes(i)} />
                    <Text style={{ flex: 1, fontSize: 14.5, lineHeight: 20, color: ink }}>{t}</Text>
                  </Tap>
                ))}
              </View>
            </View>
          )}
          {(step === "creating" || step === "delegating") && (
            <View style={{ flex: 1, justifyContent: "center", gap: 28, paddingTop: 80 }}>
              <Text style={{ fontSize: 20, fontWeight: "500", color: muted, textAlign: "center" }}>
                {step === "creating" ? "Creating Your Account" : "Waking the Guard"}
              </Text>
              <WorkingGrid width={width} />
              <View style={{ alignItems: "center", minHeight: 22 }}>
                <MorphText text={step === "creating" ? progress || "Doing some cryptographic magic…" : "One signature, no prompt…"} size={14} color={muted} />
              </View>
            </View>
          )}
          {step === "ready" && (
            <View style={{ flex: 1, justifyContent: "center", paddingTop: 70, gap: 22 }}>
              <HighlightTitle before="Your account is " word="ready" after="." />
              <View>
                <AccountCard width={width} address={address} balance="100 AUSD" pill="Turn On Guard" onPill={() => setTray(true)} />
                <Tooltip width={width} title="Let pehra keep watch" body="The guard adds margin before a position can be liquidated, even while your phone is in your pocket." />
              </View>
            </View>
          )}
          {step === "done" && (
            <View style={{ flex: 1, justifyContent: "center", paddingTop: 70, gap: 22 }}>
              <Success />
              <Text style={{ fontSize: 20, fontWeight: "600", textAlign: "center", color: ink }}>{guardOn ? "The Guard Is Watching" : "You’re All Set"}</Text>
              <AccountCard width={width} address={address} balance="100 AUSD" badge={guardOn ? "Guard On" : "Ready"} glyph="pehra-mark-paper" />
              <Text style={[space.copy, { textAlign: "center", fontSize: 14, paddingHorizontal: 40 }]}>
                {guardOn ? "It will tell you before anything goes wrong." : "You can turn on the guard later from its tab."}
              </Text>
            </View>
          )}
          {!!error && <Text style={{ color: "#B4474D", marginTop: 16, paddingHorizontal: 32, fontSize: 14, lineHeight: 20, textAlign: "center" }}>{error}</Text>}
        </Animated.View>
      </ScrollView>
      {step === "terms" && (
        <Text style={[space.small, { textAlign: "center", marginBottom: 4 }]}>By checking the boxes, you agree to these terms.</Text>
      )}
      {action && (
        <View style={[s.footer, { paddingHorizontal: 32 }]}>
          <Button color={accent} disabled={action.disabled} onPress={action.press}>
            {action.label}
          </Button>
        </View>
      )}
      {step === "ready" && (
        <Tap
          onPress={() => {
            void setOnboarded(true);
            next("done");
          }}
          innerStyle={{ alignItems: "center", paddingBottom: 14 }}
        >
          <Text style={{ color: muted, fontSize: 14 }}>Maybe Later</Text>
        </Tap>
      )}
      <LessonTray lessons={LESSONS} visible={tray} startPage={trayPage ? Number(trayPage) : 0} finalLabel="Turn On the Guard" onClose={() => setTray(false)} onDone={() => { setTray(false); void delegate(); }} />
    </Screen>
  );
}
