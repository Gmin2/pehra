import { motion } from "framer-motion";
import PhoneRow, { type RowItem } from "./PhoneRow";
import { Bolt, Check, Fingerprint, Plus, Shield } from "./Icons";
import { once, reveal } from "./motion";
import Mark from "./Mark";
import MoneyPath from "./MoneyPath";

const start: RowItem[] = [
  { label: "sign up", color: "#9E4DFD", icon: <Fingerprint size={12} />, video: "welcome", focus: 0.42 },
  { label: "funded", color: "#23765A", icon: <Plus size={9} />, video: "setup", focus: 0.4 },
  { label: "trade", color: "#28243E", icon: <Bolt size={11} />, video: "trade", focus: 0.8 },
];

const social: RowItem[] = [
  { label: "top traders", color: "#9E4DFD", icon: <Check size={10} />, video: "leaders", focus: 0.35 },
  { label: "their profit", color: "#23765A", icon: <Bolt size={11} />, video: "trader", focus: 0.35 },
  { label: "copy them", color: "#28243E", icon: <Shield size={11} />, video: "copy", focus: 0.75 },
];

export function StartRow() {
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-5 pt-8 pb-20 md:px-6">
        <Heading>
          passkey in. dollars in.
          <br />
          <Mark type="underline" color="#9E4DFD" strokeWidth={3} padding={2}>
            trade.
          </Mark>
        </Heading>
        <PhoneRow items={start} />
      </section>

      <section className="px-5 md:px-6">
        <motion.div variants={reveal} initial="hidden" whileInView="show" viewport={once} className="mx-auto max-w-[1200px]">
          <MoneyPath />
        </motion.div>
      </section>
    </>
  );
}

export function SocialRow() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-20 md:px-6">
      <Heading>
        every perpl trader, ranked.
        <br />
        copy the ones{" "}
        <Mark type="highlight" color="#EFE5FF" delay={600}>
          that win.
        </Mark>
      </Heading>
      <PhoneRow items={social} />
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <motion.h2
      variants={reveal}
      initial="hidden"
      whileInView="show"
      viewport={once}
      className="h-display text-[34px] leading-[1.08] md:text-[44px]"
    >
      {children}
    </motion.h2>
  );
}
