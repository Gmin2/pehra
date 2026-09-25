import type { Variants } from "framer-motion";

// expo out, same curve the family.co rebuild captured
export const EXPO = [0.19, 1, 0.22, 1] as const;

// blur in: fade, rise and unblur together
export const reveal: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.9, ease: EXPO } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const once = { once: true, amount: 0.3 } as const;

export const spring = { type: "spring", mass: 4, stiffness: 800, damping: 80, restDelta: 0.0001 } as const;
