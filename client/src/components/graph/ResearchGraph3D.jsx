import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import SpriteText from "three-spritetext";

function truncateTitle(title, max = 42) {
  const t = String(title || "Untitled paper");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function useGraphThemeColors() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(() => setTick((n) => n + 1));
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fallback) => {
      const value = cs.getPropertyValue(name).trim();
      return value || fallback;
    };
    return {
      seed: pick("--color-purple-600", "#7c3aed"),
      overview: pick("--pt-branch-dot-overview", "#38bdf8"),
      foundational_theory: pick("--pt-branch-dot-foundational", "#7c3aed"),
      methodology: pick("--pt-branch-dot-methodology", "#059669"),
      applied_supporting: pick("--pt-branch-dot-applied", "#d97706"),
      fallback: pick("--color-purple-500", "#8b5cf6"),
      background: pick("--color-bg-base", "#0e0e10"),
      linkLineage: pick("--color-accent-default", "#a78bfa"),
      linkContext: pick("--color-purple-400", "#a78bfa")
    };
  }, [tick]);
}

function pickNodeColor(node, palette) {
  if (node.kind === "seed") return palette.seed;
  const bt = node.branchType || "applied_supporting";
  return palette[bt] || palette.fallback;
}

/** Move camera halfway toward the orbit target (~2× zoom vs previous distance). */
function nudgeCameraZoom2x(graphRef) {
  const g = graphRef?.current;
  if (!g) return;
  const cam = g.camera();
  const ctl = g.controls?.();
  if (!cam || !ctl?.target) return;
  const target = ctl.target.clone();
  const offset = cam.position.clone().sub(target);
  const len = offset.length();
  if (len < 1e-4) return;
  offset.multiplyScalar(0.5);
  cam.position.copy(target.clone().add(offset));
  ctl.update?.();
}

export default function ResearchGraph3D({ graph, height, selectedNodeId, onNodeSelect }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const defaultZoomDoneRef = useRef(false);
  const [width, setWidth] = useState(0);
  const [hoverId, setHoverId] = useState(null);
  const palette = useGraphThemeColors();

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const fgData = useMemo(() => {
    const nodes = graph.nodes.map((n) => ({
      ...n,
      val:
        3 +
        Math.min(8, Math.sqrt((n.citationCount || 0) + 1) * 0.28) +
        (n.depth === 0 ? 1.8 : Math.max(0, 3 - Number(n.depth || 0)) * 0.25)
    }));
    const links = graph.links.map((l) => ({ ...l, source: l.source, target: l.target }));
    return { nodes, links };
  }, [graph]);

  useEffect(() => {
    defaultZoomDoneRef.current = false;
  }, [fgData]);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setWidth(Math.max(1, Math.floor(r.width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nodeColor = useCallback((node) => pickNodeColor(node, palette), [palette]);

  const linkColor = useCallback(
    (link) => (link.kind === "lineage" ? palette.linkLineage : palette.linkContext),
    [palette]
  );

  const nodeThreeObject = useCallback(
    (node) => {
      const showLabel = node.kind === "seed" || hoverId === node.id;
      const sprite = new SpriteText(showLabel ? truncateTitle(node.title) : " ");
      sprite.color = nodeColor(node);
      sprite.textHeight = showLabel ? 7 : 0.001;
      sprite.fontFace = "system-ui, Segoe UI, sans-serif";
      sprite.fontWeight = "600";
      sprite.center.y = -0.68;
      sprite.visible = showLabel;
      return sprite;
    },
    [nodeColor, hoverId]
  );

  const handleClick = useCallback(
    (node) => {
      const full = nodesById.get(node.id) || node;
      onNodeSelect?.(full);
      if (!fgRef.current || reducedMotion) return;
      if (!Number.isFinite(node.x)) return;
      const dist = 168;
      const a = 0.62;
      fgRef.current.cameraPosition(
        { x: node.x + dist * a, y: node.y + dist * 0.32, z: node.z + dist * a },
        node,
        780
      );
    },
    [nodesById, onNodeSelect, reducedMotion]
  );

  const handleEngineStop = useCallback(() => {
    const g = fgRef.current;
    if (!g || defaultZoomDoneRef.current) return;
    defaultZoomDoneRef.current = true;
    const fitMs = reducedMotion ? 0 : 420;
    const afterNudge = () => {
      requestAnimationFrame(() => nudgeCameraZoom2x(fgRef));
    };
    g.zoomToFit(fitMs, 6);
    if (fitMs === 0) {
      requestAnimationFrame(afterNudge);
    } else {
      window.setTimeout(afterNudge, fitMs + 40);
    }
  }, [reducedMotion]);

  return (
    <div
      ref={wrapRef}
      className="ancestor-tree-3d-root"
      style={{ width: "100%", height }}
      role="application"
      aria-label="Three-dimensional lineage graph"
    >
      {width > 0 ? (
        <ForceGraph3D
          ref={fgRef}
          width={width}
          height={height}
          graphData={fgData}
          backgroundColor={palette.background}
          showNavInfo={false}
          controlType="orbit"
          enableNodeDrag
          warmupTicks={reducedMotion ? 8 : 48}
          cooldownTicks={reducedMotion ? 12 : 140}
          d3VelocityDecay={0.33}
          d3AlphaDecay={reducedMotion ? 0.06 : 0.02}
          nodeVal={(n) => {
            const base = n.val || 4;
            if (hoverId === n.id || selectedNodeId === n.id) return base * 1.28;
            return base;
          }}
          nodeColor={nodeColor}
          linkWidth={(l) => (l.kind === "lineage" ? 1.35 : 0.8)}
          linkOpacity={0.42}
          linkColor={linkColor}
          linkDirectionalParticles={reducedMotion ? 0 : 1}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={0.75}
          onNodeClick={handleClick}
          onNodeHover={setHoverId}
          onEngineStop={handleEngineStop}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend
        />
      ) : null}
    </div>
  );
}
