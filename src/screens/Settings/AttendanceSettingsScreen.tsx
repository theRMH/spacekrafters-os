import { useEffect, useState } from 'react'
import { AppHeader } from '../../components/layout/AppHeader'
import { BackButton } from '../../components/layout/BackButton'
import { Snackbar } from '../../components/feedback/Snackbar'
import { getAttendanceSettings, upsertAttendanceSettings } from '../../services/attendanceSettingsService'
import type { AttendanceSettings } from '../../types'

const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-primary'
const lbl = 'text-xs font-semibold text-slate-500 mb-1.5 block'

export default function AttendanceSettingsScreen() {
  const [isLoading, setIsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState({ open: false, msg: '', type: 'success' as 'success' | 'error' })

  const [startTime, setStartTime] = useState('09:30')
  const [endTime, setEndTime] = useState('18:45')

  useEffect(() => {
    getAttendanceSettings().then(settings => {
      if (settings) {
        setStartTime(settings.startTime)
        setEndTime(settings.endTime)
      }
      setIsLoading(false)
    })
  }, [])

  async function handleSave() {
    if (!startTime || !endTime) { setSnack({ open: true, msg: 'Office start and end time are required.', type: 'error' }); return }

    setSaving(true)
    const settings: AttendanceSettings = { startTime, endTime }
    const result = await upsertAttendanceSettings(settings)
    setSaving(false)
    if (!result.ok) { setSnack({ open: true, msg: result.error ?? 'Could not save settings.', type: 'error' }); return }
    setSnack({ open: true, msg: 'Attendance settings saved.', type: 'success' })
  }

  if (isLoading) return null

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <AppHeader />

      <div className="sticky top-14 z-20 bg-white px-5 pt-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BackButton />
          <h1 className="text-lg font-extrabold text-slate-800">Attendance Settings</h1>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Office Timing</p>
          <p className="text-xs text-slate-500">
            Used to work out late arrival / early departure from each employee's actual clock-in/out time. Attendance is not restricted by location — GPS and a photo are still captured on every Start/End for verification.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inp} />
            </div>
          </div>
        </div>

        <button onClick={handleSave} disabled={saving}
          className="w-full py-3.5 rounded-xl text-white text-sm font-bold active:opacity-90 disabled:opacity-60"
          style={{ background: '#0F2A4A' }}>
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
      </div>

      <Snackbar isOpen={snack.open} message={snack.msg} type={snack.type} onClose={() => setSnack(s => ({ ...s, open: false }))} />
    </div>
  )
}
