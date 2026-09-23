// the app's icon style: nucleo's glass icons flattened to two tones (src/ui/glyphs.ts). the back
// shape takes a light tint of the colour, the front shape the colour itself.
import Svg, { Path } from "react-native-svg";
import { glyphs } from "./glyphs";

const tints: Record<string, string> = { "#9E4DFD": "#C9A6FF", "#28243E": "#B9B2C5", "#B4474D": "#F2C6CB", "#23765A": "#B7DCCB", "#9A6B1C": "#F5D48C", "#FFFFFF": "#FFFFFF80" };
// the light version of a colour for the back shape; named colours become hex first
export const tint = (c: string) => {
  const hex = c.toLowerCase() === "white" ? "#FFFFFF" : c.toLowerCase() === "black" ? "#000000" : c;
  return tints[hex.toUpperCase()] ?? (hex.startsWith("#") && hex.length === 7 ? hex + "59" : hex);
};

export function Glyph({ name, size = 20, color = "#9E4DFD", back, front }: { name: string; size?: number; color?: string; back?: string; front?: string }) {
  const g = glyphs[name];
  if (!g) return null;
  const b = back ?? tint(color),
    f = front ?? color;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {g.back.map((s, i) => (
        <Path key={"b" + i} d={s.d} fill={b} fillRule={s.evenodd ? "evenodd" : "nonzero"} />
      ))}
      {g.front.map((s, i) => (
        <Path key={"f" + i} d={s.d} fill={f} fillRule={s.evenodd ? "evenodd" : "nonzero"} />
      ))}
    </Svg>
  );
}

// the app's icon names mapped onto glass glyphs. names not here (back, chevron, close, check, more,
// plus) stay thin line marks, the way family keeps its structural icons.
export const glyphFor: Record<string, string> = {
  bell: "bell",
  wallet: "wallet-content",
  star: "star",
  bolt: "bolt",
  rocket: "rocket",
  eye: "eye",
  hide: "eye",
  settings: "gear",
  send: "paper-plane",
  receive: "circle-arrow-down",
  scan: "circle-arrow-down",
  chat: "msgs",
  search: "magnifier",
  copy: "copies",
  warning: "triangle-warning",
  help: "circle-question",
  info: "circle-question",
  grid: "grid",
  list: "tasks",
  filter: "slider",
  history: "dial",
  browser: "magnifier",
  globe: "location",
  shield: "shield",
  lock: "lock",
  heart: "heart",
  image: "image",
  swap: "swap",
  edit: "pen",
  cloud: "cloud-upload",
  group: "users",
  face: "face-grin",
  bag: "shopping",
};
