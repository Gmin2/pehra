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
    q: "how does copying work?",
    a: "pick a trader from the leaderboard, choose careful, steady or bold, and sign once. pehra reads their opens and closes straight from monads blocks and places yours at your own size, about six blocks later. their money and yours never mix.",
  },
  {
    q: "can a copy touch my own position?",
    a: "no. perpl keeps one position per market, so pehra never opens a copy on a market you already hold, and when the trader closes it closes only what the copy bought.",
  },
  {
    q: "what is a recipe?",
    a: "a few rules that work together, like catch the breakout: open when mon breaks 2% up, trail the stop, keep the guard on. you see it replayed on the last 30 days before you arm it.",
  },
  {
    q: "can pehra take my money?",
    a: "no. the server trades through a perpl api key your passkey enrolled, and perpl api keys can never withdraw at any scope. moving money out always needs your passkey, on your phone.",
  },
  {
    q: "what if your server goes down?",
    a: "your stops still have a backstop resting on perpl, and it fires without us. we tested it by killing the server with a stop armed. the guard cant add margin while it is down, so we say that plainly too.",
  },
  {
    q: "which phones?",
    a: "android today, on monad testnet. your account is your passkey, so a new phone signs in to the same address. ios comes after.",
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
