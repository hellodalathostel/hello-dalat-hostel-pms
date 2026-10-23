import { describe, expect, it } from 'vitest'
import { getQueryViewState } from './queryViewState'

describe('getQueryViewState', () => {
  it('lần tải đầu, chưa có data → loading', () => {
    expect(getQueryViewState({ isLoading: true, isError: false, data: undefined })).toBe('loading')
  })

  it('lỗi, data undefined → error', () => {
    expect(getQueryViewState({ isLoading: false, isError: true, data: undefined })).toBe('error')
  })

  it('lỗi, data rỗng → error (không được thành empty)', () => {
    expect(getQueryViewState({ isLoading: false, isError: true, data: [] })).toBe('error')
  })

  it('lỗi refetch nhưng còn data cũ → stale-error', () => {
    expect(getQueryViewState({ isLoading: false, isError: true, data: [{ id: 1 }] })).toBe('stale-error')
  })

  it('thành công, data rỗng → empty', () => {
    expect(getQueryViewState({ isLoading: false, isError: false, data: [] })).toBe('empty')
  })

  it('thành công, có data → ready', () => {
    expect(getQueryViewState({ isLoading: false, isError: false, data: [{ id: 1 }] })).toBe('ready')
  })

  it('đang refetch nhưng đã có data → ready', () => {
    expect(getQueryViewState({ isLoading: true, isError: false, data: [{ id: 1 }] })).toBe('ready')
  })

  it('đang thử lại sau lỗi (isLoading + isError) → vẫn error', () => {
    expect(getQueryViewState({ isLoading: true, isError: true, data: undefined })).toBe('error')
  })
})
