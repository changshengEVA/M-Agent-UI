import React, { useEffect, useRef } from "react";

interface ParticleBackgroundProps {
  theme: "dark" | "light";
  active: boolean;
}

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({ theme, active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let mouse = { x: 0, y: 0, radius: 100 };
    let frameId: number | null = null;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (active) {
        init();
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    class Particle {
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      density: number;
      color: string;
      vx: number;
      vy: number;

      constructor(x: number, y: number) {
        this.x = x + (Math.random() - 0.5) * 100;
        this.y = y + (Math.random() - 0.5) * 100;
        this.baseX = x;
        this.baseY = y;
        this.size = Math.random() * 1.2 + 0.8;
        this.density = (Math.random() * 20) + 5;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        
        const cyan = theme === "dark" ? "34, 211, 238" : "8, 145, 178";
        this.color = `rgba(${cyan}, ${Math.random() * 0.5 + 0.3})`;
      }

      draw() {
        ctx!.fillStyle = this.color;
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.closePath();
        ctx!.fill();
      }

      update() {
        // Random walk component
        this.vx += (Math.random() - 0.5) * 0.2;
        this.vy += (Math.random() - 0.5) * 0.2;
        
        // Damping
        this.vx *= 0.95;
        this.vy *= 0.95;

        // Restoring force (spring)
        const dxBase = this.baseX - this.x;
        const dyBase = this.baseY - this.y;
        this.vx += dxBase * 0.01;
        this.vy += dyBase * 0.01;

        // Mouse interaction
        let dxMouse = mouse.x - this.x;
        let dyMouse = mouse.y - this.y;
        let distance = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
        
        if (distance > 0 && distance < mouse.radius) {
          let force = (mouse.radius - distance) / mouse.radius;
          let forceDirectionX = dxMouse / distance;
          let forceDirectionY = dyMouse / distance;
          this.vx -= forceDirectionX * force * 5;
          this.vy -= forceDirectionY * force * 5;
        }

        this.x += this.vx;
        this.y += this.vy;
      }
    }

    const init = () => {
      particles = [];
      ctx.fillStyle = "white";
      ctx.font = "bold 120px Arial";
      const text = "CSE";
      const metrics = ctx.measureText(text);
      const textWidth = Math.ceil(metrics.width);
      const textHeight = 150;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(text, 0, 100);
      const textCoordinates = ctx.getImageData(0, 0, textWidth, textHeight);

      const scale = Math.min(canvas.width, canvas.height) / 400;
      const offsetX = (canvas.width - textWidth * scale) / 2;
      const offsetY = (canvas.height - textHeight * scale) / 2;

      // Sample every 3rd pixel for performance and a "cloudy" look
      for (let y = 0; y < textCoordinates.height; y += 3) {
        for (let x = 0; x < textCoordinates.width; x += 3) {
          if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
            let positionX = x * scale + offsetX;
            let positionY = y * scale + offsetY;
            particles.push(new Particle(positionX, positionY));
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        particles[i].draw();
        particles[i].update();
      }
      frameId = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.x;
      mouse.y = e.y;
    };

    const clearCanvas = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener("resize", resize);
    resize();

    if (active) {
      window.addEventListener("mousemove", handleMouseMove);
      animate();
    } else {
      clearCanvas();
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [theme, active]);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-[-1] opacity-100 transition-colors duration-300 ${
        theme === "dark" ? "bg-[#050505]" : "bg-[#f4f4f5]"
      }`}
    />
  );
};
