import { getFileUrl } from '../../utils/fileStorage'
import type { Lead, Quotation } from '../../types'

export type SendChannel = 'whatsapp' | 'email'
export const CHANNEL_LABEL: Record<SendChannel, string> = { whatsapp: 'WhatsApp', email: 'Email' }

// Opens WhatsApp (chat with the client) or the mail app with the quotation message ready to send, so the PC can
// send it right away. The send itself is recorded by the caller (quotation history + the lead's activity log:
// "Quotation sent via WhatsApp / Email"). Call it straight from the click so the browser doesn't block the window.
export function openClientChannel(channel: SendChannel, lead: Pick<Lead, 'name' | 'phone' | 'email'>, q: Quotation): void {
  const file = q.documentFiles?.[0]
  const fileUrl = file ? getFileUrl(file) : undefined
  const link = fileUrl ? new URL(fileUrl, window.location.origin).href : ''
  const amount = `₹${Math.round(q.netAmount).toLocaleString('en-IN')}`
  const text = `Hi ${lead.name}, please find your quotation from SpaceKrafters (${amount}).${link ? `\n${link}` : ''}`
  if (channel === 'whatsapp') {
    const digits = lead.phone.replace(/\D/g, '')
    const intl = digits.length === 10 ? `91${digits}` : digits
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  } else {
    window.location.href = `mailto:${lead.email ?? ''}?subject=${encodeURIComponent('Quotation from SpaceKrafters')}&body=${encodeURIComponent(text)}`
  }
}
