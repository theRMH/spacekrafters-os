import { MultiFileUploadField } from './MultiFileUploadField'

interface Props {
  label: string
  noteValue: string
  onNoteChange: (v: string) => void
  files: string[]
  onFilesChange: (f: string[]) => void
  placeholder?: string
  noteRows?: number
  accept?: string
  required?: boolean
}

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-400'
const lbl = 'text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5 block'

export function NoteWithFilesField({
  label, noteValue, onNoteChange, files, onFilesChange,
  placeholder = 'Add notes…', noteRows = 3, accept = 'image/*,.pdf', required,
}: Props) {
  return (
    <div className="space-y-2">
      <label className={lbl}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <textarea
        rows={noteRows}
        value={noteValue}
        onChange={e => onNoteChange(e.target.value)}
        placeholder={placeholder}
        className={`${inp} resize-none`}
      />
      <MultiFileUploadField
        label=""
        files={files}
        onChange={onFilesChange}
        accept={accept}
        helperText="Tap to attach supporting files (optional)"
      />
    </div>
  )
}
