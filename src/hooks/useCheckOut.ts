import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/api/supabase'
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import { normalizeError } from '@/shared/utils/normalizeError'

interface CheckOutBookingPayload {
  bookingId: string
  forceCheckout?: boolean
}

export class BalanceDueError extends Error {
  readonly balanceDue: number
  constructor(balanceDue: number) {
    super(`BALANCE_DUE: ${balanceDue}`)
    this.name = 'BalanceDueError'
    this.balanceDue = balanceDue
  }
}

function parseBalanceDue(message: string): number | null {
  if (!message.includes('BALANCE_DUE')) {
    return null
  }

  const matchedAmount = message.match(/còn nợ (\d+) VND/i)
  if (!matchedAmount) {
    return 0
  }

  const amount = Number(matchedAmount[1])
  return Number.isNaN(amount) ? 0 : amount
}

async function invalidateOperationalQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  bookingId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
  ])
}

// Ghi nhận check-out thông qua RPC check_out_booking.
export function useCheckOut() {
  const queryClient = useQueryClient()
  const { message, notification } = useAppFeedback()

  return useMutation({
    mutationKey: ['booking-check-out'],
    mutationFn: async (payload: CheckOutBookingPayload) => {
      try {
        const { error } = await supabase.rpc('check_out_booking', {
          p_booking_id: payload.bookingId,
          p_force_checkout: payload.forceCheckout ?? false,
        })

        if (error) {
          const normalizedError = normalizeError(error)
          const balanceDue = parseBalanceDue(normalizedError.message)

          if (balanceDue !== null) {
            throw new BalanceDueError(balanceDue)
          }

          throw normalizedError
        }
      } catch (error) {
        if (error instanceof BalanceDueError) {
          throw error
        }

        throw normalizeError(error)
      }
    },
    onSuccess: async (_, variables) => {
      await invalidateOperationalQueries(queryClient, variables.bookingId)
      message.success('Check-out thành công')
    },
    onError: (error) => {
      if (error instanceof BalanceDueError) {
        return
      }

      const normalizedError = normalizeError(error)
      notification.error({
        message: 'Không thể check-out booking',
        description: normalizedError.message,
      })
    },
  })
}
