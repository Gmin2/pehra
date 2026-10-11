// the notice at the top of the screen: a light card, a green check for things that went through, a red mark
// for things that did not. one string comes in, its first sentence is the title and the rest sits under it
import { View } from "react-native";
import Animated, { FadeInUp, FadeOutUp, ReduceMotion } from "react-native-reanimated";
import Svg, { Path, Circle } from "react-native-svg";
import { Text } from "./Text";

const ink = "#28243E", muted = "#706A7D", line = "#EEEAF2", green = "#23765A", red = "#B4474D";
const BAD = /^(couldn|failed|it didn|that is not|that link|nothing|no |only |the faucet is busy|sign in)|failed|cancelled/i;

export function split(s: string) {
  const at = s.search(/\. |, (?=nothing|try|you|it|the)/i);
  return at > 0 ? { title: s.slice(0, at), sub: s.slice(at + 2) } : { title: s, sub: "" };
}

export function Notice({ text, top }: { text: string; top: number }) {
  const bad = BAD.test(text);
  const { title, sub } = split(text);
  return (
    <Animated.View
      entering={FadeInUp.duration(220).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(180).reduceMotion(ReduceMotion.System)}
      pointerEvents="none"
      style={{ position: "absolute", top, left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "white", borderRadius: 20, borderWidth: 1, borderColor: line, paddingHorizontal: 14, paddingVertical: sub ? 12 : 14, boxShadow: "0 6px 18px #28243E1f" }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: bad ? "#FBE9EA" : "#E4F3EC", alignItems: "center", justifyContent: "center" }}>
        <Svg width={16} height={16} viewBox="0 0 16 16">
          {bad
            ? <><Path d="M8 3.5v5.5" stroke={red} strokeWidth={2.4} strokeLinecap="round" /><Circle cx={8} cy={12.4} r={1.4} fill={red} /></>
            : <Path d="M3.5 8.4l3 3 6-6.8" stroke={green} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: ink }} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12.5, fontWeight: "500", color: muted }} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </Animated.View>
  );
}
