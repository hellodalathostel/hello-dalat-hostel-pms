import { useState } from 'react'
import {
  Alert,
  Button,
  Modal,
  Space,
  Steps,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  InboxOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { useCheckinImport, type ImportRowResult } from '../hooks/useCheckinImport'

const { Dragger } = Upload
const { Text } = Typography

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

type Step = 'upload' | 'preview' | 'result'

export function CheckinImportModal({ open, onClose, onSuccess }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [fileList, setFileList] = useState<UploadFile[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const { parsing, processing, rows, results, parseFile, runImport, reset } = useCheckinImport()

  function handleClose() {
    setStep('upload')
    setFileList([])
    setParseError(null)
    reset()
    onClose()
  }

  async function handleUpload(file: File) {
    setParseError(null)

    try {
      await parseFile(file)
      setStep('preview')
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Lỗi đọc file.')
    }

    return false
  }

  async function handleImport() {
    const resultList = await runImport(rows)
    setStep('result')

    if (resultList.some((row) => row.status === 'success')) {
      onSuccess?.()
    }
  }

  const previewColumns = [
    { title: '#', dataIndex: 'rowIndex', width: 50 },
    { title: 'Họ tên', dataIndex: 'fullName', ellipsis: true },
    { title: 'Phòng', dataIndex: 'roomId', width: 70 },
    {
      title: 'Ngày đến',
      dataIndex: 'checkInDate',
      width: 110,
      render: (value: string) => value || <Text type="danger">—</Text>,
    },
    { title: 'Số giấy tờ', dataIndex: 'documentNumber', width: 140 },
    {
      title: 'Loại file',
      dataIndex: 'fileType',
      width: 80,
      render: (value: string) => <Tag color={value === 'VN' ? 'blue' : 'purple'}>{value}</Tag>,
    },
  ]

  const resultColumns = [
    { title: '#', dataIndex: 'rowIndex', width: 50 },
    { title: 'Họ tên', dataIndex: 'fullName', ellipsis: true },
    { title: 'Phòng', dataIndex: 'roomId', width: 70 },
    { title: 'Ngày đến', dataIndex: 'checkInDate', width: 110 },
    {
      title: 'Kết quả',
      dataIndex: 'status',
      width: 130,
      render: (status: ImportRowResult['status']) => {
        if (status === 'success') {
          return <Tag icon={<CheckCircleOutlined />} color="success">Check-in OK</Tag>
        }

        if (status === 'no_booking') {
          return <Tag icon={<WarningOutlined />} color="warning">Chưa có booking</Tag>
        }

        return <Tag icon={<CloseCircleOutlined />} color="error">Lỗi</Tag>
      },
    },
    {
      title: 'Ghi chú',
      dataIndex: 'message',
      ellipsis: true,
      render: (value: string) => (value ? <Text type="secondary">{value}</Text> : null),
    },
  ]

  const successCount = results.filter((row) => row.status === 'success').length
  const noBookingCount = results.filter((row) => row.status === 'no_booking').length
  const errorCount = results.filter((row) => row.status === 'error').length
  const currentStep = step === 'upload' ? 0 : step === 'preview' ? 1 : 2

  const footer =
    step === 'upload'
      ? null
      : step === 'preview'
        ? (
          <Space>
            <Button
              onClick={() => {
                setStep('upload')
                reset()
              }}
            >
              Quay lại
            </Button>
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              loading={processing}
              onClick={() => {
                void handleImport()
              }}
            >
              Thực hiện check-in ({rows.length} khách)
            </Button>
          </Space>
        )
        : <Button type="primary" onClick={handleClose}>Đóng</Button>

  return (
    <Modal
      title="Import check-in từ Excel"
      open={open}
      onCancel={handleClose}
      footer={footer}
      width={800}
      destroyOnClose
    >
      <Steps
        items={[
          { title: 'Upload file' },
          { title: 'Xem trước' },
          { title: 'Kết quả' },
        ]}
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
      />

      {step === 'upload' && (
        <>
          {parseError && <Alert type="error" message={parseError} style={{ marginBottom: 16 }} />}
          <Dragger
            accept=".xlsx"
            multiple={false}
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList([file as unknown as UploadFile])
              void handleUpload(file)
              return false
            }}
            onRemove={() => {
              setFileList([])
              setParseError(null)
            }}
            style={{ padding: 16 }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả hoặc click để chọn file</p>
            <p className="ant-upload-hint">
              Hỗ trợ file Excel (.xlsx) từ hệ thống chính phủ - khách VN (12 cột) và NNN (14 cột)
            </p>
          </Dragger>
          {parsing && (
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Đang đọc file...
            </Text>
          )}
        </>
      )}

      {step === 'preview' && (
        <>
          <Alert
            type="info"
            message={`Đọc được ${rows.length} khách. Kiểm tra trước khi check-in.`}
            style={{ marginBottom: 16 }}
          />
          <Table
            dataSource={rows}
            columns={previewColumns}
            rowKey="rowIndex"
            size="small"
            pagination={{ pageSize: 10, size: 'small' }}
            scroll={{ x: 600 }}
          />
        </>
      )}

      {step === 'result' && (
        <>
          <Space style={{ marginBottom: 16 }}>
            <Tag color="success">{successCount} thành công</Tag>
            {noBookingCount > 0 && <Tag color="warning">{noBookingCount} chưa có booking</Tag>}
            {errorCount > 0 && <Tag color="error">{errorCount} lỗi</Tag>}
          </Space>
          <Table
            dataSource={results}
            columns={resultColumns}
            rowKey="rowIndex"
            size="small"
            pagination={{ pageSize: 10, size: 'small' }}
            scroll={{ x: 600 }}
            rowClassName={(row) => (row.status === 'error' ? 'ant-table-row-danger' : '')}
          />
        </>
      )}
    </Modal>
  )
}