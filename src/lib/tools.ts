import type { ComponentType, SVGProps } from 'react'
import {
  SignatureIcon,
  ImageToPdfIcon,
  ResizeIcon,
  CompressPdfIcon,
  MergePdfIcon,
  SplitPdfIcon,
} from '../components/Icons'

export interface ToolDef {
  id: string
  path: string
  name: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const QUICK_TOOLS: ToolDef[] = [
  {
    id: 'signature',
    path: '/signature-maker',
    name: 'Signature Maker',
    description: 'Prepare form signatures',
    icon: SignatureIcon,
  },
  {
    id: 'image-to-pdf',
    path: '/image-to-pdf',
    name: 'Image to PDF',
    description: 'Photos into one PDF',
    icon: ImageToPdfIcon,
  },
  {
    id: 'resize-photo',
    path: '/resize-photo',
    name: 'Resize Photo',
    description: 'Set exact dimensions',
    icon: ResizeIcon,
  },
  {
    id: 'compress-pdf',
    path: '/compress-pdf',
    name: 'Compress PDF',
    description: 'Reduce PDF size',
    icon: CompressPdfIcon,
  },
  {
    id: 'merge-pdf',
    path: '/merge-pdf',
    name: 'Merge PDF',
    description: 'Combine PDFs',
    icon: MergePdfIcon,
  },
  {
    id: 'split-pdf',
    path: '/split-pdf',
    name: 'Split PDF',
    description: 'Extract PDF pages',
    icon: SplitPdfIcon,
  },
]
