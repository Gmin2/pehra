// the mark beside a trade in a list: a tinted tile with a heavy arrow from nucleo's micro bold set. an open
// is violet and points the way they bet, a close is green or red by how it went, a liquidation is a warning
import { View } from "react-native";
import Svg, { Path, Polyline, Line } from "react-native-svg";

const violet = "#9E4DFD", mist = "#EFE5FF", green = "#23765A", greenBg = "#E4F3EC", red = "#B4474D", redBg = "#FBE9EA", faint = "#B9B2C5", well = "#F0EDF3";

export function TradeMark({ kind, side, pnl, size = 36 }: { kind: "open" | "close" | "liquidated"; side: string | null; pnl: number | null; size?: number }) {
  const flat = kind === "close" && Math.abs(pnl ?? 0) < 0.005;
  const [bg, fg] = kind === "open" ? [mist, violet] : kind === "liquidated" ? [redBg, red] : flat ? [well, faint] : (pnl ?? 0) >= 0 ? [greenBg, green] : [redBg, red];
  const icon = size * 0.56, sw = 2.6;
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Svg width={icon} height={icon} viewBox="0 0 20 20">
        {kind === "liquidated" ? (
          <Path d="m17.794,12.5L12.598,3.5c-.542-.939-1.514-1.5-2.598-1.5s-2.056.561-2.598,1.5L2.206,12.5c-.542.938-.543,2.061,0,3,.542.939,1.514,1.5,2.598,1.5h10.393c1.084,0,2.056-.561,2.598-1.5.542-.939.542-2.062,0-3Zm-8.794-5.5c0-.552.447-1,1-1s1,.448,1,1v3.5c0,.552-.447,1-1,1s-1-.448-1-1v-3.5Zm1,8c-.689,0-1.25-.561-1.25-1.25s.561-1.25,1.25-1.25,1.25.561,1.25,1.25-.561,1.25-1.25,1.25Z" fill={fg} />
        ) : kind === "close" ? (
          <>
            <Path d="m17,6c0-1.195-.703-2.217-1.714-2.7l-2.993,2.993c-.188.188-.293.442-.293.707v6c0,.265.105.52.293.707l2.993,2.993c1.011-.483,1.714-1.505,1.714-2.7V6Z" fill={fg} />
            <Line x1={3} y1={10} x2={9} y2={10} stroke={fg} strokeWidth={sw} strokeLinecap="round" />
            <Path d="m7.44,15.544c.526.869,1.47,1.456,2.56,1.456h4c1.657,0,3-1.343,3-3V6c0-1.657-1.343-3-3-3h-4c-1.089,0-2.033.585-2.558,1.453" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="5.75 7.5 3 10 5.75 12.5" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : side === "short" ? (
          <>
            <Path d="m17,14l-7.293-7.293c-.391-.391-1.024-.391-1.414,0l-2.586,2.586c-.391.391-1.024.391-1.414,0l-2.293-2.293" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="17 7 17 14 10 14" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <Path d="m17,6l-7.293,7.293c-.391.391-1.024.391-1.414,0l-2.586-2.586c-.391-.391-1.024-.391-1.414,0l-2.293,2.293" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
            <Polyline points="17 13 17 6 10 6" fill="none" stroke={fg} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </Svg>
    </View>
  );
}
