// fund: the ways money comes into pehra, light like the rest (tmp/claude/preview/fund-b.png). usdc in the
// wallet goes through agora's instant settlement pair 1:1 into perpl, ausd goes straight in, testnet
// can ask for test usdc, and agora routes (bank or another chain) sit greyed as the later lane. the
// amount opens in a tray, and the money landing is a tray of real block ticks (fund-c.png).
import { useCallback, useEffect, useRef, useState } from "react";
import { View, ScrollView } from "react-native";
import { Stack } from "expo-router";
import Animated, { FadeIn, FadeInDown, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, Easing } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Screen, Tap, IconButton, Chevron } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Coin } from "../src/ui/Coin";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { PehraBird } from "../src/ui/PehraBird";
import { useApp } from "../src/ui/store";
import { money } from "../src/live";
import { log } from "../src/log";
import { signIn, type Session } from "../src/account";
import { walletBalances, pool, fundFromUsdc, depositAusd, withdrawToUsdc, testUsdc, waitFinal, ensureGas, type Wallet, type Moved } from "../src/fund";
import type { PairState } from "@pehra/perpl";
import { Tray } from "../src/ui/Trade";
import { reportActivity } from "../src/guard";
import { CountUp, Roll } from "../src/ui/Position";

const ink = "#28243E",
  muted = "#706A7D",
  faint = "#B9B2C5",
  violet = "#9E4DFD",
  green = "#23765A",
  red = "#B4474D",
  line = "#EEEAF2",
  well = "#F0EDF3",
  mist = "#EFE5FF",
  paper = "#FAF8F2";

type Kind = "usdc" | "ausd" | "withdraw";
const kindCopy: Record<Kind, { title: string; from: string; verb: string }> = {
  usdc: { title: "add from usdc", from: "usdc", verb: "add" },
  ausd: { title: "add from ausd", from: "ausd", verb: "add" },
  withdraw: { title: "withdraw to usdc", from: "ausd in perpl", verb: "withdraw" },
};

export default function Fund() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? null;
  const [w, setW] = useState<Wallet | null>(null),
    [p, setP] = useState<PairState | null>(null),
    [kind, setKind] = useState<Kind | null>(null),
    [landing, setLanding] = useState<{ kind: Kind; amount: number } | null>(null),
    [moved, setMoved] = useState<Moved | null>(null),
    [final, setFinal] = useState(false),
    [failed, setFailed] = useState(""),
    [drip, setDrip] = useState<"idle" | "sending" | "sent">("idle");

  const refresh = useCallback(() => {
    if (!address) return;
    walletBalances(address).then(setW).catch(() => {});
    pool().then(setP).catch(() => {});
  }, [address]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  // the passkey signs the batch, so a returning user signs in first, one sheet
  const session = async (): Promise<Session> => {
    if (a.session) return a.session;
    const s = await signIn(a.stored ? { credentialId: a.stored.credentialId } : undefined);
    a.setSession(s);
    return s;
  };

  const go = async (k: Kind, amount: number) => {
    setMoved(null);
    setFinal(false);
    setFailed("");
    setLanding({ kind: k, amount });
    try {
      const [s, fundedAt] = await Promise.all([session(), address ? ensureGas(address, w?.mon ?? 0) : Promise.resolve(undefined)]);
      const r = k === "usdc" ? await fundFromUsdc(s, amount, fundedAt) : k === "ausd" ? await depositAusd(s, amount, fundedAt) : await withdrawToUsdc(s, amount, fundedAt);
      log(`fund ${k} ${amount}: ${r.hashes.length} txs, blocks ${r.blocks.join(",")}, ${r.ms}ms`);
      if (address) {
        const tx = r.hashes[r.hashes.length - 1];
        void reportActivity(address, k === "withdraw" ? { kind: "withdrew", amount: r.out, tx, text: `${amount} ausd out of perpl to ${r.out} usdc through agora` } : { kind: "funded", amount: r.out, tx, text: k === "usdc" ? `${amount} usdc to ${r.out} ausd through agora` : `${amount} ausd from your wallet` });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMoved(r);
      refresh();
      await waitFinal(r.block);
      setFinal(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`fund ${k} ${amount} failed: ${msg}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFailed(/cancel/i.test(msg) ? "the passkey sheet was closed" : "it didn’t go through, nothing moved");
    }
  };

  const askTestUsdc = async () => {
    if (!address || drip === "sending") return;
    setDrip("sending");
    Haptics.selectionAsync();
    try {
      const r = await testUsdc(address);
      log(`test usdc ${JSON.stringify(r)}`);
      setDrip("sent");
      refresh();
    } catch (e) {
      log(`test usdc failed: ${e instanceof Error ? e.message : e}`);
      setDrip("idle");
      a.toast("the faucet is busy, try again in a bit");
    }
  };

  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, justifyContent: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} color={ink} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
        <Animated.View entering={FadeInDown.duration(380).reduceMotion(ReduceMotion.System)} style={{ paddingHorizontal: 12 }}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ borderRadius: 24, borderWidth: 3, borderColor: paper }}>
              <Coin symbol="USDC" size={40} />
            </View>
            <View style={{ marginLeft: -12, borderRadius: 24, borderWidth: 3, borderColor: paper }}>
              <Coin symbol="AUSD" size={40} />
            </View>
          </View>
          <Text style={[heading, { marginTop: 18 }]}>add money to pehra.</Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={heading}>usdc comes in </Text>
            <Rough type="underline" padding={1} strokeWidth={2.4} delay={450} duration={500}>
              <Text style={heading}>1:1.</Text>
            </Rough>
          </View>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>agora swaps it to ausd at exactly {p ? p.price.toFixed(4) : "1.0000"}, {p && p.fee > 0 ? `${(p.fee * 100).toFixed(2)}% fee` : "no fee"}, and it lands in your perpl account.</Text>
        </Animated.View>

        <View style={{ gap: 10, marginTop: 22 }}>
          <Option index={0} icon={<Coin symbol="USDC" size={36} />} title="usdc in your wallet" sub={w ? `${money(w.usdc)} · instant through agora` : "checking your wallet"} right={<Text style={{ fontSize: 13, fontWeight: "700", color: green }}>1:1</Text>} onPress={w && w.usdc > 0 && !p?.paused ? () => setKind("usdc") : undefined} />
          <Option index={1} icon={<Coin symbol="AUSD" size={36} />} title="ausd in your wallet" sub={w ? `${money(w.ausd)} · straight in` : "checking your wallet"} onPress={w && w.ausd > 0 ? () => setKind("ausd") : undefined} />
          <Option
            index={2}
            icon={<Glyph name="magic-wand-sparkle" size={30} />}
            title="get test usdc"
            sub={drip === "sending" ? "sending 50 usdc…" : drip === "sent" ? "50 usdc is in your wallet" : "50 usdc from the testnet faucet"}
            right={<Pill label="testnet" />}
            onPress={drip === "idle" ? askTestUsdc : undefined}
          />
          <Option index={3} icon={<Glyph name="credit-cards" size={30} color={faint} />} title="bank or another chain" sub="agora routes · needs a verified account" right={<Text style={{ fontSize: 11.5, fontWeight: "600", color: faint }}>later</Text>} dim onPress={() => a.toast("agora routes need a verified account, that comes after testnet")} />
        </View>
        {p && (
          <Animated.View entering={FadeIn.delay(500)}>
            <Text style={{ textAlign: "center", marginTop: 18, fontSize: 12, fontWeight: "500", color: p.paused ? red : faint }}>
              {p.paused ? "the pool is paused, usdc can’t come in right now" : `pool: ${short(p.usdcReserve)} usdc · ${short(p.ausdReserve)} ausd · not paused`}
            </Text>
          </Animated.View>
        )}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Tap onPress={w && w.perpl > 0 ? () => setKind("withdraw") : undefined} innerStyle={{ height: 56, borderRadius: 28, backgroundColor: well, alignItems: "center", justifyContent: "center", opacity: w && w.perpl > 0 ? 1 : 0.5 }}>
          <Text style={{ fontSize: 15.5, fontWeight: "600", color: ink }}>withdraw to usdc</Text>
        </Tap>
      </View>

      {/* one tray for both steps: android draws a second modal black if it opens while the first closes */}
      <Tray visible={!!kind || !!landing} onClose={() => { if (!landing || moved || failed) { setKind(null); setLanding(null); } }}>
        {landing ? (
          <LandedBody landing={landing} moved={moved} final={final} failed={failed} onClose={() => { setKind(null); setLanding(null); }} onTrade={() => { setKind(null); setLanding(null); a.go("/portfolio"); }} />
        ) : kind ? (
          <AmountBody kind={kind} max={kind === "usdc" ? w?.usdc ?? 0 : kind === "ausd" ? w?.ausd ?? 0 : w?.perpl ?? 0} onGo={go} />
        ) : null}
      </Tray>
    </Screen>
  );
}

const short = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + "m" : n >= 1e3 ? Math.round(n / 1e3) + "k" : n.toFixed(0));

function Pill({ label }: { label: string }) {
  return (
    <View style={{ height: 24, borderRadius: 12, paddingHorizontal: 10, backgroundColor: mist, justifyContent: "center" }}>
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: violet }}>{label}</Text>
    </View>
  );
}

function Option({ icon, title, sub, right, onPress, dim, index }: { icon: React.ReactNode; title: string; sub: string; right?: React.ReactNode; onPress?: () => void; dim?: boolean; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(200 + index * 70).springify().damping(20).reduceMotion(ReduceMotion.System)}>
      <Tap onPress={onPress} disabled={!onPress && !dim} innerStyle={{ height: 72, borderRadius: 22, backgroundColor: dim ? "#FDFCFA" : "white", borderWidth: 1, borderColor: line, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 14, opacity: dim ? 0.6 : 1 }}>
        <View style={{ width: 40, alignItems: "center" }}>{icon}</View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>{title}</Text>
          <Text style={{ fontSize: 12, fontWeight: "500", color: muted, fontVariant: ["tabular-nums"] }}>{sub}</Text>
        </View>
        {right}
        {onPress && !dim && <Chevron />}
      </Tap>
    </Animated.View>
  );
}

// how much: the amount big, a few quick picks, one line about the rate, one button
function AmountBody({ kind, max, onGo }: { kind: Kind; max: number; onGo: (k: Kind, amount: number) => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText(String(Math.min(25, Math.floor(max))));
  }, [kind]);
  const c = kindCopy[kind],
    amount = Number(text) || 0,
    ok = amount > 0 && amount <= max + 1e-9;
  const quick = [10, 25].filter((x) => x < max);
  return (
    <Animated.View entering={FadeIn.duration(180)}>
      <View style={{ paddingHorizontal: 8, gap: 4 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: ink }}>{c.title}</Text>
        <Text style={{ fontSize: 13.5, fontWeight: "500", color: muted }}>
          {money(max)} {c.from} {kind === "withdraw" ? "you can take out" : "in your wallet"}
        </Text>
      </View>
      <View style={{ alignItems: "center", marginTop: 20, flexDirection: "row", justifyContent: "center" }}>
        <Roll text={"$" + (text || "0")} style={{ fontFamily: "Manrope_700Bold", fontSize: 50, color: amount > max ? red : text ? ink : faint, letterSpacing: -1 }} />
      </View>
      <Text style={{ textAlign: "center", marginTop: 4, fontSize: 13.5, fontWeight: "600", color: muted }}>
        {kind === "ausd" ? `${amount} ausd straight into perpl` : kind === "usdc" ? `${amount} usdc → ${amount} ausd at 1.0000, no fee` : `${amount} ausd → ${amount} usdc at 1.0000, no fee`}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 16 }}>
        {quick.map((q) => (
          <Chip key={q} label={`$${q}`} on={amount === q} onPress={() => setText(String(q))} />
        ))}
        <Chip label="max" on={amount === Math.floor(max * 100) / 100} onPress={() => setText(String(Math.floor(max * 100) / 100))} />
      </View>
      <Pad value={text} onChange={setText} />
      <Tap onPress={ok ? () => onGo(kind, amount) : undefined} innerStyle={{ marginTop: 8, height: 54, borderRadius: 27, backgroundColor: ok ? ink : faint, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{ok ? `${c.verb} ${amount} ${kind === "withdraw" ? "usdc" : "ausd"}` : amount > max ? "more than you have" : "enter an amount"}</Text>
      </Tap>
    </Animated.View>
  );
}

// the number pad, light, inside the tray so no keyboard ever covers it
function Pad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    Haptics.selectionAsync();
    if (k === "back") return onChange(value.slice(0, -1));
    if (k === "." && value.includes(".")) return;
    if (value.includes(".") && value.split(".")[1].length >= 2) return;
    if (value.replace(".", "").length >= 7) return;
    onChange(value === "0" && k !== "." ? k : (value || (k === "." ? "0" : "")) + k);
  };
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 14 }}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
        <Tap key={k} onPress={() => press(k)} accessibilityLabel={k === "back" ? "delete" : k} style={{ width: "33.33%" }} innerStyle={{ height: 52, alignItems: "center", justifyContent: "center" }}>
          {k === "back" ? <Text style={{ fontSize: 22, fontWeight: "600", color: ink }}>‹</Text> : <Text style={{ fontSize: 24, fontWeight: "600", color: ink }}>{k}</Text>}
        </Tap>
      ))}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Tap onPress={() => { Haptics.selectionAsync(); onPress(); }} innerStyle={{ height: 38, paddingHorizontal: 18, borderRadius: 19, backgroundColor: on ? ink : well, justifyContent: "center" }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: on ? "white" : ink }}>{label}</Text>
    </Tap>
  );
}

// the money landing: the coins with a line that fills across, the amount counting up, and three ticks
// that land with the real blocks
function LandedBody({ landing, moved, final, failed, onClose, onTrade }: { landing: { kind: Kind; amount: number }; moved: Moved | null; final: boolean; failed: string; onClose: () => void; onTrade: () => void }) {
  const flow = useSharedValue(0);
  const eyes = useSharedValue(0.3),
    glance = useSharedValue(0);
  useEffect(() => {
    flow.set(0);
    if (!landing) return;
    flow.set(withTiming(moved ? 1 : 0.45, { duration: moved ? 500 : 2200, easing: Easing.out(Easing.cubic) }));
    if (moved) eyes.set(withTiming(1, { duration: 400 }));
  }, [landing, moved, flow, eyes]);
  const bar1 = useAnimatedStyle(() => ({ width: `${Math.min(1, flow.get() * 2) * 100}%` }));
  const bar2 = useAnimatedStyle(() => ({ width: `${Math.max(0, flow.get() * 2 - 1) * 100}%` }));
  const k = landing.kind,
    chain = k === "withdraw" ? ["pehra", "AUSD", "USDC"] : k === "usdc" ? ["USDC", "AUSD", "pehra"] : ["AUSD", "pehra"];
  const node = (c: string) =>
    c === "pehra" ? (
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: violet, alignItems: "center", justifyContent: "center" }}>
        <PehraBird size={32} open={eyes} shift={glance} />
      </View>
    ) : (
      <Coin symbol={c} size={40} />
    );
  const steps =
    k === "usdc"
      ? [["swapped at agora", moved ? `1:1 · block …${String(moved.blocks[1]).slice(-3)}` : ""], ["into perpl", moved ? `block …${String(moved.blocks[3]).slice(-3)}` : ""]]
      : k === "ausd"
        ? [["into perpl", moved ? `block …${String(moved.blocks[1]).slice(-3)}` : ""]]
        : [["out of perpl", moved ? `block …${String(moved.blocks[0]).slice(-3)}` : ""], ["swapped at agora", moved ? `1:1 · block …${String(moved.blocks[2]).slice(-3)}` : ""]];
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <View style={{ backgroundColor: "white", borderRadius: 24, paddingVertical: 22, alignItems: "center", gap: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {chain.map((c, i) => (
            <View key={c} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {node(c)}
              {i < chain.length - 1 && (
                <View style={{ width: 30, height: 3, borderRadius: 2, backgroundColor: well, overflow: "hidden" }}>
                  <Animated.View style={[{ height: 3, backgroundColor: violet }, i === 0 ? bar1 : bar2]} />
                </View>
              )}
            </View>
          ))}
        </View>
        {failed ? (
          <Text style={{ fontSize: 15, fontWeight: "700", color: red, paddingHorizontal: 16, textAlign: "center" }}>{failed}</Text>
        ) : moved ? (
          <>
            <CountUp value={moved.out} prefix="+$" style={{ fontFamily: "Manrope_700Bold", fontSize: 40, color: ink }} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: green }}>
              {k === "withdraw" ? "in your wallet as usdc" : "in your perpl account"} in {(moved.ms / 1000).toFixed(1)}s
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: "Manrope_700Bold", fontSize: 40, color: faint }}>${landing.amount.toFixed(2)}</Text>
            <Text style={{ fontSize: 13, fontWeight: "600", color: muted }}>sign with your passkey, then it moves</Text>
          </>
        )}
      </View>
      <View style={{ marginTop: 16, gap: 14, paddingHorizontal: 8 }}>
        {steps.map(([title, sub], i) => (
          <Step key={title} title={title} sub={sub} done={!!moved} delay={i * 180} />
        ))}
        <Step title="final" sub={final ? "3 blocks later" : ""} done={final} delay={0} />
      </View>
      <Tap onPress={moved ? onTrade : onClose} innerStyle={{ marginTop: 20, height: 54, borderRadius: 27, backgroundColor: ink, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: "white" }}>{failed ? "close" : moved ? (k === "withdraw" ? "done" : "trade with it") : "working…"}</Text>
      </Tap>
    </Animated.View>
  );
}

function Step({ title, sub, done, delay }: { title: string; sub: string; done: boolean; delay: number }) {
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (done) t.current = setTimeout(() => { setOn(true); Haptics.selectionAsync(); }, delay);
    else setOn(false);
    return () => void (t.current && clearTimeout(t.current));
  }, [done, delay]);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {on ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: green, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "white", fontSize: 13, fontWeight: "700" }}>✓</Text>
        </Animated.View>
      ) : (
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: line }} />
      )}
      <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: on ? ink : faint }}>{title}</Text>
      <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }}>{on ? sub : ""}</Text>
    </View>
  );
}
