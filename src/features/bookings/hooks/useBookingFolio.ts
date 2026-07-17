// src/features/bookings/hooks/useBookingFolio.ts
// v2 — SỬA BUG ROOT CAUSE: remaining trước đây tính
//   grandTotal (của RIÊNG booking này) - paid (của CẢ group)
// → sai khi group có nhiều phòng, vì trộn booking-level với group-level.
//
// Sửa thành: remaining = group.grand_total - group.paid (đúng nguyên tắc
// đã ghi trong Project Instructions: "Balance = groups.grand_total - groups.paid").
//
// Thêm field mới: isLastActiveBooking — để CheckoutModal biết gọi
// checkout_single_booking_txn hay checkout_last_booking_and_settle_txn.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { normalizeError } from '@/shared/utils/normalizeError'
import type { BookingStatus } from '@/types/database'

type BookingRow = {
  id: string
  status: BookingStatus
  check_in: string
  check_out: string
  price_per_night: number
  room_subtotal: number | null
  surcharge: number
  tax_amount: number | null
  grand_total: number | null
  group_id: string
  room_id: string
  guest_name: string | null
}

type GroupRow = {
  id: string
  paid: number | null
  grand_total: number | null
  net_revenue: number | null
  channel_fee_rate: number | null
  customer_name: string | null
}

type ServiceRow = {
  id: string
  name: string
  qty: number | string
  price: number
}

type DiscountRow = {
  id: string
  description: string | null
  amount: number
}

type PaymentRow = {
  id: string
  amount: number
  method: string | null
  date: string
  note: string | null
  is_void: boolean
  voided_payment_id: string | null
  updated_at: string
}

// Đếm booking active khác trong group — dùng để xác định isLastActiveBooking.
type ActiveSiblingRow = {
  id: string
  status: BookingStatus
}

export interface BookingFolio {
  booking: {
    id: string
    status: BookingStatus
    checkIn: string
    checkOut: string
    pricePerNight: number
    roomSubtotal: number
    surcharge: number
    taxAmount: number
    grandTotal: number
    groupId: string
    roomNumber: string
    guestName: string
  }
  services: Array<{
    id: string
    name: string
    qty: number
    price: number
    subtotal: number
  }>
  discounts: Array<{
    id: string
    description: string
    amount: number
  }>
  payments: Array<{
    id: string
    amount: number
    method: string
    date: string
    note: string | null
    isVoid: boolean
    voidedPaymentId: string | null
    updatedAt: string
  }>
  group: {
    id: string
    paid: number
    grandTotal: number
    netRevenue: number
    channelFeeRate: number
  }
  /** SỬA: giờ tính ở group-level (group.grandTotal - group.paid), không còn trộn booking-level */
  remaining: number
  /** Booking này có phải booking active (booked/checked-in) cuối cùng trong group không */
  isLastActiveBooking: boolean
}

export function useBookingFolio(bookingId: string | null) {
  return useQuery({
    queryKey: ['booking-folio', bookingId],
    enabled: Boolean(bookingId),
    refetchOnMount: true,
    queryFn: async (): Promise<BookingFolio> => {
      if (!bookingId) {
        throw new Error('Thiếu bookingId')
      }

      try {
        const { data: booking, error: bookingError } = await supabase
          .from('bookings')
          .select('id, status, check_in, check_out, price_per_night, room_subtotal, surcharge, tax_amount, grand_total, group_id, room_id, guest_name')
          .eq('id', bookingId)
          .single<BookingRow>()

        if (bookingError || !booking) {
          throw bookingError ?? new Error('Không tìm thấy booking')
        }

        const [groupResult, servicesResult, discountsResult, paymentsResult, siblingsResult] = await Promise.all([
          supabase
            .from('groups')
            .select('id, paid, grand_total, net_revenue, channel_fee_rate, customer_name')
            .eq('id', booking.group_id)
            .single<GroupRow>(),
          supabase
            .from('booking_services')
            .select('id, name, qty, price')
            .eq('booking_id', bookingId),
          supabase
            .from('booking_discounts')
            .select('id, description, amount')
            .eq('booking_id', bookingId),
          supabase
            .from('payment_history')
            .select('id, amount, method, date, note, is_void, voided_payment_id, updated_at')
            .eq('group_id', booking.group_id)
            .order('date', { ascending: false }),
          // Lấy trạng thái các booking khác trong group để tính isLastActiveBooking.
          // Không dùng count() vì cần loại trừ is_deleted và chính booking này.
          supabase
            .from('bookings')
            .select('id, status')
            .eq('group_id', booking.group_id)
            .eq('is_deleted', false)
            .in('status', ['booked', 'checked-in']),
        ])

        if (groupResult.error || !groupResult.data) {
          throw groupResult.error ?? new Error('Không tìm thấy thông tin group')
        }

        if (servicesResult.error) {
          throw servicesResult.error
        }

        if (discountsResult.error) {
          throw discountsResult.error
        }

        if (paymentsResult.error) {
          throw paymentsResult.error
        }

        if (siblingsResult.error) {
          throw siblingsResult.error
        }

        const group = groupResult.data
        const services = (servicesResult.data ?? []) as ServiceRow[]
        const discounts = (discountsResult.data ?? []) as DiscountRow[]
        const payments = (paymentsResult.data ?? []) as PaymentRow[]
        const activeSiblings = (siblingsResult.data ?? []) as ActiveSiblingRow[]

        const grandTotal = booking.grand_total ?? 0
        const roomSubtotal = booking.room_subtotal ?? 0
        const paid = group.paid ?? 0
        const groupGrandTotal = group.grand_total ?? 0

        // Booking này active + không còn booking active nào khác (loại trừ chính nó) → là booking cuối.
        const otherActiveCount = activeSiblings.filter((row) => row.id !== bookingId).length
        const isLastActiveBooking = booking.status === 'checked-in' && otherActiveCount === 0

        return {
          booking: {
            id: booking.id,
            status: booking.status,
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            pricePerNight: booking.price_per_night,
            roomSubtotal,
            surcharge: booking.surcharge,
            taxAmount: booking.tax_amount ?? 0,
            grandTotal,
            groupId: booking.group_id,
            roomNumber: booking.room_id,
            guestName: booking.guest_name ?? group.customer_name ?? '—',
          },
          services: services.map((service) => {
            const qty = Number(service.qty)
            return {
              id: service.id,
              name: service.name,
              qty,
              price: service.price,
              subtotal: Math.round(qty * service.price),
            }
          }),
          discounts: discounts.map((discount) => ({
            id: discount.id,
            description: discount.description ?? 'Giảm giá',
            amount: discount.amount,
          })),
          payments: payments.map((payment) => ({
            id: payment.id,
            amount: payment.amount,
            method: payment.method ?? 'other',
            date: payment.date,
            note: payment.note,
            isVoid: payment.is_void,
            voidedPaymentId: payment.voided_payment_id,
            updatedAt: payment.updated_at,
          })),
          group: {
            id: group.id,
            paid,
            grandTotal: groupGrandTotal,
            netRevenue: group.net_revenue ?? 0,
            channelFeeRate: Number(group.channel_fee_rate ?? 0),
          },
          // SỬA: group-level, không còn booking.grand_total - group.paid
          remaining: groupGrandTotal - paid,
          isLastActiveBooking,
        }
      } catch (error) {
        throw normalizeError(error)
      }
    },
    staleTime: 30000,
  })
}
