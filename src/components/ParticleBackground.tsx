import React, { useEffect, useRef } from "react";

export const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let mouse = { x: 0, y: 0, radius: 100 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    class Particle {
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      density: number;
      color: string;

      constructor(x: number, y: number) {
        this.x = Math.random() * canvas!.width;
        this.y = Math.random() * canvas!.height;
        this.baseX = x;
        this.baseY = y;
        this.size = Math.random() * 1.5 + 1.0; // Slightly larger for clarity
        this.density = (Math.random() * 30) + 1;
        this.color = `rgba(34, 211, 238, ${Math.random() * 0.7 + 0.3})`; // More solid colors
      }

      draw() {
        ctx!.shadowBlur = 0; // Completely sharp, no glow
        ctx!.shadowColor = "transparent";
        ctx!.fillStyle = this.color;
        ctx!.beginPath();
        ctx!.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx!.closePath();
        ctx!.fill();
        ctx!.shadowBlur = 0;
      }

      update() {
        let dx = mouse.x - this.x;
        let dy = mouse.y - this.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let forceDirectionX = dx / distance;
        let forceDirectionY = dy / distance;
        let maxDistance = mouse.radius;
        let force = (maxDistance - distance) / maxDistance;
        let directionX = forceDirectionX * force * this.density;
        let directionY = forceDirectionY * force * this.density;

        if (distance < mouse.radius) {
          this.x -= directionX;
          this.y -= directionY;
        } else {
          if (this.x !== this.baseX) {
            let dx = this.x - this.baseX;
            this.x -= dx / 10;
          }
          if (this.y !== this.baseY) {
            let dy = this.y - this.baseY;
            this.y -= dy / 10;
          }
        }
      }
    }

    const init = () => {
      particles = [];
      ctx.fillStyle = "white";
      ctx.font = "bold 120px Arial"; // Even larger font for more particles
      const text = "CSE";
      const metrics = ctx.measureText(text);
      const textWidth = Math.ceil(metrics.width);
      const textHeight = 150;
      
      // Clear a small area to draw text
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillText(text, 0, 100);
      const textCoordinates = ctx.getImageData(0, 0, textWidth, textHeight);

      // Scale and center the text on the main canvas
      const scale = Math.min(canvas.width, canvas.height) / 400;
      const offsetX = (canvas.width - textWidth * scale) / 2;
      const offsetY = (canvas.height - textHeight * scale) / 2;

      // Scan every pixel for maximum density
      for (let y = 0; y < textCoordinates.height; y++) {
        for (let x = 0; x < textCoordinates.width; x++) {
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
      requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.x;
      mouse.y = e.y;
    };

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", handleMouseMove);
    resize();
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[-1] opacity-100 bg-[#050505]"
    />
  );
};
