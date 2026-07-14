interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

export class LoginRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maximumAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): boolean {
    const currentTime = this.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= currentTime) {
      this.entries.set(key, { attempts: 1, resetAt: currentTime + this.windowMs });
      return true;
    }
    if (current.attempts >= this.maximumAttempts) return false;
    current.attempts += 1;
    return true;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }
}
