import { App } from 'antd'

export function useAppFeedback() {
  const { message, notification } = App.useApp()

  return { message, notification }
}
