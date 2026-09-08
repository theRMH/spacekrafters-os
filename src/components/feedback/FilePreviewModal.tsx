import { X, Download, Printer } from 'lucide-react'

interface Props {
  src: string
  name: string
  onClose: () => void
}

export function FilePreviewModal({ src, name, onClose }: Props) {
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name) || src.startsWith('data:image')
  const isAudio = /\.(mp3|wav|webm|ogg|aac|m4a)$/i.test(name) || src.startsWith('data:audio')
  const isPdf   = /\.pdf$/i.test(name) || src.startsWith('data:application/pdf')

  function handleDownload() {
    const a = document.createElement('a')
    a.href = src
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handlePrint() {
    let url = src
    if (src.startsWith('data:')) {
      const res = await fetch(src)
      const blob = await res.blob()
      url = URL.createObjectURL(blob)
    }
    const win = window.open(url, '_blank')
    if (win) win.addEventListener('load', () => win.print())
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 flex-shrink-0 bg-black/90"
        style={{ height: 56 }}>
        <p className="text-white text-xs font-semibold truncate flex-1 opacity-80">{name}</p>
        <button type="button" onClick={handleDownload}
          className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30"
          title="Download">
          <Download size={15} className="text-white" />
        </button>
        {isPdf && (
          <button type="button" onClick={handlePrint}
            className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30">
            <Printer size={15} className="text-white" />
          </button>
        )}
        <button type="button" onClick={onClose}
          className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center active:bg-white/30">
          <X size={16} className="text-white" />
        </button>
      </div>

      {/* Content — fills remaining height */}
      <div className="flex-1 overflow-hidden" onClick={onClose}>
        {isImage && (
          <div className="w-full h-full flex items-center justify-center p-4"
            onClick={e => e.stopPropagation()}>
            <img src={src} alt={name}
              className="max-w-full max-h-full object-contain rounded-xl" />
          </div>
        )}

        {isAudio && (
          <div className="w-full h-full flex items-center justify-center p-6"
            onClick={e => e.stopPropagation()}>
            <div className="bg-white/10 rounded-2xl p-6 w-full max-w-sm">
              <p className="text-white text-sm font-semibold mb-4 text-center">🎤 {name}</p>
              <audio controls src={src} className="w-full" autoPlay />
            </div>
          </div>
        )}

        {isPdf && (
          <iframe
            src={src}
            title={name}
            className="w-full h-full border-0"
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {!isImage && !isAudio && !isPdf && (
          <div className="w-full h-full flex items-center justify-center p-6"
            onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl p-4 text-center space-y-3 w-full max-w-sm">
              <p className="text-4xl">📎</p>
              <p className="text-slate-700 font-semibold text-sm">{name}</p>
              <button type="button" onClick={handleDownload}
                className="block w-full py-3 bg-slate-700 text-white rounded-xl text-sm font-bold">
                Download File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
