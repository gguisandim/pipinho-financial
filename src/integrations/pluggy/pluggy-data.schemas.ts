import { z } from "zod";

export const pluggyItemSchema = z
  .object({
    id: z.string().min(1),
    connectorId: z.number().int().optional(),
    status: z.string().optional(),
    executionStatus: z.string().optional(),
    lastUpdatedAt: z.string().nullable().optional(),
    nextAutoSyncAt: z.string().nullable().optional(),
    products: z.unknown().optional(),
    connector: z
      .object({
        id: z.number().int().optional(),
        name: z.string().optional(),
        institutionUrl: z.string().optional(),
        primaryColor: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export type PluggyItem = z.infer<typeof pluggyItemSchema>;

export const pluggyConnectorSchema = z
  .object({
    id: z.number().int(),
    name: z.string().min(1),
    institutionUrl: z.string().nullable().optional(),
    isOpenFinance: z.boolean().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export type PluggyConnector = z.infer<typeof pluggyConnectorSchema>;

export const pluggyAccountSchema = z
  .object({
    id: z.string().min(1),
    itemId: z.string().min(1),
    type: z.enum(["BANK", "CREDIT"]),
    subtype: z.string().min(1),
    number: z.string().nullable().optional(),
    balance: z.number().nullable(),
    currencyCode: z.string().min(1),
    name: z.string().min(1),
    marketingName: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    taxNumber: z.string().nullable().optional(),
    bankData: z.unknown().nullable().optional(),
    creditData: z.unknown().nullable().optional(),
  })
  .passthrough();

export type PluggyAccount = z.infer<typeof pluggyAccountSchema>;

export const pluggyAccountsResponseSchema = z.object({
  results: z.array(pluggyAccountSchema),
});

export const pluggyTransactionSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    description: z.string(),
    descriptionRaw: z.string().nullable().optional(),
    currencyCode: z.string().min(1),
    amount: z.number(),
    amountInAccountCurrency: z.number().nullable().optional(),
    date: z.string().min(1),
    balance: z.number().nullable().optional(),
    category: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    providerCode: z.string().nullable().optional(),
    providerId: z.string().nullable().optional(),
    status: z.enum(["PENDING", "POSTED"]).or(z.string()),
    type: z.enum(["DEBIT", "CREDIT"]).or(z.string()),
    operationType: z.string().nullable().optional(),
    operationTypeAdditionalInfo: z.string().nullable().optional(),
    paymentData: z.unknown().nullable().optional(),
    creditCardMetadata: z.unknown().nullable().optional(),
    merchant: z.unknown().nullable().optional(),
  })
  .passthrough();

export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>;

export const pluggyTransactionsCursorResponseSchema = z.object({
  results: z.array(pluggyTransactionSchema),
  next: z.string().nullable().optional(),
});
