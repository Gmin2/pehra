import { motion } from "framer-motion";

// small drawn icons for the hero chips, in the same language as the illustrations:
// a dark outline, flat fills, brand purple and the night yellow, each with one small motion
const OUT = "#1F1D1D";
const DUSK = "#9E4DFD";
const NIGHT = "#F5CE4E";
const common = { width: 22, height: 22, viewBox: "0 0 24 24", "aria-hidden": true } as const;

// one tap: a candle that fills green, with a tap ring pulsing on it
export function TapIcon() {
  return (
    <svg {...common}>
      <path d="M12 2.5v4M12 17.5v4" stroke={OUT} strokeWidth={1.8} strokeLinecap="round" />
      <rect x="5.5" y="6" width="13" height="12" rx="3" fill="#2E9C6E" stroke={OUT} strokeWidth={1.8} />
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={DUSK}
        strokeWidth={1.8}
        vectorEffect="non-scaling-stroke"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={{ scale: [0.33, 1], opacity: [0.9, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", repeatDelay: 0.6 }}
      />
      <circle cx="12" cy="12" r="1.8" fill="#fff" stroke={OUT} strokeWidth={1.2} />
    </svg>
  );
}

// no seed phrase: a fingerprint on a purple tile, its ridges scan in
export function PrintIcon() {
  const ridges = [
    "M7.6 16.2c-.7-1.2-1-2.6-1-4.2a5.4 5.4 0 0 1 9.4-3.6",
    "M9.6 17.6c-.7-1.6-.8-3.4-.8-5.6a3.2 3.2 0 0 1 6.4 0",
    "M12 11.4c0 2.6-.3 4.7-.9 6.8",
    "M14.4 17.3c.4-1.4.8-3.1.9-5",
  ];
  return (
    <svg {...common}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill={DUSK} stroke={OUT} strokeWidth={1.8} />
      {ridges.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          fill="none"
          stroke="#fff"
          strokeWidth={1.5}
          strokeLinecap="round"
          animate={{ pathLength: [0, 1, 1] }}
          transition={{ duration: 2.4, times: [0, 0.4, 1], repeat: Infinity, delay: i * 0.12 }}
        />
      ))}
    </svg>
  );
}

// sleep through 3am wicks: a crescent moon with a z drifting up off it
export function MoonIcon() {
  return (
    <svg {...common}>
      <path d="M15.5 4.2a8 8 0 1 0 4.3 12.3A6.4 6.4 0 0 1 15.5 4.2Z" fill={NIGHT} stroke={OUT} strokeWidth={1.8} strokeLinejoin="round" />
      <motion.path
        d="M17 3h3.2L17 6.4h3.2"
        fill="none"
        stroke={OUT}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ y: [2, -1.5, 2], opacity: [0, 1, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}
