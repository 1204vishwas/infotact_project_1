import { telemetryService } from './telemetryService.js';
import { isConnected } from '../config/db.js';

/**
 * Micro-Batch In-Memory Telemetry Buffer
 *
 * Provides ultra-fast ingestion by queuing writes in memory and asynchronously
 * flushing them in high-throughput batches to MongoDB via insertMany({ ordered: false }).
 */
export class TelemetryBuffer {
  constructor(options = {}) {
    this.maxBatchSize = options.maxBatchSize || parseInt(process.env.BUFFER_MAX_BATCH_SIZE || '1000', 10);
    this.flushIntervalMs = options.flushIntervalMs || parseInt(process.env.BUFFER_FLUSH_INTERVAL_MS || '100', 10);
    this.queue = [];
    this.timer = null;
    this.isFlushing = false;
    this.isShuttingDown = false;
    this.metrics = {
      totalBuffered: 0,
      totalFlushed: 0,
      flushCount: 0,
      lastFlushDurationMs: 0
    };

    this.startAutoFlush();
  }

  /**
   * Enqueue a normalized telemetry record into the write buffer.
   * Returns immediately for sub-millisecond response time.
   */
  enqueue(doc) {
    this.queue.push(doc);
    this.metrics.totalBuffered++;

    // Flush immediately if high-water mark batch size is reached
    if (this.queue.length >= this.maxBatchSize && !this.isShuttingDown) {
      this.flush();
    }

    return {
      buffered: true,
      queueDepth: this.queue.length
    };
  }

  /**
   * Enqueue a batch of normalized records.
   */
  enqueueBatch(docs) {
    this.queue.push(...docs);
    this.metrics.totalBuffered += docs.length;

    if (this.queue.length >= this.maxBatchSize && !this.isShuttingDown) {
      this.flush();
    }

    return {
      buffered: true,
      enqueuedCount: docs.length,
      queueDepth: this.queue.length
    };
  }

  /**
   * Flush queued documents to MongoDB.
   */
  async flush() {
    if (this.isFlushing || this.queue.length === 0 || !isConnected()) {
      return;
    }

    this.isFlushing = true;
    const batch = this.queue.splice(0, this.maxBatchSize);
    let flushError = false;

    try {
      const startTime = performance.now();
      const res = await telemetryService.ingestBatch(batch);
      const duration = performance.now() - startTime;

      this.metrics.totalFlushed += res.insertedCount || batch.length;
      this.metrics.flushCount++;
      this.metrics.lastFlushDurationMs = parseFloat(duration.toFixed(2));
    } catch (err) {
      flushError = true;
      if (!this.isShuttingDown && isConnected()) {
        console.error('[TelemetryBuffer] Error during flush:', err.message);
        // Re-queue failed batch at head for resilience (only if queue isn't overgrown)
        if (this.queue.length < 5000) {
          this.queue.unshift(...batch);
        }
      }
    } finally {
      this.isFlushing = false;

      // Only immediately trigger next flush if previous succeeded and more items remain
      if (!flushError && !this.isShuttingDown && this.queue.length >= this.maxBatchSize && isConnected()) {
        setImmediate(() => this.flush());
      }
    }
  }

  startAutoFlush() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.queue.length > 0 && isConnected()) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  async stop() {
    this.isShuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Flush remaining items before stop if connected
    if (this.queue.length > 0 && isConnected()) {
      await this.flush();
    }
  }

  getStats() {
    return {
      currentQueueDepth: this.queue.length,
      maxBatchSize: this.maxBatchSize,
      flushIntervalMs: this.flushIntervalMs,
      ...this.metrics
    };
  }
}

export const telemetryBuffer = new TelemetryBuffer();
