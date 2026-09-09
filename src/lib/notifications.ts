export async function notifyTelegram(eventType: string, data: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  try {
    const text = formatMessage(eventType, data)
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch (e) {
    console.error('Telegram notification failed:', e)
  }
}

function formatMessage(eventType: string, data: Record<string, unknown>): string {
  const templates: Record<string, string> = {
    lead_created: `🆕 <b>New Lead Created</b>\n━━━━━━━━━━━━━━━\n👤 Client: ${data.client_name}\n📱 Phone: ${data.phone}\n🏷️ Interest: ${data.product_interest || '—'}\n📍 Source: ${data.source || '—'}\n👷 Lead Owner: ${data.lead_owner_name || '—'}`,
    lead_converted: `✅ <b>Lead Converted to Project</b>\n━━━━━━━━━━━━━━━\n👤 Client: ${data.client_name}\n📋 Project: ${data.project_name}\n💰 Expected Value: ₹${data.expected_value || '—'}`,
    order_confirmed: `🎉 <b>Order Confirmed!</b>\n━━━━━━━━━━━━━━━\n📋 Project: ${data.project_name}\n👤 Client: ${data.client_name}\n💰 Order Value: ₹${data.order_value}\n💵 Advance: ₹${data.advance_paid}\n⚖️ Balance: ₹${data.balance_amount}\n📅 Delivery Date: ${data.promised_delivery_date}`,
    payment_received: `💰 <b>Payment Received</b>\n━━━━━━━━━━━━━━━\n📋 Project: ${data.project_name}\n👤 Client: ${data.client_name}\n💵 Amount: ₹${data.amount}\n💳 Mode: ${data.payment_mode}\n⚖️ Balance Remaining: ₹${data.balance_amount}`,
    installation_completed: `🎉 <b>Installation Completed — Project Done!</b>\n━━━━━━━━━━━━━━━\n📋 Project: ${data.project_name}\n👤 Client: ${data.client_name}\n🏗️ Engineer: ${data.engineer_name}`,
  }
  return templates[eventType] || `📢 <b>${eventType}</b>\n${JSON.stringify(data, null, 2)}`
}
