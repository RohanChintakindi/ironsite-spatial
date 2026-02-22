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
      <div className="space-y-10">
        {/* Stats */}
        {trajectoryData && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Camera Poses</div>
              <AnimatedNumber
                value={trajectoryData.positions.length}
                className="text-xl text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">Distance Walked</div>
              <AnimatedNumber
                value={trajectoryData.total_distance}
                decimals={1}
                suffix="m"
                className="text-xl text-[#e4e4e7]"
              />
            </div>
            <div className="bg-[#111] rounded-lg p-4 border border-[#222]">
              <div className="text-xs text-[#52525b] uppercase tracking-wider mb-1">3D Points</div>
              <span className="text-xl text-[#e4e4e7] font-data">30K</span>
            </div>
          </div>
        )}

        {/* Depth maps carousel */}
        <div>
          <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Depth Maps</h3>
          <DepthCarousel />
        </div>

        {/* 3D Point Cloud */}
        <div>
          <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Interactive 3D Point Cloud</h3>
          <PointCloudViewer />
        </div>

        {/* Top-down trajectory */}
        <div>
          <h3 className="text-lg font-semibold text-[#e4e4e7] mb-4">Camera Trajectory (Top-Down)</h3>
          <TrajectoryMap />
        </div>
      </div>
    </Chapter>
  )
}
