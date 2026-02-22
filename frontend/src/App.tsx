import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import StoryContainer from './components/layout/StoryContainer'
import Hero from './components/chapters/Hero'
import Preprocessing from './components/chapters/Preprocessing'
import Detection from './components/chapters/Detection'
import Reconstruction from './components/chapters/Reconstruction'
import FrameExplorer from './components/chapters/FrameExplorer'
import SceneGraphs from './components/chapters/SceneGraphs'
import SpatialGraphChapter from './components/chapters/SpatialGraphChapter'
import Events from './components/chapters/Events'
import SpatialMemory from './components/chapters/SpatialMemory'
import VlmAnalysis from './components/chapters/VlmAnalysis'
import Analytics from './components/chapters/Analytics'
import Summary from './components/chapters/Summary'
import { usePipelineWs } from './hooks/usePipelineWs'
import { useStepData } from './hooks/useStepData'

export default function App() {
  usePipelineWs()
  useStepData()

  return (
    <div className="min-h-screen bg-[#0a0a0f] grain">
      <Header />
      <Sidebar />
      <StoryContainer>
        <Hero />
        <Preprocessing />
        <Detection />
        <Reconstruction />
        <FrameExplorer />
        <SceneGraphs />
        <SpatialGraphChapter />
        <Events />
        <SpatialMemory />
        <Analytics />
        <VlmAnalysis />
        <Summary />
      </StoryContainer>
    </div>
  )
}
