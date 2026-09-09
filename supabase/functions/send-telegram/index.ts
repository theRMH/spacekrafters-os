import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID')

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { event_type, data } = await req.json()
  const text = formatMessage(event_type, data)

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    })
    if (res.ok) return new Response(JSON.stringify({ sent: true }), { status: 200 })
    await new Promise(r => setTimeout(r, (attempt + 1) * 2000))
  }

  return new Response(JSON.stringify({ error: 'Failed to send' }), { status: 500 })
})

function formatMessage(eventType: string, data: Record<string, unknown>): string {
  const templates: Record<string, string> = {
    lead_created: `🆕 <b>New Lead Created</b>\n━━━━━━━━━━━━━━━\n👤 Client: ${data.client_name}\n📱 Phone: ${data.phone}\n🏷️ Interest: ${data.product_interest || '—'}\n📍 Source: ${data.source || '—'}`,
    order_confirmed: `🎉 <b>Order Confirmed!</b>\n━━━━━━━━━━━━━━━\n📋 Project: ${data.project_name}\n👤 Client: ${data.client_name}\n💰 Order Value: ₹${data.order_value}\n⚖️ Balance: ₹${data.balance_amount}`,
    payment_received: `💰 <b>Payment Received</b>\n━━━━━━━━━━━━━━━\n📋 Project: ${data.project_name}\n💵 Amount: ₹${data.amount}\n💳 Mode: ${data.payment_mode}\n⚖️ Balance: ₹${data.balance_amount}`,
  }
  return templates[eventType] || `📢 <b>${eventType}</b>`
}
