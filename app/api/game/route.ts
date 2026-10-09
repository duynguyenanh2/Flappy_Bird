import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  consumePlay,
  createPendingPayment,
  getStatus,
  saveBestScore,
  upsertPlayer,
} from '@/lib/game'
import { callBotApi, verifyInitData } from '@/lib/telegram'

export const dynamic = 'force-dynamic'

type Body = { action?: string; initData?: string; score?: number }

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  let user
  try {
    user = verifyInitData(body.initData)
  } catch (e) {
    console.error('[game] config error', e)
    return NextResponse.json({ error: 'server_not_configured' }, { status: 503 })
  }
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    await upsertPlayer(user)

    switch (body.action) {
      case 'status':
        return NextResponse.json(await getStatus(user.id))

      case 'start': {
        const used = await consumePlay(user.id)
        const status = await getStatus(user.id)
        if (!used) return NextResponse.json({ ok: false, ...status }, { status: 402 })
        return NextResponse.json({ ok: true, used, ...status })
      }

      case 'score': {
        const score = Number(body.score)
        if (Number.isInteger(score) && score >= 0 && score <= 100000) await saveBestScore(user.id, score)
        return NextResponse.json({ ok: true })
      }

      case 'invoice': {
        const { price } = await getStatus(user.id)
        const payload = randomUUID()
        await createPendingPayment(user.id, payload, price)
        const link = await callBotApi<string>('createInvoiceLink', {
          title: 'Chơi lại Flappy Penguin',
          description: `Mua 1 lượt chơi mới với giá ${price} Stars. Giá tăng sau mỗi lượt mua trong ngày.`,
          payload,
          provider_token: '',
          currency: 'XTR',
          prices: [{ label: '1 lượt chơi', amount: price }],
        })
        return NextResponse.json({ link, price })
      }

      default:
        return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
    }
  } catch (e) {
    console.error('[game] error', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
