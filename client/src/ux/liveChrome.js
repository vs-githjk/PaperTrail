import { prefersReducedMotion } from "./prefersReducedMotion";

/** @param {number} a @param {number} b @param {number} t */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function attachRipple(el) {
  const onDown = (e) => {
    if (e.button !== 0) return;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (cs.position === "static") el.style.position = "relative";
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const ring = document.createElement("span");
    ring.className = "ux-ripple";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    el.appendChild(ring);
    requestAnimationFrame(() => ring.classList.add("ux-ripple-active"));
    const done = () => ring.remove();
    ring.addEventListener("animationend", done, { once: true });
    setTimeout(done, 520);
  };
  el.addEventListener("pointerdown", onDown);
  return () => el.removeEventListener("pointerdown", onDown);
}

/** @param {HTMLElement} el */
function attachCompositorWillChange(el) {
  const onEnter = () => {
    el.style.willChange = "transform, opacity";
  };
  const onLeave = () => {
    el.style.willChange = "auto";
  };
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);
  return () => {
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", onLeave);
    el.style.willChange = "";
  };
}

/**
 * Spotlight / ::before glow only — no 3D tilt or [data-depth] parallax.
 * @param {HTMLElement} card
 */
function attachCardGlowOnly(card) {
  if (card.querySelector("input, textarea, select, table")) return () => {};

  let hovering = false;
  let lastCX = 0;
  let lastCY = 0;
  let tickId = 0;

  const flushGlow = () => {
    tickId = 0;
    if (!hovering) return;
    const r = card.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    card.style.setProperty("--mouse-x", `${lastCX - r.left}px`);
    card.style.setProperty("--mouse-y", `${lastCY - r.top}px`);
  };

  /** @param {PointerEvent} e */
  const onMove = (e) => {
    lastCX = e.clientX;
    lastCY = e.clientY;
    cancelAnimationFrame(tickId);
    tickId = requestAnimationFrame(flushGlow);
  };

  /** @param {PointerEvent} e */
  const onEnter = (e) => {
    hovering = true;
    card.classList.add("ux-card-active");
    lastCX = e.clientX;
    lastCY = e.clientY;
    cancelAnimationFrame(tickId);
    tickId = requestAnimationFrame(flushGlow);
  };

  const onLeave = () => {
    hovering = false;
    cancelAnimationFrame(tickId);
    tickId = 0;
    card.classList.remove("ux-card-active");
    card.style.willChange = "";
  };

  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerenter", onEnter);
  card.addEventListener("pointerleave", onLeave);

  return () => {
    cancelAnimationFrame(tickId);
    card.removeEventListener("pointermove", onMove);
    card.removeEventListener("pointerenter", onEnter);
    card.removeEventListener("pointerleave", onLeave);
    card.classList.remove("ux-card-active");
    card.style.willChange = "";
  };
}

function attachCardTilt(card) {
  if (card.querySelector("input, textarea, select, table")) return () => {};

  const max = 6;
  let hovering = false;
  let lastCX = 0;
  let lastCY = 0;
  let curNx = 0;
  let curNy = 0;
  let tickId = 0;

  const stopTick = () => {
    if (tickId) {
      cancelAnimationFrame(tickId);
      tickId = 0;
    }
  };

  const tick = () => {
    tickId = 0;
    const r = card.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      if (hovering) tickId = requestAnimationFrame(tick);
      return;
    }

    let tgtNx = 0;
    let tgtNy = 0;
    if (hovering) {
      tgtNx = ((lastCX - r.left) / r.width - 0.5) * 2;
      tgtNy = ((lastCY - r.top) / r.height - 0.5) * 2;
    }

    const factor = hovering ? 0.08 : 0.06;
    curNx = lerp(curNx, tgtNx, factor);
    curNy = lerp(curNy, tgtNy, factor);

    const settled = !hovering && Math.abs(curNx) < 0.002 && Math.abs(curNy) < 0.002;
    if (settled) {
      curNx = 0;
      curNy = 0;
      card.style.setProperty("--tilt-x", "0deg");
      card.style.setProperty("--tilt-y", "0deg");
      card.querySelectorAll("[data-depth]").forEach((inner) => {
        inner.style.transform = "";
      });
      card.style.willChange = "";
      return;
    }

    const caughtUp =
      hovering &&
      Math.abs(curNx - tgtNx) < 2e-4 &&
      Math.abs(curNy - tgtNy) < 2e-4;
    if (caughtUp) {
      curNx = tgtNx;
      curNy = tgtNy;
    }

    const rx = Math.max(-max, Math.min(max, -curNy * max));
    const ry = Math.max(-max, Math.min(max, curNx * max));
    const mx = (curNx * 0.5 + 0.5) * r.width;
    const my = (curNy * 0.5 + 0.5) * r.height;

    card.style.setProperty("--tilt-x", `${rx}deg`);
    card.style.setProperty("--tilt-y", `${ry}deg`);
    card.style.setProperty("--mouse-x", `${mx}px`);
    card.style.setProperty("--mouse-y", `${my}px`);

    card.querySelectorAll("[data-depth]").forEach((inner) => {
      const d = Number(inner.getAttribute("data-depth")) || 0.3;
      inner.style.transform = `translate3d(${curNx * d * 12}px, ${curNy * d * 12}px, 0)`;
    });

    if (caughtUp) {
      card.style.willChange = "";
      return;
    }

    card.style.willChange = "transform";
    tickId = requestAnimationFrame(tick);
  };

  const scheduleTick = () => {
    if (!tickId) tickId = requestAnimationFrame(tick);
  };

  /** @param {PointerEvent} e */
  const onMove = (e) => {
    lastCX = e.clientX;
    lastCY = e.clientY;
    scheduleTick();
  };

  /** @param {PointerEvent} e */
  const onEnter = (e) => {
    hovering = true;
    card.classList.add("ux-card-active");
    lastCX = e.clientX;
    lastCY = e.clientY;
    scheduleTick();
  };

  const onLeave = () => {
    hovering = false;
    card.classList.remove("ux-card-active");
    scheduleTick();
  };

  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerenter", onEnter);
  card.addEventListener("pointerleave", onLeave);

  return () => {
    stopTick();
    card.removeEventListener("pointermove", onMove);
    card.removeEventListener("pointerenter", onEnter);
    card.removeEventListener("pointerleave", onLeave);
    card.style.willChange = "";
    card.classList.remove("ux-card-active");
    card.querySelectorAll("[data-depth]").forEach((inner) => {
      inner.style.transform = "";
    });
  };
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountLiveChrome(root) {
  if (!root) return () => {};
  if (prefersReducedMotion()) return () => {};

  const btnSel =
    "button.pt-btn-primary, button.secondary-btn, button.workbench-refresh-btn, button.nav-link-btn, button.modal-close-btn, button.tree-node-badge-btn, button.hero-inline-btn, a.paper-link-btn, button.text-link-btn, button.save-paper-btn, button.tree-cta, button.inspector-seed-btn, button.pt-btn-destructive, button.history-remove-btn, button.history-clear-all-btn, button.seed-chip, button.workspace-btn, button.paper-btn, button.brand-home-btn";

  /** @type {(() => void)[]} */
  let cleanups = [];

  const scan = () => {
    cleanups.forEach((fn) => fn());
    cleanups = [];

    root.querySelectorAll(btnSel).forEach((el) => {
      if (el.disabled) return;
      cleanups.push(attachRipple(el));
      cleanups.push(attachCompositorWillChange(el));
    });

    root.querySelectorAll(".ux-card-tilt.ux-card-tilt--glow-only").forEach((card) => {
      cleanups.push(attachCardGlowOnly(card));
    });

    root.querySelectorAll(".ux-card-tilt:not(.ux-card-tilt--glow-only)").forEach((card) => {
      cleanups.push(attachCardTilt(card));
    });
  };

  scan();

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      scan();
    });
  };

  const mo = new MutationObserver(() => schedule());
  mo.observe(root, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    if (raf) cancelAnimationFrame(raf);
    cleanups.forEach((fn) => fn());
    cleanups = [];
  };
}
