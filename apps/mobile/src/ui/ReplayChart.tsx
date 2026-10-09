// a recipe's month on the price: the line, where it got in, its stop as it moved, where it got out, and
// the stretch after the last exit shaded as waiting. the fills come from the replay, the line from the
// same 4h candles the trade chart uses
import { View } from "react-native";
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
import type { ManyFire } from "@pehra/perpl";
import { Text } from "./Text";

const violet = "#9E4DFD", mist = "#EFE5FF", green = "#23765A", red = "#B4474D", ink = "#28243E", faint = "#B9B2C5";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const day = (ms: number) => { const d = new Date(ms); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const px = (n: number) => Number(n.toPrecision(4)).toString();

export function ReplayChart({ points, fires, from, width, height = 170 }: { points: { t: number; p: number }[]; fires: ManyFire[]; from?: number; width: number; height?: number }) {
  // the candles stream in newest first, the chart waits until they reach back to where the replay starts
  const first = points.length ? (points[0].t < 1e12 ? points[0].t * 1000 : points[0].t) : Infinity;
  if (points.length < 2 || (from !== undefined && first > from + 86_400_000)) return <View style={{ width, height, borderRadius: 16, backgroundColor: "#F0EDF3" }} />;
  const ms = (t: number) => (t < 1e12 ? t * 1000 : t);
  const pts = points.map((p) => ({ t: ms(p.t), p: p.p }));
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const inWindow = fires.filter((f) => f.at >= t0 && f.at <= t1 + 4 * 3600_000);
  const prices = [...pts.map((p) => p.p), ...inWindow.map((f) => f.px)];
  const lo = Math.min(...prices), hi = Math.max(...prices), span = hi - lo || 1;
  const top = 30, bottom = 10;
  const X = (t: number) => ((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0 || 1)) * (width - 12) + 6;
  const Y = (p: number) => top + (1 - (p - lo) / span) * (height - top - bottom);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.p).toFixed(1)}`).join(" ");

  const open = inWindow.find((f) => f.what === "open");
  const exits = inWindow.filter((f) => ["stop", "backstop", "close", "step", "liquidated"].includes(f.what));
  const out = exits.filter((f) => f.what !== "step").pop() ?? exits[exits.length - 1];
  const moves = inWindow.filter((f) => f.what === "move");
  // the stop's path: from the first move to the last, each step held until the next
  const stopPath = moves.length > 1 ? moves.map((f, i) => `${i ? "L" : "M"}${X(f.at).toFixed(1)} ${Y(f.px).toFixed(1)}`).join(" ") : null;
  const label = (x: number, y: number, text: string, color: string, below: boolean) => {
    const w = text.length * 6.6 + 16, lx = Math.min(Math.max(x - w / 2, 0), width - w), ly = below ? y + 12 : y - 34;
    return { lx, ly, w, text, color };
  };
  const tags = [] as ReturnType<typeof label>[];
  if (open) tags.push(label(X(open.at), Y(open.px), `in ${px(open.px)}`, violet, true));
  if (out) tags.push(label(X(out.at), Y(out.px), `${out.what === "liquidated" ? "liquidated" : "out"} ${px(out.px)}`, out.what === "liquidated" ? red : green, false));
  const waitFrom = out ? X(out.at) : null;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {waitFrom !== null && waitFrom < width - 30 && <Rect x={waitFrom} y={top - 8} width={width - waitFrom} height={height - top + 8 - bottom} rx={10} fill={mist} opacity={0.55} />}
        <Path d={d} fill="none" stroke={ink} strokeWidth={2} strokeLinejoin="round" opacity={0.85} />
        {stopPath && <Path d={stopPath} fill="none" stroke={violet} strokeWidth={2} strokeDasharray="4 4" />}
        {exits.filter((f) => f.what === "step").map((f, i) => <Circle key={i} cx={X(f.at)} cy={Y(f.px)} r={4} fill={green} />)}
        {open && <Circle cx={X(open.at)} cy={Y(open.px)} r={6.5} fill="white" stroke={violet} strokeWidth={3} />}
        {out && <Circle cx={X(out.at)} cy={Y(out.px)} r={6.5} fill="white" stroke={out.what === "liquidated" ? red : green} strokeWidth={3} />}
        {!open && <Line x1={0} x2={width} y1={height - bottom} y2={height - bottom} stroke="#E6E1EC" />}
      </Svg>
      {tags.map((g, i) => (
        <View key={i} style={{ position: "absolute", left: g.lx, top: g.ly, width: g.w, height: 22, borderRadius: 11, backgroundColor: g.color, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 11, fontWeight: "700", color: "white" }}>{g.text}</Text>
        </View>
      ))}
      {waitFrom !== null && waitFrom < width - 140 && (
        <View style={{ position: "absolute", left: waitFrom + 8, top: top - 2, paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "white", justifyContent: "center" }}><Text style={{ fontSize: 11.5, fontWeight: "600", color: violet }}>out, waiting for the next one</Text></View>
      )}
      {!open && fires.length === 0 && (
        <Text style={{ position: "absolute", left: 0, right: 0, top: top + 4, textAlign: "center", fontSize: 12, fontWeight: "600", color: faint }}>it never got in this month</Text>
      )}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: -18, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{day(t0)}</Text>
        <Text style={{ fontSize: 11, fontWeight: "600", color: faint }}>{day(t1)}</Text>
      </View>
    </View>
  );
}
