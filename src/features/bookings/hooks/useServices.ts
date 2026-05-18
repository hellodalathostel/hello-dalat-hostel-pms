import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'

export interface ServiceCatalogItem {
  id: string
  name: string
  price: number
}

async function fetchServices(): Promise<ServiceCatalogItem[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, price')
    .eq('is_deleted', false)
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

// Fetch danh mục dịch vụ từ bảng services.
export function useServices() {
  return useQuery({
    queryKey: ['services-catalog'],
    queryFn: fetchServices,
    staleTime: 10 * 60 * 1000,
  })
}
