'use client'

import { useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Spin physics (radians/sec): lazy idle spin, clicks stack speed, friction
// settles it back down — it never fully stops.
const BASE_SPIN  = 0.4
const TAP_BOOST  = 9
const MAX_SPIN   = 32
const FRICTION   = 1.1

// ─────────────────────────────────────────────────────────────────────────────
// Procedural textures: pebbled leather + seams drawn on a canvas, so the ball
// needs no image assets. The same drawing doubles as a bump map for depth.
// ─────────────────────────────────────────────────────────────────────────────

function drawBallCanvas(grayscale: boolean): HTMLCanvasElement {
  // High resolution so the seams render with crisp, anti-aliased edges when
  // wrapped onto the sphere.
  const w = 4096
  const h = 2048
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Base leather — brick orange like a real game ball, darker toward the poles
  if (grayscale) {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#8f3e10')
    g.addColorStop(0.5, '#bf5d1f')
    g.addColorStop(1, '#823709')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  // Pebble grain — dense and contrasty so it reads as rubber, not plastic
  for (let i = 0; i < 95000; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = Math.random() * 3 + 1
    ctx.fillStyle = grayscale
      ? (Math.random() < 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.20)')
      : (Math.random() < 0.5 ? 'rgba(255,205,160,0.07)' : 'rgba(50,16,4,0.14)')
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Seams — bold near-black channels, sized to read clearly at the small
  // hero display size (the texture is downsampled several times onto the sphere).
  ctx.strokeStyle = grayscale ? '#000000' : '#0b0603'
  ctx.lineWidth = 46
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Stroke a parametric curve, breaking the path where it wraps across the
  // texture's left/right edge so no stray line shoots across the seam.
  const strokeCurve = (fn: (t: number) => [number, number]) => {
    ctx.beginPath()
    let started = false
    let prevX = 0
    for (let i = 0; i <= 720; i++) {
      const [x, y] = fn(i / 720)
      if (started && Math.abs(x - prevX) > w / 2) {
        ctx.stroke(); ctx.beginPath(); started = false
      }
      if (!started) { ctx.moveTo(x, y); started = true }
      else ctx.lineTo(x, y)
      prevX = x
    }
    ctx.stroke()
  }

  // Draw seams as TRUE circles on the sphere, so they wrap all the way around
  // and the ball reads correctly from every spin angle (no bare patches).
  // A circle is the set of points at angular radius `rho` from a center
  // direction `c`; rho = PI/2 gives a great circle. Project each point to
  // equirectangular texture coords (front +Z maps to the texture center).
  const strokeSphereCircle = (cx: number, cy: number, cz: number, rho: number) => {
    // Build an orthonormal basis {c, e1, e2}
    const ref: [number, number, number] = Math.abs(cy) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    let e1x = cy * ref[2] - cz * ref[1]
    let e1y = cz * ref[0] - cx * ref[2]
    let e1z = cx * ref[1] - cy * ref[0]
    const e1l = Math.hypot(e1x, e1y, e1z) || 1
    e1x /= e1l; e1y /= e1l; e1z /= e1l
    const e2x = cy * e1z - cz * e1y
    const e2y = cz * e1x - cx * e1z
    const e2z = cx * e1y - cy * e1x
    const cr = Math.cos(rho)
    const sr = Math.sin(rho)
    strokeCurve(t => {
      const th = t * 2 * Math.PI
      const ct = Math.cos(th)
      const st = Math.sin(th)
      const px = cr * cx + sr * (ct * e1x + st * e2x)
      const py = cr * cy + sr * (ct * e1y + st * e2y)
      const pz = cr * cz + sr * (ct * e1z + st * e2z)
      const lon = Math.atan2(px, pz)                       // front (+Z) → 0
      const lat = Math.asin(Math.max(-1, Math.min(1, py)))
      return [((lon / (2 * Math.PI)) + 0.5) * w, (0.5 - lat / Math.PI) * h]
    })
  }

  const D = Math.PI / 180
  // Two straight seams = a perfect cross:
  strokeSphereCircle(0, 1, 0, Math.PI / 2)   // equator (horizontal great circle)
  strokeSphereCircle(1, 0, 0, Math.PI / 2)   // meridian (vertical great circle)
  // Two curvy seams = small circles centered on the left/right sides, so they
  // bow outward on the front and wrap around to the back.
  strokeSphereCircle(1, 0, 0, 58 * D)        // right flank
  strokeSphereCircle(-1, 0, 0, 58 * D)       // left flank

  return canvas
}

function makeGlowTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,140,40,1)')
  g.addColorStop(0.4, 'rgba(249,115,22,0.45)')
  g.addColorStop(1, 'rgba(249,115,22,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  return tex
}

// ─────────────────────────────────────────────────────────────────────────────
// The ball
// ─────────────────────────────────────────────────────────────────────────────

function SpinningBall() {
  const spinGroup = useRef<THREE.Group>(null)
  const ballMat = useRef<THREE.MeshStandardMaterial>(null)
  const glowMat = useRef<THREE.MeshBasicMaterial>(null)
  const velocity = useRef(BASE_SPIN)

  const { colorMap, bumpMap, glowTex } = useMemo(() => {
    const colorMap = new THREE.CanvasTexture(drawBallCanvas(false))
    const bumpMap = new THREE.CanvasTexture(drawBallCanvas(true))
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.anisotropy = 8
    bumpMap.anisotropy = 8
    return { colorMap, bumpMap, glowTex: makeGlowTexture() }
  }, [])

  useFrame((_, delta) => {
    // Friction eases the extra speed back to the idle spin
    velocity.current = BASE_SPIN + (velocity.current - BASE_SPIN) * Math.exp(-delta * FRICTION)
    if (spinGroup.current) spinGroup.current.rotation.y += velocity.current * delta

    // Heat effects: glow + emissive ramp up with speed
    const heat = Math.min((velocity.current - BASE_SPIN) / (MAX_SPIN - BASE_SPIN), 1)
    if (glowMat.current) glowMat.current.opacity = heat * 0.7
    if (ballMat.current) ballMat.current.emissiveIntensity = heat * 0.5
  })

  function ripIt() {
    velocity.current = Math.min(velocity.current + TAP_BOOST, MAX_SPIN)
  }

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 5]} intensity={2.4} />
      <pointLight position={[-5, -2, -4]} intensity={1.2} color="#f97316" />

      {/* Speed glow behind the ball — sized to fade out before the canvas edge */}
      <mesh position={[0, 0, -2.2]} scale={4.6}>
        <planeGeometry />
        <meshBasicMaterial
          ref={glowMat}
          map={glowTex}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Tilted axis so the spin reads like a ball on a fingertip */}
      <group rotation={[0.32, 0, -0.22]}>
        <group ref={spinGroup}>
          <mesh
            onPointerDown={ripIt}
            onPointerOver={() => { document.body.style.cursor = 'pointer' }}
            onPointerOut={() => { document.body.style.cursor = '' }}
          >
            <sphereGeometry args={[1.58, 96, 96]} />
            <meshStandardMaterial
              ref={ballMat}
              map={colorMap}
              bumpMap={bumpMap}
              bumpScale={2.6}
              roughness={0.72}
              metalness={0.05}
              emissive="#f97316"
              emissiveIntensity={0}
            />
          </mesh>
        </group>
      </group>
    </>
  )
}

export default function Basketball3D() {
  return (
    <motion.div
      animate={{ y: [0, -14, 0] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      className="relative w-60 h-60 sm:w-[24rem] sm:h-[24rem] select-none"
      aria-label="Interactive basketball — click to spin it faster"
    >
      <Canvas
        camera={{ position: [0, 0, 5.4], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <SpinningBall />
      </Canvas>
      {/* Floor shadow (stays put while the ball bobs) */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-32 h-4 rounded-full bg-black/60 blur-md" />
    </motion.div>
  )
}
