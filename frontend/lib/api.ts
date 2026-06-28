const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://propostas-expert-energy-api.onrender.com"
).replace(/\/+$/, "");

function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

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

  return fetch(buildApiUrl(path), {
    ...options,
    headers,
  });
}

export { buildApiUrl };
