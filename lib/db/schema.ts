import { bigint, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const players = pgTable('players', {
  telegramId: bigint('telegram_id', { mode: 'number' }).primaryKey(),
  username: text('username'),
  firstName: text('first_name'),
  bestScore: integer('best_score').notNull().default(0),
  credits: integer('credits').notNull().default(0),
  paidCountDay: date('paid_count_day'),
  paidCount: integer('paid_count').notNull().default(0),
  freeUsedOn: date('free_used_on'),
  totalStarsSpent: integer('total_stars_spent').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const starPayments = pgTable('star_payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull(),
  payload: text('payload').notNull().unique(),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('pending'),
  telegramChargeId: text('telegram_charge_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
})
