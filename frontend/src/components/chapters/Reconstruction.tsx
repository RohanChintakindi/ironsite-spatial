import Chapter from '../layout/Chapter'
import { usePipelineStore } from '../../store/pipeline'
import PointCloudViewer from '../viz/PointCloud'
import DepthCarousel from '../viz/DepthCarousel'
import TrajectoryMap from '../viz/TrajectoryMap'
import AnimatedNumber from '../ui/AnimatedNumber'

export default function Reconstruction() {
  const trajectoryData = usePipelineStore((s) => s.trajectoryData)

  return (
    <Chapter
      step="reconstruction"
      title="3D Reconstruction"
      subtitle="VGGT-X produces metric depth maps, camera poses, and a dense point cloud in global COLMAP coordinates."
    >
      <div className="space-y-20">
        {/* Stats */}
        {trajectoryData && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0f0f14] rounded-lg p-5 border border-[#1a1a1a] card-highlight card-glow">
              <div className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Camera Poses</div>
              <AnimatedNumber
                value={trajectoryData.positions.length}
                className="text-2xl font-bold text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#0f0f14] rounded-lg p-5 border border-[#1a1a1a] card-highlight card-glow">
              <div className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">Distance Walked</div>
              <AnimatedNumber
                value={trajectoryData.total_distance}
                decimals={1}
                suffix="m"
                className="text-2xl font-bold text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#0f0f14] rounded-lg p-5 border border-[#1a1a1a] card-highlight card-glow">
              <div className="text-[10px] text-[#52525b] uppercase tracking-[0.12em] font-data mb-2">3D Points</div>
              <span className="text-2xl font-bold text-[#e4e4e7] font-data">30K</span>
            </div>
          </div>
        )}

        {/* ─── Depth Maps ─── */}
        <div className="pt-8" style={{ borderTop: '1px solid #1a1a1a' }}>
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">VGGT-X Depth Maps</h3>
          <p className="text-[#a1a1aa] text-[15px] mb-6 max-w-2xl leading-relaxed">
            Per-frame metric depth estimated by VGGT-X, visualized with the plasma colormap. Scroll to browse.
          </p>
          <DepthCarousel />
        </div>

        {/* ─── 3D Point Cloud ─── */}
        <div className="pt-8" style={{ borderTop: '1px solid #1a1a1a' }}>
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">Interactive 3D Point Cloud</h3>
          <p className="text-[#a1a1aa] text-[15px] mb-6 max-w-2xl leading-relaxed">
            Dense point cloud with per-point RGB colors. Red dots mark camera positions. Drag to orbit, scroll to zoom.
          </p>
          <PointCloudViewer />
        </div>

        {/* ─── Camera Trajectory (COLMAP World Coords) ─── */}
        <div className="pt-8" style={{ borderTop: '1px solid #1a1a1a' }}>
          <h3 className="text-xl font-bold text-[#e4e4e7] mb-2 tracking-tight">COLMAP World Coordinates</h3>
          <p className="text-[#a1a1aa] text-[15px] mb-6 max-w-2xl leading-relaxed">
            Top-down view of camera positions in COLMAP world space. Left: trajectory colored by time. Right: point cloud with camera path overlay.
          </p>
          <TrajectoryMap />
        </div>
      </div>
    </Chapter>
  )
}
