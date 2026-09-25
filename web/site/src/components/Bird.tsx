import { motion } from "framer-motion";

// same geometry as brand/mascot and apps/mobile/src/ui/PehraBird.tsx, viewBox 256
const BODY =
  "M120,30 C166,30 184,65 190,109 C195,151 211,182 231,207 C235,212 234,216 226,214 L207,210 C181,230 141,239 101,235 C54,232 23,215 24,178 C25,152 43,120 49,96 C60,53 85,30 120,30 Z";
const BEAK = "M113,130Q111,126 116,126H126Q131,126 129,130L123,141Q121,145 119,141Z";

const EYES = {
  asleep:
    "M77.5,113H104.5Q107,113 107,115.5V115.5Q107,118 104.5,118H77.5Q75,118 75,115.5V115.5Q75,113 77.5,113Z M137.5,113H164.5Q167,113 167,115.5V115.5Q167,118 164.5,118H137.5Q135,118 135,115.5V115.5Q135,113 137.5,113Z",
  dozing: "M74,108H108C107,127 75,127 74,108Z M134,108H168C167,127 135,127 134,108Z",
  watching: "M82,110a9,15 0 1,0 18,0a9,15 0 1,0 -18,0Z M142,110a9,15 0 1,0 18,0a9,15 0 1,0 -18,0Z",
  alert: "M79,110a12,19 0 1,0 24,0a12,19 0 1,0 -24,0Z M139,110a12,19 0 1,0 24,0a12,19 0 1,0 -24,0Z",
  saved: "M77,120a14,14 0 0,1 28,0h-7a7,7 0 0,0 -14,0Z M137,120a14,14 0 0,1 28,0h-7a7,7 0 0,0 -14,0Z",
};

export type BirdState = keyof typeof EYES;

export default function Bird({
  state = "watching",
  size = 120,
  body = "#9E4DFD",
  face = "#FAF8F2",
  blink = false,
  className = "",
}: {
  state?: BirdState;
  size?: number;
  body?: string;
  face?: string;
  blink?: boolean;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={className} aria-hidden>
      <path d={BODY} fill={body} />
      <motion.path
        d={EYES[state]}
        fill={face}
        style={{ originY: "110px", originX: "121px", transformBox: "view-box" }}
        animate={blink ? { scaleY: [1, 1, 0.1, 1, 1] } : undefined}
        transition={blink ? { duration: 4.2, times: [0, 0.9, 0.93, 0.96, 1], repeat: Infinity } : undefined}
      />
      <path d={BEAK} fill={face} />
    </svg>
  );
}
