import { useEffect, useState } from 'react'
import { api } from './lib/api'

interface HealthResponse {
  status: string
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function checkHealth() {
      try {
        setLoading(true)
        const data = await api.get<HealthResponse>('/api/health')
        if (isMounted) {
          setHealth(data)
          setError(null)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to reach API')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    checkHealth()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-6">
      <main className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900/60 p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          MergeMind Scaffold
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Verifying backend API connectivity...
        </p>

        <div className="mt-4 rounded border border-zinc-800 bg-zinc-950 p-4 font-mono text-sm">
          {loading && (
            <span className="text-zinc-500">Checking /api/health...</span>
          )}
          {error && (
            <div className="text-rose-400">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}
          {health && (
            <div className="text-emerald-400">
              <span className="font-semibold">API Health:</span>{' '}
              {JSON.stringify(health)}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
