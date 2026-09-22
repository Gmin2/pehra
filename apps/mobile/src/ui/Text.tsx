// every pehra label goes through here: manrope at the weight the style asks for. react native on
// android cannot pick a weight out of one family, so each weight is its own loaded font.
import { Text as RNText, StyleSheet, type TextProps } from "react-native";

export const fonts: Record<string, string> = {
  "300": "Manrope_400Regular",
  "400": "Manrope_400Regular",
  normal: "Manrope_400Regular",
  "500": "Manrope_500Medium",
  "600": "Manrope_600SemiBold",
  "700": "Manrope_700Bold",
  bold: "Manrope_700Bold",
  "800": "Manrope_800ExtraBold",
};

export function Text(props: TextProps) {
  const flat = StyleSheet.flatten(props.style) ?? {};
  const weight = String(flat.fontWeight ?? "400");
  return <RNText {...props} style={[props.style, { fontFamily: fonts[weight] ?? fonts["400"], fontWeight: "normal" }]} />;
}
