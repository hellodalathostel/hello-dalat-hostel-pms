import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface BookingGuest {
  id: string
  is_primary: boolean
  customer: {
    id: string
    full_name: string | null
    date_of_birth: string | null
    gender: string | null
    nationality: string | null
    document_type: string | null
    document_number: string | null
    phone: string | null
  }
}

export interface BookingService {
  id: string
  service_id: string
  name: string
  price: number
  qty: number
}

export interface BookingDiscount {
  id: string
  amount: number
  description: string
}

export interface BookingDetail {
  id: string
  room_id: string
  check_in: string
  check_out: string
  nights: number
  price_per_night: number
  room_subtotal: number
  surcharge: number
  tax_amount: number
  grand_total: number
  status: string
  guests_count: number
  note: string | null
  actual_check_in: string | null
  actual_check_out: string | null
  has_early_check_in: boolean
  has_late_check_out: boolean
  external_ical_uid: string | null
  ota_booking_number: string | null
  group: {
    id: string
    customer_name: string | null
    customer_phone: string | null
    source: string
    paid: number
    net_revenue: number
    deposit_method: string | null
    channel_fee_rate: number | null
  }
  guests: BookingGuest[]
  services: BookingService[]
  discounts: BookingDiscount[]
  balance_due: number
}

type BookingRow = {
  id: string
  room_id: string
  check_in: string
  check_out: string
  nights: number | null
  price_per_night: number | null
  room_subtotal: number | null
  surcharge: number | null
  tax_amount: number | null
  grand_total: number | null
  status: string | null
  guests_count: number | null
  note: string | null
  actual_check_in: string | null
  actual_check_out: string | null
  has_early_check_in: boolean | null
  has_late_check_out: boolean | null
}

type GroupRow = {
  id: string
  customer_name: string | null
  customer_phone: string | null
  source: string | null
  paid: number | null
  net_revenue: number | null
  deposit_method: string | null
  channel_fee_rate: number | null
  external_ical_uid: string | null
  ota_booking_number: string | null
}

type BookingWithGroupRow = BookingRow & {
  groups: GroupRow | null
}

type CustomerRow = {
  id: string
  full_name: string | null
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  document_type: string | null
  document_number: string | null
  phone: string | null
}

type GuestRow = {
  id: string
  is_primary: boolean | null
  customers: CustomerRow | CustomerRow[] | null
}

type ServiceRow = {
  id: string
  service_id: string | null
  name: string | null
  price: number | null
  qty: number | null
}

type DiscountRow = {
  id: string
  amount: number | null
  description: string | null
}

function getCustomer(customers: CustomerRow | CustomerRow[] | null): CustomerRow | null {
  if (!customers) {
    return null
  }

  if (Array.isArray(customers)) {
    return customers[0] ?? null
  }

  return customers
}

export function useBookingDetail(bookingId: string | null) {
  return useQuery({
    queryKey: ['booking-detail', bookingId],
    enabled: Boolean(bookingId),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<BookingDetail> => {
      if (!bookingId) {
        throw new Error('bookingId required')
      }

      try {
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select(`
            id, room_id, check_in, check_out, nights,
            price_per_night, room_subtotal, surcharge, tax_amount, grand_total,
            status, guests_count, note, actual_check_in, actual_check_out,
            has_early_check_in, has_late_check_out,
            groups (
              id, customer_name, customer_phone, source,
              paid, net_revenue, deposit_method, channel_fee_rate,
              external_ical_uid, ota_booking_number
            )
          `)
          .eq('id', bookingId)
          .eq('is_deleted', false)
          .single()

        if (bookingError) {
          throw bookingError
        }

        const bookingData = booking as unknown as BookingWithGroupRow | null
        if (!bookingData || !bookingData.groups) {
          throw new Error('Booking not found')
        }

        const [{ data: guestRows, error: guestError }, servicesResult, discountsResult] = await Promise.all([
          supabase
            .from('booking_guests')
            .select(`
              id, is_primary,
              customers (
                id, full_name, date_of_birth, gender, nationality,
                document_type, document_number, phone
              )
            `)
            .eq('booking_id', bookingId),
          supabase
            .from('booking_services')
            .select('id, service_id, name, price, qty')
            .eq('booking_id', bookingId),
          supabase
            .from('booking_discounts')
            .select('id, amount, description')
            .eq('booking_id', bookingId),
        ])

        if (guestError) {
          throw guestError
        }

        const guests: BookingGuest[] = ((guestRows ?? []) as unknown as GuestRow[]).map((row) => {
          const customer = getCustomer(row.customers)

          return {
            id: row.id,
            is_primary: Boolean(row.is_primary),
            customer: {
              id: customer?.id ?? '',
              full_name: customer?.full_name ?? null,
              date_of_birth: customer?.date_of_birth ?? null,
              gender: customer?.gender ?? null,
              nationality: customer?.nationality ?? null,
              document_type: customer?.document_type ?? null,
              document_number: customer?.document_number ?? null,
              phone: customer?.phone ?? null,
            },
          }
        })

        // Nếu bảng dịch vụ/giảm giá không có dữ liệu thì trả mảng rỗng để drawer vẫn render.
        const servicesRows = servicesResult.error
          ? []
          : ((servicesResult.data ?? []) as unknown as ServiceRow[])
        const discountsRows = discountsResult.error
          ? []
          : ((discountsResult.data ?? []) as unknown as DiscountRow[])

        const services: BookingService[] = servicesRows.map((row) => ({
          id: row.id,
          service_id: row.service_id ?? '',
          name: row.name ?? 'Dich vu',
          price: row.price ?? 0,
          qty: Number(row.qty ?? 0),
        }))

        const discounts: BookingDiscount[] = discountsRows.map((row) => ({
          id: row.id,
          amount: row.amount ?? 0,
          description: row.description ?? '',
        }))

        const group = bookingData.groups

        return {
          id: bookingData.id,
          room_id: bookingData.room_id,
          check_in: bookingData.check_in,
          check_out: bookingData.check_out,
          nights: bookingData.nights ?? 0,
          price_per_night: bookingData.price_per_night ?? 0,
          room_subtotal: bookingData.room_subtotal ?? 0,
          surcharge: bookingData.surcharge ?? 0,
          tax_amount: bookingData.tax_amount ?? 0,
          grand_total: bookingData.grand_total ?? 0,
          status: bookingData.status ?? 'booked',
          guests_count: bookingData.guests_count ?? 0,
          note: bookingData.note,
          actual_check_in: bookingData.actual_check_in,
          actual_check_out: bookingData.actual_check_out,
          has_early_check_in: Boolean(bookingData.has_early_check_in),
          has_late_check_out: Boolean(bookingData.has_late_check_out),
          external_ical_uid: group.external_ical_uid,
          ota_booking_number: group.ota_booking_number,
          group: {
            id: group.id,
            customer_name: group.customer_name,
            customer_phone: group.customer_phone,
            source: group.source ?? 'Other',
            paid: group.paid ?? 0,
            net_revenue: group.net_revenue ?? 0,
            deposit_method: group.deposit_method,
            channel_fee_rate: group.channel_fee_rate,
          },
          guests,
          services,
          discounts,
          balance_due: (bookingData.grand_total ?? 0) - (group.paid ?? 0),
        }
      } catch (error) {
        throw normalizeError(error)
      }
    },
  })
}