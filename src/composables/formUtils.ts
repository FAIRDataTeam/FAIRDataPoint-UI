/**
 * Email format check validation taken from the WHATWG HTML Living Standard:
 * https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
 */
const LOCAL_PART = "[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+"
const DOMAIN_LABEL = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?'
const EMAIL_PATTERN = new RegExp(`^${LOCAL_PART}@${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*$`)

export function isValidEmail(v: string): boolean {
  return EMAIL_PATTERN.test(v)
}

const DATE = String.raw`\d{4}-\d{2}-\d{2}`
const TIME = String.raw`(?:[01]\d|2[0-3]):[0-5]\d`
const ZONE = String.raw`Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00`
const CALENDAR_DATE = new RegExp(`^${DATE}$`)
const PICKER_DATE_TIME_PATTERN = new RegExp(
  String.raw`^(${DATE})T(${TIME})(?::([0-5]\d)(?:\.\d+)?)?(${ZONE})?$`,
)
const PICKER_DATE_PATTERN = new RegExp(`^(${DATE})(${ZONE})?$`)

/** Checks calendar dates supported by this picker: four-digit years after year zero. */
function isCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  if (year === 0 || month < 1 || month > 12) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= days[month - 1]!
}

/** Formats a local clock time, rejecting years the picker cannot represent. */
function localInputValue(date: Date): string | null {
  const result = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString()
  return isCalendarDate(result.slice(0, 10)) ? result.slice(0, 19) : null
}

/**
 * Converts zoned date-times to local time; leaves offset-free times as written.
 * Returns null for values the native picker cannot display.
 */
export function toDateTimeInputValue(lexical: string): string | null {
  if (lexical === '') return ''
  const match = PICKER_DATE_TIME_PATTERN.exec(lexical)
  if (!match) return null
  const [, date, time, seconds, zone] = match
  if (!isCalendarDate(date!)) return null
  // The input uses whole seconds, so omit any fractional part.
  const asStored = `${date}T${time}${seconds ? `:${seconds}` : ''}`
  if (zone === undefined) return asStored
  return localInputValue(new Date(parseDateTimeForPicker(lexical)))
}

/**
 * Adds the local UTC offset to an edited date-time. Times in a daylight-saving gap
 * move forward; invalid input leaves the previous value unchanged.
 */
export function fromDateTimeInputValue(inputValue: string, previous: string): string {
  if (inputValue === '') return ''
  if (toDateTimeInputValue(inputValue) === null) return previous
  const date = new Date(inputValue)
  const local = localInputValue(date)!
  const offset = -date.getTimezoneOffset()
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
  const minutes = String(Math.abs(offset) % 60).padStart(2, '0')
  return `${local}${offset < 0 ? '-' : '+'}${hours}:${minutes}`
}

/** Returns the calendar date alone; the date input has nowhere to show its optional timezone. */
export function toDateInputValue(lexical: string): string | null {
  if (lexical === '') return ''
  const match = PICKER_DATE_PATTERN.exec(lexical)
  return match && isCalendarDate(match[1]!) ? match[1]! : null
}

/** Keeps the previous offset when editing an xsd:date. */
export function fromDateInputValue(inputValue: string, previous: string): string {
  if (inputValue === '') return ''
  if (!isCalendarDate(inputValue)) return previous
  return inputValue + (PICKER_DATE_PATTERN.exec(previous)?.[2] ?? '')
}

/** Describes an xsd:date offset beside its timezone-free native input. */
export function dateZoneLabel(lexical: string): string {
  const zone = PICKER_DATE_PATTERN.exec(lexical)?.[2]
  if (!zone) return ''
  return zone === 'Z' ? 'UTC' : `UTC${zone}`
}

/** Date.parse uses millisecond precision; discard further digits for the picker. */
function parseDateTimeForPicker(lexical: string): number {
  return Date.parse(lexical.replace(/(\.\d{3})\d+/, '$1'))
}
