import React from "react";
import { motion } from "motion/react";

interface BufferVialProps {
  pendingCount: number;
  maxCount?: number;
}

export const BufferVial: React.FC<BufferVialProps> = ({ pendingCount, maxCount = 10 }) => {
  const fillPercentage = Math.min((pendingCount / maxCount) * 100, 100);

  return (
    <div className="flex flex-col items-center gap-3 py-6 px-4 bg-zinc-900/20 border border-zinc-800/50 rounded-lg relative overflow-hidden group">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
      
      <div className="text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500 mb-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
        Memory Buffer
      </div>

      <div className="relative w-16 h-32 border-2 border-zinc-700/50 rounded-b-2xl rounded-t-md overflow-hidden bg-black/40 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
        {/* Glass Reflection */}
        <div className="absolute top-0 left-1/4 w-1 h-full bg-white/5 skew-x-12 z-20 pointer-events-none" />
        
        {/* Liquid Container */}
        <motion.div 
          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-purple-600 via-blue-500 to-cyan-400"
          initial={{ height: 0 }}
          animate={{ height: `${fillPercentage}%` }}
          transition={{ type: "spring", stiffness: 50, damping: 20 }}
        >
          {/* Bubbles */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-white/40 rounded-full"
              initial={{ bottom: -10, left: `${Math.random() * 80 + 10}%` }}
              animate={{ 
                bottom: "120%",
                opacity: [0, 1, 0],
                scale: [0.5, 1.2, 0.8]
              }}
              transition={{ 
                duration: 2 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2
              }}
            />
          ))}

          {/* Wave Effect */}
          <motion.div 
            className="absolute -top-4 left-[-50%] w-[200%] h-8 bg-cyan-300/30 blur-md rounded-[40%]"
            animate={{ 
              rotate: [0, 360],
              x: ["-10%", "10%", "-10%"]
            }}
            transition={{ 
              rotate: { duration: 4, repeat: Infinity, ease: "linear" },
              x: { duration: 3, repeat: Infinity, ease: "easeInOut" }
            }}
          />
        </motion.div>

        {/* Measurement Lines */}
        <div className="absolute inset-0 flex flex-col justify-between py-4 pointer-events-none opacity-20">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-2 h-[1px] bg-white ml-auto" />
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 leading-none">
          {pendingCount}
        </span>
        <span className="text-[8px] uppercase text-zinc-600 tracking-widest mt-1">Pending Units</span>
      </div>
    </div>
  );
};
