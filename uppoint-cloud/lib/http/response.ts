export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string };

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function fail(error: string, code = error): ApiResponse<never> {
  return { success: false, error, code };
}
