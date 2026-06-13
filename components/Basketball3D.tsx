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

  // A real 8-panel basketball, from the front, shows: a horizontal seam
  // (equator), a vertical seam (meridian), and two curves that BOW outward
  // from the vertical seam — widest at the equator, converging toward the
  // poles. Same pattern repeats on the back, so the ball reads correctly as
  // it spins.
  // A basketball is: TWO straight seams forming a perfect cross (the vertical
  // meridian + the horizontal equator), plus TWO curvy seams that flank the
  // vertical line and ALMOST intersect the cross near the top and bottom —
  // they come close to the vertical line but do NOT merge into it.
  const BOW = w / 6        // max bow at the equator → seams evenly spaced (every w/6)
  const GAP = w * 0.045    // how far the curvy seams stay clear of the vertical line
  const V_TOP = 0.12       // curvy seams span this far from each pole
  const V_BOT = 1 - V_TOP

  // Straight seam 1: equator (horizontal)
  strokeCurve(t => [t * w, h / 2])
  // Straight seam 2: vertical meridian — front center (w/2) + back center (0/w)
  for (const cx of [0, w / 2, w]) {
    strokeCurve(t => [cx, t * h])
  }
  // Curvy seams: near the vertical line (a GAP away) at top and bottom, bowing
  // out to ±BOW at the equator. Drawn around the front (w/2) and back (0/w).
  for (const center of [0, w / 2]) {
    for (const dir of [1, -1]) {
      strokeCurve(t => {
        const v = V_TOP + t * (V_BOT - V_TOP)
        const offset = GAP + (BOW - GAP) * Math.sin(Math.PI * t)
        return [center + dir * offset, v * h]
      })
    }
  }

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
