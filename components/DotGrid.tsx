"use client";

import { useEffect, useRef } from "react";

const SPACING = 20;
const BASE_RADIUS = 0.75;
const HOVER_RADIUS = 1.5;
const BASE_COLOR = "#D6D3D1";
const INFLUENCE = 120;

export default function DotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const raf = useRef(0);

  useEffect(() => {
    const cvs = canvasRef.current!;
    const ctx = cvs.getContext("2d")!;

    let w = window.innerWidth;
    let h = window.innerHeight;

    function resize() {
      w = window.innerWidth;
      h = window.innerHeight;
      cvs.width = w * devicePixelRatio;
      cvs.height = h * devicePixelRatio;
      cvs.style.width = w + "px";
      cvs.style.height = h + "px";
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const mx = mouse.current.x;
      const my = mouse.current.y;

      for (let x = SPACING / 2; x < w; x += SPACING) {
        for (let y = SPACING / 2; y < h; y += SPACING) {
          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < INFLUENCE) {
            const t = 1 - dist / INFLUENCE;
            const radius = BASE_RADIUS + (HOVER_RADIUS - BASE_RADIUS) * t;
            const r = Math.round(214 + (168 - 214) * t);
            const g = Math.round(211 + (162 - 211) * t);
            const b = Math.round(209 + (158 - 209) * t);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = BASE_COLOR;
            ctx.beginPath();
            ctx.arc(x, y, BASE_RADIUS, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    function onMove(e: MouseEvent) {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    }

    function loop() {
      draw();
      raf.current = requestAnimationFrame(loop);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
}
