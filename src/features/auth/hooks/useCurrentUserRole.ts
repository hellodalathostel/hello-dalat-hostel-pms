import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import type { UserRole as DbUserRole } from '@/types/database'

export type UserRole = DbUserRole

export function useCurrentUserRole() {
	return useQuery<UserRole | null>({
		queryKey: ['currentUserRole'],
		queryFn: async () => {
			const { data, error } = await supabase.rpc('current_user_role')
			if (error) {
				throw error
			}

			return data as UserRole | null
		},
		staleTime: 1000 * 60 * 30,
		retry: 1,
	})
}