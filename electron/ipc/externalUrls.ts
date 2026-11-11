/**
 * Which web addresses the app will hand to the person's browser.
 *
 * An unfiltered "open this link" is a phishing channel: any text the app shows that looks like a
 * link (an error message, a course name) could send someone to a look-alike site. So the app opens
 * only the places it actually sends people to: Google (the consent screen, the finished document,
 * the console pages named in setup errors), Canvas, the project's page on GitHub, and the support
 * pages. Kept free of Electron imports so it can be unit tested.
 */
const EXACT_HOSTS = new Set([
  'docs.google.com',
  'drive.google.com',
  'sheets.google.com',
  'accounts.google.com',
  'myaccount.google.com',
  'console.cloud.google.com',
  'console.developers.google.com',
  'github.com',
  'community.instructure.com',
])
const SUFFIX_HOSTS = ['.instructure.com', '.atlassian.net']

export function isAllowedExternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase()
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s))
}
