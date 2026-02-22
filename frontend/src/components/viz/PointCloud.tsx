import { useRef, useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '../../store/pipeline'
import { getPointCloud } from '../../api/client'

function PointCloudScene() {
  const runId = usePipelineStore((s) => s.runId)
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)
  const [pcData, setPcData] = useState<Float32Array | null>(null)
  const pointsRef = useRef<THREE.Points>(null)

  useEffect(() => {
    if (!runId) return
    getPointCloud(runId).then(setPcData).catch(console.error)
  }, [runId])

  const { positions, colors } = useMemo(() => {
    if (!pcData) return { positions: new Float32Array(0), colors: new Float32Array(0) }
    const count = pcData.length / 6
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = pcData[i * 6]
      pos[i * 3 + 1] = pcData[i * 6 + 1]
      pos[i * 3 + 2] = pcData[i * 6 + 2]
      col[i * 3] = pcData[i * 6 + 3]
      col[i * 3 + 1] = pcData[i * 6 + 4]
      col[i * 3 + 2] = pcData[i * 6 + 5]
    }
    return { positions: pos, colors: col }
  }, [pcData])

  const camPositions = useMemo(() => {
    if (!trajectoryData) return new Float32Array(0)
    const arr = new Float32Array(trajectoryData.positions.length * 3)
    trajectoryData.positions.forEach((p, i) => {
      arr[i * 3] = p.x
      arr[i * 3 + 1] = p.y
      arr[i * 3 + 2] = p.z
    })
    return arr
  }, [trajectoryData])

  const pcGeometry = useMemo(() => {
    if (positions.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return geo
  }, [positions, colors])

  const camGeometry = useMemo(() => {
    if (camPositions.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(camPositions, 3))
    return geo
  }, [camPositions])

  const lineGeometry = useMemo(() => {
    if (camPositions.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(camPositions, 3))
    return geo
  }, [camPositions])

  if (!pcGeometry) return null

  return (
    <>
      {/* Point cloud */}
      <points ref={pointsRef} geometry={pcGeometry}>
        <pointsMaterial size={0.02} vertexColors sizeAttenuation />
      </points>

      {/* Camera positions as red dots */}
      {camGeometry && (
        <points geometry={camGeometry}>
          <pointsMaterial size={0.08} color="#ff3333" sizeAttenuation />
        </points>
      )}

      {/* Camera trajectory line */}
      {lineGeometry && (
        <primitive
          object={new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#ff3333', opacity: 0.5, transparent: true }))}
        />
      )}
    </>
  )
}

export default function PointCloudViewer() {
  return (
    <div className="w-full h-[500px] rounded-xl overflow-hidden border border-[#222] bg-black">
      <Canvas
        camera={{ position: [5, 5, 5], fov: 60 }}
        gl={{ antialias: true }}
        style={{ background: '#0a0a0f' }}
      >
        <ambientLight intensity={0.5} />
        <PointCloudScene />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={50}
        />
        <axesHelper args={[2]} />
        <gridHelper args={[20, 20, '#222', '#111']} />
      </Canvas>
    </div>
  )
}
