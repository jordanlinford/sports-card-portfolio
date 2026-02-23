import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

interface SuccessCheckmarkProps {
  show: boolean;
  onComplete?: () => void;
  size?: "sm" | "md" | "lg";
}

export function SuccessCheckmark({ show, onComplete, size = "md" }: SuccessCheckmarkProps) {
  const sizes = {
    sm: { container: "w-12 h-12", icon: "h-6 w-6" },
    md: { container: "w-16 h-16", icon: "h-8 w-8" },
    lg: { container: "w-20 h-20", icon: "h-10 w-10" },
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          onAnimationComplete={() => {
            setTimeout(() => onComplete?.(), 800);
          }}
          className={`${sizes[size].container} rounded-full bg-green-500 flex items-center justify-center`}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 400 }}
          >
            <Check className={`${sizes[size].icon} text-white stroke-[3]`} />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-green-400"
            initial={{ scale: 1, opacity: 1 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SparkleEffectProps {
  show: boolean;
  onComplete?: () => void;
}

export function SparkleEffect({ show, onComplete }: SparkleEffectProps) {
  const sparkles = Array.from({ length: 8 }, (_, i) => ({
    id: i,
    angle: (i * 360) / 8,
    delay: i * 0.05,
  }));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onAnimationComplete={() => {
            setTimeout(() => onComplete?.(), 600);
          }}
        >
          {sparkles.map((sparkle) => (
            <motion.div
              key={sparkle.id}
              className="absolute"
              initial={{ 
                scale: 0, 
                x: 0, 
                y: 0, 
                opacity: 1 
              }}
              animate={{ 
                scale: [0, 1, 0],
                x: Math.cos((sparkle.angle * Math.PI) / 180) * 40,
                y: Math.sin((sparkle.angle * Math.PI) / 180) * 40,
                opacity: [1, 1, 0]
              }}
              transition={{ 
                duration: 0.5, 
                delay: sparkle.delay,
                ease: "easeOut"
              }}
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SuccessOverlayProps {
  show: boolean;
  message?: string;
  onComplete?: () => void;
}

export function SuccessOverlay({ show, message = "Success!", onComplete }: SuccessOverlayProps) {
  const completedRef = useRef(false);

  useEffect(() => {
    if (!show) {
      completedRef.current = false;
      return;
    }
    completedRef.current = false;
    const safetyTimer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
    }, 2000);
    return () => clearTimeout(safetyTimer);
  }, [show, onComplete]);

  const handleAnimationComplete = () => {
    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.();
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
          >
            <div className="relative">
              <SuccessCheckmark show={true} size="lg" />
              <SparkleEffect show={true} onComplete={handleAnimationComplete} />
            </div>
            <motion.p
              className="text-lg font-medium text-foreground"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {message}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
