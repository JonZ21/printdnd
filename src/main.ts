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

const video = document.querySelector<HTMLVideoElement>("#wrist-cam");
if (video) {
  if (reducedMotion) {
    // Leave it on the poster frame; the caption still explains what it is.
    video.controls = true;
  } else {
    const videoObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void video.play().catch(() => {});
          else video.pause();
        }
      },
      { threshold: 0.25 },
    );
    videoObserver.observe(video);
  }
}

/* ---------------------------------------------------------------------- robot */

const stage = document.querySelector<HTMLElement>("#robot-stage");
const canvas = document.querySelector<HTMLCanvasElement>("#robot-canvas");
const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-step]"));
const resetSection = document.querySelector<HTMLElement>("#reset");

const frameEl = document.querySelector<HTMLElement>("#tm-frame");
const totalEl = document.querySelector<HTMLElement>("#tm-total");
const timeEl = document.querySelector<HTMLElement>("#tm-time");

const pad = (value: number, width: number) => String(value).padStart(width, "0");

function markActiveStep() {
  if (steps.length === 0) return;
  const focus = window.innerHeight * 0.46;
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  steps.forEach((step, index) => {
    const box = step.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) return;
    const distance = Math.abs(box.top + box.height / 2 - focus);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });

  steps.forEach((step, index) => step.classList.toggle("is-active", index === best));
}

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

  const onScroll = () => {
    // The episode is scrubbed across the span from the top of the page to the end of
    // the reset section -- exactly the stretch where the robot is on screen.
    const end = resetSection
      ? resetSection.offsetTop + resetSection.offsetHeight - window.innerHeight * 0.9
      : window.innerHeight * 3;
    const progress = end > 0 ? window.scrollY / end : 0;
    handle.setProgress(Math.min(Math.max(progress, 0), 1));

    // Fade the robot out once the page moves on to the footage.
    const fadeStart = end;
    const fadeOver = window.innerHeight * 0.75;
    const fade = 1 - Math.min(Math.max((window.scrollY - fadeStart) / fadeOver, 0), 1);
    canvas.style.opacity = fade.toFixed(3);

    markActiveStep();
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
