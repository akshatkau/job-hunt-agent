import { useState } from 'react'

export function useToast() {
  const [toasts, setToasts] = useState([])

  function addToast(message, type = 'success') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error:   (msg) => addToast(msg, 'error'),
    info:    (msg) => addToast(msg, 'info'),
  }

  return { toasts, toast }
}

export function ToastContainer({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`
            px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium
            flex items-center gap-2 animate-slide-in min-w-[200px] max-w-[320px]
            ${t.type === 'success' ? 'bg-emerald-500' : ''}
            ${t.type === 'error'   ? 'bg-red-500'     : ''}
            ${t.type === 'info'    ? 'bg-blue-500'    : ''}
          `}
        >
          <span className="flex-shrink-0">
            {t.type === 'success' && '✓'}
            {t.type === 'error'   && '✕'}
            {t.type === 'info'    && 'ℹ'}
          </span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
