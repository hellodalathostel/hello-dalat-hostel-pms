// Xác định trạng thái hiển thị của một danh sách theo kết quả query.
// Tách khỏi component để test được và dùng chung 4 màn.
export type QueryViewState =
  | 'loading'      // lần tải đầu, chưa có data
  | 'error'        // lỗi và không có data cũ -> khối lỗi + Thử lại
  | 'stale-error'  // lỗi refetch nhưng còn data cũ -> hiện data + banner
  | 'empty'        // tải thành công, danh sách rỗng thật
  | 'ready';       // có data

export interface QueryViewInput {
  isLoading: boolean;
  isError: boolean;
  data: readonly unknown[] | undefined;
}

export function getQueryViewState({ isLoading, isError, data }: QueryViewInput): QueryViewState {
  const hasData = Array.isArray(data) && data.length > 0;
  if (isError) return hasData ? 'stale-error' : 'error';
  if (isLoading && data === undefined) return 'loading';
  if (!hasData) return 'empty';
  return 'ready';
}
