interface CreateContextOptions {
  req?: Request;
}

/**
 * ORPC Request Context
 *
 * @param options - Optional context options including the request object
 * @returns Empty context object (for now)
 */
export async function createContext({ req: _req }: CreateContextOptions = {}) {
  return {};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
