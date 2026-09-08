// Session-only stores for object URLs — valid for current browser session only.
// Persisted across components so history section can show preview buttons.

import { getFileUrl, isRemoteFileRef } from './fileStorage'

export const filePreviewStore = new Map<string, string>()   // filename → object URL
export const voicePreviewStore = new Map<string, string>()  // voiceId → blob URL

export function isImageFileName(name: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(name)
}

export function isPdfFileName(name: string) {
  return /\.pdf$/i.test(name)
}

export function isAudioId(id: string) {
  return id.startsWith('voice_')
}

export function resolveFileUrl(name: string): string | undefined {
  if (name.startsWith('data:') || isRemoteFileRef(name)) return name
  return filePreviewStore.get(name) ?? getFileUrl(name) ?? undefined
}
