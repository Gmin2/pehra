// receive (tmp/claude/preview/recv-a.png, addr2.png): a sentence, the qr of your address drawn in
// dots with the bird in the middle, the address on one line with copy, and what can be sent here.
import { useMemo, useState } from "react";
import { View, ScrollView, Share, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import Svg, { Circle, Rect, G } from "react-native-svg";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInDown, ReduceMotion, useSharedValue } from "react-native-reanimated";
import QRCode from "qrcode";
import { Screen, Tap, IconButton } from "../src/ui/components";
import { Text } from "../src/ui/Text";
import { Coin } from "../src/ui/Coin";
import { Glyph } from "../src/ui/Glyph";
import { Rough } from "../src/ui/Rough";
import { PehraBird } from "../src/ui/PehraBird";
import { useApp } from "../src/ui/store";

const ink = "#28243E",
  muted = "#706A7D",
  violet = "#9E4DFD",
  green = "#23765A",
  amber = "#9A6B1C",
  line = "#EEEAF2",
  well = "#F0EDF3",
  mist = "#EFE5FF";

// the qr as dots with rounded eyes and a clear middle for the bird; error correction H leaves room
function Qr({ value, size }: { value: string; size: number }) {
  const { n, dots } = useMemo(() => {
    const q = QRCode.create(value, { errorCorrectionLevel: "H" });
    const n = q.modules.size,
      mid = n / 2,
      hole = 5.5;
    const eye = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const dots: [number, number][] = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (!q.modules.get(r, c) || eye(r, c)) continue;
        if (Math.abs(r - mid + 0.5) < hole && Math.abs(c - mid + 0.5) < hole) continue;
        dots.push([r, c]);
      }
    return { n, dots };
  }, [value]);
  const cell = size / n,
    cs = cell * 5.5 * 1.7;
  const eyes = useSharedValue(1),
    glance = useSharedValue(0);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {dots.map(([r, c]) => (
          <Circle key={r * n + c} cx={c * cell + cell / 2} cy={r * cell + cell / 2} r={cell * 0.42} fill={ink} />
        ))}
        {[
          [0, 0],
          [0, n - 7],
          [n - 7, 0],
        ].map(([r, c]) => (
          <G key={r + ":" + c}>
            <Rect x={c * cell + cell * 0.5} y={r * cell + cell * 0.5} width={cell * 6} height={cell * 6} rx={cell * 1.8} fill="none" stroke={ink} strokeWidth={cell} />
            <Rect x={c * cell + cell * 2} y={r * cell + cell * 2} width={cell * 3} height={cell * 3} rx={cell} fill={violet} />
          </G>
        ))}
        <Rect x={size / 2 - cs / 2} y={size / 2 - cs / 2} width={cs} height={cs} rx={cs * 0.3} fill={violet} />
      </Svg>
      <View style={{ position: "absolute", left: size / 2 - cs * 0.4, top: size / 2 - cs * 0.4 + 1 }}>
        <PehraBird size={cs * 0.8} open={eyes} shift={glance} />
      </View>
    </View>
  );
}

export default function Receive() {
  const a = useApp(),
    address = a.stored?.address ?? a.session?.address ?? "",
    { width } = useWindowDimensions(),
    [copied, setCopied] = useState(false);
  const copy = () => {
    if (!address) return;
    Clipboard.setStringAsync(address);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = () => address && Share.share({ message: address });
  const heading = { fontFamily: "Manrope_700Bold", fontSize: 24, color: ink, letterSpacing: -0.4 };
  const qrSize = Math.min(230, width - 160);
  const mono = { fontFamily: "monospace", fontSize: 12.4 };
  return (
    <Screen>
      <Stack.Screen options={{ animation: "slide_from_right" }} />
      <View style={{ height: 60, justifyContent: "center", paddingHorizontal: 12 }}>
        <IconButton name="back" label="Back" onPress={a.back} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20 }}>
        <Animated.View entering={FadeInDown.duration(300).reduceMotion(ReduceMotion.System)}>
          <Text style={heading}>send usdc or ausd</Text>
          <Rough type="underline" padding={1} strokeWidth={2.4} delay={350} duration={500}>
            <Text style={heading}>to your wallet.</Text>
          </Rough>
          <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 20, fontWeight: "500", color: muted }}>from any wallet on monad. it lands here, then you add it to perpl from fund.</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(120).duration(300).reduceMotion(ReduceMotion.System)} style={{ alignSelf: "center", marginTop: 24, backgroundColor: "white", borderRadius: 28, padding: 14 }}>
          {address ? <Qr value={address} size={qrSize} /> : <View style={{ width: qrSize, height: qrSize, borderRadius: 16, backgroundColor: well }} />}
        </Animated.View>

        <Tap onPress={copy} innerStyle={{ marginTop: 22, backgroundColor: "white", borderRadius: 22, borderWidth: 1, borderColor: line, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>your address</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: copied ? "#23765A1a" : mist }}>
              {copied ? (
                <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: green, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>✓</Text>
                </View>
              ) : (
                <Glyph name="clipboard" size={18} />
              )}
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: copied ? green : violet }}>{copied ? "copied" : "copy"}</Text>
            </View>
          </View>
          {/* one line, the ends in ink since those are what people check */}
          <Text numberOfLines={1} adjustsFontSizeToFit style={mono}>
            <Text style={[mono, { color: ink, fontWeight: "700" }]}>{address.slice(0, 6)}</Text>
            <Text style={[mono, { color: muted }]}>{address.slice(6, -4)}</Text>
            <Text style={[mono, { color: ink, fontWeight: "700" }]}>{address.slice(-4)}</Text>
          </Text>
        </Tap>

        <Text style={{ marginTop: 20, marginBottom: 10, fontSize: 12.5, fontWeight: "600", color: muted }}>what you can send</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[
            ["USDC", "usdc"],
            ["AUSD", "ausd"],
            ["MON", "mon for gas"],
          ].map(([sym, label]) => (
            <View key={sym} style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "white", borderWidth: 1, borderColor: line }}>
              <Coin symbol={sym} size={22} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: ink }}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 15, backgroundColor: "#FFF3D9", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Glyph name="triangle-warning" size={18} color={amber} />
          <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: amber }}>monad testnet only. other networks won’t arrive.</Text>
        </View>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Tap onPress={share} style={{ flex: 1 }} innerStyle={{ height: 54, borderRadius: 27, backgroundColor: well, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15.5, fontWeight: "600", color: ink }}>share</Text>
        </Tap>
        <Tap onPress={copy} style={{ flex: 1 }} innerStyle={{ height: 54, borderRadius: 27, backgroundColor: copied ? green : ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 15.5, fontWeight: "600", color: "white" }}>{copied ? "copied" : "copy address"}</Text>
        </Tap>
      </View>
    </Screen>
  );
}
