import Success from "../src/ui/Success";
import { useState, useEffect, useRef } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { Text } from "../src/ui/Text";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Header, Button, Tap, MorphText, s } from "../src/ui/components";
import { useLocalSearchParams } from "expo-router";
import { useApp } from "../src/ui/store";
import { space } from "../src/ui/theme";
import {
  PositionStack,
  WorkSteps,
  ChoiceCard,
  SquareCheck,
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
import { money } from "../src/live";
import { enrollGuard } from "../src/guard";
import { registerPush } from "../src/push";
import { log } from "../src/log";
import { setOnboarded } from "../src/keys";

// family's onboarding from the reference recordings: choose, terms, working grid, ready card with
// its tooltip, education trays, the completed card with confetti. only the words are pehra's.
const TERMS = [
  "I understand that perps are leveraged. A small move in price can close my position.",
  "I understand that the guard adds margin within limits I set, and that I can turn it off.",
  "I understand that my passkey is my account and pehra never holds my keys.",
  "I understand that this is monad testnet, with test dollars on perpl testnet.",
]
const LESSONS: Lesson[] = [
  {
    art: "shield",
    title: ["Most liquidations happen while you’re", { u: "away.", mark: "circle" }],
    body: (
      <>
        When a position runs out of margin, perpl closes it for you, and it rarely waits for you to wake up. The guard
        watches the <Em>distance to liquidation</Em> and adds margin before it gets there.
      </>
    ),
  },
  {
    art: "session",
    title: ["One signature, and every trade fills in about a", { u: "second.", mark: "underline" }],
    body: (
      <>
        Your passkey lets the guard keep a trading session for you. It adds margin and places your orders, no wallet
        popup, no gas. You can turn it off any time.
      </>
    ),
  },
  {
    art: "lock",
    title: ["Your money stays", { u: "yours.", mark: "highlight" }],
    body: (
      <>
        The guard can add margin, but it can never withdraw. Only your passkey moves money out of your account, and it
        <Em> asks you every time</Em>.
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
    [balance, setBalance] = useState(100),
    [error, setError] = useState(""),
    [tray, setTray] = useState(false),
    [guardOn, setGuardOn] = useState(false),
    [phase, setPhase] = useState(0),
    [startedAt, setStartedAt] = useState(Date.now()),
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
    setPhase(0);
    setStartedAt(Date.now());
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
      setPhase(1);
      const t1 = Date.now();
      const info = await prepareAccount(sess, (p) => {
        if (p === "opening your perpl account") setPhase(2);
        log(`onboarding: ${p}`);
      });
      // a returning account shows what it really holds, a new one the 100 it was opened with
      setBalance(Number(info.balanceCns) / 1e6);
      log(`onboarding: ready in ${Date.now() - t1}ms`);
      setPhase(3);
      await new Promise((r) => setTimeout(r, 450));
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
    setPhase(0);
    setStartedAt(Date.now());
    next("delegating");
    try {
      const t2 = Date.now();
      const r = await enrollGuard(sess);
      setPhase(2);
      log(`onboarding: guard holds account ${r.account}, ${Date.now() - t2}ms`);
      registerPush(sess.address, log).catch(() => {});
      await setOnboarded(true);
      setGuardOn(true);
      setPhase(3);
      next("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
      next("ready");
    }
  };
  const labels = step === "delegating" ? ["passkey signature", "guard session opened", "notifications on"] : ["passkey ready", "test dollars in", "perpl account open"];
  const workSteps = labels.map((label, i) => ({ label, done: phase > i, active: phase === i }));
  // preview only: walk the steps on a timer so the screen can be judged without a passkey
  useEffect(() => {
    if (!preview || (step !== "creating" && step !== "delegating")) return;
    setPhase(0);
    setStartedAt(Date.now());
    const ts = [900, 2100, 3300].map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => ts.forEach(clearTimeout);
  }, [preview, step]);
  const bare = ["creating", "ready", "delegating", "done"].includes(step);
  let action: undefined | { label: string; press: () => void; disabled?: boolean };
  if (step === "terms") action = { label: "i understand, continue", press: () => create(false), disabled: terms.length !== TERMS.length };
  if (step === "ready") action = { label: "turn on the guard", press: () => setTray(true) };
  if (step === "done") action = { label: "place your first trade", press: () => a.go("/portfolio") };
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
              <View style={{ backgroundColor: "#F0EDF3", paddingTop: 30, paddingBottom: 26 }}>
                <PositionStack width={width} />
              </View>
              <View style={{ paddingHorizontal: 32, paddingTop: 28, alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: "600", letterSpacing: -0.5, color: ink, textAlign: "center" }}>trade perps without watching the chart</Text>
                <Text style={[space.copy, { textAlign: "center", fontSize: 15, lineHeight: 21 }]}>
                  a passkey in, dollars in, and a guard that keeps you from getting liquidated at 3am.
                </Text>
              </View>
              <View style={{ paddingHorizontal: 24, paddingTop: 26, gap: 12 }}>
                <ChoiceCard icon="plus" color={accent} title="create account" subtitle="make a passkey and open a funded testnet account." onPress={() => next("terms")} />
                <ChoiceCard icon="key" color={ink} title="sign in" subtitle="use the passkey you already made on this or another phone." onPress={() => create(true)} />
              </View>
            </View>
          )}
          {step === "terms" && (
            <View style={{ paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 24, fontWeight: "600", letterSpacing: -0.6, marginTop: 36, marginBottom: 12, color: ink }}>before you start</Text>
              <Text style={[space.copy, { fontSize: 16, lineHeight: 23 }]}>four things worth knowing. tap each one.</Text>
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
            <View style={{ flex: 1, justifyContent: "center", gap: 34, paddingTop: 60 }}>
              <Text style={{ fontSize: 22, fontWeight: "600", color: ink, textAlign: "center", letterSpacing: -0.5 }}>
                {step === "creating" ? "setting up your account" : "waking the guard"}
              </Text>
              <WorkSteps startedAt={startedAt} steps={workSteps} />
            </View>
          )}
          {step === "ready" && (
            <View style={{ flex: 1, justifyContent: "center", paddingTop: 70, gap: 22 }}>
              <HighlightTitle before="your account is " word="funded" after="." />
              <View>
                <AccountCard width={width} address={address} balance={money(balance) + " AUSD"} pill="turn on guard" onPill={() => setTray(true)} />
                <Tooltip width={width} title="turn on the guard" body="most liquidations happen while you’re away. the guard steps in first." />
              </View>
            </View>
          )}
          {step === "done" && (
            <View style={{ flex: 1, justifyContent: "center", paddingTop: 70, gap: 22 }}>
              <Success />
              <Text style={{ fontSize: 20, fontWeight: "600", textAlign: "center", color: ink }}>{guardOn ? "the guard is watching" : "you’re all set"}</Text>
              <AccountCard width={width} address={address} balance={money(balance) + " AUSD"} badge={guardOn ? "guard on" : "ready"} glyph="pehra-mark-paper" />
              <Text style={[space.copy, { textAlign: "center", fontSize: 14, paddingHorizontal: 40 }]}>
                {guardOn ? "it will tell you before anything goes wrong." : "you can turn the guard on later in settings."}
              </Text>
            </View>
          )}
          {!!error && <Text style={{ color: "#B4474D", marginTop: 16, paddingHorizontal: 32, fontSize: 14, lineHeight: 20, textAlign: "center" }}>{error}</Text>}
        </Animated.View>
      </ScrollView>
      {step === "terms" && (
        <Text style={[space.small, { textAlign: "center", marginBottom: 4 }]}>by checking the boxes you agree to these terms.</Text>
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
          <Text style={{ color: muted, fontSize: 14 }}>maybe later</Text>
        </Tap>
      )}
      <LessonTray lessons={LESSONS} visible={tray} startPage={trayPage ? Number(trayPage) : 0} finalLabel="turn on the guard" onClose={() => setTray(false)} onDone={() => { setTray(false); void delegate(); }} />
    </Screen>
  );
}
