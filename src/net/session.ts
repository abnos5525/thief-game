import { joinRoom, selfId } from 'trystero'
import { APP_ID, type NetMsg } from '@/lib/types'

export type Session = {
  selfId: string
  leave: () => Promise<void>
  send: (msg: NetMsg, target?: string) => void
  onMessage: (fn: (msg: NetMsg, peerId: string) => void) => () => void
  onPeerJoin: (fn: (peerId: string) => void) => () => void
  onPeerLeave: (fn: (peerId: string) => void) => () => void
  getPeers: () => string[]
}

function isNetMsg(data: unknown): data is NetMsg {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { t?: unknown }).t === 'string'
  )
}

export function createRoomSession({ roomCode }: { roomCode: string }): Session {
  const room = joinRoom({ appId: APP_ID }, roomCode)
  const [sendRaw, onRaw] = room.makeAction('rp')

  const msgFns = new Set<(msg: NetMsg, peerId: string) => void>()
  const joinFns = new Set<(peerId: string) => void>()
  const leaveFns = new Set<(peerId: string) => void>()

  onRaw((data, peerId) => {
    if (!isNetMsg(data)) return
    for (const fn of msgFns) fn(data, peerId)
  })

  room.onPeerJoin((peerId) => {
    for (const fn of joinFns) fn(peerId)
  })

  room.onPeerLeave((peerId) => {
    for (const fn of leaveFns) fn(peerId)
  })

  const unsub =
    <T extends (...args: never[]) => void>(set: Set<T>, fn: T) =>
    () => {
      set.delete(fn)
    }

  return {
    selfId,
    leave: () => room.leave(),
    send: (msg, target) => {
      void sendRaw(msg, target)
    },
    onMessage: (fn) => {
      msgFns.add(fn)
      return unsub(msgFns, fn)
    },
    onPeerJoin: (fn) => {
      joinFns.add(fn)
      return unsub(joinFns, fn)
    },
    onPeerLeave: (fn) => {
      leaveFns.add(fn)
      return unsub(leaveFns, fn)
    },
    getPeers: () => Object.keys(room.getPeers()),
  }
}
