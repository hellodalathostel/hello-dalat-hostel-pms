import { Drawer, Timeline, Tag, Empty, Spin, Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useDocumentHistory, DOC_TYPE_LABEL, DOC_FORMAT_LABEL } from '@/hooks/useDocumentHistory'

const { Text } = Typography

interface Props {
  groupId: string | null
  open: boolean
  onClose: () => void
}

const FORMAT_COLOR: Record<string, string> = {
  pdf: 'blue',
  zalo_text: 'green',
  email_html: 'orange',
}

export function DocumentHistoryDrawer({ groupId, open, onClose }: Props) {
  const { data: logs, isLoading } = useDocumentHistory(open ? groupId : null)

  return (
    <Drawer
      title="Lịch sử tài liệu"
      placement="right"
      width={380}
      open={open}
      onClose={onClose}
    >
      {isLoading && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <Spin />
        </div>
      )}

      {!isLoading && (!logs || logs.length === 0) && (
        <Empty description="Chưa có tài liệu nào được tạo" />
      )}

      {!isLoading && logs && logs.length > 0 && (
        <Timeline
          items={logs.map((log) => ({
            dot: <FileTextOutlined style={{ fontSize: 14 }} />,
            children: (
              <div style={{ paddingBottom: 8 }}>
                {/* Loại tài liệu + format */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    {DOC_TYPE_LABEL[log.doc_type] ?? log.doc_type}
                  </Text>
                  <Tag color={FORMAT_COLOR[log.doc_format]} style={{ margin: 0 }}>
                    {DOC_FORMAT_LABEL[log.doc_format] ?? log.doc_format}
                  </Tag>
                </div>

                {/* Người nhận + kênh gửi */}
                {(log.recipient_name || log.sent_via) && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {[log.recipient_name, log.recipient_phone].filter(Boolean).join(' · ')}
                    {log.sent_via && ` — qua ${log.sent_via}`}
                  </Text>
                )}

                {/* Ghi chú */}
                {log.note && (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', fontStyle: 'italic' }}>
                    {log.note}
                  </Text>
                )}

                {/* Thời gian */}
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {dayjs(log.created_at).format('DD/MM/YYYY HH:mm')}
                </Text>
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  )
}