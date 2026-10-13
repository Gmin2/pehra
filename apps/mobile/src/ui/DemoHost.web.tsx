// the web try page's stand ins for the phone: the passkey sheet with a drawn fingerprint for anything
// that would sign, and inside the phone on pehra.io a status bar and home bar
import { useEffect, useRef, useState } from "react";
import { View, Pressable } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import Svg, { Path, Circle, Rect, ClipPath, Defs, G } from "react-native-svg";
import { usePathname } from "expo-router";
import { Text } from "./Text";
import { BODY, BEAK } from "./PehraBird";
import { DEMO, onAsk } from "../web/demo";
import { framed, FRAME } from "../polyfills.web";

const ink = "#28243E", muted = "#706A7D", line = "#EEEAF2", violet = "#9E4DFD", green = "#23765A", paper = "#FAF8F2";

// nucleo ui/fingerprint
const PRINT = [
  "M5.078,3.462c1.052-.911,2.424-1.462,3.922-1.462,3.309,0,6,2.691,6,6,0,2.307-.363,4.373-.988,6.213",
  "M1.908,11.703c1.04-1.692,1.092-3.383,1.092-3.703,0-.912,.204-1.777,.57-2.552",
  "M11.87,10.142c-.278,2.234-.983,4.16-1.951,5.806",
  "M3.872,14.14c1.224-1.479,2.128-3.474,2.128-6.14,0-1.657,1.343-3,3-3,1.524,0,2.783,1.137,2.975,2.608",
  "M6.551,15.618c1.424-1.874,2.449-4.356,2.449-7.618",
];

function Print({ size, color, fill, p }: { size: number; color: string; fill: string; p: number }) {
  const lines = (c: string) => PRINT.map((d) => <Path key={d} d={d} fill="none" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />);
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Defs>
        <ClipPath id="read">
          <Rect x={0} y={18 * (1 - p)} width={18} height={18 * p} />
        </ClipPath>
      </Defs>
      {lines(color)}
      <G clipPath="url(#read)">{lines(fill)}</G>
    </Svg>
  );
}

type Step = "idle" | "reading" | "done";

function Sheet({ onDone, onRead }: { onDone: (ok: boolean) => void; onRead: () => void }) {
  const [step, setStep] = useState<Step>("idle");
  const [p, setP] = useState(0);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const read = () => {
    if (step !== "idle") return;
    setStep("reading");
    onRead();
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 750);
      setP(1 - (1 - k) ** 3);
      if (k < 1) { raf.current = requestAnimationFrame(tick); return; }
      setStep("done");
      setTimeout(() => onDone(true), 550);
    };
    raf.current = requestAnimationFrame(tick);
  };
  const ring = 2 * Math.PI * 42;
  const label = step === "idle" ? "touch the sensor" : step === "reading" ? "reading your fingerprint" : "verified";
  return (
    <Animated.View entering={SlideInDown.duration(280)} exiting={SlideOutDown.duration(200)} style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "white", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 22 + (framed ? FRAME.bottom : 0) }}>
      <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: line, marginBottom: 20 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: violet, alignItems: "center", justifyContent: "center" }}>
          <Svg width={28} height={28} viewBox="0 0 256 256">
            <Path d={BODY} fill={paper} />
            <Path d="M78,110H104 M138,110H164" stroke={violet} strokeWidth={9} strokeLinecap="round" />
            <Path d={BEAK} fill={violet} />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: ink }}>use your passkey for pehra</Text>
          <Text style={{ fontSize: 13, fontWeight: "500", color: muted }}>{DEMO.slice(0, 6)}····{DEMO.slice(-4)} · passkey on this phone</Text>
        </View>
      </View>

      <Pressable onPress={read} accessibilityRole="button" accessibilityLabel="touch the fingerprint sensor" style={{ alignSelf: "center", marginTop: 30, width: 96, height: 96, alignItems: "center", justifyContent: "center", cursor: step === "idle" ? "pointer" : "auto" } as object}>
        <Svg width={96} height={96} viewBox="0 0 96 96" style={{ position: "absolute" }}>
          <Circle cx={48} cy={48} r={42} fill={step === "done" ? "#E4F3EC" : "#F3ECFE"} />
          <Circle cx={48} cy={48} r={42} fill="none" stroke={step === "done" ? green : violet} strokeWidth={3} strokeLinecap="round" strokeDasharray={`${ring}`} strokeDashoffset={ring * (1 - p)} transform="rotate(-90 48 48)" />
        </Svg>
        {step === "done" ? (
          <Animated.View entering={FadeIn.duration(160)}>
            <Svg width={40} height={40} viewBox="0 0 16 16">
              <Path d="M3.5 8.4l3 3 6-6.8" stroke={green} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        ) : (
          <View>
            <Print size={52} color="#C9B3F2" fill={violet} p={p} />
          </View>
        )}
      </Pressable>
      <Text style={{ textAlign: "center", marginTop: 14, fontSize: 15, fontWeight: "700", color: step === "done" ? green : ink }}>{label}</Text>
      <Text style={{ textAlign: "center", marginTop: 4, fontSize: 12.5, fontWeight: "500", color: muted }}>a tap stands in for your finger. it all plays out on your{"\n"}own copy of the account, nothing reaches perpl</Text>

      <Pressable onPress={() => step === "idle" && onDone(false)} style={{ marginTop: 22, height: 48, borderRadius: 24, backgroundColor: "#F2F0F5", alignItems: "center", justifyContent: "center", opacity: step === "idle" ? 1 : 0.4 }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: ink }}>cancel</Text>
      </Pressable>
    </Animated.View>
  );
}

function StatusBar() {
  const light = usePathname() === "/";
  const c = light ? "white" : ink;
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
  return (
    <>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: FRAME.top, paddingHorizontal: 30, paddingTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 50 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: c }}>{time}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Svg width={16} height={12} viewBox="0 0 16 12">
            {[0, 1, 2, 3].map((i) => <Rect key={i} x={i * 4.2} y={9 - i * 3} width={3} height={3 + i * 3} rx={1} fill={c} />)}
          </Svg>
          <Svg width={16} height={12} viewBox="0 0 16 12">
            <Path d="M8 11.2l2.3-2.6a3.4 3.4 0 0 0-4.6 0z M3.4 6.2a6.8 6.8 0 0 1 9.2 0l-1.3 1.5a4.8 4.8 0 0 0-6.6 0z M1 3.5a10.4 10.4 0 0 1 14 0l-1.3 1.5a8.4 8.4 0 0 0-11.4 0z" fill={c} />
          </Svg>
          <Svg width={25} height={12} viewBox="0 0 25 12">
            <Rect x={0.75} y={0.75} width={20.5} height={10.5} rx={3} fill="none" stroke={c} strokeWidth={1.3} opacity={0.5} />
            <Rect x={2.5} y={2.5} width={14} height={7} rx={1.6} fill={c} />
            <Rect x={22.5} y={4} width={1.8} height={4} rx={0.9} fill={c} opacity={0.5} />
          </Svg>
        </View>
      </View>
      <View pointerEvents="none" style={{ position: "absolute", bottom: 6, alignSelf: "center", width: 120, height: 4, borderRadius: 2, backgroundColor: c, opacity: 0.85, zIndex: 50 }} />
    </>
  );
}

export default function DemoHost() {
  const [asking, setAsking] = useState(false);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  useEffect(() => onAsk(() => new Promise<boolean>((resolve) => { answer.current = resolve; setAsking(true); })), []);
  const reading = useRef(false);
  const done = (ok: boolean) => { if (!ok && reading.current) return; reading.current = false; setAsking(false); answer.current?.(ok); answer.current = null; };
  return (
    <>
      {framed && <StatusBar />}
      {asking && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 60 }}>
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,18,32,0.42)" }}>
            <Pressable style={{ flex: 1 }} onPress={() => done(false)} />
          </Animated.View>
          <Sheet onDone={done} onRead={() => { reading.current = true; }} />
        </View>
      )}
    </>
  );
}
