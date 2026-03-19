import { useState, useEffect } from 'react'

export default function InstallPrompt() {
  const [prompt,    setPrompt]    = useState(null)
  const [dismissed, setDismissed] = useState(false)  // never persist dismiss — always show on new session
  const [installed, setInstalled] = useState(false)
  const [isIOS,     setIsIOS]     = useState(false)
  const [showIOS,   setShowIOS]   = useState(false)
  const [isAndroid, setIsAndroid] = useState(false)
  const [showManual,setShowManual]= useState(false)

  useEffect(() => {
    const ua         = navigator.userAgent
    const ios        = /iphone|ipad|ipod/i.test(ua)
    const android    = /android/i.test(ua)
    const standalone = window.matchMedia('(display-mode: standalone)').matches

    // Already installed as PWA — show nothing
    if (standalone) { setInstalled(true); return }

    setIsIOS(ios)
    setIsAndroid(android)

    if (ios) {
      setTimeout(() => setShowIOS(true), 2000)
    }

    if (android) {
      // Show manual fallback after 5s if beforeinstallprompt hasn't fired
      const fallbackTimer = setTimeout(() => {
        setShowManual(true)
      }, 5000)

      const handler = (e) => {
        e.preventDefault()
        clearTimeout(fallbackTimer)
        setPrompt(e)
        setShowManual(false)
      }
      window.addEventListener('beforeinstallprompt', handler)
      window.addEventListener('appinstalled', () => {
        setInstalled(true)
        setPrompt(null)
        setShowManual(false)
      })
      return () => {
        window.removeEventListener('beforeinstallprompt', handler)
        clearTimeout(fallbackTimer)
      }
    } else if (!ios) {
      // Desktop Chrome
      const handler = (e) => {
        e.preventDefault()
        setPrompt(e)
      }
      window.addEventListener('beforeinstallprompt', handler)
      window.addEventListener('appinstalled', () => { setInstalled(true); setPrompt(null) })
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  async function install() {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setPrompt(null)
  }

  if (installed || dismissed) return null

  // iOS instructions
  if (isIOS && showIOS) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 relative">
          <button onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl font-bold">×</button>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl">🏢</div>
            <div>
              <p className="font-bold text-sm">Install GM Property Hub</p>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                Tap the <strong className="text-white">Share</strong> button ⎙ at the bottom, then tap <strong className="text-white">Add to Home Screen</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Android — beforeinstallprompt fired
  if (prompt) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 relative">
          <button onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl font-bold">×</button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl">🏢</div>
            <div className="flex-1">
              <p className="font-bold text-sm">Install GM Property Hub</p>
              <p className="text-xs text-gray-300 mt-0.5">Add to home screen for quick access</p>
            </div>
            <button onClick={install}
              className="flex-shrink-0 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm">
              Install
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Android manual fallback — Chrome menu instructions
  if (isAndroid && showManual) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-4 relative">
          <button onClick={() => setDismissed(true)}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl font-bold">×</button>
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl">🏢</div>
            <div>
              <p className="font-bold text-sm">Add to Home Screen</p>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                Tap the <strong className="text-white">⋮ menu</strong> in Chrome, then tap <strong className="text-white">Add to Home screen</strong>.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
