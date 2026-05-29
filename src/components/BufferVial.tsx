import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { cn } from "../lib/utils";

interface BufferVialProps {
  pendingCount: number;
  maxCount?: number;
  isFlushing?: boolean;
  flushStatus?: string | null;
  theme?: "dark" | "light";
  unitLabel?: string;
  headerLabel?: string;
}

export const BufferVial: React.FC<BufferVialProps> = ({
  pendingCount,
  maxCount = 10,
  isFlushing = false,
  flushStatus = null,
  theme = "dark",
  unitLabel = "Units",
  headerLabel = "Buffer",
}) => {
  const [displayHeight, setDisplayHeight] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [streamOpacity, setStreamOpacity] = useState(0);
  const [displayCount, setDisplayCount] = useState(pendingCount);
  
  const prevFlushingRef = useRef(isFlushing);
  const clampedCount = Math.min(Math.max(pendingCount, 0), maxCount);
  const targetHeight = (clampedCount / maxCount) * 100;

  // Sync display count when not pouring or flushing
  useEffect(() => {
    if (!isPouring && !isFlushing) {
      setDisplayCount(pendingCount);
    } else {
      setDisplayCount(0);
    }
  }, [pendingCount, isPouring, isFlushing]);

  // Handle the pouring sequence
  useEffect(() => {
    const startPouring = async () => {
      setIsPouring(true);
      setDisplayCount(0); // Immediately show 0 units when pouring starts
      
      // 1. Tilt the vial
      setRotation(75);
      
      // 2. Wait for tilt to start, then start stream and drain
      await new Promise(resolve => setTimeout(resolve, 400));
      setStreamOpacity(1);
      
      // 3. Drain liquid to zero
      const startTime = Date.now();
      const duration = 1200; // Slightly faster drain
      const startH = displayHeight;
      
      const animateDrain = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const currentH = startH * (1 - progress);
        setDisplayHeight(currentH);
        
        if (progress < 1) {
          requestAnimationFrame(animateDrain);
        } else {
          // 4. Once empty, stop stream and return
          setStreamOpacity(0);
          setRotation(0);
          setTimeout(() => {
            setIsPouring(false);
          }, 800);
        }
      };
      
      animateDrain();
    };

    if (isFlushing && !prevFlushingRef.current && !isPouring) {
      startPouring();
    }
    
    prevFlushingRef.current = isFlushing;
  }, [isFlushing, isPouring]);

  // Update height based on units when NOT pouring or flushing
  useEffect(() => {
    if (!isPouring && !isFlushing) {
      setDisplayHeight(targetHeight);
    }
  }, [targetHeight, isPouring, isFlushing]);

  return (
    <div className={cn(
      "flex flex-col items-center gap-2 py-4 px-2 border rounded-lg relative overflow-hidden group transition-colors duration-300",
      theme === 'dark' ? "bg-zinc-900/20 border-zinc-800/50" : "bg-zinc-50 border-zinc-200"
    )}>
      {/* Header Info */}
      <div className="w-full flex justify-between items-center px-2 mb-2 z-10">
        <div className="text-[9px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
          <div className={cn(
            "w-1 h-1 rounded-full animate-pulse",
            theme === 'dark' ? "bg-purple-400" : "bg-purple-600"
          )} />
          {headerLabel}
        </div>
        <div className="flex items-baseline gap-1">
          <span className={cn(
            "text-sm font-black leading-none transition-colors",
            theme === 'dark' ? "text-purple-400" : "text-purple-600"
          )}>
            {displayCount}
          </span>
          <span className="text-[7px] uppercase text-zinc-600 tracking-tighter">{unitLabel}</span>
        </div>
      </div>

      {/* Main Animation Area */}
      <div className="relative w-full h-40 flex flex-col items-center">
        
        {/* The Vial */}
        <motion.div 
          className="relative w-10 h-24 z-20"
          style={{ originX: "50%", originY: "10%" }}
          animate={{ rotate: rotation }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          {/* Glass Body */}
          <div className="absolute inset-0 border-2 border-white/10 rounded-b-full rounded-t-sm overflow-hidden bg-white/5 backdrop-blur-[2px] shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
            
            {/* Liquid Simulation */}
            <div className="absolute inset-0 pointer-events-none">
              <motion.div 
                className="absolute w-[400%] h-[400%] left-[-150%]"
                style={{ 
                  bottom: "-150%", 
                  originX: "50%", 
                  originY: "62.5%" // Surface line at bottom of vial
                }}
                animate={{ 
                  y: `-${displayHeight / 4}%`,
                  rotate: -rotation // Inverse rotation to keep liquid horizontal
                }}
                transition={{ 
                  y: { type: "spring", stiffness: 40, damping: 15 },
                  rotate: { type: "spring", stiffness: 30, damping: 10 }
                }}
              >
                {/* Liquid Body */}
                <div className={cn(
                  "absolute top-[62.5%] left-0 right-0 bottom-0 bg-gradient-to-t",
                  theme === 'dark' 
                    ? "from-indigo-900/90 via-purple-600/70 to-fuchsia-400/50" 
                    : "from-indigo-600/90 via-purple-400/70 to-fuchsia-300/50"
                )}>
                  {/* Surface Glow Line */}
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-fuchsia-300 shadow-[0_0_10px_#e879f9]" />
                  
                  {/* Bubbles */}
                  {[...Array(4)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-1 h-1 bg-white/20 rounded-full"
                      style={{ left: `${20 + Math.random() * 60}%`, bottom: "0%" }}
                      animate={{ 
                        bottom: "100%",
                        opacity: [0, 1, 0],
                        x: [0, (Math.random() - 0.5) * 10, 0]
                      }}
                      transition={{ 
                        duration: 2 + Math.random() * 2,
                        repeat: Infinity,
                        delay: Math.random() * 2
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Glass Reflections */}
            <div className="absolute top-0 left-2 w-1 h-full bg-white/5 skew-x-6" />
            <div className="absolute top-0 right-2 w-0.5 h-full bg-white/5 -skew-x-6" />
          </div>
          
          {/* Vial Rim */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-12 h-2 border-2 border-white/10 rounded-full bg-white/5" />
        </motion.div>

        {/* Pouring Stream */}
        <div 
          className="absolute top-4 left-1/2 z-10 pointer-events-none"
          style={{ 
            width: '2px', 
            height: '100px',
            opacity: streamOpacity,
            transition: 'opacity 0.3s ease'
          }}
        >
          <motion.div 
            className="w-1 h-full bg-gradient-to-b from-fuchsia-400/80 via-purple-500/40 to-transparent blur-[1px]"
            animate={{ 
              scaleX: [1, 1.5, 1],
              x: [-1, 1, -1]
            }}
            transition={{ duration: 0.2, repeat: Infinity }}
          />
          {/* Splash Particles at bottom of stream */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-fuchsia-400 rounded-full"
                animate={{ 
                  x: [(Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40],
                  y: [0, -20 - Math.random() * 20],
                  opacity: [1, 0],
                  scale: [1, 0]
                }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        </div>

        {/* Memory Ocean */}
        <div className="absolute bottom-0 w-full h-12 px-2">
          <div className={cn(
            "relative w-full h-full border rounded-sm overflow-hidden flex items-center justify-center",
            theme === 'dark' ? "bg-black/40 border-zinc-800" : "bg-white border-zinc-200"
          )}>
            {/* Ocean Waves */}
            <motion.div 
              className={cn(
                "absolute inset-0 opacity-40",
                theme === 'dark' ? "bg-indigo-900/40" : "bg-indigo-50"
              )}
              animate={{ 
                y: [2, -2, 2],
                x: [-5, 5, -5]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-purple-500/30" />
            
            {/* Flush Stage Text */}
            <AnimatePresence mode="wait">
              {flushStatus && (
                <motion.div
                  key={flushStatus}
                  initial={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, scale: 1.1, filter: "blur(4px)" }}
                  className="relative z-10 text-[7px] font-mono text-fuchsia-300 font-bold uppercase tracking-tighter text-center px-1 drop-shadow-[0_0_3px_rgba(232,121,249,0.5)]"
                >
                  {flushStatus.replace(/_/g, ' ')}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Impact Ripple */}
            {streamOpacity > 0 && (
              <motion.div 
                className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-4 bg-fuchsia-400/20 blur-md rounded-full"
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            )}
          </div>
          <div className="text-[7px] uppercase font-bold text-zinc-600 tracking-widest mt-1 text-center">
            Memory Depository
          </div>
        </div>

      </div>
    </div>
  );
};
