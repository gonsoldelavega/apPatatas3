import type { Pool } from "pg";
import {
  withTenantTransaction,
  type TenantContext,
} from "../database/client.js";

export interface OcrBudgetLimits {
  dailyAttempts: number;
  monthlyAttempts: number;
  monthlyMicrousd: number;
}

export interface OcrTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export const OCR_ATTEMPT_RESERVATION_MICROUSD = 65_000;

export function haiku45CostMicrousd(usage: OcrTokenUsage): number {
  return usage.inputTokens + usage.outputTokens * 5;
}

export class OcrBudgetExceededError extends Error {
  constructor() {
    super("ocr_budget_exhausted");
    this.name = "OcrBudgetExceededError";
  }
}

export class OcrBudget {
  constructor(
    private readonly pool: Pool,
    private readonly limits: OcrBudgetLimits,
  ) {}

  async reserve(identity: TenantContext, model: string): Promise<string> {
    return withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [identity.companyId],
      );
      const usage = (
        await client.query<{
          daily_attempts: string;
          monthly_attempts: string;
          monthly_microusd: string;
        }>(
          `select
             count(*) filter (
               where (created_at at time zone 'Europe/Madrid')::date =
                     (now() at time zone 'Europe/Madrid')::date
             )::text daily_attempts,
             count(*)::text monthly_attempts,
             coalesce(sum(coalesce(actual_cost_microusd, reserved_microusd)), 0)::text monthly_microusd
           from ocr_usage_events
           where date_trunc('month', created_at at time zone 'Europe/Madrid') =
                 date_trunc('month', now() at time zone 'Europe/Madrid')`,
        )
      ).rows[0]!;
      if (
        Number(usage.daily_attempts) >= this.limits.dailyAttempts ||
        Number(usage.monthly_attempts) >= this.limits.monthlyAttempts ||
        Number(usage.monthly_microusd) + OCR_ATTEMPT_RESERVATION_MICROUSD >
          this.limits.monthlyMicrousd
      )
        throw new OcrBudgetExceededError();
      return (
        await client.query<{ id: string }>(
          `insert into ocr_usage_events(
             company_id, model, status, reserved_microusd
           ) values($1,$2,'reserved',$3) returning id`,
          [
            identity.companyId,
            model,
            OCR_ATTEMPT_RESERVATION_MICROUSD,
          ],
        )
      ).rows[0]!.id;
    });
  }

  async status(identity: TenantContext) {
    return withTenantTransaction(this.pool, identity, async (client) => {
      const usage = (
        await client.query<{
          daily_attempts: string;
          monthly_attempts: string;
          monthly_microusd: string;
        }>(
          `select
             count(*) filter (
               where (created_at at time zone 'Europe/Madrid')::date =
                     (now() at time zone 'Europe/Madrid')::date
             )::text daily_attempts,
             count(*)::text monthly_attempts,
             coalesce(sum(coalesce(actual_cost_microusd, reserved_microusd)), 0)::text monthly_microusd
           from ocr_usage_events
           where date_trunc('month', created_at at time zone 'Europe/Madrid') =
                 date_trunc('month', now() at time zone 'Europe/Madrid')`,
        )
      ).rows[0]!;
      const accountedMicrousd = Number(usage.monthly_microusd);
      return {
        dailyAttempts: Number(usage.daily_attempts),
        dailyLimit: this.limits.dailyAttempts,
        monthlyAttempts: Number(usage.monthly_attempts),
        monthlyLimit: this.limits.monthlyAttempts,
        accountedMicrousd,
        budgetMicrousd: this.limits.monthlyMicrousd,
        remainingMicrousd: Math.max(
          0,
          this.limits.monthlyMicrousd - accountedMicrousd,
        ),
      };
    });
  }

  async complete(
    identity: TenantContext,
    reservationId: string,
    usage: OcrTokenUsage,
  ): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        `update ocr_usage_events
         set status='completed', actual_cost_microusd=$2,
             input_tokens=$3, output_tokens=$4, completed_at=now()
         where id=$1 and status='reserved'`,
        [
          reservationId,
          haiku45CostMicrousd(usage),
          usage.inputTokens,
          usage.outputTokens,
        ],
      );
    });
  }

  async fail(identity: TenantContext, reservationId: string): Promise<void> {
    await withTenantTransaction(this.pool, identity, async (client) => {
      await client.query(
        `update ocr_usage_events
         set status='failed', completed_at=now()
         where id=$1 and status='reserved'`,
        [reservationId],
      );
    });
  }
}
