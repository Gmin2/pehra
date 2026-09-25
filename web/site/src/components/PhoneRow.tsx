import { useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import Phone from "./Phone";
import { spring } from "./motion";

export type RowItem = {
  label: string;
  color: string;
  icon: ReactNode;
  video: string;
  // where the action is on the screen, 0 is the top and 1 the bottom. the window centres on it
  focus: number;
};

const PHONE_W = 230;
const PHONE_H = PHONE_W * 2.16;
const WINDOW_H = 300;

// three phones, one plays at a time and hands off to the next when its clip ends
export default function PhoneRow({ items }: { items: RowItem[] }) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });

  return (
    <div ref={ref} className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
      {items.map((it, i) => {
        const on = inView && i === active;
        const top = Math.min(0, Math.max(WINDOW_H - PHONE_H, WINDOW_H / 2 - it.focus * PHONE_H));
        return (
          <div key={it.label} className="flex flex-col items-stretch justify-center gap-5">
            <motion.div
              animate={{ scale: on ? 1.04 : 1, y: on ? -4 : 0 }}
              transition={spring}
              className="relative mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#EEF3FF,#F6F8FE)] will-change-transform"
              style={{ height: WINDOW_H }}
            >
              <motion.div
                className="absolute left-1/2 -translate-x-1/2"
                initial={false}
                animate={{ top: on ? top : top + 12 }}
                transition={spring}
                style={{ width: PHONE_W }}
              >
                <Phone
                  name={it.video}
                  playing={on}
                  shadow={false}
                  onEnded={() => {
                    setProgress(0);
                    setActive((a) => (a + 1) % items.length);
                  }}
                  onProgress={on ? setProgress : undefined}
                />
              </motion.div>
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(transparent,rgba(238,243,255,0.9))]" />
            </motion.div>
            <motion.button
              type="button"
              onClick={() => {
                setProgress(0);
                setActive(i);
              }}
              animate={{ opacity: on ? 1 : 0.5 }}
              className="mx-auto flex items-center justify-center gap-2 text-[15px] font-semibold"
              style={{ color: it.color }}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-md text-white" style={{ background: it.color }}>
                {it.icon}
              </span>
              {it.label}
              <span className="relative ml-1 h-1 w-10 overflow-hidden rounded-full bg-black/10">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: it.color }}
                  animate={{ width: on ? `${progress * 100}%` : "0%" }}
                  transition={{ duration: on ? 0.28 : 0.2, ease: "linear" }}
                />
              </span>
            </motion.button>
          </div>
        );
      })}
    </div>
  );
}
