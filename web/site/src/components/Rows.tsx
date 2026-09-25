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

const honest: RowItem[] = [
  { label: "read the terms", color: "#8A601B", icon: <Check size={10} />, video: "checklist", focus: 0.3 },
  { label: "meet the guard", color: "#9E4DFD", icon: <Shield size={11} />, video: "funded", focus: 0.4 },
  { label: "what it does", color: "#23765A", icon: <Check size={10} />, video: "guard", focus: 0.76 },
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

export function HonestRow() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-20 md:px-6">
      <Heading>
        honest from the first tap.
        <br />
        leverage explained,{" "}
        <Mark type="highlight" color="#EFE5FF" delay={600}>
          not hidden.
        </Mark>
      </Heading>
      <PhoneRow items={honest} />
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
