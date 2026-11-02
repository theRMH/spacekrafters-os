// A material indent estimated above this amount (rupees) needs the MD's approval; at or below it the PC can approve.
export const MD_APPROVAL_LIMIT = 50000

// GST rate offered by default on a purchase-order line.
export const DEFAULT_GST_PERCENT = '18'
export const GST_PERCENT_OPTIONS = ['0', '5', '12', '18', '28']

// The buyer printed at the top of every purchase order (taken from the sample PO). Edit here to change it.
export const PO_COMPANY = {
  logo: '/brand/fgd-logo.png',
  name: 'FUTURE GROUP DISTRIBUTORS',
  gstin: '33AJEPN8101A1ZW',
  pan: 'AJEPN8101A',
  address: 'NO. 6, GROUND FLOOR, 27th STREET, KRISHNA NAGAR, MADURAVOYAL, CHENNAI, Tiruvallur, TAMIL NADU, 600095',
  phone: '+91 8300000096, 93637 30096',
  email: 'futuregroupdistributors@gmail.com',
  placeOfSupply: '33-TAMIL NADU',
}
