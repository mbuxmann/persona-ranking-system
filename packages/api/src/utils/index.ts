import { logger } from "./logger";

export class Utils {
  static chunk<T>(array: T[], size: number): T[][] {
    if (size <= 0 || !Number.isInteger(size)) {
      throw new Error(`Invalid chunk size: ${size}. Size must be a positive integer.`);
    }

    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  static findMissingItems<T extends { id: string }, R extends { leadId: string }>(
    expectedItems: T[],
    receivedItems: R[]
  ): T[] {
    const receivedIds = new Set(receivedItems.map((r) => r.leadId));
    return expectedItems.filter((item) => !receivedIds.has(item.id));
  }

  static filterInvalidItems<T extends { leadId: string }>(
    items: T[],
    validItems: { id: string }[],
    context: string
  ): T[] {
    const validIds = new Set(validItems.map((v) => v.id));
    const invalidItems = items.filter((item) => !validIds.has(item.leadId));

    if (invalidItems.length > 0) {
      logger.warn(context, "Filtering out invalid lead IDs", {
        invalidCount: invalidItems.length,
        invalidIds: invalidItems.map((r) => r.leadId).slice(0, 5),
        expectedCount: validItems.length,
        receivedCount: items.length,
      });
    }

    return items.filter((item) => validIds.has(item.leadId));
  }

  /**
   * Group items by a key function
   */
  static groupBy<T, K extends string | number>(
    items: T[],
    keyFn: (item: T) => K
  ): Map<K, T[]> {
    const grouped = new Map<K, T[]>();
    for (const item of items) {
      const key = keyFn(item);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    }
    return grouped;
  }
}

export const utils = Utils;
