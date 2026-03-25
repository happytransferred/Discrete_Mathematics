const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateClassCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return out;
}
