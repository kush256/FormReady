import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SpecChip } from '../components/SpecChip'
import { ChevronRightIcon, SmartPhotoIcon, SignatureIcon, ImageToPdfIcon } from '../components/Icons'
import { findExam, describeSize, type ExamDocument } from '../lib/exams'

const KIND_ICON = {
  photo: SmartPhotoIcon,
  signature: SignatureIcon,
  document: ImageToPdfIcon,
}

export function ExamDetail() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const exam = examId ? findExam(examId) : undefined

  if (!exam) {
    return (
      <div className="flex min-h-screen flex-col">
        <ScreenHeader title="Exam" />
        <main className="flex-1 px-5 py-8">
          <p className="text-sm text-[var(--ink-2)]">That exam isn't in the list.</p>
          <Button className="mt-4" onClick={() => navigate('/gov-exams')}>
            Back to exams
          </Button>
        </main>
      </div>
    )
  }

  function open(doc: ExamDocument) {
    // Signature Maker knows about ink; everything else is a framed image.
    const path = doc.kind === 'signature' ? '/signature-maker' : '/smart-photo'
    navigate(path, {
      state: {
        // The whole spec travels, minimum included. Dropping it here is what let
        // a photo come out under the floor the form states and the list shows.
        requirement: { width: doc.width, height: doc.height, maxKb: doc.maxKb, minKb: doc.minKb },
        label: doc.label,
        context: exam!.name,
      },
    })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScreenHeader title={exam.name} subtitle={exam.authority} />

      <main className="flex-1 space-y-5 px-5 py-4">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-[var(--ink)]">
            {exam.documents.length} documents to prepare
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            Tap one and it opens already set to that size. Confirm the numbers against your notification before you
            upload.
          </p>
        </div>

        <ul className="space-y-2.5">
          {exam.documents.map((doc, i) => {
            const Icon = KIND_ICON[doc.kind]
            return (
              <li key={doc.id}>
                <button
                  onClick={() => open(doc)}
                  className="w-full rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-card)] active:bg-[var(--surface-sunk)]"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                      <Icon width={21} height={21} />
                      <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] font-mono text-[10px] font-semibold text-white">
                        {i + 1}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[15px] font-bold tracking-tight text-[var(--ink)]">{doc.label}</p>
                        <ChevronRightIcon width={17} height={17} className="shrink-0 text-[var(--ink-3)]" />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <SpecChip icon={false}>
                          {doc.width}×{doc.height} px
                        </SpecChip>
                        <SpecChip icon={false}>{describeSize(doc)}</SpecChip>
                        <SpecChip icon={false}>{doc.format}</SpecChip>
                      </div>
                      {doc.note && (
                        <p className="mt-2 text-xs leading-relaxed text-[var(--ink-2)]">{doc.note}</p>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
