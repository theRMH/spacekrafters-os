// How a quotation went to the client. The buttons only RECORD the send (quotation history + the lead's activity
// log: "Quotation sent via WhatsApp / Email") — nothing is opened or sent from the app.
export type SendChannel = 'whatsapp' | 'email'
export const CHANNEL_LABEL: Record<SendChannel, string> = { whatsapp: 'WhatsApp', email: 'Email' }
