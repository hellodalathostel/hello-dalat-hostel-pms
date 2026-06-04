// Trang /checkin-import — wrapper mỏng quanh CheckinImportModal đã tested
import { useNavigate } from 'react-router-dom'
import { CheckinImportModal } from '../components/CheckinImportModal'

export default function CheckinImportPage() {
  const navigate = useNavigate()

  return (
    <CheckinImportModal
      open={true}
      onClose={() => navigate(-1)}
      onSuccess={() => {
        /* invalidate đã xử lý trong hook */
      }}
    />
  )
}
