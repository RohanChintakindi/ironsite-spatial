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
            <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Camera Poses</div>
              <AnimatedNumber
                value={trajectoryData.positions.length}
                className="text-2xl text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Distance Walked</div>
              <AnimatedNumber
                value={trajectoryData.total_distance}
                decimals={1}
                suffix="m"
                className="text-2xl text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#111] rounded-lg p-5 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">3D Points</div>
              <span className="text-2xl text-[#e4e4e7] font-data">30K</span>
            </div>
          </div>
        )}

        {/* ─── Depth Maps ─── */}
        <div className="pt-8 border-t border-[#222]">
          <h3 className="text-2xl font-semibold text-[#e4e4e7] mb-2">VGGT-X Depth Maps</h3>
          <p className="text-[#a1a1aa] mb-6 max-w-2xl">
            Per-frame metric depth estimated by VGGT-X, visualized with the plasma colormap. Scroll to browse.
          </p>
          <DepthCarousel />
        </div>

        {/* ─── 3D Point Cloud ─── */}
        <div className="pt-8 border-t border-[#222]">
          <h3 className="text-2xl font-semibold text-[#e4e4e7] mb-2">Interactive 3D Point Cloud</h3>
          <p className="text-[#a1a1aa] mb-6 max-w-2xl">
            Dense point cloud with per-point RGB colors. Red dots mark camera positions. Drag to orbit, scroll to zoom.
          </p>
          <PointCloudViewer />
        </div>

        {/* ─── Camera Trajectory (COLMAP World Coords) ─── */}
        <div className="pt-8 border-t border-[#222]">
          <h3 className="text-2xl font-semibold text-[#e4e4e7] mb-2">COLMAP World Coordinates</h3>
          <p className="text-[#a1a1aa] mb-6 max-w-2xl">
            Top-down view of camera positions in COLMAP world space. Left: trajectory colored by time. Right: point cloud with camera path overlay.
          </p>
          <TrajectoryMap />
        </div>
      </div>
    </Chapter>
  )
}
