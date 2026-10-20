import { describe, expect, it } from 'vitest'
import { amountInWords } from './amountInWords'

describe('amountInWords', () => {
  it('matches the sample quotation wording', () => {
    expect(amountInWords(360810)).toBe('Rupees Three Lakhs Sixty Thousand Eight Hundred and Ten')
  })
  it('handles crores, singular lakh and a small remainder', () => {
    expect(amountInWords(10100005)).toBe('Rupees One Crore One Lakh and Five')
    expect(amountInWords(5010)).toBe('Rupees Five Thousand and Ten')
  })
  it('adds paise and handles zero', () => {
    expect(amountInWords(1250.5)).toBe('Rupees One Thousand Two Hundred and Fifty and Fifty Paise')
    expect(amountInWords(0)).toBe('Rupees Zero')
  })
})
