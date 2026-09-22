import { StyleSheet } from "react-native";
// pehra brand kit 0.1 (brand/tokens.json): dusk, paper, ink, mist. green and red are kept for meaning.
export const colors = {
  ink: "#28243E",
  muted: "#706A7D",
  faint: "#B9B2C5",
  surface: "#F0EDF3",
  blue: "#7362CE",
  green: "#23765A",
  red: "#B4474D",
  purple: "#7362CE",
  line: "#DDD8E6",
  paper: "#FAF8F2",
  mist: "#E6E0F7",
};
export const space = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FAF8F2" },
  row: { flexDirection: "row", alignItems: "center" },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  center: { alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: 24 },
  grow: { flex: 1 },
  title: {
    fontSize: 24,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  copy: { fontSize: 16, lineHeight: 22, color: colors.muted },
  small: { fontSize: 12, lineHeight: 17, color: colors.muted },
  divider: { height: 1, backgroundColor: colors.line },
});
