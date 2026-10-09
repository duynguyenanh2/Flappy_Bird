import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { replayPrice, type TelegramUser } from '@/lib/telegram'

type PlayerRow = {
  credits: number
  paid_today: number
  free_available: boolean
  best_score: number
}

export async function upsertPlayer(user: TelegramUser) {
  await db.execute(sql`
    INSERT INTO players (telegram_id, username, first_name)
    VALUES (${user.id}, ${user.username ?? null}, ${user.first_name ?? null})
    ON CONFLICT (telegram_id) DO UPDATE
      SET username = EXCLUDED.username, first_name = EXCLUDED.first_name, updated_at = now()
  `)
}

export async function getStatus(telegramId: number) {
  const { rows } = await db.execute<PlayerRow>(sql`
    SELECT credits,
           CASE WHEN paid_count_day = CURRENT_DATE THEN paid_count ELSE 0 END AS paid_today,
           (free_used_on IS DISTINCT FROM CURRENT_DATE) AS free_available,
           best_score
    FROM players WHERE telegram_id = ${telegramId}
  `)
  const row = rows[0]
  const paidToday = Number(row?.paid_today ?? 0)
  return {
    credits: Number(row?.credits ?? 0),
    freeAvailable: row ? Boolean(row.free_available) : true,
    paidToday,
    price: replayPrice(paidToday),
    nextPrice: replayPrice(paidToday + 1),
    best: Number(row?.best_score ?? 0),
  }
}

export async function consumePlay(telegramId: number): Promise<'free' | 'paid' | null> {
  const free = await db.execute(sql`
    UPDATE players SET free_used_on = CURRENT_DATE, updated_at = now()
    WHERE telegram_id = ${telegramId} AND free_used_on IS DISTINCT FROM CURRENT_DATE
    RETURNING telegram_id
  `)
  if (free.rows.length) return 'free'

  const paid = await db.execute(sql`
    UPDATE players SET credits = credits - 1, updated_at = now()
    WHERE telegram_id = ${telegramId} AND credits > 0
    RETURNING telegram_id
  `)
  return paid.rows.length ? 'paid' : null
}

export async function saveBestScore(telegramId: number, score: number) {
  await db.execute(sql`
    UPDATE players SET best_score = GREATEST(best_score, ${score}), updated_at = now()
    WHERE telegram_id = ${telegramId}
  `)
}

export async function createPendingPayment(telegramId: number, payload: string, amount: number) {
  await db.execute(sql`
    INSERT INTO star_payments (telegram_id, payload, amount) VALUES (${telegramId}, ${payload}, ${amount})
  `)
}

export async function findPendingPayment(payload: string) {
  const { rows } = await db.execute<{ telegram_id: string; amount: number }>(sql`
    SELECT telegram_id, amount FROM star_payments WHERE payload = ${payload} AND status = 'pending'
  `)
  const row = rows[0]
  return row ? { telegramId: Number(row.telegram_id), amount: Number(row.amount) } : null
}

export async function completePayment(payload: string, chargeId: string, totalAmount: number) {
  return db.transaction(async (tx) => {
    const { rows } = await tx.execute<{ telegram_id: string; amount: number }>(sql`
      UPDATE star_payments
      SET status = 'paid', telegram_charge_id = ${chargeId}, paid_at = now()
      WHERE payload = ${payload} AND status = 'pending' AND amount = ${totalAmount}
      RETURNING telegram_id, amount
    `)
    const row = rows[0]
    if (!row) return false
    await tx.execute(sql`
      UPDATE players SET
        credits = credits + 1,
        paid_count = CASE WHEN paid_count_day = CURRENT_DATE THEN paid_count + 1 ELSE 1 END,
        paid_count_day = CURRENT_DATE,
        total_stars_spent = total_stars_spent + ${Number(row.amount)},
        updated_at = now()
      WHERE telegram_id = ${Number(row.telegram_id)}
    `)
    return true
  })
}
