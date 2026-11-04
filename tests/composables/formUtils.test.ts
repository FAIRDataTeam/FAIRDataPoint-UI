import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  fromDateInputValue,
  fromDateTimeInputValue,
  dateZoneLabel,
  toDateInputValue,
  toDateTimeInputValue,
} from '../../src/composables/formUtils'

// Pinned, so "your time" does not depend on where the tests run. Amsterdam is UTC+01:00 in
// winter and UTC+02:00 in summer, which exercises daylight saving time.
const originalTimeZone = process.env.TZ
beforeAll(() => {
  process.env.TZ = 'Europe/Amsterdam'
})
afterAll(() => {
  if (originalTimeZone === undefined) delete process.env.TZ
  else process.env.TZ = originalTimeZone
})

describe('toDateTimeInputValue', () => {
  it.each([
    '2026-09-15T24:00:00',
    '2026-02-30T10:00:00Z',
    '2025-02-29T10:00:00Z',
    '2026-09-15T10:60:00Z',
    '2026-09-15T10:00:60Z',
    '2026-09-15T10:00:00+14:01',
    '0000-01-01T10:00:00Z',
    '-0001-01-01T00:00:00',
    'not a date',
  ])('uses the text fallback for %s', (lexical) => {
    expect(toDateTimeInputValue(lexical)).toBeNull()
  })

  it('converts the stored instant to local time', () => {
    expect(toDateTimeInputValue('2026-09-15T10:00:00+05:30')).toBe('2026-09-15T06:30:00')
    expect(toDateTimeInputValue('2026-09-15T10:00:00-04:00')).toBe('2026-09-15T16:00:00')
  })

  it('uses the offset at the stored date, including changes across midnight', () => {
    expect(toDateTimeInputValue('2026-01-15T23:30:00Z')).toBe('2026-01-16T00:30:00')
    expect(toDateTimeInputValue('2026-07-15T23:30:00Z')).toBe('2026-07-16T01:30:00')
  })

  it('handles a local timezone west of UTC', () => {
    process.env.TZ = 'America/New_York'
    try {
      expect(toDateTimeInputValue('2026-09-15T14:00:00Z')).toBe('2026-09-15T10:00:00')
    } finally {
      process.env.TZ = 'Europe/Amsterdam'
    }
  })

  it('shows offset-free values as written and leaves empty inputs empty', () => {
    expect(toDateTimeInputValue('2026-09-15T10:00:00')).toBe('2026-09-15T10:00:00')
    expect(toDateTimeInputValue('')).toBe('')
  })

  it('shows an offset-free value as written even where that local time does not exist', () => {
    // Amsterdam skips 02:30 that night, and a value naming no moment must not be moved to 03:30.
    expect(toDateTimeInputValue('2026-03-29T02:30:00')).toBe('2026-03-29T02:30:00')
  })

  it('omits fractional seconds for display', () => {
    expect(toDateTimeInputValue('2026-09-17T07:37:59.257199467Z')).toBe('2026-09-17T09:37:59')
  })

  it('checks leap days and the converted year range', () => {
    expect(toDateTimeInputValue('2000-02-29T10:00:00Z')).toBe('2000-02-29T11:00:00')
    expect(toDateTimeInputValue('1900-02-29T10:00:00Z')).toBeNull()
    expect(toDateTimeInputValue('9999-12-31T23:30:00-02:00')).toBeNull()
  })
})

describe('fromDateTimeInputValue', () => {
  it('writes local times with the offset at the entered date', () => {
    expect(fromDateTimeInputValue('2026-01-15T10:00:00', '')).toBe('2026-01-15T10:00:00+01:00')
    expect(fromDateTimeInputValue('2026-07-01T10:00:00', '')).toBe('2026-07-01T10:00:00+02:00')
  })

  it('retains the local offset instead of replacing it with UTC', () => {
    const value = fromDateTimeInputValue('2025-05-14T14:44:22', '')
    expect(value).toBe('2025-05-14T14:44:22+02:00')
    expect(Date.parse(value)).toBe(Date.parse('2025-05-14T12:44:22Z'))
  })

  it.each([
    ['America/New_York', '-04:00'],
    ['Asia/Kolkata', '+05:30'],
    ['UTC', '+00:00'],
  ])('writes the offset for %s', (zone, offset) => {
    process.env.TZ = zone
    try {
      expect(fromDateTimeInputValue('2025-05-14T14:44:22', '')).toBe(`2025-05-14T14:44:22${offset}`)
    } finally {
      process.env.TZ = 'Europe/Amsterdam'
    }
  })

  it('round-trips the displayed local time to the same instant', () => {
    const previous = '2026-09-15T10:00:00+05:30'
    const edited = fromDateTimeInputValue(toDateTimeInputValue(previous)!, previous)
    expect(edited).toBe('2026-09-15T06:30:00+02:00')
    expect(Date.parse(edited)).toBe(Date.parse(previous))
  })

  it('normalizes a DST-gap time consistently', () => {
    const value = fromDateTimeInputValue('2026-03-29T02:30:00', '')
    expect(value).toBe('2026-03-29T03:30:00+02:00')
    expect(toDateTimeInputValue(value)).toBe('2026-03-29T03:30:00')
    expect(fromDateTimeInputValue('2026-03-29T01:30:00', '')).toBe('2026-03-29T01:30:00+01:00')
  })

  it('keeps the previous value for unsupported input', () => {
    const previous = '2026-02-30T10:00:00Z'
    expect(fromDateTimeInputValue('2026-02-30T11:00:00', previous)).toBe(previous)
    expect(fromDateTimeInputValue('2026-09-15T10:60:00', previous)).toBe(previous)
  })

  it('adds missing seconds and permits clearing', () => {
    expect(fromDateTimeInputValue('2026-09-15T11:30', '')).toBe('2026-09-15T11:30:00+02:00')
    expect(fromDateTimeInputValue('', '2026-09-15T10:00:00Z')).toBe('')
  })
})

describe('date inputs', () => {
  it.each(['2026-02-30', '1900-02-29', '0000-01-01', '2026-13-01'])(
    'keeps unsupported date %s out of the picker',
    (lexical) => {
      expect(toDateInputValue(lexical)).toBeNull()
      expect(fromDateInputValue(lexical, '2026-09-15Z')).toBe('2026-09-15Z')
    },
  )

  it('accepts leap days without converting the calendar date', () => {
    expect(toDateInputValue('2000-02-29+14:00')).toBe('2000-02-29')
    expect(toDateInputValue('2026-09-15+14:01')).toBeNull()
  })
  it('round-trips an xsd:date, keeping any offset it had', () => {
    expect(toDateInputValue('2026-09-15')).toBe('2026-09-15')
    expect(toDateInputValue('2026-09-15Z')).toBe('2026-09-15')
    expect(fromDateInputValue('2026-10-01', '2026-09-15Z')).toBe('2026-10-01Z')
    expect(fromDateInputValue('2026-10-01', '2026-09-15')).toBe('2026-10-01')
  })

  it('gives a new date no offset', () => {
    expect(fromDateInputValue('2026-10-01', '')).toBe('2026-10-01')
  })

  it('returns null for a form the input cannot show', () => {
    expect(toDateInputValue('2026-09')).toBeNull()
  })
})

describe('dateZoneLabel', () => {
  it('names the offset, or nothing when there is none', () => {
    expect(dateZoneLabel('2026-09-15Z')).toBe('UTC')
    expect(dateZoneLabel('2026-09-15+02:00')).toBe('UTC+02:00')
    expect(dateZoneLabel('2026-09-15')).toBe('')
  })
})
