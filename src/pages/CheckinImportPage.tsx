import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  message,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd';
import { useCheckinImport } from '@/hooks/useCheckinImport';
import type { ImportGroup } from '@/types/checkin';

const { Title, Text } = Typography;

export default function CheckinImportPage() {
  const { importing, preview, results, loadPreview, confirmImport, reset } = useCheckinImport();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  async function handleFile(file: File) {
    setLoading(true);
    try {
      await loadPreview(file);
    } catch {
      message.error('Không đọc được file. Kiểm tra lại định dạng Excel.');
    } finally {
      setLoading(false);
    }

    return false;
  }

  async function handleConfirm() {
    await confirmImport();
    message.success('Import hoàn tất');
  }

  const hasErrors = preview.some((g) => g.error);
  const validCount = preview.filter((g) => !g.error).length;

  const previewColumns = [
    {
      title: 'Phòng',
      dataIndex: 'room_number',
      width: 80,
    },
    {
      title: 'Check-in',
      dataIndex: 'check_in_date',
      width: 120,
    },
    {
      title: 'Booking',
      dataIndex: 'booking_id',
      width: 120,
      render: (_id: string | null, row: ImportGroup) =>
        row.error ? <Tag color="red">Không tìm thấy</Tag> : <Tag color="green">Match</Tag>,
    },
    {
      title: 'Khách',
      dataIndex: 'guests',
      render: (guests: ImportGroup['guests']) => (
        <Space direction="vertical" size={0}>
          {guests.map((g, i) => (
            <Text key={`${g.id_number}-${i}`} style={{ fontSize: 12 }}>
              {i + 1}. {g.full_name} ({g.id_number})
            </Text>
          ))}
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'error',
      width: 260,
      render: (err: string | undefined) =>
        err ? (
          <Text type="danger" style={{ fontSize: 12 }}>
            {err}
          </Text>
        ) : (
          <Text type="success" style={{ fontSize: 12 }}>
            Sẵn sàng import
          </Text>
        ),
    },
  ];

  const resultColumns = [
    {
      title: 'Phòng',
      dataIndex: 'room_number',
      width: 80,
    },
    {
      title: 'Kết quả',
      dataIndex: 'success',
      render: (ok: boolean) =>
        ok ? (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Thành công
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Thất bại
          </Tag>
        ),
    },
    {
      title: 'Khách đã lưu',
      dataIndex: 'guests_upserted',
      width: 120,
    },
    {
      title: 'Lỗi',
      dataIndex: 'error',
      render: (e?: string) => (e ? <Text type="danger">{e}</Text> : '—'),
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
            <Button icon={<UploadOutlined />} loading={loading}>
              Chọn file khai báo lưu trú
            </Button>
          </Upload>
        </Card>
      )}

      {preview.length > 0 && results.length === 0 && (
        <Card
          title={`Bước 2 — Xác nhận (${validCount}/${preview.length} nhóm hợp lệ)`}
          style={{ marginBottom: 16 }}
          extra={
            <Space>
              <Button onClick={reset}>Chọn lại</Button>
              <Button
                type="primary"
                loading={importing}
                disabled={validCount === 0}
                onClick={() => {
                  void handleConfirm();
                }}
              >
                Xác nhận Import ({validCount} nhóm)
              </Button>
            </Space>
          }
        >
          {hasErrors && (
            <Alert
              type="warning"
              message="Một số nhóm không match được booking. Chỉ các nhóm hợp lệ mới được import."
              style={{ marginBottom: 12 }}
            />
          )}
          <Table
            dataSource={preview}
            columns={previewColumns}
            rowKey={(r) => `${r.room_number}_${r.check_in_date}`}
            pagination={false}
            size="small"
            rowClassName={(r) => (r.error ? 'ant-table-row-disabled' : '')}
          />
        </Card>
      )}

      {results.length > 0 && (
        <Card title="Kết quả Import" extra={<Button onClick={reset}>Import thêm</Button>}>
          <Table
            dataSource={results}
            columns={resultColumns}
            rowKey="room_number"
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
