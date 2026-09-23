// market coins: the real marks where we have them (btc, eth, monad from its token list), a
// lettered disc in the market's colour for the rest
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import logoData from "./logos.json";

const logos = logoData as Record<string, { vb: string; d: string[] }>;
const byMarket: Record<string, { logo?: string; bg: string }> = {
  BTC: { logo: "btc", bg: "#F7931A" },
  ETH: { logo: "eth", bg: "#627EEA" },
  MON: { logo: "monad", bg: "#836EF9" },
  SOL: { bg: "#14161F" },
  ZEC: { bg: "#E8B30F" },
  LIT: { bg: "#1D9BF0" },
  PUMP: { bg: "#3BB273" },
  AUSD: { logo: "ausd", bg: "#9A9350" },
};

export function Coin({ symbol, size = 40 }: { symbol: string; size?: number }) {
  const c = byMarket[symbol] ?? { bg: "#9E4DFD" };
  const l = c.logo ? logos[c.logo] : undefined;
  const r = size / 2;
  let glyph = null;
  if (l) {
    const [, , vw, vh] = l.vb.split(" ").map(Number);
    const k = (size * 0.56) / Math.max(vw, vh);
    glyph = (
      <G transform={`translate(${r - (vw * k) / 2} ${r - (vh * k) / 2}) scale(${k})`}>
        {l.d.map((d, i) => (
          <Path key={i} d={d} fill="white" fillRule="evenodd" />
        ))}
      </G>
    );
  } else
    glyph = (
      <SvgText x={r} y={r + size * 0.16} fontSize={size * 0.42} fontWeight="700" fill="white" textAnchor="middle">
        {symbol.slice(0, 1)}
      </SvgText>
    );
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r} fill={c.bg} />
      {glyph}
    </Svg>
  );
}
