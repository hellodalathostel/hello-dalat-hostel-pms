import { useState } from 'react';
import {
  Button,
  Card,
  Divider,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useCheckinImport, type ImportRowResult } from '@/features/checkin/hooks/useCheckinImport';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback'
import type { GuestImportRow } from '@/features/checkin/utils/parseCheckinExcel';

const { Title, Text } = Typography;

export default function CheckinImportPage() {
  const { parsing, processing, rows, results, parseFile, runImport, reset } = useCheckinImport();
  const { message } = useAppFeedback()
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    try {
      await parseFile(file);
    } catch {
      message.error('Không đọc được file. Kiểm tra lại định dạng Excel.');
    } finally {
      setLoading(false);
    }

    return false;
  }

  async function handleConfirm() {
    await runImport(rows);
    message.success('Import hoàn tất');
  }

  const successCount = results.filter((row) => row.status === 'success').length;
  const noBookingCount = results.filter((row) => row.status === 'no_booking').length;
  const errorCount = results.filter((row) => row.status === 'error').length;

  const previewColumns = [
    {
      title: '#',
      dataIndex: 'rowIndex',
      width: 60,
    },
    {
      title: 'Họ tên',
      dataIndex: 'fullName',
    },
    {
      title: 'Phòng',
      dataIndex: 'roomId',
      width: 80,
    },
    {
      title: 'Ngày đến',
      dataIndex: 'checkInDate',
      width: 120,
    },
    {
      title: 'Số giấy tờ',
      dataIndex: 'documentNumber',
      width: 180,
    },
  ];

  const resultColumns = [
    {
      title: '#',
      dataIndex: 'rowIndex',
      width: 60,
    },
    {
      title: 'Họ tên',
      dataIndex: 'fullName',
    },
    {
      title: 'Phòng',
      dataIndex: 'roomId',
      width: 80,
    },
    {
      title: 'Kết quả',
      dataIndex: 'status',
      render: (status: ImportRowResult['status']) =>
        status === 'success' ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Thành công
          </Tag>
        ) : status === 'no_booking' ? (
          <Tag color="warning">Chưa có booking</Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Thất bại
          </Tag>
        ),
    },
    {
      title: 'Ngày đến',
      dataIndex: 'checkInDate',
      width: 120,
    },
    {
      title: 'Ghi chú',
      dataIndex: 'message',
      render: (value?: string) => (value ? <Text type="danger">{value}</Text> : '—'),
    },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <Title level={4}>Import Check-in từ Excel</Title>
      <Text type="secondary">
        Upload file khai báo lưu trú (format Công an) để cập nhật thông tin khách và đánh dấu check-in.
      </Text>

      <Divider />

      {results.length === 0 && (
        <Card title="Bước 1 — Chọn file Excel" style={{ marginBottom: 16 }}>
          <Upload
            accept=".xlsx,.xls"
            fileList={fileList}
            maxCount={1}
            beforeUpload={(file) => {
              setFileList([file]);
              void handleFile(file);
              return false;
            }}
            onRemove={() => {
              setFileList([]);
              reset();
            }}
          >
            <Button icon={<UploadOutlined />} loading={loading || parsing}>
              Chọn file khai báo lưu trú
            </Button>
          </Upload>
        </Card>
      )}

      {rows.length > 0 && results.length === 0 && (
        <Card
          title={`Bước 2 — Xác nhận (${rows.length} khách)`}
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Button onClick={reset}>Chọn lại</Button>
              <Button
                type="primary"
                loading={processing}
                disabled={rows.length === 0}
                onClick={() => {
                  void handleConfirm();
                }}
              >
                Xác nhận Import ({rows.length} khách)
              </Button>
            </Space>
          }
        >
          <Table
            dataSource={rows}
            columns={previewColumns}
            rowKey={(row: GuestImportRow) => `${row.fileType}_${row.rowIndex}`}
            pagination={false}
            size="small"
          />
        </Card>
      )}

      {results.length > 0 && (
        <Card
          title="Kết quả Import"
          extra={<Button onClick={reset}>Import thêm</Button>}
        >
          <Space style={{ marginBottom: 12 }}>
            <Tag color="success">{successCount} thành công</Tag>
            {noBookingCount > 0 && <Tag color="warning">{noBookingCount} chưa có booking</Tag>}
            {errorCount > 0 && <Tag color="error">{errorCount} lỗi</Tag>}
          </Space>
          <Table
            dataSource={results}
            columns={resultColumns}
            rowKey="rowIndex"
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
