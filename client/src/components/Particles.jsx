import { useEffect, useRef } from "react";
import { Renderer, Camera, Geometry, Program, Mesh } from "ogl";
import "./Particles.css";

function readParticlePaletteFromDom() {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const keys = ["--pt-particle-canvas-1", "--pt-particle-canvas-2", "--pt-particle-canvas-3", "--pt-particle-canvas-4"];
  const fallback = cs.getPropertyValue("--pt-particle-canvas-1").trim();
  return keys.map((key) => {
    const value = cs.getPropertyValue(key).trim();
    return value || fallback;
  });
}

function hexToRgb(hex) {
  const normalized = hex.replace(/^#/, "");
  const expanded = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const int = Number.parseInt(expanded, 16);
  return [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255
  ];
}

const vertex = `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;

  varying vec4 vRandom;
  varying vec3 vColor;

  void main() {
    vRandom = random;
    vColor = color;

    vec3 pos = position * uSpread;
    pos.z *= 10.0;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

    vec4 mvPos = viewMatrix * mPos;

    if (uSizeRandomness == 0.0) {
      gl_PointSize = uBaseSize;
    } else {
      gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    }

    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragment = `
  precision highp float;

  uniform float uTime;
  uniform float uAlphaParticles;
  varying vec4 vRandom;
  varying vec3 vColor;

  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));

    if(uAlphaParticles < 0.5) {
      if(d > 0.5) {
        discard;
      }
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), 1.0);
    } else {
      float circle = smoothstep(0.5, 0.4, d) * 0.8;
      gl_FragColor = vec4(vColor + 0.2 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
    }
  }
`;

export default function Particles({
  particleCount = 200,
  particleSpread = 10,
  speed = 0.1,
  particleColors,
  moveParticlesOnHover = false,
  particleHoverFactor = 1,
  alphaParticles = false,
  particleBaseSize = 100,
  sizeRandomness = 1,
  cameraDistance = 20,
  disableRotation = false,
  pixelRatio = 1,
  className = ""
}) {
  const containerRef = useRef(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new Renderer({
      dpr: pixelRatio,
      depth: false,
      alpha: true
    });

    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    gl.clearColor(0, 0, 0, 0);

    const camera = new Camera(gl, { fov: 15 });
    camera.position.set(0, 0, cameraDistance);

    const bounds = { left: 0, top: 0, width: 1, height: 1 };

    const syncBounds = () => {
      const rect = container.getBoundingClientRect();
      bounds.left = rect.left;
      bounds.top = rect.top;
      bounds.width = Math.max(1, rect.width);
      bounds.height = Math.max(1, rect.height);
    };

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
      syncBounds();
    };

    let moveRaf = 0;
    const handleMouseMove = (event) => {
      cancelAnimationFrame(moveRaf);
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
        const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
        mouseRef.current = { x, y };
      });
    };

    window.addEventListener("resize", resize, { passive: true });
    resize();

    if (moveParticlesOnHover) {
      container.addEventListener("mousemove", handleMouseMove, { passive: true });
    }

    const positions = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount * 4);
    const colors = new Float32Array(particleCount * 3);
    const palette = particleColors?.length ? particleColors : readParticlePaletteFromDom();

    for (let index = 0; index < particleCount; index += 1) {
      let x;
      let y;
      let z;
      let length;

      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        length = x * x + y * y + z * z;
      } while (length > 1 || length === 0);

      const radius = Math.cbrt(Math.random());
      positions.set([x * radius, y * radius, z * radius], index * 3);
      randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], index * 4);
      colors.set(hexToRgb(palette[Math.floor(Math.random() * palette.length)]), index * 3);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      random: { size: 4, data: randoms },
      color: { size: 3, data: colors }
    });

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: particleSpread },
        uBaseSize: { value: particleBaseSize * pixelRatio },
        uSizeRandomness: { value: sizeRandomness },
        uAlphaParticles: { value: alphaParticles ? 1 : 0 }
      },
      transparent: true,
      depthTest: false
    });

    const particles = new Mesh(gl, { mode: gl.POINTS, geometry, program });
    let animationFrameId;
    let lastTime = performance.now();
    let elapsed = 0;
    let curHoverX = 0;
    let curHoverY = 0;

    const lerp = (a, b, t) => a + (b - a) * t;

    const update = (time) => {
      animationFrameId = requestAnimationFrame(update);
      const delta = time - lastTime;
      lastTime = time;
      elapsed += delta * speed;

      program.uniforms.uTime.value = elapsed * 0.001;

      if (moveParticlesOnHover) {
        const tx = -mouseRef.current.x * particleHoverFactor;
        const ty = -mouseRef.current.y * particleHoverFactor;
        curHoverX = lerp(curHoverX, tx, 0.12);
        curHoverY = lerp(curHoverY, ty, 0.12);
        particles.position.x = curHoverX;
        particles.position.y = curHoverY;
      } else {
        curHoverX = lerp(curHoverX, 0, 0.12);
        curHoverY = lerp(curHoverY, 0, 0.12);
        particles.position.x = curHoverX;
        particles.position.y = curHoverY;
      }

      if (!disableRotation) {
        particles.rotation.x = Math.sin(elapsed * 0.0002) * 0.1;
        particles.rotation.y = Math.cos(elapsed * 0.0005) * 0.15;
        particles.rotation.z += 0.01 * speed;
      }

      renderer.render({ scene: particles, camera });
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(moveRaf);
      if (moveParticlesOnHover) {
        container.removeEventListener("mousemove", handleMouseMove);
      }
      cancelAnimationFrame(animationFrameId);
      if (container.contains(gl.canvas)) {
        container.removeChild(gl.canvas);
      }
    };
  }, [
    alphaParticles,
    cameraDistance,
    disableRotation,
    moveParticlesOnHover,
    particleBaseSize,
    particleColors,
    particleCount,
    particleHoverFactor,
    particleSpread,
    pixelRatio,
    sizeRandomness,
    speed
  ]);

  return <div ref={containerRef} className={`particles-container ${className}`.trim()} />;
}
