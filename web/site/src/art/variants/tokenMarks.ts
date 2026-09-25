import { group, path, type ObjectNode } from "./objectIR";

// Exact vector outlines reused from apps/mobile/src/ui/logos.json.
// The mobile token artwork is sourced from Monad's token list, rather than
// a drawn approximation. Keep these paths intact when changing the scene.
export const TOKEN_COLORS = { monad: "#6E54FF", ausd: "#9A9350" };
const marks = {
  "monad": {
    "vb": "0 0 33 32",
    "d": [
      "M16.8163 0C12.1959 0 0.816406 11.3792 0.816406 15.9999C0.816406 20.6206 12.1959 32 16.8163 32C21.4367 32 32.8164 20.6204 32.8164 15.9999C32.8164 11.3794 21.4369 0 16.8163 0ZM14.323 25.1492C12.3746 24.6183 7.13621 15.455 7.66723 13.5066C8.19825 11.5581 17.3614 6.31979 19.3097 6.8508C21.2582 7.38173 26.4966 16.5449 25.9656 18.4934C25.4346 20.4418 16.2714 25.6802 14.323 25.1492Z"
    ]
  },
  "ausd": {
    "vb": "0 0 256 256",
    "d": [
      "M124.22 38.98V101.232C124.22 103.847 121.111 105.119 119.274 103.281L89.9493 74.6638L102.244 42.725C103.092 40.4639 105.283 38.98 107.685 38.98H124.22Z",
      "M124.22 123.773V158.75C124.22 161.082 121.464 162.213 119.768 160.658L74.3333 117.838L87.6882 83.2137L120.828 115.647C123.019 117.767 124.22 120.664 124.22 123.773Z",
      "M124.22 180.161V195.847H53.7709C49.7432 195.847 46.9168 191.749 48.4007 188.004L72.0014 126.529L120.969 172.741C123.089 174.649 124.22 177.334 124.22 180.161Z",
      "M131.781 38.98V101.232C131.781 103.847 134.89 105.119 136.727 103.281L165.98 74.6638L153.756 42.725C152.838 40.4639 150.718 38.98 148.315 38.98H131.781Z",
      "M131.781 123.773V158.75C131.781 161.082 134.536 162.213 136.232 160.658L181.667 117.838L168.312 83.2137L135.172 115.647C132.982 117.767 131.71 120.664 131.71 123.773H131.781Z",
      "M131.781 180.161V195.847H202.159C206.257 195.847 209.084 191.749 207.6 188.004L183.928 126.529L134.96 172.741C132.911 174.649 131.781 177.334 131.781 180.161Z"
    ]
  }
} as const;

export function tokenMark(name: keyof typeof marks, x: number, y: number, size: number, color = "#FFFFFF"): ObjectNode {
  const mark = marks[name];
  // Tight symbol bounds make the AUSD tree legible at small sizes without
  // altering its paths or proportions. Both marks stay centered on the coin.
  const bounds = name === "monad" ? [0.816406, 0, 32, 32] : [48, 38.98, 160, 156.867];
  const [left, top, width, height] = bounds;
  const scale = size / Math.max(width, height);
  return group(mark.d.map((d) => path(d, { fill: color, fillRule: "evenodd" })),
    `translate(${x - width * scale / 2} ${y - height * scale / 2}) scale(${scale}) translate(${-left} ${-top})`);
}
