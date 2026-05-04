// src/api/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Thiếu biến môi trường Supabase. Hãy kiểm tra file .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

function getSupabaseStorageKey(url: string): string {
  const projectRef = new URL(url).hostname.split('.')[0]
  return `sb-${projectRef}-auth-token`
}

// Tự dọn session local bị cũ để tránh lỗi refresh token lặp lại trên môi trường dev.
void (async () => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    await supabase.auth.getSession()
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Invalid Refresh Token')) {
      return
    }

    const storageKey = getSupabaseStorageKey(supabaseUrl)
    localStorage.removeItem(storageKey)
    await supabase.auth.signOut({ scope: 'local' })
  }
})()