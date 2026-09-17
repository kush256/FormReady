import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SpecEditor } from '../components/SpecEditor'
import { SizeField } from '../components/SizeField'
import { Notice } from '../components/Notice'
import { deleteCustomExam, findCustomExam, saveCustomExam } from '../lib/customExams'
import type { ExamDocument } from '../lib/exams'
import type { ImageRequirement } from '../lib/requirements'

/**
 * Starting numbers, not claims about anything.
 *
 * The most common shape on Indian recruitment portals, there to be typed over
 * rather than to be trusted — which is why this screen names no source and
 * carries no "checked in" date, unlike the built-in exams.
 */
const START_PHOTO: ImageRequirement = { width: 200, height: 230, maxKb: 50 }
const START_SIGNATURE: ImageRequirement = { width: 140, height: 60, maxKb: 20 }
const START_PDF_BYTES = 500 * 1024

interface Section {
  on: boolean
  spec: ImageRequirement
}

/**
 * Add the exam that isn't in the list.
 *
 * Nine exams is a starting set, not a boundary, and a candidate for the tenth
 * has the same problem as everyone else: a form stating numbers, and no easy
 * way to hit them. They name their exam, fill in what it asks for, and from
 * then on it behaves exactly like a built-in one — same list, same search, same
 * document rows opening the same tools already filled in.
 */
export function CustomExam() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const existing = examId ? findCustomExam(examId) : undefined

  const [name, setName] = useState(existing?.name ?? '')
  const [photo, setPhoto] = useState<Section>(() => fromStored(existing?.documents, 'photo', START_PHOTO))
  const [signature, setSignature] = useState<Section>(() =>
    fromStored(existing?.documents, 'signature', START_SIGNATURE),
  )
  const [pdfOn, setPdfOn] = useState(
    () => existing?.documents.some((doc) => doc.format === 'PDF') ?? false,
  )
  const [pdfBytes, setPdfBytes] = useState(() => {
    const doc = existing?.documents.find((d) => d.format === 'PDF')
    return doc ? doc.maxKb * 1024 : START_PDF_BYTES
  })
  const [error, setError] = useState<string | null>(null)

  const nothingChosen = !photo.on && !signature.on && !pdfOn

  function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give your exam a name so you can find it in the list.')
      return
    }
    if (nothingChosen) {
      setError('Add at least one of the three — a photograph, a signature or a document.')
      return
    }
    const documents: ExamDocument[] = []
    if (photo.on) {
      documents.push({
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: photo.spec.width,
        height: photo.spec.height,
        minKb: photo.spec.minKb,
        maxKb: photo.spec.maxKb,
        format: 'JPG',
      })
    }
    if (signature.on) {
      documents.push({
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: signature.spec.width,
        height: signature.spec.height,
        minKb: signature.spec.minKb,
        maxKb: signature.spec.maxKb,
        format: 'JPG',
      })
    }
    if (pdfOn) {
      documents.push({
        id: 'document',
        label: 'Document (PDF)',
        kind: 'document',
        // A PDF has no pixel size to hit; only the limit matters.
        width: 0,
        height: 0,
        maxKb: Math.max(1, Math.round(pdfBytes / 1024)),
        format: 'PDF',
      })
    }
    const stored = saveCustomExam({
      id: existing?.id,
      name: trimmed,
      authority: 'Added by you',
      aliases: [],
      portal: 'your exam notification',
      documents,
    })
    navigate(`/gov-exams/${stored.id}`, { replace: true })
  }

  function remove() {
    if (!existing) return
    deleteCustomExam(existing.id)
    navigate('/gov-exams', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader
        title={existing ? 'Edit your exam' : 'Add your exam'}
        subtitle={existing?.name ?? 'Kept on this device'}
      />

      <main className="flex-1 space-y-5 px-5 py-4">
        {error && <Notice title={error} />}

        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">
            {existing ? 'Change the numbers' : 'Which exam are you applying for?'}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            Copy what the form asks for. It is saved on this phone and appears in your exam list.
          </p>
        </div>

        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">Exam name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bihar SSC Inter Level"
            aria-label="Exam name"
            className="fr-field mt-1 font-sans"
          />
        </label>

        <SectionCard
          title="Photograph"
          hint="The passport-style photo the form asks for."
          section={photo}
          onToggle={(on) => setPhoto({ ...photo, on })}
          onChange={(spec) => setPhoto({ on: true, spec })}
        />

        <SectionCard
          title="Signature"
          hint="Usually a wide, short box."
          section={signature}
          onToggle={(on) => setSignature({ ...signature, on })}
          onChange={(spec) => setSignature({ on: true, spec })}
        />

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={pdfOn}
              aria-label="Document (PDF)"
              onChange={(e) => setPdfOn(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="text-sm font-bold text-[var(--ink)]">Document (PDF)</span>
          </label>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-2)]">
            A mark sheet, certificate or ID proof. Only the size limit matters.
          </p>
          {pdfOn && (
            <div className="mt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                Largest allowed
              </span>
              <div className="mt-1">
                <SizeField label="Largest allowed PDF size" bytes={pdfBytes} onChange={setPdfBytes} />
              </div>
            </div>
          )}
        </div>

        <Button fullWidth onClick={save}>
          {existing ? 'Save changes' : 'Save this exam'}
        </Button>
        {existing && (
          <Button variant="ghost" fullWidth onClick={remove}>
            Delete this exam
          </Button>
        )}
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}

function SectionCard({
  title,
  hint,
  section,
  onToggle,
  onChange,
}: {
  title: string
  hint: string
  section: Section
  onToggle: (on: boolean) => void
  onChange: (spec: ImageRequirement) => void
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={section.on}
          aria-label={title}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <span className="text-sm font-bold text-[var(--ink)]">{title}</span>
      </label>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-2)]">{hint}</p>
      {section.on && (
        <div className="mt-3">
          <SpecEditor value={section.spec} onChange={onChange} />
        </div>
      )}
    </div>
  )
}

function fromStored(
  documents: ExamDocument[] | undefined,
  id: string,
  fallback: ImageRequirement,
): Section {
  const doc = documents?.find((d) => d.id === id)
  if (!doc) return { on: false, spec: fallback }
  return { on: true, spec: { width: doc.width, height: doc.height, maxKb: doc.maxKb, minKb: doc.minKb } }
}
