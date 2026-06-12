import { useEffect } from 'react';
import {
  Modal, Form, Select, DatePicker, InputNumber, Input, Row, Col, Spin,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';
import { useAddRoomToGroup } from '@/hooks/useAddRoomToGroup';
import { useAppFeedback } from '@/shared/hooks/useAppFeedback';

const schema = z.object({
  room_id:         z.string().min(1, 'Chọn phòng'),
  check_in:        z.custom<Dayjs>(v => dayjs.isDayjs(v), 'Chọn ngày nhận'),
  check_out:       z.custom<Dayjs>(v => dayjs.isDayjs(v), 'Chọn ngày trả'),
  price_per_night: z.number().min(1, 'Nhập giá'),
  guests_count:    z.number().min(1),
  note:            z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  groupId: string;
  defaultCheckIn?: string;
  defaultCheckOut?: string;
  onClose: () => void;
}

export function AddRoomModal({ open, groupId, defaultCheckIn, defaultCheckOut, onClose }: Props) {
  const { message } = useAppFeedback();
  const { mutate: addRoom, isPending } = useAddRoomToGroup();

  const { data: rooms = [], isLoading: roomsLoading } = useQuery({
    queryKey: ['rooms-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('is_active', true)
        .order('id');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      guests_count:    1,
      price_per_night: 0,
    },
  });

  // Reset khi mở modal
  useEffect(() => {
    if (open) {
      reset({
        room_id:         undefined as unknown as string,
        check_in:        defaultCheckIn ? dayjs(defaultCheckIn) : undefined as unknown as Dayjs,
        check_out:       defaultCheckOut ? dayjs(defaultCheckOut) : undefined as unknown as Dayjs,
        price_per_night: 0,
        guests_count:    1,
        note:            '',
      });
    }
  }, [open, defaultCheckIn, defaultCheckOut, reset]);

  // Gợi ý giá khi chọn phòng + ngày
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() không tương thích React Compiler, known issue
  const watchRoomId  = watch('room_id');
  const watchCheckIn = watch('check_in');

  useEffect(() => {
    if (!watchRoomId || !watchCheckIn) return;
    supabase
      .rpc('get_suggested_price', {
        p_room_id: watchRoomId,
        p_date:    watchCheckIn.format('YYYY-MM-DD'),
      })
      .then(({ data }: { data: number | null }) => {
        if (data && data > 0) setValue('price_per_night', data);
      });
  }, [watchRoomId, watchCheckIn, setValue]);

  const onSubmit = (values: FormValues) => {
    addRoom(
      {
        group_id:        groupId,
        room_id:         values.room_id,
        check_in:        values.check_in.format('YYYY-MM-DD'),
        check_out:       values.check_out.format('YYYY-MM-DD'),
        price_per_night: values.price_per_night,
        guests_count:    values.guests_count,
        note:            values.note,
      },
      {
        onSuccess: onClose,
        onError: (error: Error) => {
          message.error(`Tạo phòng thất bại: ${error.message}`);
        },
      },
    );
  };

  return (
    <Modal
      title="Thêm phòng"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit(onSubmit)}
      okText="Thêm phòng"
      cancelText="Hủy"
      confirmLoading={isPending}
      destroyOnClose
    >
      <Spin spinning={roomsLoading}>
        <Form layout="vertical" style={{ marginTop: 16 }}>

          <Form.Item
            label="Phòng"
            validateStatus={errors.room_id ? 'error' : ''}
            help={errors.room_id?.message}
            required
          >
            <Controller
              name="room_id"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  placeholder="Chọn phòng"
                  options={rooms.map(r => ({ value: r.id, label: `${r.id} — ${r.name}` }))}
                  showSearch
                  optionFilterProp="label"
                />
              )}
            />
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Nhận phòng"
                validateStatus={errors.check_in ? 'error' : ''}
                help={errors.check_in?.message as string}
                required
              >
                <Controller
                  name="check_in"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder="Ngày nhận"
                    />
                  )}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Trả phòng"
                validateStatus={errors.check_out ? 'error' : ''}
                help={errors.check_out?.message as string}
                required
              >
                <Controller
                  name="check_out"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      style={{ width: '100%' }}
                      format="DD/MM/YYYY"
                      placeholder="Ngày trả"
                      disabledDate={current =>
                        watchCheckIn
                          ? current.isBefore(watchCheckIn.add(1, 'day'), 'day')
                          : false
                      }
                    />
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Giá/đêm (VND)"
                validateStatus={errors.price_per_night ? 'error' : ''}
                help={errors.price_per_night?.message}
                required
              >
                <Controller
                  name="price_per_night"
                  control={control}
                  render={({ field }) => (
                    <InputNumber
                      {...field}
                      style={{ width: '100%' }}
                      formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={v => Number(v?.replace(/,/g, '') ?? 0)}
                      min={1}
                      step={50000}
                    />
                  )}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Số khách">
                <Controller
                  name="guests_count"
                  control={control}
                  render={({ field }) => (
                    <InputNumber {...field} style={{ width: '100%' }} min={1} max={20} />
                  )}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Ghi chú">
            <Controller
              name="note"
              control={control}
              render={({ field }) => (
                <Input.TextArea {...field} rows={2} placeholder="Ghi chú cho phòng này (tùy chọn)" />
              )}
            />
          </Form.Item>

        </Form>
      </Spin>
    </Modal>
  );
}
