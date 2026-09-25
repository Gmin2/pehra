import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "./Icons";
import { EXPO } from "./motion";

export default function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-night/80 p-5 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ duration: 0.5, ease: EXPO }}
            onClick={(e) => e.stopPropagation()}
            className="relative h-[min(86vh,780px)] aspect-[9/16] max-w-full overflow-hidden rounded-[24px] bg-black"
          >
            <video src="/videos/intro.mp4" poster="/videos/intro.jpg" autoPlay controls playsInline className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={onClose}
              aria-label="close"
              className="absolute top-3 right-3 flex h-9 w-9 rotate-45 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
            >
              <Plus size={13} />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
