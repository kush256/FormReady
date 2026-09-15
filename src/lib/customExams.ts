import type { Exam, ExamDocument } from './exams'

const KEY = 'formready.custom-exams.v1'

/**
 * Exams the user added themselves.
 *
 * Nine built-in exams cannot cover every recruitment board in the country, and
 * a candidate for the tenth should not be sent away to type numbers into a tool
 * screen every time. A custom exam is the same shape as a built-in one, so
 * every screen that already knows how to open a document works unchanged.
 *
 * It lives in this device's storage and nowhere else. Like everything in this
 * app, nothing is uploaded — which also means it is gone if the app's data is
 * cleared, and that is the honest trade for not having an account.
 */
export interface CustomExam extends Exam {
  custom: true
}

/** Marks an id as one of ours, and keeps it clear of the built-in ids. */
const PREFIX = 'my-'

export function isCustomExamId(id: string): boolean {
  return id.startsWith(PREFIX)
}

export function loadCustomExams(): CustomExam[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Written by an older version of this app, or by a hand that edited site
    // data: anything malformed is dropped rather than crashing the exam list.
    return parsed.filter(isCustomExam)
  } catch {
    return []
  }
}

export function findCustomExam(id: string): CustomExam | undefined {
  return loadCustomExams().find((exam) => exam.id === id)
}

/** Adds or replaces one, returning the stored copy with its id filled in. */
export function saveCustomExam(exam: Omit<CustomExam, 'id' | 'custom'> & { id?: string }): CustomExam {
  const stored: CustomExam = {
    ...exam,
    id: exam.id ?? `${PREFIX}${Date.now().toString(36)}`,
    custom: true,
  }
  const rest = loadCustomExams().filter((e) => e.id !== stored.id)
  write([...rest, stored])
  return stored
}

export function deleteCustomExam(id: string): void {
  write(loadCustomExams().filter((exam) => exam.id !== id))
}

function write(exams: CustomExam[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(exams))
  } catch {
    // Storage full or blocked. The exam stays usable for this visit; there is
    // nothing useful to say about it that the user could act on.
  }
}

function isCustomExam(value: unknown): value is CustomExam {
  if (typeof value !== 'object' || value === null) return false
  const exam = value as Partial<CustomExam>
  return (
    typeof exam.id === 'string' &&
    typeof exam.name === 'string' &&
    Array.isArray(exam.documents) &&
    exam.documents.every(isExamDocument)
  )
}

function isExamDocument(value: unknown): value is ExamDocument {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Partial<ExamDocument>
  return (
    typeof doc.id === 'string' &&
    typeof doc.label === 'string' &&
    typeof doc.width === 'number' &&
    typeof doc.height === 'number' &&
    typeof doc.maxKb === 'number'
  )
}
