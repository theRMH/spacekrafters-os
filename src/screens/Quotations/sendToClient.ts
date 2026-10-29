import { getFileUrl } from '../../utils/fileStorage'
import type { Lead, Quotation } from '../../types'

// How a quotation went to the client. Both buttons RECORD the send (quotation history + the lead's activity log:
// "Quotation sent via WhatsApp / Email"). WhatsApp also opens the chat with the client with the message and the
// PDF link ready; Email only records.
export type SendChannel = 'whatsapp' | 'email'
export const CHANNEL_LABEL: Record<SendChannel, string> = { whatsapp: 'WhatsApp', email: 'Email' }

// Opens the WhatsApp chat with the client (wa.me) with the quotation message ready. Call it straight from the click
// so the browser doesn't block the window.
export function openWhatsApp(lead: Pick<Lead, 'name' | 'phone'>, q: Quotation): void {
  const file = q.documentFiles?.[0]
  const fileUrl = file ? getFileUrl(file) : undefined
  const link = fileUrl ? new URL(fileUrl, window.location.origin).href : ''
  const amount = `₹${Math.round(q.netAmount).toLocaleString('en-IN')}`
  const text = `Hi ${lead.name}, please find your quotation from SpaceKrafters (${amount}).${link ? `\n${link}` : ''}`
  const digits = lead.phone.replace(/\D/g, '')
  const intl = digits.length === 10 ? `91${digits}` : digits
  window.open(`https://wa.me/${intl}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
}
