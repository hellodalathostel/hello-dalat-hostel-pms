import { FunctionsHttpError } from '@supabase/supabase-js'

/**
 * Lấy thông báo lỗi thật từ Edge Function.
 * supabase-js chỉ trả "Edge Function returned a non-2xx status code";
 * body JSON { ok:false, error } nằm trong error.context (Response).
 */
export async function getFunctionErrorMessage(
  error: unknown,
  fallback = 'Lỗi không xác định',
): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body && typeof body.error === 'string' && body.error) return body.error
    } catch {
      // body không phải JSON, dùng fallback bên dưới
    }
  }
  return error instanceof Error ? error.message : fallback
}
