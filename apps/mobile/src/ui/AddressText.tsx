// an address the way pehra shows it: 0x faint, the first four in violet (the part people remember), the
// last four in ink
import type { TextStyle } from "react-native";
import { Text } from "./Text";

export function AddressText({ address, size = 19, color = "#28243E", style }: { address: string; size?: number; color?: string; style?: TextStyle }) {
  const a = address.toLowerCase();
  const f = { fontFamily: "Manrope_700Bold" };
  return (
    <Text style={[{ fontFamily: "Manrope_700Bold", fontSize: size, color, letterSpacing: -0.2 }, style]}>
      <Text style={[f, { color: "#B9B2C5" }]}>0x</Text>
      <Text style={[f, { color: "#9E4DFD" }]}>{a.slice(2, 6)}</Text>
      <Text style={[f, { color: "#B9B2C5" }]}> … </Text>
      {a.slice(-4)}
    </Text>
  );
}
