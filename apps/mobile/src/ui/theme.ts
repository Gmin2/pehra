import { StyleSheet } from "react-native";
export const colors = {
  ink: "#151515",
  muted: "#999999",
  faint: "#c4c4c4",
  surface: "#f6f6f6",
  // the accent is pehra dusk, brand/tokens.json. the key keeps family's name so every screen follows
  blue: "#6553B9",
  green: "#00c858",
  red: "#ff2945",
  purple: "#7c3fe9",
  line: "#f0f0f0",
};
export const space = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
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
