import dayjs, { Dayjs } from 'dayjs'
import { z } from 'zod'
import { ROOM_CAPACITY_BY_ID } from '@/shared/constants/rooms'

const dayjsSchema = z.custom<Dayjs>(
  (value) => dayjs.isDayjs(value) && value.isValid(),
  'Ngày không hợp lệ',
)

// Schema validate cho form tạo booking nhóm (Phase 1).
export const newBookingSchema = z.object({
  customer_name: z
    .string({ message: 'Vui lòng nhập tên khách hàng' })
    .trim()
    .min(1, 'Tên khách hàng là bắt buộc')
    .max(120, 'Tên khách hàng không vượt quá 120 ký tự'),
  customer_phone: z
    .string()
    .trim()
    .max(20, 'Số điện thoại không vượt quá 20 ký tự')
    .optional()
    .or(z.literal('')),
  customer_note: z.string().trim().max(500, 'Ghi chú không vượt quá 500 ký tự').optional().or(z.literal('')),
  customer_cccd: z.string().trim().max(32, 'CCCD không vượt quá 32 ký tự').optional().or(z.literal('')),
  source: z.enum(['Booking.com', 'Facebook', 'Gọi điện/Zalo', 'Khách quen', 'Walk-in', 'Other'], {
    message: 'Vui lòng chọn nguồn khách',
  }),
  bookings: z
    .array(
      z
        .object({
          room_id: z.string({ message: 'Vui lòng chọn phòng' }).min(1, 'Vui lòng chọn phòng'),
          check_in: dayjsSchema,
          check_out: dayjsSchema,
          price: z.number({ message: 'Vui lòng nhập giá phòng' }).gt(0, 'Giá phòng phải lớn hơn 0'),
          guest_name: z.string().trim().max(120, 'Tên khách không vượt quá 120 ký tự').optional().or(z.literal('')),
          guests_count: z
            .number({ message: 'Vui lòng nhập số khách' })
            .int('Số khách phải là số nguyên')
            .min(1, 'Số khách phải lớn hơn hoặc bằng 1'),
          note: z.string().trim().max(500, 'Ghi chú booking không vượt quá 500 ký tự').optional().or(z.literal('')),
          surcharge: z
            .number({ message: 'Vui lòng nhập phụ thu' })
            .int('Phụ thu phải là số nguyên')
            .min(0, 'Phụ thu phải lớn hơn hoặc bằng 0'),
        })
        .superRefine((value, context) => {
          if (!value.check_out.isAfter(value.check_in, 'day')) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Ngày check-out phải sau ngày check-in',
              path: ['check_out'],
            })
          }

          const roomCapacity = ROOM_CAPACITY_BY_ID[value.room_id]
          if (roomCapacity !== undefined && value.guests_count > roomCapacity) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Số khách không được vượt quá sức chứa phòng (${roomCapacity})`,
              path: ['guests_count'],
            })
          }
        }),
    )
    .min(1, 'Cần ít nhất 1 booking phòng'),
})

export type NewBookingFormValues = z.infer<typeof newBookingSchema>

export const paymentSchema = z.object({
  amount: z
    .number({ message: 'Vui lòng nhập số tiền' })
    .gt(0, 'Số tiền thanh toán phải lớn hơn 0'),
  method: z.enum(['cash', 'transfer', 'card', 'other'], {
    message: 'Vui lòng chọn phương thức thanh toán',
  }),
  note: z.string().trim().max(500, 'Ghi chú không vượt quá 500 ký tự').optional().or(z.literal('')),
})

export type PaymentFormValues = z.infer<typeof paymentSchema>