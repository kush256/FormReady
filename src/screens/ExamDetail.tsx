import { useNavigate, useParams } from 'react-router-dom'
import { ScreenHeader } from '../components/ScreenHeader'
import { PrivacyFooter } from '../components/PrivacyFooter'
import { Button } from '../components/Button'
import { SpecChip } from '../components/SpecChip'
import {
  ChevronRightIcon,
  SmartPhotoIcon,
  SignatureIcon,
  ImageToPdfIcon,
  CompressPdfIcon,
} from '../components/Icons'
import { findExam, describeSize, SPECS_CHECKED, type ExamDocument } from '../lib/exams'
import { findCustomExam, isCustomExamId } from '../lib/customExams'

const KIND_ICON = {
  photo: SmartPhotoIcon,
  signature: SignatureIcon,
  document: ImageToPdfIcon,
}

export function ExamDetail() {
  const { examId } = useParams()
  const navigate = useNavigate()
  // An exam the user added behaves exactly like a built-in one from here on.
  const isMine = !!examId && isCustomExamId(examId)
  const exam = examId ? (isMine ? findCustomExam(examId) : findExam(examId)) : undefined

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
    // A PDF has no pixel size to hit, so it goes to the compressor with the
    // limit the form states rather than to an image tool.
    if (doc.format === 'PDF') {
      navigate('/compress-pdf', { state: { context: exam!.name, targetBytes: doc.maxKb * 1024 } })
      return
    }
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
            Tap one and it opens already set to that size.
          </p>
        </div>

        {/* Ours, from published guidance at a point in time. Worth saying, not
            worth alarming anyone about. */}
        {isMine ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-[var(--ink-2)]">The numbers you saved for this exam.</p>
            <button
              onClick={() => navigate(`/gov-exams/custom/${exam!.id}`)}
              className="shrink-0 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] active:bg-[var(--surface-sunk)]"
            >
              Edit numbers
            </button>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-[var(--ink-2)]">
            Sizes as published in {SPECS_CHECKED}. Please check them against your exam notification — you can edit
            every number before your file is made.
          </p>
        )}

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
                        {doc.format !== 'PDF' && (
                          <SpecChip icon={false}>
                            {doc.width}×{doc.height} px
                          </SpecChip>
                        )}
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

        {/* Exams ask for mark sheets, certificates and ID proofs as PDFs under
            a size limit, and which ones differs per candidate. Rather than
            guess at a list, this opens the PDF compressor with the exam's name
            on it. */}
        <div>
          <h3 className="text-sm font-bold tracking-tight text-[var(--ink)]">Any other document</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-2)]">
            Mark sheet, certificate, ID proof — anything the form wants as a PDF under a size limit.
          </p>
          <button
            onClick={() => navigate('/compress-pdf', { state: { context: exam!.name } })}
            className="mt-2.5 flex w-full items-center gap-3.5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-[var(--shadow-card)] active:bg-[var(--surface-sunk)]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <CompressPdfIcon width={21} height={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold tracking-tight text-[var(--ink)]">
                Compress a PDF document
              </span>
              <span className="block text-xs text-[var(--ink-2)]">Set the size limit your form states</span>
            </span>
            <ChevronRightIcon width={17} height={17} className="shrink-0 text-[var(--ink-3)]" />
          </button>
        </div>
      </main>

      <PrivacyFooter className="safe-bottom" />
    </div>
  )
}
