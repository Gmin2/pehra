// a face for an address: a 5 by 5 mirrored pixel pattern from its hash, in pehra's violets on mist. the
// same address always gets the same face, so a trader is recognisable across the board, watch and copy
import Svg, { Rect, G } from "react-native-svg";
import { View } from "react-native";

const COLORS = ["#9E4DFD", "#8A3CEB", "#C9A6FF", "#28243E"];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

function cells(address: string) {
  let h = hash(address.toLowerCase());
  const color = COLORS[h % COLORS.length];
  const on: [number, number][] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    if (h % 2) { on.push([x + 1, y + 1]); if (x < 2) on.push([5 - x, y + 1]); }
  }
  return { color, on };
}

export function Face({ address, size = 36, ring }: { address: string; size?: number; ring?: string }) {
  const { color, on } = cells(address);
  const pad = ring ? Math.max(2, Math.round(size / 18)) : 0;
  return (
    <View style={{ width: size + pad * 2, height: size + pad * 2, borderRadius: size, backgroundColor: ring ?? "transparent", padding: pad }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden" }}>
        <Svg width={size} height={size} viewBox="0 0 7 7">
          <Rect width={7} height={7} fill="#EFE5FF" />
          <G fill={color}>
            {on.map(([x, y]) => <Rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} />)}
          </G>
        </Svg>
      </View>
    </View>
  );
}
