import { describe, expect, it } from 'vitest'
import type { DocumentData, GroupDocumentData } from './shared'
import { renderBookingConfirmation, renderInvoice, renderDepositRequest } from './singleBookingTemplates'
import { renderGroupInvoice, renderGroupConfirmation } from './groupTemplates'

const PAYLOADS = ['<img src=x onerror=alert(1)>', '"><script>x</script>']

function singleData(guestName: string): DocumentData {
  return {
    bookingId: 'b1234567-0000-0000-0000-000000000000',
    groupId: 'g1234567-0000-0000-0000-000000000000',
    roomName: '301',
    roomType: 'Double',
    checkIn: '2026-10-15',
    checkOut: '2026-10-17',
    nights: 2,
    guestsCount: 2,
    hasEarlyCheckIn: false,
    hasLateCheckOut: false,
    guestName,
    guestPhone: guestName,
    source: 'website',
    otaBookingNumber: guestName,
    pricePerNight: 300000,
    roomSubtotal: 600000,
    surcharge: 0,
    grandTotal: 700000,
    groupGrandTotal: 700000,
    services: [{ name: guestName, price: 100000, qty: 1 }],
    discounts: [{ description: guestName, amount: 0 }],
    paid: 200000,
    payments: [
      { id: 'p1', amount: 100000, method: 'cash', date: '2026-10-10', note: guestName },
      { id: 'p2', amount: 100000, method: 'transfer', date: '2026-10-11', note: guestName },
    ],
    generatedAt: '2026-10-10T10:00:00Z',
  }
}

function groupData(guestName: string): GroupDocumentData {
  return {
    groupId: 'g1234567-0000-0000-0000-000000000000',
    guestName,
    guestPhone: guestName,
    source: 'website',
    otaBookingNumber: guestName,
    checkIn: '2026-10-15',
    checkOut: '2026-10-17',
    bookings: [
      {
        bookingId: 'b1',
        roomName: '301',
        roomType: 'Double',
        checkIn: '2026-10-15',
        checkOut: '2026-10-17',
        nights: 2,
        pricePerNight: 300000,
        roomSubtotal: 600000,
        surcharge: 0,
        services: [{ name: guestName, price: 100000, qty: 1 }],
        discounts: [{ description: guestName, amount: 0 }],
        grandTotal: 700000,
      },
    ],
    totalGrandTotal: 700000,
    totalPaid: 200000,
    payments: [],
    generatedAt: '2026-10-10T10:00:00Z',
  }
}

function expectEscaped(html: string) {
  expect(html).not.toContain('<img src=x')
  expect(html).not.toContain('<script>')
  for (const payload of PAYLOADS) expect(html).not.toContain(payload)
}

const escaped = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

describe('templates chứng từ escape dữ liệu tự do (stored XSS)', () => {
  for (const payload of PAYLOADS) {
    it(`renderBookingConfirmation — ${payload}`, () => {
      const { html } = renderBookingConfirmation(singleData(payload))
      expectEscaped(html)
      expect(html).toContain(escaped(payload))
    })

    it(`renderInvoice — ${payload}`, () => {
      const { html } = renderInvoice(singleData(payload))
      expectEscaped(html)
    })

    it(`renderDepositRequest — ${payload}`, () => {
      const { html } = renderDepositRequest(singleData(payload), { depositAmount: 200000, deadline: '2026-10-12' })
      expectEscaped(html)
    })

    it(`renderGroupInvoice — ${payload}`, () => {
      const html = renderGroupInvoice(groupData(payload), 'vi')
      expectEscaped(html)
      expect(html).toContain(escaped(payload))
    })

    it(`renderGroupConfirmation — ${payload}`, () => {
      expectEscaped(renderGroupConfirmation(groupData(payload), 'en'))
    })
  }

  it('zaloText (plain text) giữ nguyên tên khách, không escape', () => {
    const name = 'Tom & Jerry'
    const { zaloText } = renderBookingConfirmation(singleData(name))
    expect(zaloText).toContain('Tom & Jerry')
  })
})
