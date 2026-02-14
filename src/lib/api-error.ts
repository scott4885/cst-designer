export async function throwIfError(response: Response, fallback: string) {
  if (!response.ok) {
    let message = fallback;
    try {
      const body = await response.json();
      message = body.error || body.message || fallback;
    } catch {}
    throw new Error(message);
  }
  return response;
}
