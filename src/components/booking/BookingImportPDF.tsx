import React, { useRef, useState } from 'react';
import { Button, Upload, Typography, Space, message } from 'antd';
import type { UploadProps } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import * as pdfjsLib from 'pdfjs-dist';

interface BookingImportPDFProps {
  onParsed: (data: ParsedBookingData) => void;
  onImport: (data: ParsedBookingData) => void;
}

interface ParsedBookingData {
  checkIn?: string;
  checkOut?: string;
  totalPrice?: number;
  [key: string]: any;
}

const BookingImportPDF: React.FC<BookingImportPDFProps> = ({ onParsed, onImport }) => {
  const [parsed, setParsed] = useState<ParsedBookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ');
      }
      // Parse booking data from text (simple demo, customize as needed)
      const data: ParsedBookingData = {};
      const checkInMatch = text.match(/Check[- ]?in[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
      const checkOutMatch = text.match(/Check[- ]?out[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
      const totalMatch = text.match(/Tổng cộng[:\s]+([\d,.]+)/i);
      if (checkInMatch) data.checkIn = checkInMatch[1];
      if (checkOutMatch) data.checkOut = checkOutMatch[1];
      if (totalMatch) data.totalPrice = parseInt(totalMatch[1].replace(/\D/g, ''));
      setParsed(data);
      onParsed(data);
    } catch (err) {
      message.error('Không đọc được file PDF');
    } finally {
      setLoading(false);
    }
  };

  const props: UploadProps = {
    beforeUpload: (file) => {
      handleFile(file);
      return false;
    },
    showUploadList: false,
    accept: '.pdf',
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Upload {...props}>
        <Button icon={<UploadOutlined />} loading={loading}>
          Chọn file PDF đặt phòng
        </Button>
      </Upload>
      {parsed && (
        <div style={{ background: '#fafafa', padding: 12, borderRadius: 4 }}>
          <Typography.Title level={5}>Xem trước dữ liệu</Typography.Title>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(parsed, null, 2)}</pre>
          <Button type="primary" onClick={() => onImport(parsed)}>
            Dùng dữ liệu này
          </Button>
        </div>
      )}
    </Space>
  );
};

export default BookingImportPDF;
