/**
 * Requirements for the exams FormReady targets.
 *
 * Every entry is a starting point, not gospel: commissions change these
 * between cycles, and a wrong number is worse than no number. The app shows
 * each spec as editable and tells the user to check it against the current
 * notification. Where a notification states a physical size rather than
 * pixels, the pixel figure here is derived from it at print resolution and
 * says so in its note.
 */

export type DocumentKind = 'photo' | 'signature' | 'document'

export interface ExamDocument {
  id: string
  label: string
  kind: DocumentKind
  /** Output pixels. Present for every image document. */
  width: number
  height: number
  minKb?: number
  maxKb: number
  format: 'JPG' | 'PDF'
  note?: string
}

export interface Exam {
  id: string
  name: string
  authority: string
  /** What a candidate would search for. */
  aliases: string[]
  documents: ExamDocument[]
}

const SSC_PHOTO: ExamDocument = {
  id: 'photo',
  label: 'Photograph',
  kind: 'photo',
  width: 200,
  height: 230,
  minKb: 20,
  maxKb: 50,
  format: 'JPG',
  note: 'Plain light background, taken within the last three months.',
}

const SSC_SIGNATURE: ExamDocument = {
  id: 'signature',
  label: 'Signature',
  kind: 'signature',
  width: 140,
  height: 60,
  minKb: 10,
  maxKb: 20,
  format: 'JPG',
  note: 'Black ink on white paper. Blue ink is a common cause of rejection.',
}

export const EXAMS: Exam[] = [
  {
    id: 'ssc-cgl',
    name: 'SSC CGL',
    authority: 'Staff Selection Commission',
    aliases: ['combined graduate level', 'ssc'],
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
  {
    id: 'ssc-chsl',
    name: 'SSC CHSL',
    authority: 'Staff Selection Commission',
    aliases: ['combined higher secondary', 'ssc', '10+2'],
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
  {
    id: 'upsc-cse',
    name: 'UPSC Civil Services',
    authority: 'Union Public Service Commission',
    aliases: ['ias', 'ips', 'cse', 'upsc prelims'],
    documents: [
      {
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: 350,
        height: 350,
        minKb: 20,
        maxKb: 300,
        format: 'JPG',
        note: 'Square crop. The face should fill most of the frame.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 350,
        height: 350,
        minKb: 20,
        maxKb: 300,
        format: 'JPG',
        note: 'Black ink on white paper, inside a square frame.',
      },
    ],
  },
  {
    id: 'dsssb',
    name: 'DSSSB',
    authority: 'Delhi Subordinate Services Selection Board',
    aliases: ['delhi', 'subordinate services'],
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
  {
    id: 'neet-ug',
    name: 'NEET UG',
    authority: 'National Testing Agency',
    aliases: ['medical', 'nta', 'mbbs'],
    documents: [
      {
        id: 'photo',
        label: 'Passport photograph',
        kind: 'photo',
        width: 276,
        height: 354,
        minKb: 10,
        maxKb: 200,
        format: 'JPG',
        note: 'Derived from 3.5 × 4.5 cm. White background, name and date usually printed below.',
      },
      {
        id: 'postcard',
        label: 'Postcard photograph',
        kind: 'photo',
        width: 472,
        height: 630,
        minKb: 10,
        maxKb: 200,
        format: 'JPG',
        note: 'Derived from 4 × 6 inch at screen resolution. White background.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 280,
        height: 120,
        minKb: 4,
        maxKb: 30,
        format: 'JPG',
        note: 'Running handwriting in black ink. Capitals are not accepted.',
      },
      {
        id: 'thumb',
        label: 'Left thumb impression',
        kind: 'photo',
        width: 240,
        height: 240,
        minKb: 10,
        maxKb: 200,
        format: 'JPG',
        note: 'Blue ink on white paper.',
      },
    ],
  },
  {
    id: 'jee-main',
    name: 'JEE Main',
    authority: 'National Testing Agency',
    aliases: ['engineering', 'nta', 'btech'],
    documents: [
      {
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: 276,
        height: 354,
        minKb: 10,
        maxKb: 300,
        format: 'JPG',
        note: 'Derived from 3.5 × 4.5 cm. Plain white background, face at least 80% of the frame, both ears visible.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 280,
        height: 120,
        minKb: 10,
        maxKb: 100,
        format: 'JPG',
        note: 'Black ink on white paper.',
      },
    ],
  },
  {
    id: 'jee-advanced',
    name: 'JEE Advanced',
    authority: 'IIT (rotating host)',
    aliases: ['iit', 'engineering'],
    documents: [
      {
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: 276,
        height: 354,
        minKb: 10,
        maxKb: 300,
        format: 'JPG',
        note: 'Derived from 3.5 × 4.5 cm. Plain background, taken recently.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 280,
        height: 120,
        minKb: 10,
        maxKb: 100,
        format: 'JPG',
        note: 'Black ink on white paper.',
      },
    ],
  },
  {
    id: 'ibps-po',
    name: 'IBPS PO',
    authority: 'Institute of Banking Personnel Selection',
    aliases: ['bank', 'probationary officer', 'sbi'],
    documents: [
      SSC_PHOTO,
      SSC_SIGNATURE,
      {
        id: 'thumb',
        label: 'Left thumb impression',
        kind: 'photo',
        width: 240,
        height: 240,
        minKb: 20,
        maxKb: 50,
        format: 'JPG',
        note: 'Black or blue ink on white paper.',
      },
      {
        id: 'declaration',
        label: 'Handwritten declaration',
        kind: 'document',
        width: 800,
        height: 400,
        minKb: 50,
        maxKb: 100,
        format: 'JPG',
        note: 'Written by hand in English, in running handwriting, on white paper.',
      },
    ],
  },
  {
    id: 'rrb-ntpc',
    name: 'RRB NTPC',
    authority: 'Railway Recruitment Board',
    aliases: ['railway', 'ntpc'],
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
]

export function findExam(id: string): Exam | undefined {
  return EXAMS.find((exam) => exam.id === id)
}

export function searchExams(query: string): Exam[] {
  const q = query.trim().toLowerCase()
  if (!q) return EXAMS
  return EXAMS.filter(
    (exam) =>
      exam.name.toLowerCase().includes(q) ||
      exam.authority.toLowerCase().includes(q) ||
      exam.aliases.some((alias) => alias.includes(q)),
  )
}

export function describeSize(doc: ExamDocument): string {
  return doc.minKb ? `${doc.minKb}–${doc.maxKb} KB` : `≤ ${doc.maxKb} KB`
}
