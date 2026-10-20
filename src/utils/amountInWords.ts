const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n: number): string {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')
}

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100
  return [h ? `${ONES[h]} Hundred` : '', r ? (h ? `and ${below100(r)}` : below100(r)) : ''].filter(Boolean).join(' ')
}

// Indian numbering (lakh / crore), e.g. 360810.96 → "Rupees Three Lakhs Sixty Thousand
// Eight Hundred and Ten and Ninety Six Paise" — same wording style as the quotation template.
export function amountInWords(amount: number): string {
  const total = Math.round(Math.max(0, amount) * 100)
  const rupees = Math.floor(total / 100)
  const paise = total % 100
  if (rupees === 0 && paise === 0) return 'Rupees Zero'

  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const rest = rupees % 1000

  const parts: string[] = []
  if (crore) parts.push(`${below100(crore)} ${crore === 1 ? 'Crore' : 'Crores'}`)
  if (lakh) parts.push(`${below100(lakh)} ${lakh === 1 ? 'Lakh' : 'Lakhs'}`)
  if (thousand) parts.push(`${below100(thousand)} Thousand`)
  if (rest) {
    const words = below1000(rest)
    parts.push(parts.length && !words.startsWith('and ') && rest < 100 ? `and ${words}` : words)
  }
  let out = `Rupees ${parts.join(' ')}`.trim()
  if (rupees === 0) out = 'Rupees Zero'
  if (paise) out += ` and ${below100(paise)} Paise`
  return out
}
