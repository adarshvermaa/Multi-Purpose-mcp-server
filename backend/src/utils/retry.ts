type AsyncFunction<T> = (...args: any[]) => Promise<T>;

interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoff?: number;
}

export function withRecall<T>(
  fn: AsyncFunction<T>,
  options: RetryOptions
): AsyncFunction<T> {
  const { maxAttempts, delayMs, backoff = 1 } = options;

  return async (...args: any[]): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxAttempts) {
          throw lastError;
        }

        const currentDelay = delayMs * Math.pow(backoff, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, currentDelay));
        console.log(
          `Attempt ${attempt} failed. Retrying in ${currentDelay}ms...`
        );
      }
    }

    throw lastError || new Error("Unknown error in retry");
  };
}
