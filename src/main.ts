import Lenis from "lenis";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/sections.css";

import { mountRobot, supportsWebGL } from "./three/scene";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------- smooth scroll */

if (!reducedMotion) {
  const lenis = new Lenis({ lerp: 0.1 });
  const raf = (time: number) => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}

/* ---------------------------------------------------------------------- reveals */

const revealables = document.querySelectorAll<HTMLElement>("[data-reveal]");
if (reducedMotion) {
  revealables.forEach((element) => element.classList.add("is-visible"));
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px" },
  );
  revealables.forEach((element) => revealObserver.observe(element));
}

/* ------------------------------------------------------------------ wrist cam */

const clips = document.querySelectorAll<HTMLVideoElement>("video[data-clip]");
if (reducedMotion) {
  // Leave them on their poster frames; the captions still explain what they are.
  clips.forEach((clip) => {
    clip.controls = true;
  });
} else {
  const clipObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const clip = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) void clip.play().catch(() => {});
        else clip.pause();
      }
    },
    { threshold: 0.25 },
  );
  clips.forEach((clip) => clipObserver.observe(clip));
}

/* ---------------------------------------------------------------------- robot */

const stage = document.querySelector<HTMLElement>("#robot-stage");
const canvas = document.querySelector<HTMLCanvasElement>("#robot-canvas");
// The robot lives alongside "how we built it", where the recorded episode is the point.
const robotSection = document.querySelector<HTMLElement>("#built");

const frameEl = document.querySelector<HTMLElement>("#tm-frame");
const totalEl = document.querySelector<HTMLElement>("#tm-total");
const timeEl = document.querySelector<HTMLElement>("#tm-time");

const pad = (value: number, width: number) => String(value).padStart(width, "0");

async function start() {
  if (!stage || !canvas) return;

  if (!supportsWebGL()) {
    document.body.classList.add("no-webgl");
    stage.classList.add("is-ready");
    return;
  }

  let handle: Awaited<ReturnType<typeof mountRobot>>;
  try {
    handle = await mountRobot(canvas);
  } catch (error) {
    console.error("robot failed to mount", error);
    document.body.classList.add("no-webgl");
    stage.classList.add("is-ready");
    return;
  }

  stage.classList.add("is-ready");

  handle.onFrame((frame, total, seconds) => {
    if (frameEl) frameEl.textContent = pad(frame, 3);
    if (totalEl) totalEl.textContent = pad(total - 1, 3);
    if (timeEl) timeEl.textContent = seconds.toFixed(1);
  });

  const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

  const onScroll = () => {
    const viewport = window.innerHeight;

    if (!robotSection) return;

    const top = robotSection.offsetTop;
    const bottom = top + robotSection.offsetHeight;

    // The episode is scrubbed across the section: it starts as the section comes into
    // view and finishes as the last of it leaves.
    const from = top - viewport * 0.75;
    const to = bottom - viewport * 0.6;
    handle.setProgress(to > from ? clamp01((window.scrollY - from) / (to - from)) : 0);

    // Visibility is driven by how much of the section the viewport is actually showing,
    // which behaves the same on a short phone hero as on a wide desktop one. Keying it
    // to scroll offsets instead lets the robot bleed into the hero whenever the
    // viewport is taller than the hero.
    const rect = robotSection.getBoundingClientRect();
    const shown = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
    const coverage = clamp01(shown / Math.min(rect.height, viewport));
    canvas.style.opacity = clamp01((coverage - 0.45) / 0.3).toFixed(3);
  };

  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      onScroll();
    });
  };

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  onScroll();
}

void start();
