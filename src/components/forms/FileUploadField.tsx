import { useRef } from 'react'
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react'

interface Props {
  label: string
  required?: boolean
  uploadedFiles: string[]
  onFileSelected: (fileName: string) => void
  error?: string
}

export function FileUploadField({ label, required = false, uploadedFiles, onFileSelected, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const hasFiles = uploadedFiles.length > 0
  const latestFile = uploadedFiles[uploadedFiles.length - 1]

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file.name)
    e.target.value = ''
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-sm font-bold text-slate-700">{label}</p>
        {required && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md uppercase tracking-wide">
            Required
          </span>
        )}
      </div>

      {hasFiles ? (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={19} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-700">Photo Added</p>
            <p className="text-xs text-emerald-600 truncate mt-0.5">{latestFile}</p>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-bold text-emerald-700 underline active:opacity-70 min-h-[36px] px-2"
          >
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={[
            'w-full border-2 border-dashed rounded-xl py-6 flex flex-col items-center gap-2.5 active:opacity-70 transition-opacity',
            error ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50',
          ].join(' ')}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${error ? 'bg-red-100' : 'bg-slate-100'}`}>
            <Upload size={20} className={error ? 'text-red-400' : 'text-slate-400'} />
          </div>
          <p className={`text-sm font-bold ${error ? 'text-red-600' : 'text-slate-600'}`}>Upload Photo</p>
          <p className="text-xs text-slate-400">Tap to pick from gallery</p>
        </button>
      )}

      {error && !hasFiles && (
        <div className="flex items-center gap-1.5 mt-2">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-red-600">{error}</p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
