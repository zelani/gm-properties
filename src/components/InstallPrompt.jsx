import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [prompt,     setPrompt]     = useState(null)
  const [dismissed,  setDismissed]  = useState(() => !!localStorage.getItem('pwa_dismissed'))
  const [installed,  setInstalled]  = useState(false)
  const [isIOS,      setIsIOS]      = useState(false)
  const [showIOS,    setShowIOS]    = useState(false)

  useEffect(() => {
    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios)

    if (ios && !standalone && !dismissed) {
      // Show iOS manual install instructions after 3 seconds
      setTimeout(() => setShowIOS(true), 3000)
    }

    // Chrome/Android install prompt
    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    window.addEventListener('appinstalled', () => {
      setInstalled(true)
      setPrompt(null)
    })

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  function dismiss() {
    setDismissed(true)
    setShowIOS(false)
    localStorage.setItem('pwa_dismissed', '1')
  }

  async function install() {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') {
      setInstalled(true)
    }
    setPrompt(null)
  }

  // Already installed or dismissed — show nothing
  if (installed || dismissed) return null

  // iOS manual instruction banner
  if (isIOS && showIOS) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2">
        <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 relative">
          <button onClick={dismiss}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl font-bold leading-none">×</button>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl">🏢</div>
            <div>
              <p className="font-bold text-sm">Install GM Property Hub</p>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                Tap <strong className="text-white">Share</strong> <span className="text-base">⎙</span> then
                tap <strong className="text-white">Add to Home Screen</strong> to install this app on your iPhone.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Android / Chrome install prompt
  if (prompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2">
        <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 relative">
          <button onClick={dismiss}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl font-bold leading-none">×</button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl">🏢</div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">Install GM Property Hub</p>
              <p className="text-xs text-gray-300 mt-0.5">Add to your home screen for quick access</p>
            </div>
            <button onClick={install}
              className="flex-shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm transition">
              Install
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
