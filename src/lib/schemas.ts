import dayjs, { Dayjs } from 'dayjs'
import { z } from 'zod'

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
  channel_fee_rate: z
    .number({ message: 'Vui lòng nhập phí kênh' })
    .min(0, 'Phí kênh phải lớn hơn hoặc bằng 0')
    .max(1, 'Phí kênh không được vượt quá 1 (100%)'),
  bookings: z
    .array(
      z
        .object({
          room_id: z.string({ message: 'Vui lòng chọn phòng' }).min(1, 'Vui lòng chọn phòng'),
          check_in: dayjsSchema,
          check_out: dayjsSchema,
          price_per_night: z.number({ message: 'Vui lòng nhập giá phòng' }).gt(0, 'Giá phòng phải lớn hơn 0'),
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

// Schema validate cho check-in guest payload
export const checkinGuestSchema = z.object({
  full_name: z.string({ message: 'Vui lòng nhập họ tên' }).min(1, 'Họ tên là bắt buộc'),
  document_type: z.enum(['CCCD', 'Hộ chiếu', 'Giấy tờ khác'], {
    message: 'Loại giấy tờ không hợp lệ',
  }),
  document_number: z.string({ message: 'Vui lòng nhập số giấy tờ' }).min(1, 'Số giấy tờ là bắt buộc'),
  nationality: z.string({ message: 'Vui lòng nhập quốc tịch' }).min(1, 'Quốc tịch là bắt buộc'),
  date_of_birth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày sinh phải ở định dạng YYYY-MM-DD')
    .or(z.literal(''))
    .optional(),
  gender: z.string().optional().or(z.literal('')),
  residency_type: z
    .enum(['Thường trú', 'Tạm trú', 'Địa chỉ khác'], {
      message: 'Loại cư trú không hợp lệ',
    })
    .or(z.literal(''))
    .optional(),
  province: z.string().optional().or(z.literal('')),
  district: z.string().optional().or(z.literal('')),
  ward: z.string().optional().or(z.literal('')),
  address_detail: z.string().optional().or(z.literal('')),
})

export type CheckinGuestFormValues = z.infer<typeof checkinGuestSchema>