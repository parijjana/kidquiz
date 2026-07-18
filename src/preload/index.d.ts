import type { KidquizApi } from './index'

declare global {
  interface Window {
    kidquiz: KidquizApi
  }
}

export {}
