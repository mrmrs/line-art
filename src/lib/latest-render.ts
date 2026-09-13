// One owner runs draft/final work. New requests invalidate final continuations
// even after the pending slot has already been consumed by a later request.
export class LatestRender<T> {
  private pending: { value: T; epoch: number } | null = null;
  private epoch = 0;
  private running = false;
  private work: (value: T, current: () => boolean) => Promise<void>;
  private failed: (error: unknown, value: T) => void;
  constructor(
    work: (value: T, current: () => boolean) => Promise<void>,
    failed: (error: unknown, value: T) => void,
  ) {
    this.work = work;
    this.failed = failed;
  }
  submit(value: T) {
    this.pending = { value, epoch: ++this.epoch };
    if (!this.running) {
      this.running = true;
      setTimeout(() => {
        void this.drain();
      }, 0);
    }
  }
  private async drain() {
    try {
      while (this.pending) {
        const job = this.pending;
        this.pending = null;
        try {
          await this.work(job.value, () => job.epoch === this.epoch);
        } catch (error) {
          if (job.epoch === this.epoch) this.failed(error, job.value);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
