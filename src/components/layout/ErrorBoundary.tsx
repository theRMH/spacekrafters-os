import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Fenster] Unhandled render error:', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Something went wrong</h2>
        <p className="text-sm text-slate-500 mb-6">The app hit an unexpected error. Try reloading.</p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl active:bg-blue-700"
          >
            Reload App
          </button>
          <button
            onClick={() => { window.location.href = '/dashboard' }}
            className="px-5 py-2.5 bg-slate-200 text-slate-700 text-sm font-medium rounded-xl active:bg-slate-300"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }
}
