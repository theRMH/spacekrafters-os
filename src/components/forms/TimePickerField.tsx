import { Clock } from 'lucide-react'

const TIME_SLOTS = [
  '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM',
]

interface Props {
  label?: string
  value: string
  onChange: (v: string) => void
}

export function TimePickerField({ label = 'Visit Time', value, onChange }: Props) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5 block">
        <Clock size={11} className="text-slate-400" />
        {label}
      </label>
      <div className="grid grid-cols-4 gap-1.5">
        {TIME_SLOTS.map(slot => {
          const active = value === slot
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onChange(slot)}
              className={`py-2.5 rounded-xl text-[11px] font-bold border-2 transition-colors active:scale-95
                ${active
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
                }`}
            >
              {slot}
            </button>
          )
        })}
      </div>
      {value && (
        <p className="text-[11px] text-blue-600 font-semibold mt-1.5">Selected: {value}</p>
      )}
    </div>
  )
}
