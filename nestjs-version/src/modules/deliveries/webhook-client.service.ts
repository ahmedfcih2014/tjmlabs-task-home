import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { Event } from 'src/modules/events/entities/event.entity';

export type WebhookDeliveryResult =
  | { success: true; httpStatus: number; durationMs: number }
  | {
      success: false;
      httpStatus: number | null;
      durationMs: number;
      error: string;
    };

@Injectable()
export class WebhookClient {
  private readonly timeoutMs = 5000;

  async deliver(
    destinationUrl: string,
    secret: string,
    event: Event,
  ): Promise<WebhookDeliveryResult> {
    const body = JSON.stringify({
      id: event.id,
      eventType: event.eventType,
      payload: event.payload,
    });
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    const startedAt = Date.now();

    try {
      const response = await fetch(destinationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Event-Id': String(event.id),
          'X-Event-Type': event.eventType,
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      const durationMs = Date.now() - startedAt;

      if (response.ok) {
        return { success: true, httpStatus: response.status, durationMs };
      }

      return {
        success: false,
        httpStatus: response.status,
        durationMs,
        error: `Destination responded with HTTP ${response.status}`,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message =
        error instanceof Error ? error.message : 'Unknown delivery error';

      return {
        success: false,
        httpStatus: null,
        durationMs,
        error: message,
      };
    }
  }
}
