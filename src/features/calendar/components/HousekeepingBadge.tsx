import React from 'react'
import { Tag, Tooltip } from 'antd'
import type { HousekeepingStatus } from '@/types/database'
import { STATUS_LABEL, nextStatus, useUpdateHousekeeping } from '../hooks/useHousekeeping'

interface Props {
  roomId: string
  status: HousekeepingStatus
  note?: string | null
  readonly?: boolean
}

const CONFIG: Record<HousekeepingStatus, { color: string; label: string; tooltip: string }> = {
  clean: { color: 'success', label: '✓', tooltip: 'Sạch — click để đánh dấu cần dọn' },
  dirty: { color: 'error', label: '🧹', tooltip: 'Cần dọn — click để chuyển đang dọn' },
  cleaning: { color: 'warning', label: '⟳', tooltip: 'Đang dọn — click để đánh dấu sạch' },
  out_of_order: { color: 'default', label: '⚠', tooltip: 'Hỏng / Out of order' },
}

export const HousekeepingBadge: React.FC<Props> = ({ roomId, status, note, readonly }) => {
  const { mutate, isPending } = useUpdateHousekeeping()
  const cfg = CONFIG[status] ?? CONFIG.dirty
  const isOoo = status === 'out_of_order'

  const tooltipTitle = isOoo
    ? `Hỏng / Out of order${note ? ` — ${note}` : ''}`
    : `${STATUS_LABEL[status]} — click để chuyển sang ${STATUS_LABEL[nextStatus(status)]}`

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation()

    if (readonly || isOoo || isPending) {
      return
    }

    mutate({ roomId, status: nextStatus(status) })
  }

  return (
    <Tooltip title={tooltipTitle} mouseEnterDelay={0.4}>
      <Tag
        color={cfg.color}
        onClick={handleClick}
        style={{
          cursor: readonly || isOoo ? 'default' : 'pointer',
          fontSize: 11,
          padding: '0 4px',
          lineHeight: '18px',
          opacity: isPending ? 0.5 : 1,
          transition: 'opacity 0.15s',
          userSelect: 'none',
          marginInlineEnd: 0,
        }}
      >
        {cfg.label}
      </Tag>
    </Tooltip>
  )
}