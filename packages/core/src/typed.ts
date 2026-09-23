export function parseTypedData(raw: string): {
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
} {
  let text = raw.trim();
  if (text.startsWith("0x")) {
    const hex = text.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    text = new TextDecoder().decode(bytes);
  }
  const parsed = JSON.parse(text) as {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    primaryType: string;
    message: Record<string, unknown>;
  };
  if (parsed.types?.EIP712Domain) delete parsed.types.EIP712Domain;
  return parsed;
}
