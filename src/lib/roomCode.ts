const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function makeRoomCode(): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += CHARS[(Math.random() * CHARS.length) | 0]
  return code
}

export function normalizeRoomCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-Z0-9]{4}$/.test(normalizeRoomCode(code))
}
