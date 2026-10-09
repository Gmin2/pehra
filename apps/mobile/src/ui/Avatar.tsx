// a picture for an address, picked by its hash so the same trader always looks the same. three looks:
// pehra's bird on a tinted tile, two letters on a soft tile, or a few flat shapes
import { View } from "react-native";
import Svg, { Path, Ellipse, Circle, Rect } from "react-native-svg";
import { BODY, BEAK } from "./PehraBird";
import { Text } from "./Text";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const next = (h: number) => Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;

// soft tile, strong mark. all from the brand: dusk, green, amber, red, ink
const TONES = [
  ["#EFE5FF", "#9E4DFD"],
  ["#E4F3EC", "#23765A"],
  ["#FBEFD8", "#9A6B1C"],
  ["#FBE9EA", "#B4474D"],
  ["#ECEAF0", "#28243E"],
  ["#F3EAFF", "#8A3CEB"],
] as const;

export type AvatarLook = "bird" | "letters" | "shapes";

export function Avatar({ address, size = 48, look = "bird" }: { address: string; size?: number; look?: AvatarLook }) {
  const a = address.toLowerCase();
  let h = hash(a);
  const [bg, fg] = TONES[h % TONES.length];
  if (look === "letters") {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: "Manrope_700Bold", fontSize: size * 0.38, color: fg, letterSpacing: -0.5 }}>{a.slice(2, 4)}</Text>
      </View>
    );
  }
  if (look === "bird") {
    // the bird looks left or right and sits a little higher or lower, so a row of them is not a stamp
    h = next(h);
    const flip = h % 2 === 1;
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, overflow: "hidden", alignItems: "center", justifyContent: "flex-end" }}>
        <Svg width={size * 0.86} height={size * 0.86} viewBox="0 0 256 256" style={{ marginBottom: -size * 0.08, transform: [{ scaleX: flip ? -1 : 1 }] }}>
          <Path d={BODY} fill={fg} />
          <Ellipse cx={91} cy={110} rx={12.5} ry={15.5} fill="white" />
          <Ellipse cx={151} cy={110} rx={12.5} ry={15.5} fill="white" />
          <Path d={BEAK} fill="white" />
        </Svg>
      </View>
    );
  }
  // shapes: a big one behind, a small one in front, each its own shape, colour and corner
  const palette = ["#9E4DFD", "#C9A6FF", "#28243E", "#9A6B1C", "#23765A", "#B4474D"];
  const pickColor = (k: number) => palette[k % palette.length];
  h = next(h); const c1 = pickColor(h); h = next(h); let c2 = pickColor(h); if (c2 === c1) c2 = palette[(palette.indexOf(c1) + 2) % palette.length];
  h = next(h); const s1 = h % 3; h = next(h); const s2 = h % 3; h = next(h); const corner = h % 4;
  const shape = (kind: number, cx: number, cy: number, r: number, fill: string, key: string) =>
    kind === 0 ? <Circle key={key} cx={cx} cy={cy} r={r} fill={fill} />
      : kind === 1 ? <Rect key={key} x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={r * 0.35} fill={fill} transform={`rotate(${(h % 4) * 12} ${cx} ${cy})`} />
        : <Path key={key} d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`} fill={fill} transform={`rotate(${corner * 90} ${cx} ${cy})`} />;
  const pos = [[34, 34], [66, 34], [34, 66], [66, 66]][corner];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {shape(s1, 50, 54, 30, c1, "a")}
        {shape(s2, pos[0], pos[1], 16, c2, "b")}
      </Svg>
    </View>
  );
}
