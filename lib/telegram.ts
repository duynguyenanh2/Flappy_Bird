import { createHmac, timingSafeEqual } from 'node:crypto'

export type TelegramUser = {
  id: number
  first_name?: string
  username?: string
}

const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24

function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set')
  return token
}

export function verifyInitData(initData: unknown): TelegramUser | null {
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 4096) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return null
  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken()).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) return null

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TelegramUser | null
    if (!user || !Number.isSafeInteger(user.id)) return null
    return user
  } catch {
    return null
  }
}

export async function callBotApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string }
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`)
  return json.result as T
}

function envInt(name: string, fallback: number, min: number) {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n >= min ? n : fallback
}

export const pricing = {
  base: Math.floor(envInt('STAR_BASE_PRICE', 10, 1)),
  multiplier: envInt('STAR_PRICE_MULTIPLIER', 2, 1),
  max: Math.floor(envInt('STAR_MAX_PRICE', 2500, 1)),
}

export function replayPrice(paidToday: number) {
  const raw = pricing.base * Math.pow(pricing.multiplier, Math.max(0, paidToday))
  return Math.max(1, Math.min(pricing.max, Math.round(raw)))
}
