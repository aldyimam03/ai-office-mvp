import { z } from "zod";

export const ProposedAction = z.object({
  tool: z.string().trim().min(1).max(100),
  input: z.any().default(null),
  risk: z.enum(["low", "medium", "high"]),
  allowlistKey: z.string().trim().min(1).max(160),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

export const ActionRequest = z.object({
  summary: z.string().trim().min(1).max(1000),
  action: ProposedAction,
});
