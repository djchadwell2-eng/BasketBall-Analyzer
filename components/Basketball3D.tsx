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
  const w = 2048
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Base leather
  if (grayscale) {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, w, h)
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#b34509')
    g.addColorStop(0.5, '#d3540c')
    g.addColorStop(1, '#a03c08')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }

  // Pebble grain
  for (let i = 0; i < 16000; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = Math.random() * 2.4 + 0.6
    ctx.fillStyle = grayscale
      ? (Math.random() < 0.5 ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.18)')
      : (Math.random() < 0.5 ? 'rgba(255,235,210,0.05)' : 'rgba(40,10,0,0.10)')
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Seams — equirectangular: vertical lines = meridian circles, the equator,
  // and two tilted great circles (sinusoids: lat = atan(tan(i)·sin(lon+φ))).
  ctx.strokeStyle = grayscale ? '#101010' : '#1a0a03'
  ctx.lineWidth = 13
  ctx.lineCap = 'round'

  const stroke = (fn: (t: number) => [number, number]) => {
    ctx.beginPath()
    for (let i = 0; i <= 512; i++) {
      const [x, y] = fn(i / 512)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // Equator
  stroke(t => [t * w, h / 2])
  // Two meridian circles → vertical lines at 0°, 90°, 180°, 270°
  for (const fx of [0, w / 4, w / 2, (3 * w) / 4, w]) {
    stroke(t => [fx, t * h])
  }
  // Two tilted circles for the curved panel seams
  for (const phase of [Math.PI / 4, (5 * Math.PI) / 4]) {
    const incl = 0.45 // ~26°
    stroke(t => {
      const lon = t * Math.PI * 2
      const lat = Math.atan(Math.tan(incl) * Math.sin(lon + phase))
      return [t * w, h / 2 - (lat / Math.PI) * h]
    })
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

      {/* Speed glow behind the ball */}
      <mesh position={[0, 0, -2.2]} scale={6.5}>
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
            <sphereGeometry args={[1.45, 96, 96]} />
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
      className="relative w-48 h-48 sm:w-72 sm:h-72 select-none"
      aria-label="Interactive basketball — click to spin it faster"
    >
      <Canvas
        camera={{ position: [0, 0, 4.1], fov: 40 }}
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
