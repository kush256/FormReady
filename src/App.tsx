import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Home } from './screens/Home'
import { hasOnboarded } from './lib/onboarding'

const SmartPhoto = lazy(() => import('./screens/SmartPhoto').then((m) => ({ default: m.SmartPhoto })))
const SignatureMaker = lazy(() => import('./screens/SignatureMaker').then((m) => ({ default: m.SignatureMaker })))
const ImageToPdf = lazy(() => import('./screens/ImageToPdf').then((m) => ({ default: m.ImageToPdf })))
const ResizePhoto = lazy(() => import('./screens/ResizePhoto').then((m) => ({ default: m.ResizePhoto })))
const CompressPdf = lazy(() => import('./screens/CompressPdf').then((m) => ({ default: m.CompressPdf })))
const MergePdf = lazy(() => import('./screens/MergePdf').then((m) => ({ default: m.MergePdf })))
const SplitPdf = lazy(() => import('./screens/SplitPdf').then((m) => ({ default: m.SplitPdf })))
const GovExams = lazy(() => import('./screens/GovExams').then((m) => ({ default: m.GovExams })))
const ExamDetail = lazy(() => import('./screens/ExamDetail').then((m) => ({ default: m.ExamDetail })))
const Onboarding = lazy(() => import('./screens/Onboarding').then((m) => ({ default: m.Onboarding })))

/**
 * Evaluated when the route matches rather than when App renders, so finishing
 * the introduction and navigating home does not bounce straight back to it.
 */
function HomeGate() {
  return hasOnboarded() ? <Home /> : <Navigate to="/welcome" replace />
}

function ScreenFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--accent-soft)] border-t-[var(--accent)]" />
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <div className="mx-auto min-h-screen w-full max-w-md bg-[var(--bg)]">
        <Suspense fallback={<ScreenFallback />}>
          <Routes>
            <Route path="/" element={<HomeGate />} />
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/smart-photo" element={<SmartPhoto />} />
            <Route path="/signature-maker" element={<SignatureMaker />} />
            <Route path="/image-to-pdf" element={<ImageToPdf />} />
            <Route path="/resize-photo" element={<ResizePhoto />} />
            <Route path="/compress-pdf" element={<CompressPdf />} />
            <Route path="/merge-pdf" element={<MergePdf />} />
            <Route path="/split-pdf" element={<SplitPdf />} />
            <Route path="/gov-exams" element={<GovExams />} />
            <Route path="/gov-exams/:examId" element={<ExamDetail />} />
          </Routes>
        </Suspense>
      </div>
    </HashRouter>
  )
}

export default App
