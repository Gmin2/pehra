import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Chevron } from "./Icons";
import { EXPO, once, reveal } from "./motion";
import Mark from "./Mark";

const qa = [
  {
    q: "is this real money?",
    a: "not yet. pehra runs on monad testnet with test dollars on perpl testnet. the app gives you test usdc when you sign up so you can try every screen.",
  },
  {
    q: "what does the guard actually do?",
    a: "it watches your open positions against the mark price. when one gets close to the line you set, it moves spare ausd from your perpl account into that position as margin, then sends you a push saying what it did.",
  },
  {
    q: "can pehra take my money?",
    a: "no. the key the guard holds is a perpl api key, and perpl api keys can never withdraw at any scope. moving money out of your account always needs your passkey, on your phone.",
  },
  {
    q: "what if your server goes down?",
    a: "then the guard cant step in, and perpl liquidates like it always would. your funds stay where they are. we say this plainly because a guard you trust blindly is worse than none.",
  },
  {
    q: "what if i lose my phone?",
    a: "your account is your passkey. if it syncs through your password manager, sign in on the new phone and you get the same address back.",
  },
  {
    q: "which phones?",
    a: "android today, on monad testnet. ios comes after.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto grid max-w-[1100px] scroll-mt-20 grid-cols-1 gap-10 px-5 py-24 md:grid-cols-[1fr_1.4fr] md:px-6">
      <motion.h2 variants={reveal} initial="hidden" whileInView="show" viewport={once} className="h-display text-[34px] leading-[1.08] md:text-[44px]">
        questions,
        <br />
        <Mark type="highlight" color="#EFE5FF">
          answered.
        </Mark>
      </motion.h2>
      <div className="divide-y divide-line border-y border-line">
        {qa.map((item, i) => {
          const on = open === i;
          return (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(on ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold text-ink"
                aria-expanded={on}
              >
                {item.q}
                <motion.span animate={{ rotate: on ? 180 : 0 }} transition={{ duration: 0.4, ease: EXPO }} className="text-muted">
                  <Chevron />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {on && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.45, ease: EXPO }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-[560px] pb-5 text-[16px] leading-[25px]">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
