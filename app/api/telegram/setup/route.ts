import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { callBotApi } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const key = url.searchParams.get('key') ?? ''
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? ''
  const a = Buffer.from(key)
  const b = Buffer.from(secret)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const host = req.headers.get('x-forwarded-host') ?? url.host
  const webhookUrl = `https://${host}/api/telegram/webhook`

  try {
    await callBotApi('setWebhook', {
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ['message', 'pre_checkout_query'],
      drop_pending_updates: false,
    })
    return NextResponse.json({ ok: true, webhookUrl })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
