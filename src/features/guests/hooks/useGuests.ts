import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'

export interface GuestSummary {
  id: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  document_type: string | null
  document_number: string | null
  phone: string | null
  nationality_display: string | null
  booking_count: number
  last_stay: string | null
  created_at: string
}

export interface GuestBooking {
  booking_id: string
  room_number: string
  check_in: string
  check_out: string
  status: string
  grand_total: number | null
}

type CustomerWithBookingsRow = {
  id: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  nationality: string | null
  country: string | null
  document_type: string | null
  document_number: string | null
  phone: string | null
  created_at: string
  booking_guests: {
    booking_id: string
    bookings: {
      check_in: string | null
      status: string | null
    } | null
  }[] | null
}

type GuestBookingsRow = {
  booking_id: string
  bookings: {
    room_id: string | null
    check_in: string | null
    check_out: string | null
    status: string | null
    grand_total: number | null
    rooms: {
      id: string | null
      name: string | null
    } | null
  } | null
}

async function fetchGuests(search: string): Promise<GuestSummary[]> {
  try {
    let query = supabase
      .from('customers')
      .select(`
        id,
        full_name,
        date_of_birth,
        gender,
        nationality,
        country,
        document_type,
        document_number,
        phone,
        created_at,
        booking_guests (
          booking_id,
          bookings (
            check_in,
            status
          )
        )
      `)
      .order('created_at', { ascending: false })

    if (search.trim()) {
      query = query.or(
        `full_name.ilike.%${search}%,document_number.ilike.%${search}%,phone.ilike.%${search}%`,
      )
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return ((data ?? []) as unknown as CustomerWithBookingsRow[]).map((customer) => {
      const bookings = customer.booking_guests ?? []
      const sortedDates = bookings
        .map((bookingGuest) => bookingGuest.bookings?.check_in)
        .filter((date): date is string => Boolean(date))
        .sort()
        .reverse()

      return {
        id: customer.id,
        full_name: customer.full_name,
        date_of_birth: customer.date_of_birth,
        gender: customer.gender,
        nationality: customer.nationality,
        document_type: customer.document_type,
        document_number: customer.document_number,
        phone: customer.phone,
        nationality_display: customer.nationality ?? customer.country ?? null,
        booking_count: bookings.length,
        last_stay: sortedDates[0] ?? null,
        created_at: customer.created_at,
      }
    })
  } catch (error) {
    throw normalizeError(error)
  }
}

async function fetchGuestBookings(customerId: string): Promise<GuestBooking[]> {
  try {
    const { data, error } = await supabase
      .from('booking_guests')
      .select(`
        booking_id,
        bookings (
          room_id,
          check_in,
          check_out,
          status,
          grand_total,
          rooms (
            id,
            name
          )
        )
      `)
      .eq('customer_id', customerId)

    if (error) {
      throw error
    }

    return ((data ?? []) as unknown as GuestBookingsRow[])
      .map((bookingGuest) => {
        const booking = bookingGuest.bookings
        if (!booking?.check_in || !booking.check_out || !booking.status) {
          return null
        }

        return {
          booking_id: bookingGuest.booking_id,
          room_number: booking.rooms?.name ?? booking.rooms?.id ?? booking.room_id ?? '—',
          check_in: booking.check_in,
          check_out: booking.check_out,
          status: booking.status,
          grand_total: booking.grand_total,
        }
      })
      .filter((booking): booking is GuestBooking => booking !== null)
      .sort((a, b) => b.check_in.localeCompare(a.check_in))
  } catch (error) {
    throw normalizeError(error)
  }
}

export function useGuests(search: string) {
  return useQuery({
    queryKey: ['guests', search],
    queryFn: () => fetchGuests(search),
    staleTime: 30_000,
  })
}

export function useGuestBookings(customerId: string | null) {
  return useQuery({
    queryKey: ['guest-bookings', customerId],
    enabled: Boolean(customerId),
    queryFn: () => fetchGuestBookings(customerId as string),
  })
}