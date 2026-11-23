import { z } from "zod";

export const monitoringMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GET_MONITORING"), origin: z.string().url() }),
  z.object({ type: z.literal("SET_MONITORING"), origin: z.string().url(), enabled: z.boolean() }),
]);

export type MonitoringMessage = z.infer<typeof monitoringMessage>;

export const monitoringState = z.object({ enabled: z.boolean() });
export type MonitoringState = z.infer<typeof monitoringState>;

export function siteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}
