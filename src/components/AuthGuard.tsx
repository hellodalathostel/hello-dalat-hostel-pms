import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { Spin } from 'antd'
import { supabase } from '@/api/supabase'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

type AuthGuardProps = {
  children: ReactNode
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [session, setSession] = useState<AuthState>('loading')

  useEffect(() => {
    // Supabase v2 bắn INITIAL_SESSION ngay khi mount — dùng onAuthStateChange duy nhất
    // để tránh race condition giữa getSession và listener setState song song.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession ? 'authenticated' : 'unauthenticated')
    })

    return () => subscription.unsubscribe()
  }, [])

  if (session === 'loading') {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  if (session === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
