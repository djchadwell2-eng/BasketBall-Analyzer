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

  // Seams — bold near-black channels like a real game ball.
  ctx.strokeStyle = grayscale ? '#060606' : '#150a04'
  ctx.lineWidth = 34
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const stroke = (fn: (t: number) => [number, number], close = false) => {
    ctx.beginPath()
    for (let i = 0; i <= 720; i++) {
      const [x, y] = fn(i / 720)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    if (close) ctx.closePath()
    ctx.stroke()
  }

  // Equator
  stroke(t => [t * w, h / 2])
  // One meridian circle → vertical lines at 0° and 180° (0/w are the same line)
  for (const fx of [0, w / 2, w]) {
    stroke(t => [fx, t * h])
  }
  // Curved side seams: four arcs (upper + lower per side) that blend into the
  // equator with a LONG shallow approach — raised cosine with softened tails
  // (exponent > 1), so the curve hugs the horizontal seam for a stretch before
  // melting into it, like a real ball.
  const A = (48 * Math.PI) / 180  // peak latitude of the curve
  const B = (71 * Math.PI) / 180  // half-width of the arc in longitude
  const SOFT = 1.8                // higher = longer, flatter glide into the merge
  for (const centerLon of [Math.PI / 2, (3 * Math.PI) / 2]) {
    for (const sign of [1, -1]) {
      stroke(t => {
        const lonOffset = (t * 2 - 1) * B
        const lat = sign * A * (0.5 + 0.5 * Math.cos((Math.PI * lonOffset) / B)) ** SOFT
        const lon = centerLon + lonOffset
        return [(lon / (Math.PI * 2)) * w, h / 2 - (lat / Math.PI) * h]
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
              bumpScale={1.2}
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
