import type { Lead, QuotationTemplateData } from '../types'

// Fixed letterhead of the quotation PDF (QuotationPrintTemplate.tsx). Edit here to change it.
export const QUOTATION_LETTERHEAD = {
  companyName: ['S.P.A.C.E', 'K.R.A.F.T.E.R.S'],
  tagline: 'Turnkey Projects & Constructions | Quotation',
  address: 'NO.16/18, Ground Floor, Cabin No.02, Arulambal Street, Rama Kamath Puram, T.Nagar, Chennai - 600097',
  phone: 'Office : +91 93 63 73 00 96',
  logo: '/brand/spacekrafters-logo.png',
  signingCompany: 'For Space Krafters Turnkey Projects & Constructions',
}

// Default wording for the per-project note boxes — taken from the sample quotation.
// One point per line. The sample PDF cut three lines off at the page edge; those
// were completed here (marked) — adjust them in the form if the wording differs.
export const DEFAULT_TERMS = {
  commercialTerms: [
    'GST is 18% inclusive, as reflected in the quoted amount.',
    'This quotation is valid for 7 days from the date of issue; rates are subject to revision thereafter.',
    'Work will commence within 2 to 3 days of written confirmation from the client along with a Purchase Order (PO).',
    'Electricity and water required for the execution of works will be provided by the client at the site.',
  ].join('\n'),
  clientScope: [
    'A functional electricity supply point at the site, in working condition, for the duration of the project, at no cost to the contractor.',
    'A functional water supply at the site for works requiring water.',
    "Unrestricted access to the site during working hours for the contractor's workforce and movement of materials.",
    'Adequate space at the site for secure storage of materials, tools and equipment for the duration of the works.',
    'Necessary permissions and NOCs from the builder, society, RWA or local authority for carrying out interior works, including material movement.',
    'Any civil, electrical or plumbing alteration required outside the scope of this BOQ will be carried out on a chargeable basis, only after client approval.',
  ].join('\n'),
  scopeVariations: [
    'Rates quoted are based on the drawings, specifications and sizes finalized and shared as of the date of this quotation.',
    'Any change in design, material, finish, size or specification after confirmation will be treated as a variation and billed separately at applicable rates.',
    'Quantities mentioned are approximate and subject to site verification; final billing will be as per actual site measurements.',
  ].join('\n'),
  executionTimeline: [
    'Working hours and site access will be as per the timings permitted by the building/society.',
    'Project timelines are indicative and may be affected by delays in client decisions, approvals, payments, or site handover.',
    'Any work beyond the scope of this BOQ will be quoted and taken up only after written client approval.',
  ].join('\n'),
  generalTerms: [
    'Any statutory taxes, cess or duties introduced or revised after the date of this quotation will be charged extra as applicable.',
    'This quotation, together with the BOQ, constitutes the complete scope of work agreed upon unless amended in writing by both parties.',
    'All disputes are subject to Chennai jurisdiction.',
  ].join('\n'),
}

export const DEFAULT_PAYMENT_STAGES = [
  { stage: 'Advance – on confirmation of order along with Purchase Order', percent: '50%' },
  { stage: 'During execution', percent: '40%' },
  { stage: 'On completion / handover', percent: '10%' },
]

export const DEFAULT_PAYMENT_FOOTER = 'Payments are to be made strictly as per the above schedule. Any delay in payment may affect the project execution timeline.'

export const DEFAULT_CLOSING_NOTE = 'Payment schedule, quotation validity, site provisions and other conditions are detailed in the Terms & Conditions annexed on the following page and form an integral part of this quotation.'

// Starting values for a new quotation — everything stays editable in the form.
export function defaultTemplateData(opts: { lead?: Lead; mdName?: string; signName?: string; signPhone?: string }): QuotationTemplateData {
  const { lead, mdName, signName, signPhone } = opts
  return {
    workTitle: 'Interior Fit-Out Works',
    kindAttn: lead?.name ?? '',
    siteName: lead?.city ?? '',
    projectType: lead?.businessCategory ? lead.businessCategory.charAt(0).toUpperCase() + lead.businessCategory.slice(1) : '',
    projectMd: mdName ?? '',
    projectLead: lead?.ownerName ?? '',
    projectQs: '',
    paymentNotes: '',
    closingNote: DEFAULT_CLOSING_NOTE,
    signName: signName ?? '',
    signDesignation: 'Project Coordinator',
    signPhone: signPhone ?? '',
    ...DEFAULT_TERMS,
    paymentStages: DEFAULT_PAYMENT_STAGES.map(s => ({ ...s })),
    paymentFooter: DEFAULT_PAYMENT_FOOTER,
  }
}
