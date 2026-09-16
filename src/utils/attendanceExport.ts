import type { AttendanceRecord } from '../types'

function pad(n: number): string { return String(n).padStart(2, '0') }

function fmtTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Matches the office timing/late windows shown in the reference sheet's own legend.
function lateBucket(iso?: string): 'late' | 'late_excess' | null {
  if (!iso) return null
  const d = new Date(iso)
  const minutes = d.getHours() * 60 + d.getMinutes()
  if (minutes > 11 * 60) return 'late_excess'
  if (minutes > 9 * 60 + 45) return 'late'
  return null
}

const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

// Colors matched to the client's actual reference spreadsheet (not a generic
// guess) — dark navy banner/total, tan/gold employee+header cells, light
// pink/red Absent, solid gray Week Off, white normal cells.
const NAVY        = 'FF0F2A4A'
const TAN_GOLD     = 'FFD9C39A'
const HEADER_LIGHT = 'FFEDEFF2'
const WHITE        = 'FFFFFFFF'
const ABSENT_BG    = 'FFFADBD8'
const ABSENT_TEXT  = 'FFC0392B'
const PRESENT_TEXT = 'FF1E7A4A'
const HALFDAY_TEXT = 'FFB7791F'
const LEAVE_TEXT   = 'FF6B7280'
const WO_BG        = 'FFD5D8DC'
const DARK_TEXT    = 'FF1F2937'

// Password is a deliberate-friction convention, same as any normal
// "protected sheet" in Excel — not real security. Documented for the user
// rather than left undiscoverable; anyone with Excel + intent can still
// remove protection given the file itself, same as any client-side export.
export const ATTENDANCE_SHEET_PASSWORD = 'SpaceKrafters2026'

// members only needs id + fullName — callers pass either the real team
// directory (MD/Admin export) or a single self-only entry built from AuthUser.
export async function downloadAttendanceExcel(
  members: { id: string; fullName: string }[],
  records: AttendanceRecord[],
  year: number,
  month: number, // 0-indexed, matches Date
) {
  // Loaded on demand, not bundled into the main app chunk — exceljs is large
  // enough on its own to push the whole build over the PWA service worker's
  // 2MB-per-file precache limit, and it's only ever needed when someone
  // actually clicks Download.
  const ExcelJS = (await import('exceljs')).default

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  const sundays = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)).filter(d => d.getDay() === 0).length
  const workingDays = daysInMonth - sundays

  // "Leave Deduction (d)" is part of the client's reference layout but this
  // app has no paid/unpaid-leave-quota concept to compute it from — always 0,
  // matching what the client's own reference shows for every row anyway.
  const summaryCols = ['Present', 'Half Day', 'Absent', 'Late (9:45–11:00)', 'Late-Excess (>11:00)', 'Leave Deduction (d)', 'Payable Days']
  const colCount = 2 + daysInMonth + summaryCols.length

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Attendance', { views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }] })

  function bannerRow(text: string, color: string, bold: boolean) {
    const row = sheet.addRow([text])
    sheet.mergeCells(row.number, 1, row.number, colCount)
    const cell = row.getCell(1)
    cell.font = { bold, italic: !bold, color: { argb: color }, size: bold ? 13 : 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle' }
    row.height = bold ? 22 : 16
  }

  bannerRow(`SPACEKRAFTERS — STAFF ATTENDANCE | ${monthLabel.toUpperCase()}`, WHITE, true)
  bannerRow('Office Timing 9:30 AM - 6:45 PM   |   Sunday = Week Off   |   Values below are pulled directly from recorded attendance', 'FFD9C39A', false)
  bannerRow(`Total Calendar Days: ${daysInMonth}   |   Sundays (Week Off): ${sundays}   |   Working Days: ${workingDays}`, 'FFD9C39A', false)
  sheet.addRow([])

  const headerCells = ['EMPLOYEE', 'DETAIL', ...Array.from({ length: daysInMonth }, (_, i) => i + 1), ...summaryCols]
  const headerRow = sheet.addRow(headerCells)
  headerRow.eachCell((cell, colNumber) => {
    const isEmployeeCol = colNumber <= 2
    const isSummaryCol = colNumber > 2 + daysInMonth
    cell.font = { bold: true, color: { argb: DARK_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: (isEmployeeCol || isSummaryCol) ? TAN_GOLD : HEADER_LIGHT } }
    cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: isSummaryCol }
  })

  const weekdayCells: (string | number)[] = ['', '']
  for (let i = 1; i <= daysInMonth; i++) {
    const day = new Date(year, month, i).getDay()
    weekdayCells.push(day === 0 ? `${WEEKDAY_ABBR[day]} (WO)` : WEEKDAY_ABBR[day])
  }
  weekdayCells.push('', '', '', '', '', '', '')
  const weekdayRow = sheet.addRow(weekdayCells)
  weekdayRow.eachCell((cell, colNumber) => {
    const isEmployeeCol = colNumber <= 2
    cell.font = { bold: true, size: 9, color: { argb: DARK_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEmployeeCol ? TAN_GOLD : HEADER_LIGHT } }
    cell.alignment = { horizontal: 'center' }
  })

  const totals = { present: 0, halfDay: 0, absent: 0, late: 0, lateExcess: 0, payable: 0 }

  members.forEach(member => {
    const byDate = new Map(records.filter(r => r.userId === member.id).map(r => [r.date, r]))
    let present = 0, halfDay = 0, absent = 0, late = 0, lateExcess = 0

    // Reference order is IN TIME, OUT TIME, STATUS (status last).
    const inCells: (string | number)[] = ['', 'IN TIME']
    const outCells: (string | number)[] = ['', 'OUT TIME']
    const statusCells: (string | number)[] = ['', 'STATUS']
    const dayIsSunday: boolean[] = []
    const dayStatus: string[] = []

    for (let day = 1; day <= daysInMonth; day++) {
      const isSunday = new Date(year, month, day).getDay() === 0
      dayIsSunday.push(isSunday)
      const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`
      const rec = byDate.get(dateKey)

      if (isSunday) {
        inCells.push(''); outCells.push(''); statusCells.push('WO')
        dayStatus.push('WO')
        continue
      }

      const status = rec?.status ?? 'absent'
      const label = status === 'half_day' ? 'Half Day' : status.charAt(0).toUpperCase() + status.slice(1)
      inCells.push(fmtTime(rec?.startTime))
      outCells.push(fmtTime(rec?.endTime))
      statusCells.push(label)
      dayStatus.push(label)

      if (status === 'present') present++
      else if (status === 'half_day') halfDay++
      else if (status === 'absent') absent++

      const bucket = lateBucket(rec?.startTime)
      if (bucket === 'late') late++
      else if (bucket === 'late_excess') lateExcess++
    }

    const payable = present + halfDay * 0.5
    inCells.push('', '', '', '', '', '', '')
    outCells.push('', '', '', '', '', '', '')
    statusCells.push(present, halfDay, absent, late, lateExcess, 0, payable)

    const inRow = sheet.addRow(inCells)
    const outRow = sheet.addRow(outCells)
    const statusRow = sheet.addRow(statusCells)

    // Employee name — merged across the 3 rows, tan/gold like the header.
    const nameCell = inRow.getCell(1)
    nameCell.value = member.fullName
    nameCell.font = { bold: true, color: { argb: DARK_TEXT } }
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TAN_GOLD } }
    nameCell.alignment = { vertical: 'middle', wrapText: true }
    sheet.mergeCells(inRow.number, 1, statusRow.number, 1)

    for (const row of [inRow, outRow, statusRow]) {
      row.getCell(2).font = { bold: true, size: 9, color: { argb: DARK_TEXT } }
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_LIGHT } }
    }

    // Color each day column across all 3 rows by that day's status.
    for (let day = 1; day <= daysInMonth; day++) {
      const col = 2 + day
      const value = dayStatus[day - 1]
      const cellsForDay = [inRow.getCell(col), outRow.getCell(col), statusRow.getCell(col)]
      if (dayIsSunday[day - 1]) {
        cellsForDay.forEach(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WO_BG } } })
        statusRow.getCell(col).font = { italic: true, color: { argb: DARK_TEXT } }
      } else if (value === 'Absent') {
        cellsForDay.forEach(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ABSENT_BG } } })
        statusRow.getCell(col).font = { bold: true, color: { argb: ABSENT_TEXT } }
      } else {
        const textColor = value === 'Present' ? PRESENT_TEXT : value === 'Half Day' ? HALFDAY_TEXT : LEAVE_TEXT
        statusRow.getCell(col).font = { bold: true, color: { argb: textColor } }
      }
      cellsForDay.forEach(c => { c.alignment = { horizontal: 'center' } })
    }

    // Summary columns — tan/gold like the header, dark bold values.
    for (let i = 0; i < summaryCols.length; i++) {
      const cell = statusRow.getCell(3 + daysInMonth + i)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TAN_GOLD } }
      cell.font = { bold: true, color: { argb: DARK_TEXT } }
      cell.alignment = { horizontal: 'center' }
    }

    totals.present += present
    totals.halfDay += halfDay
    totals.absent += absent
    totals.late += late
    totals.lateExcess += lateExcess
    totals.payable += payable
  })

  sheet.addRow([])
  const totalCells: (string | number)[] = ['TOTAL', '']
  for (let i = 1; i <= daysInMonth; i++) totalCells.push('')
  totalCells.push(totals.present, totals.halfDay, totals.absent, totals.late, totals.lateExcess, 0, totals.payable)
  const totalRow = sheet.addRow(totalCells)
  totalRow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true, color: { argb: WHITE } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  })

  sheet.getColumn(1).width = 16
  sheet.getColumn(2).width = 10
  for (let i = 0; i < daysInMonth; i++) sheet.getColumn(3 + i).width = 8
  for (let i = 0; i < summaryCols.length; i++) sheet.getColumn(3 + daysInMonth + i).width = 13

  // Genuine, Excel-enforced protection — every cell is locked by default,
  // so this makes the whole sheet read-only until someone deliberately
  // removes protection with the password (Review > Unprotect Sheet).
  await sheet.protect(ATTENDANCE_SHEET_PASSWORD, { selectLockedCells: true, selectUnlockedCells: false })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Attendance_${monthLabel.replace(/\s+/g, '_')}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
