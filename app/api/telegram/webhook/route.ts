import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { completePayment, findPendingPayment } from '@/lib/game'
import { callBotApi } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

type Update = {
  pre_checkout_query?: {
    id: string
    from: { id: number }
    currency: string
    total_amount: number
    invoice_payload: string
  }
  message?: {
    chat: { id: number }
    successful_payment?: {
      currency: string
      total_amount: number
      invoice_payload: string
      telegram_payment_charge_id: string
    }
  }
}

function secretMatches(header: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const update = (await req.json()) as Update

  try {
    const q = update.pre_checkout_query
    if (q) {
      const pending = await findPendingPayment(q.invoice_payload)
      const valid =
        pending !== null &&
        q.currency === 'XTR' &&
        pending.telegramId === q.from.id &&
        pending.amount === q.total_amount
      await callBotApi('answerPreCheckoutQuery', {
        pre_checkout_query_id: q.id,
        ok: valid,
        ...(valid ? {} : { error_message: 'Hóa đơn đã hết hạn, vui lòng thử lại trong game.' }),
      })
      return NextResponse.json({ ok: true })
    }

    const paid = update.message?.successful_payment
    if (paid && paid.currency === 'XTR') {
      await completePayment(paid.invoice_payload, paid.telegram_payment_charge_id, paid.total_amount)
    }
  } catch (e) {
    console.error('[telegram-webhook] error', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
