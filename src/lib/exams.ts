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

/**
 * When these numbers were last checked against published guidance.
 *
 * Shown to the user rather than kept in a comment, because a spec with no date
 * on it invites more trust than it has earned.
 */
export const SPECS_CHECKED = 'September 2026'

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
  /** Where the authoritative numbers live, for the user to check against. */
  portal: string
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
    portal: 'ssc.gov.in (One Time Registration)',
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
  {
    id: 'ssc-chsl',
    name: 'SSC CHSL',
    authority: 'Staff Selection Commission',
    aliases: ['combined higher secondary', 'ssc', '10+2'],
    portal: 'ssc.gov.in (One Time Registration)',
    documents: [SSC_PHOTO, SSC_SIGNATURE],
  },
  {
    id: 'upsc-cse',
    name: 'UPSC Civil Services',
    authority: 'Union Public Service Commission',
    aliases: ['ias', 'ips', 'cse', 'upsc prelims'],
    portal: 'upsconline.gov.in',
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
        note: 'UPSC asks for the signature three times, one below the other, in black ink on white paper.',
      },
    ],
  },
  {
    id: 'dsssb',
    name: 'DSSSB',
    authority: 'Delhi Subordinate Services Selection Board',
    aliases: ['delhi', 'subordinate services'],
    portal: 'dsssbonline.nic.in (advertisement instructions)',
    documents: [
      {
        id: 'photo',
        label: 'Postcard photograph',
        kind: 'photo',
        width: 480,
        height: 672,
        minKb: 50,
        maxKb: 300,
        format: 'JPG',
        note: 'Derived from 5 × 7 inch. DSSSB asks for a postcard photo, not a passport one — a passport-size upload is a common rejection.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 140,
        height: 110,
        minKb: 10,
        maxKb: 40,
        format: 'JPG',
        note: 'Black ink on white paper. Block capitals are rejected.',
      },
    ],
  },
  {
    id: 'neet-ug',
    name: 'NEET UG',
    authority: 'National Testing Agency',
    aliases: ['medical', 'nta', 'mbbs'],
    portal: 'neet.nta.nic.in information bulletin',
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
    portal: 'jeemain.nta.nic.in information bulletin',
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
        note: 'Derived from 3.5 × 4.5 cm. Plain white background, face at least 80% of the frame, both ears visible. Recent bulletins have lowered the ceiling to 200 KB — check yours.',
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
    portal: 'jeeadv.ac.in information brochure',
    documents: [
      {
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: 276,
        height: 354,
        minKb: 4,
        maxKb: 100,
        format: 'JPG',
        note: 'Derived from 3.5 × 4.5 cm. JEE Advanced allows far less than JEE Main — 100 KB, not 300.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 280,
        height: 120,
        minKb: 1,
        maxKb: 30,
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
    portal: 'ibps.in (detailed advertisement)',
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
    portal: 'rrbapply.gov.in (the CEN for your cycle)',
    documents: [
      {
        id: 'photo',
        label: 'Photograph',
        kind: 'photo',
        width: 276,
        height: 354,
        minKb: 30,
        maxKb: 70,
        format: 'JPG',
        note: 'Derived from 3.5 × 4.5 cm. Railways ask for 30–70 KB, not the 20–50 KB most other boards use.',
      },
      {
        id: 'signature',
        label: 'Signature',
        kind: 'signature',
        width: 394,
        height: 157,
        minKb: 10,
        maxKb: 70,
        format: 'JPG',
        note: 'Derived from 5 × 2 cm. Running handwriting only. Some CENs state a 30 KB floor — check yours.',
      },
    ],
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
