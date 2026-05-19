# Feature Status

## Summary
All major features are wired end-to-end with routes, hooks, and modals integrated.

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard | done | Home page with room status; integrated checkout/payment modals |
| New Booking | done | Routed page with full booking flow; PDF import, folio editing |
| Calendar | done | Room timeline view with booking/block management |
| Check-in Import | done | Excel-based guest check-in batch processor |
| Checkout | done | Checkout modals integrated in Dashboard & BookingDetailDrawer |
| Payment | done | Modal-based payment recording via BookingDetailDrawer |
| Documents | done | Generate/send booking docs (confirmations, invoices, etc.) |
| Finance | done | Monthly revenue dashboard with KPI cards & charts |
| Revenue | done | Yearly revenue tracking with monthly breakdown |
| DK14 Report | done | Compliance reporting page with date filters |
| Settings/iCal | done | iCal feed management panel |
| Bookings List | todo | BookingsPage listed in CODEBASE but not routed |

## Implementation Notes
- Hooks are actively used: `useRevenue`, `useMonthlyRevenue`, `useDocumentGenerator`
- Modals (Payment, Checkout, Documents) are modal-based features integrated via parent pages
- Legacy page copies exist (`pages/*`) but feature pages are preferred
