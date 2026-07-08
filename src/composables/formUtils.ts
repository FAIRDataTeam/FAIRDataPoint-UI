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
