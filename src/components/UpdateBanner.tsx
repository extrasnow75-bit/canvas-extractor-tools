import { Download, X } from 'lucide-react'

interface UpdateBannerProps {
  /** The newer version available on GitHub. */
  version: string
  /** The version currently running, shown so the difference is concrete. */
  currentVersion: string
  onDismiss(): void
}

/**
 * A quiet bar telling the user a newer version exists. It links out rather than installing:
 * updates are downloaded and run by hand, so this only has to make sure nobody is unknowingly
 * sitting on an old build.
 *
 * Dismissal lasts for the session only. Next launch it reappears, which is deliberate — the
 * cost is one small bar, and the failure mode of a permanent dismissal is someone running a
 * version with a known bug for months.
 */
export function UpdateBanner({ version, currentVersion, onDismiss }: UpdateBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200 flex-shrink-0"
    >
      <p className="text-xs text-blue-900">
        <span className="font-bold">Version {version} is available.</span>{' '}
        {currentVersion && <>You&apos;re running {currentVersion}.</>}
      </p>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => void window.api.app.openReleases()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#0033a0] hover:bg-[#002a85] px-2.5 py-1 text-xs font-bold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0] focus-visible:ring-offset-1"
        >
          <Download className="w-3.5 h-3.5" aria-hidden="true" />
          Download
        </button>
        <button
          onClick={onDismiss}
          aria-label="Dismiss update notice"
          className="rounded-lg p-1 text-blue-900 hover:bg-blue-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0033a0] focus-visible:ring-offset-1"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
