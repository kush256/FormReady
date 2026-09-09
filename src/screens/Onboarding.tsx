import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/Button'
import { BrandMark } from '../components/BrandMark'
import { SpecChip } from '../components/SpecChip'
import { ExamIllustration, PhotoIllustration, PrivacyIllustration } from '../components/Illustrations'
import { markOnboarded } from '../lib/onboarding'

interface Slide {
  illustration: React.ReactNode
  eyebrow: string
  title: string
  body: string
  chips?: React.ReactNode
}

const SLIDES: Slide[] = [
  {
    illustration: <PhotoIllustration size={230} />,
    eyebrow: 'The problem',
    title: 'Every form wants a different size',
    body: 'Exactly 200 by 230 pixels. Under 50 KB. JPG only. Get one number wrong and the upload is rejected.',
    chips: (
      <>
        <SpecChip icon={false}>200×230 px</SpecChip>
        <SpecChip icon={false}>20–50 KB</SpecChip>
        <SpecChip icon={false}>JPG</SpecChip>
      </>
    ),
  },
  {
    illustration: <ExamIllustration size={230} />,
    eyebrow: 'The shortcut',
    title: 'Pick your exam, get every document',
    body: 'SSC, UPSC, NEET, JEE and more. Choose one and FormReady already knows the photo, signature and everything else it asks for.',
  },
  {
    illustration: <PrivacyIllustration size={230} />,
    eyebrow: 'The promise',
    title: 'Nothing ever leaves your phone',
    body: 'Every photo and PDF is processed on your device, online or offline. Nothing is uploaded, stored elsewhere, or shared with anyone.',
  },
]

export function Onboarding() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  function finish() {
    markOnboarded()
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top flex items-center justify-between px-5 pt-5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={30} />
          <span className="text-[15px] font-extrabold tracking-tight text-[var(--ink)]">FormReady</span>
        </div>
        {!last && (
          <button onClick={finish} className="px-2 py-1 text-sm font-bold text-[var(--ink-2)]">
            Skip
          </button>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-6">{slide.illustration}</div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">{slide.eyebrow}</p>
        <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-balance text-[var(--ink)]">
          {slide.title}
        </h1>
        <p className="mx-auto mt-3 max-w-[34ch] text-[15px] leading-relaxed text-[var(--ink-2)]">{slide.body}</p>
        {slide.chips && <div className="mt-4 flex flex-wrap justify-center gap-2">{slide.chips}</div>}
      </main>

      <footer className="safe-bottom space-y-5 px-6 pb-6">
        <div className="flex justify-center gap-2" role="tablist" aria-label="Introduction progress">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              role="tab"
              aria-selected={i === index}
              aria-label={`Step ${i + 1} of ${SLIDES.length}`}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-7 bg-[var(--accent)]' : 'w-2 bg-[var(--line-strong)]'
              }`}
            />
          ))}
        </div>
        <Button fullWidth onClick={() => (last ? finish() : setIndex(index + 1))}>
          {last ? 'Get started' : 'Next'}
        </Button>
      </footer>
    </div>
  )
}
