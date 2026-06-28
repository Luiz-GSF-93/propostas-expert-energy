export async function apiFetch(
  path: string,
  token?: string,
  options: RequestInit = {}
) {
  const headers = new Headers(options.headers || undefined);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  return response;
}
