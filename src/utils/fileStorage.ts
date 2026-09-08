const UPLOAD_URL = (import.meta.env.VITE_UPLOAD_URL as string | undefined)?.trim()
const UPLOAD_KEY = (import.meta.env.VITE_UPLOAD_KEY as string | undefined)?.trim()

async function uploadToHostinger(file: File): Promise<string> {
  if (!UPLOAD_URL || !UPLOAD_KEY) {
    throw new Error('File upload is not configured. Contact your administrator.')
  }
  const form = new FormData()
  // Use a unique filename when uploading to avoid server-side overwrites. The random
  // segment is padded to a fixed length — Math.random().toString(36) can yield fewer
  // than 6 chars, which used to break getDisplayFileName's prefix-stripping regex and
  // left the ugly upload prefix showing instead of the original file name.
  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`
  const uploadName = `${uniqueSuffix}_${file.name}`
  const fileForUpload = new File([file], uploadName, { type: file.type })
  form.append('file', fileForUpload)
  let res: Response
  try {
    res = await fetch(UPLOAD_URL, {
      method: 'POST',
      headers: { 'X-Upload-Key': UPLOAD_KEY },
      body: form,
    })
  } catch {
    throw new Error('Upload failed — check your internet connection and try again.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `Upload failed (${res.status}). Please try again.`)
  }
  const json = await res.json() as { url?: string }
  if (!json.url) throw new Error('Upload failed — invalid server response.')
  return json.url
}

export async function storeFile(file: File): Promise<string> {
  if (UPLOAD_URL && UPLOAD_KEY) {
    return uploadToHostinger(file)
  }
  // Upload not configured — block in production, fall back to object URL only in local dev
  if (import.meta.env.PROD) {
    throw new Error('File upload is not configured. Contact your administrator.')
  }
  return URL.createObjectURL(file)
}

// The upload server returns either an absolute URL or a root-relative path
// (e.g. "/uploads/abc123_file.pdf") — both work fine directly in <a href>/
// <img src> (they resolve against the app's own origin), but checking only
// for an 'http' prefix treated the relative form as unresolvable and showed
// it as permanently "Unavailable". A bare original filename (from a
// pre-Hostinger-fix broken record, which never contains '/') is the only
// thing that should fall through to the local/session-only lookups below.
export function isRemoteFileRef(nameOrUrl: string): boolean {
  if (nameOrUrl.startsWith('data:') || nameOrUrl.startsWith('blob:')) return false
  return nameOrUrl.startsWith('http') || nameOrUrl.includes('/')
}

// Uploaded remote URLs carry a `<timestamp>_<random>_<originalName>` filename
// (our own client-side prefix) to avoid server-side overwrites — strip that
// back off for display. The upload server also prepends its own uniqid-style
// prefix (e.g. "5f2a1b3c4d5e6.12345678_") ahead of whatever name we send, so
// both prefixes have to be stripped, in either order, or the ugly generated
// name leaks through instead of the file the user actually picked.
export function getDisplayFileName(nameOrUrl: string): string {
  if (nameOrUrl.startsWith('data:')) return 'Voice Recording'
  let raw = isRemoteFileRef(nameOrUrl)
    ? decodeURIComponent(nameOrUrl.split('/').pop() ?? nameOrUrl)
    : nameOrUrl
  raw = raw.replace(/^[a-f0-9]{10,20}\.\d{4,12}_/i, '')
  raw = raw.replace(/^\d+_[a-z0-9]{1,8}_/i, '')
  return raw
}

export function getFileUrl(nameOrUrl: string): string | undefined {
  if (isRemoteFileRef(nameOrUrl)) return nameOrUrl
  return undefined
}

export async function fileToShareable(nameOrUrl: string): Promise<File | null> {
  if (isRemoteFileRef(nameOrUrl)) {
    try {
      const res = await fetch(nameOrUrl)
      const blob = await res.blob()
      return new File([blob], nameOrUrl.split('/').pop() ?? 'file', { type: blob.type })
    } catch { return null }
  }
  return null
}

export async function deleteRemoteFile(url: string): Promise<void> {
  if (!UPLOAD_URL || !UPLOAD_KEY || !isRemoteFileRef(url)) return
  try {
    await fetch(UPLOAD_URL, {
      method: 'DELETE',
      headers: { 'X-Upload-Key': UPLOAD_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
  } catch {}
}
