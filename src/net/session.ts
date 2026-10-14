import { joinRoom, selfId } from 'trystero/mqtt'
import { APP_ID, type NetMsg } from '@/lib/types'

export type Session = {
  selfId: string
  leave: () => Promise<void>
  send: (msg: NetMsg, target?: string) => void
  onMessage: (fn: (msg: NetMsg, peerId: string) => void) => () => void
  onPeerJoin: (fn: (peerId: string) => void) => () => void
  onPeerLeave: (fn: (peerId: string) => void) => () => void
  onJoinError: (fn: (message: string) => void) => () => void
  getPeers: () => string[]
}

type IceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

/** Free public TURN so peers behind different NATs can still connect. */
const TURN: IceServer[] = [
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

function isNetMsg(data: unknown): data is NetMsg {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof (data as { t?: unknown }).t === 'string'
  )
}

/** Prefix keeps public-relay topics unique to this game. */
export function roomTopic(roomCode: string): string {
  return `room-peel-${roomCode}`
}

type JoinRoomFn = (
  config: {
    appId: string
    turnConfig?: IceServer[]
  },
  roomId: string,
  onJoinError?: (details: { error: string; peerId: string }) => void,
) => ReturnType<typeof joinRoom>

export function createRoomSession({ roomCode }: { roomCode: string }): Session {
  const topic = roomTopic(roomCode)
  const joinErrors = new Set<(message: string) => void>()

  // mqtt.d.ts is narrower than runtime (turnConfig + onJoinError exist in strategy/peer).
  const join = joinRoom as unknown as JoinRoomFn
  const room = join(
    { appId: APP_ID, turnConfig: TURN },
    topic,
    ({ error, peerId }) => {
      const message = peerId ? `${error} (${peerId.slice(0, 6)})` : error
      for (const fn of joinErrors) fn(message)
    },
  )

  const [sendRaw, onRaw] = room.makeAction<NetMsg>('rp')

  const msgFns = new Set<(msg: NetMsg, peerId: string) => void>()
  const joinFns = new Set<(peerId: string) => void>()
  const leaveFns = new Set<(peerId: string) => void>()

  onRaw((data, peerId) => {
    if (!isNetMsg(data)) return
    for (const fn of msgFns) fn(data, peerId)
  })

  // Trystero replaces the handler — keep one fan-out wrapper.
  room.onPeerJoin((peerId) => {
    for (const fn of joinFns) fn(peerId)
  })
  room.onPeerLeave((peerId) => {
    for (const fn of leaveFns) fn(peerId)
  })

  const unsub =
    <T>(set: Set<T>, fn: T) =>
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
    onJoinError: (fn) => {
      joinErrors.add(fn)
      return unsub(joinErrors, fn)
    },
    getPeers: () => Object.keys(room.getPeers()),
  }
}
