// Modal import danh sách khách từ file KBTT export
// Flow: Upload → Preview (match booking) → Confirm → checkin_booking_txn RPC

import React, { useState, useCallback } from 'react';
import {
  Modal, Upload, Table, Button, Alert, Tag, Typography, Space, Steps, Tooltip, Spin
} from 'antd';
import {
  InboxOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import { supabase } from '@/api/supabase';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';
import {
  parseKBTTExcel, mapDocumentType, kbttDateToISO
} from '@/utils/parseKBTTExcel';
import type { KBTTGuest, KBTTParseResult } from '@/utils/parseKBTTExcel';

const { Dragger } = Upload;
const { Text }    = Typography;

type MatchStatus = 'matched' | 'no_booking';

interface GuestRow extends KBTTGuest {
  key:         string;
  matchStatus: MatchStatus;
  booking_id:  string | null;
  matchNote:   string;
}

interface Props {
  open:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

async function lookupBooking(
  room_id: string,
  check_in_date_kbtt: string
): Promise<{ id: string; status: string; note: string } | null> {
  const isoDate = kbttDateToISO(check_in_date_kbtt);
  if (!isoDate || !room_id) return null;

  const { data, error } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('room_id', room_id)
    .in('status', ['booked', 'checked-in'])
    .eq('check_in', isoDate)
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return {
      id:     data.id,
      status: data.status,
      note:   data.status === 'checked-in'
        ? `(đã check-in) #${data.id.slice(0, 8)}`
        : `#${data.id.slice(0, 8)}`,
    };
  }

  // Fallback: booking gần nhất cho phòng đó
  const { data: data2 } = await supabase
    .from('bookings')
    .select('id, status, check_in')
    .eq('room_id', room_id)
    .in('status', ['booked', 'checked-in'])
    .order('check_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data2) {
    return {
      id:     data2.id,
      status: data2.status,
      note:   `⚠️ Khác ngày · check_in=${data2.check_in} · #${data2.id.slice(0, 8)}`,
    };
  }

  return null;
}

function buildGuestPayload(guests: GuestRow[]) {
  return guests.map(g => ({
    full_name:       g.full_name,
    document_type:   mapDocumentType(g.id_type_raw),
    document_number: g.id_number,
    nationality:     g.nationality ?? 'Việt Nam',
    date_of_birth:   g.date_of_birth ? kbttDateToISO(g.date_of_birth) : '',
    gender:          g.gender ?? '',
    residency_type:  null,
    province:        null,
    district:        null,
    ward:            null,
    address_detail:  null,
  }));
}

const STEPS = ['Upload file', 'Xem trước', 'Kết quả'];

export const KBTTImportModal: React.FC<Props> = ({ open, onClose, onSuccess }) => {
  const [step,         setStep]         = useState(0);
  const [parseResult,  setParseResult]  = useState<KBTTParseResult | null>(null);
  const [guestRows,    setGuestRows]    = useState<GuestRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);
  const { showSuccess, showError }      = useAppFeedback();

  const reset = () => {
    setStep(0); setParseResult(null); setGuestRows([]);
    setLoading(false); setErrorMsg(null); setSuccessCount(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileUpload = useCallback(async (file: File) => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const result = await parseKBTTExcel(file);
      setParseResult(result);

      const rows: GuestRow[] = [];
      for (const g of result.guests) {
        const match = await lookupBooking(g.room_id, g.check_in_date);
        rows.push({
          ...g,
          key:         String(g.stt),
          matchStatus: match ? 'matched' : 'no_booking',
          booking_id:  match?.id ?? null,
          matchNote:   match?.note ?? 'Không tìm thấy booking (phòng / trạng thái)',
        });
      }

      setGuestRows(rows);
      setStep(1);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
    return false;
  }, []);

  const handleConfirm = async () => {
    const toImport = guestRows.filter(r => r.matchStatus === 'matched' && r.booking_id);
    if (!toImport.length) {
      showError('Không có khách nào khớp booking để import.');
      return;
    }

    setLoading(true);
    let ok = 0;

    const byBooking = toImport.reduce<Record<string, GuestRow[]>>((acc, g) => {
      const bid = g.booking_id!;
      if (!acc[bid]) acc[bid] = [];
      acc[bid].push(g);
      return acc;
    }, {});

    for (const [booking_id, guests] of Object.entries(byBooking)) {
      try {
        const { error } = await supabase.rpc('checkin_booking_txn', {
          p_booking_id: booking_id,
          p_guests:     buildGuestPayload(guests),
        });
        if (error) throw error;
        ok += guests.length;
      } catch (err) {
        const names = guests.map(g => g.full_name).join(', ');
        showError(`Lỗi phòng ${guests[0].room_id}: ${(err as Error).message} (${names})`);
      }
    }

    setSuccessCount(ok);
    setStep(2);
    setLoading(false);
    if (ok > 0) {
      showSuccess(`Đã import ${ok} khách thành công!`);
      onSuccess?.();
    }
  };

  const matchedCount = guestRows.filter(r => r.matchStatus === 'matched').length;

  const columns = [
    { title: '#', dataIndex: 'stt', width: 45 },
    {
      title: 'Họ tên',
      dataIndex: 'full_name',
      render: (v: string) => <Text strong>{v}</Text>,
    },
    { title: 'Ngày sinh', dataIndex: 'date_of_birth', width: 100 },
    { title: 'GT', dataIndex: 'gender', width: 55 },
    ...(parseResult?.format === 'NNN'
      ? [{ title: 'Quốc tịch', dataIndex: 'nationality' }]
      : [{ title: 'Loại GT',   dataIndex: 'id_type_raw'  }]
    ),
    {
      title: 'Số GT',
      dataIndex: 'id_number',
      render: (v: string) => <Text code>{v.slice(0, 3)}••••{v.slice(-2)}</Text>,
    },
    { title: 'Phòng', dataIndex: 'room_id', width: 65 },
    { title: 'Ngày đến', dataIndex: 'check_in_date', width: 100 },
    {
      title: 'Booking',
      width: 130,
      render: (_: unknown, r: GuestRow) =>
        r.matchStatus === 'matched' ? (
          <Tooltip title={r.matchNote}>
            <Tag icon={<CheckCircleOutlined />} color="success">Khớp</Tag>
          </Tooltip>
        ) : (
          <Tooltip title={r.matchNote}>
            <Tag icon={<CloseCircleOutlined />} color="error">Không khớp</Tag>
          </Tooltip>
        ),
    },
  ];

  return (
    <Modal
      title="Import check-in từ KBTT"
      open={open}
      onCancel={handleClose}
      width={900}
      footer={null}
      destroyOnClose
    >
      <Steps
        current={step}
        items={STEPS.map(t => ({ title: t }))}
        size="small"
        style={{ marginBottom: 24 }}
      />

      {step === 0 && (
        <Spin spinning={loading} tip="Đang đọc file...">
          {errorMsg && (
            <Alert type="error" message={errorMsg} showIcon style={{ marginBottom: 16 }} />
          )}
          <Dragger
            accept=".xlsx"
            showUploadList={false}
            beforeUpload={handleFileUpload}
            disabled={loading}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined /></p>
            <p className="ant-upload-text">Kéo thả hoặc click để chọn file</p>
            <p className="ant-upload-hint">
              Hỗ trợ file Excel (.xlsx) export từ KBTT — khách VN (12 cột) và NNN (14 cột)
            </p>
          </Dragger>
        </Spin>
      )}

      {step === 1 && (
        <Spin spinning={loading} tip="Đang import...">
          <Space style={{ marginBottom: 12 }} wrap>
            <Tag color={parseResult?.format === 'VN' ? 'blue' : 'purple'}>
              {parseResult?.format === 'VN' ? '🇻🇳 Khách Việt Nam' : '🌏 Khách Nước Ngoài'}
            </Tag>
            <Text type="secondary">Ngày xuất: {parseResult?.file_date}</Text>
            <Text>
              <Text strong>{guestRows.length}</Text> khách —{' '}
              <Text type="success"><strong>{matchedCount}</strong> khớp booking</Text>
              {guestRows.length - matchedCount > 0 && (
                <Text type="danger">
                  {' '}/ <strong>{guestRows.length - matchedCount}</strong> không khớp (bỏ qua)
                </Text>
              )}
            </Text>
          </Space>

          <Table
            columns={columns}
            dataSource={guestRows}
            size="small"
            pagination={false}
            scroll={{ x: 800 }}
            rowClassName={(r: GuestRow) =>
              r.matchStatus !== 'matched' ? 'opacity-40' : ''
            }
          />

          <Space style={{ marginTop: 16, justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={reset}>Chọn file khác</Button>
            <Button
              type="primary"
              onClick={handleConfirm}
              loading={loading}
              disabled={matchedCount === 0}
            >
              Confirm import {matchedCount} khách
            </Button>
          </Space>
        </Spin>
      )}

      {step === 2 && (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 52, color: '#52c41a', display: 'block', marginBottom: 16 }} />
          <Typography.Title level={4}>
            Import hoàn thành: {successCount} khách
          </Typography.Title>
          <Space>
            <Button onClick={handleClose}>Đóng</Button>
            <Button type="primary" onClick={reset}>Import file khác</Button>
          </Space>
        </div>
      )}
    </Modal>
  );
};
