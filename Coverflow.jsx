// Coverflow carousel — plain React port (no framer-motion / Framer runtime).
// One shared `pos` ref drives every card's slide + size via a single rAF loop
// writing styles straight to the DOM, so there are no per-frame re-renders.
const { useRef, useEffect, useMemo, useCallback } = React;

const GRADIENT_FALLBACKS = [
  "linear-gradient(160deg,#1e3a8a,#3b82f6)",
  "linear-gradient(160deg,#3730a3,#6366f1)",
  "linear-gradient(160deg,#0e7490,#22d3ee)",
  "linear-gradient(160deg,#5b21b6,#8b5cf6)",
  "linear-gradient(160deg,#1e40af,#38bdf8)",
  "linear-gradient(160deg,#155e75,#2dd4bf)",
  "linear-gradient(160deg,#4338ca,#818cf8)",
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Signed distance of card `index` from centre at position `pos`, wrapped into
// (-count/2, count/2] so the loop seam sits where opacity is already 0.
function relOf(index, pos, count) {
  let rel = (((index - pos) % count) + count) % count;
  if (rel > count / 2) rel -= count;
  return rel;
}

// Horizontal px offset from centre for a signed distance `rel`.
function xForRel(rel, s, gap) {
  const ar = Math.abs(rel);
  const c1 = s.activeWidth / 2 + gap + s.restWidth / 2;
  const pitch = s.restWidth + gap;
  const mag = ar <= 1 ? ar * c1 : c1 + (ar - 1) * pitch;
  return (rel < 0 ? -1 : 1) * mag;
}

function blendForRel(rel) { return Math.min(Math.abs(rel), 1); }

function Coverflow(props) {
  const images = useMemo(
    () => (Array.isArray(props.images) && props.images.length ? props.images : []),
    [props.images]
  );
  const count = Math.max(1, images.length);

  const activeWidth = Number(props.activeWidth) || 560;
  const activeHeight = Number(props.activeHeight) || 360;
  const restWidth = Number(props.restWidth) || 190;
  const restHeight = Number(props.restHeight) || 250;
  const gap = Number(props.gap) || 26;
  const radius = props.radius == null ? 6 : Number(props.radius);
  const showArrows = props.showArrows !== false;
  const arrowColor = props.arrowColor || "#0b0d14";
  const arrowBackground = props.arrowBackground || "rgba(255,255,255,0.92)";
  const arrowSize = Number(props.arrowSize) || 52;
  const arrowPosition = props.arrowPosition == null ? 92 : Number(props.arrowPosition);
  const autoplay = !!props.autoplay;
  const autoplayDirection = props.autoplayDirection || "rightToLeft";
  const moveDur = Number(props.moveDur) || 0.5;
  const dwell = props.dwell == null ? 1.6 : Number(props.dwell);

  const sizing = { activeWidth, activeHeight, restWidth, restHeight };
  const R = Math.max(1, Math.min(6, Math.floor(count / 2) - 1));

  const outerRefs = useRef([]);
  const innerRefs = useRef([]);
  const titleRefs = useRef([]);
  const ctaRefs = useRef([]);

  const posRef = useRef(0);
  const targetRef = useRef(0);
  const rafRef = useRef(null);
  const lastTRef = useRef(null);
  const autoplayingRef = useRef(false);
  const dirRef = useRef(1);
  const dwellAccRef = useRef(0);

  const apply = useCallback(() => {
    const p = posRef.current;
    for (let i = 0; i < count; i++) {
      const outer = outerRefs.current[i];
      const inner = innerRefs.current[i];
      if (!outer || !inner) continue;
      const rel = relOf(i, p, count);
      const ar = Math.abs(rel);
      const x = xForRel(rel, sizing, gap);
      const opacity = ar <= R ? 1 : ar >= R + 1 ? 0 : 1 - (ar - R);
      const z = Math.round(1000 - ar * 100);
      const a = blendForRel(rel);
      const w = activeWidth + (restWidth - activeWidth) * a;
      const h = activeHeight + (restHeight - activeHeight) * a;
      const br = (clamp(radius, 0, 20) / 20) * (Math.min(w, h) / 2);
      outer.style.transform = `translateX(${x}px)`;
      outer.style.zIndex = String(z);
      outer.style.opacity = String(opacity);
      outer.style.pointerEvents = opacity < 0.05 ? "none" : "auto";
      inner.style.width = w + "px";
      inner.style.height = h + "px";
      inner.style.borderRadius = br + "px";
      inner.style.boxShadow = ar < 0.5
        ? "0 30px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)"
        : "0 16px 44px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.06)";
      const tl = titleRefs.current[i];
      if (tl) tl.style.opacity = String(clamp(1 - ar * 1.1, 0, 1));
      const cta = ctaRefs.current[i];
      if (cta) cta.style.pointerEvents = ar < 0.35 ? "auto" : "none";
    }
  }, [count, R, gap, radius, activeWidth, activeHeight, restWidth, restHeight]);

  const tick = useCallback((t) => {
    const last = lastTRef.current == null ? t : lastTRef.current;
    const dt = Math.min((t - last) / 1000, 1 / 30);
    lastTRef.current = t;
    const cur = posRef.current;
    const diff = targetRef.current - cur;
    const dur = Math.max(0.08, moveDur);
    const step = (1 / dur) * dt;
    const arriving = Math.abs(diff) <= step;
    if (arriving) {
      posRef.current = targetRef.current;
      apply();
      if (autoplayingRef.current) {
        dwellAccRef.current += dt;
        if (dwellAccRef.current >= Math.max(0, dwell)) {
          dwellAccRef.current = 0;
          targetRef.current += dirRef.current;
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      rafRef.current = null;
      lastTRef.current = null;
      return;
    }
    posRef.current = cur + Math.sign(diff) * step;
    apply();
    rafRef.current = requestAnimationFrame(tick);
  }, [apply, moveDur, dwell]);

  const ensureRunning = useCallback(() => {
    if (rafRef.current == null) {
      lastTRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  const goNext = useCallback(() => { targetRef.current += 1; ensureRunning(); }, [ensureRunning]);
  const goPrev = useCallback(() => { targetRef.current -= 1; ensureRunning(); }, [ensureRunning]);
  const goTo = useCallback((index) => {
    const cur = targetRef.current;
    let d = index - cur;
    d = ((d % count) + count) % count;
    if (d > count / 2) d -= count;
    targetRef.current = cur + d;
    ensureRunning();
  }, [ensureRunning, count]);

  useEffect(() => { apply(); }, [apply]);

  useEffect(() => {
    const on = autoplay && count > 1;
    autoplayingRef.current = on;
    if (on) {
      dirRef.current = autoplayDirection === "leftToRight" ? -1 : 1;
      dwellAccRef.current = 0;
      ensureRunning();
    }
    return () => { autoplayingRef.current = false; };
  }, [autoplay, autoplayDirection, count, ensureRunning]);

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const selectable = true; // clickable even while autoplaying — click jumps to a card

  const cards = images.map((img, i) => {
    const src = img && img.srcUrl ? img.srcUrl : "";
    const grad = GRADIENT_FALLBACKS[i % GRADIENT_FALLBACKS.length];
    return React.createElement(
      "div",
      {
        key: i,
        ref: (el) => (outerRefs.current[i] = el),
        onClick: selectable ? () => goTo(i) : undefined,
        style: {
          position: "absolute", left: "50%", top: "50%",
          cursor: selectable ? "pointer" : "default",
        },
      },
      React.createElement(
        "div",
        {
          ref: (el) => (innerRefs.current[i] = el),
          style: {
            transform: "translate(-50%,-50%)",
            width: activeWidth, height: activeHeight,
            overflow: "hidden", background: grad,
            position: "relative",
          },
        },
        src
          ? React.createElement("img", {
              src, alt: img.title || "",
              draggable: false,
              style: { width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none", userSelect: "none" },
            })
          : null,
        // Bottom gradient scrim (only over gradient placeholders; real covers carry their own art)
        React.createElement("div", {
          style: {
            position: "absolute", inset: 0,
            background: src
              ? "linear-gradient(to top, rgba(6,8,14,0.55) 0%, transparent 34%)"
              : "linear-gradient(to top, rgba(6,8,14,0.82) 0%, rgba(6,8,14,0.28) 42%, transparent 70%)",
            pointerEvents: "none",
          },
        }),
        React.createElement(
          "div",
          {
            ref: (el) => (titleRefs.current[i] = el),
            style: {
              position: "absolute", left: 28, right: 28, bottom: 26,
              pointerEvents: "none", fontFamily: "'Inter',sans-serif",
              transition: "opacity 0.2s ease",
            },
          },
          !src && img && img.tag
            ? React.createElement("div", {
                style: {
                  display: "inline-block", fontSize: 11, fontWeight: 600,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  color: "#bcd0ff", background: "rgba(47,107,255,0.28)",
                  border: "1px solid rgba(120,160,255,0.45)", borderRadius: 999,
                  padding: "4px 11px", marginBottom: 12,
                },
              }, img.tag)
            : null,
          !src
            ? React.createElement("div", {
                style: { fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.15, letterSpacing: "-0.01em" },
              }, (img && img.title) || "")
            : null,
          !src && img && img.subtitle
            ? React.createElement("div", {
                style: { fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.7)", marginTop: 7 },
              }, img.subtitle)
            : null,
          img && img.link
            ? React.createElement("a", {
                ref: (el) => (ctaRefs.current[i] = el),
                href: img.link,
                onClick: (e) => e.stopPropagation(),
                style: {
                  marginTop: 18, display: "inline-flex", alignItems: "center", gap: 8,
                  width: "fit-content", pointerEvents: "none", textDecoration: "none",
                  background: "#2f6bff", color: "#fff", fontSize: 14.5, fontWeight: 600,
                  padding: "11px 20px", borderRadius: 999,
                  boxShadow: "0 10px 26px rgba(47,107,255,0.5)",
                },
              }, "View Project", React.createElement("span", { style: { fontSize: 17, lineHeight: 1 } }, "\u2192"))
            : React.createElement("span", {
                ref: (el) => (ctaRefs.current[i] = el),
                style: {
                  marginTop: 18, display: "inline-block", width: "fit-content",
                  background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)",
                  fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "8px 15px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.2)",
                },
              }, "Coming soon")
        )
      )
    );
  });

  function Arrow(side) {
    const isLeft = side === "left";
    const p = clamp(arrowPosition, 0, 100);
    const inset = `calc((50% - ${arrowSize}px) * ${(100 - p) / 100})`;
    return React.createElement(
      "button",
      {
        type: "button",
        "aria-label": isLeft ? "Previous" : "Next",
        onClick: (e) => { e.stopPropagation(); isLeft ? goPrev() : goNext(); },
        style: {
          position: "absolute", top: "50%",
          [isLeft ? "left" : "right"]: inset,
          transform: "translateY(-50%)",
          width: arrowSize, height: arrowSize, borderRadius: "50%",
          border: "none", background: arrowBackground, color: arrowColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, zIndex: 2000,
          boxShadow: "0 8px 22px rgba(0,0,0,0.4)",
          WebkitTapHighlightColor: "transparent",
          backdropFilter: "blur(6px)",
        },
      },
      React.createElement(
        "svg",
        { width: arrowSize * 0.4, height: arrowSize * 0.4, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", style: { pointerEvents: "none" } },
        React.createElement("polyline", { points: isLeft ? "15 18 9 12 15 6" : "9 18 15 12 9 6" })
      )
    );
  }

  return React.createElement(
    "div",
    {
      style: {
        position: "relative", width: "100%", height: "100%",
        minWidth: 320, minHeight: 240, overflow: "hidden",
        userSelect: "none", touchAction: "pan-y",
      },
    },
    React.createElement("div", { style: { position: "absolute", inset: 0, isolation: "isolate", zIndex: 0 } }, cards),
    showArrows && count > 1 ? Arrow("left") : null,
    showArrows && count > 1 ? Arrow("right") : null
  );
}

window.Coverflow = Coverflow;
if (typeof module !== "undefined") module.exports = { Coverflow };
