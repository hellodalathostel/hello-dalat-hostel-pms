// Các union type dùng chung cho nghiệp vụ DB/RPC.
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other'

export type BookingStatus = 'booked' | 'checked-in' | 'checked-out' | 'cancelled'
