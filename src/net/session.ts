import mqtt, { type MqttClient } from 'mqtt'
import { APP_ID, type NetMsg } from '@/lib/types'

export type Session = {
  selfId: string
  leave: () => Promise<void>
  send: (msg: NetMsg, target?: string) => void
  onMessage: (fn: (msg: NetMsg, peerId: string) => void) => () => void
  onPeerJoin: (fn: (peerId: string) => void) => () => void
  onPeerLeave: (fn: (peerId: string) => void) => () => void
  onJoinError: (fn: (message: string) => void) => () => void
  onConnected: (fn: () => void) => () => void
  getPeers: () => string[]
  /** How many public brokers are currently connected. */
  getBrokerCount: () => number
  ready: boolean
}

type Wire = {
  v: 1
  id: string
  app: string
  from: string
  to?: string
  msg: NetMsg
}

/** Fan-out to several public brokers so peers don't land on different islands. */
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
]

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return `p${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 16)
}

/** Flat topic — some public brokers are picky about deep paths. */
function roomTopic(roomCode: string): string {
  return `${APP_ID}-${roomCode.toUpperCase()}`
}

export function createRoomSession({ roomCode }: { roomCode: string }): Session {
  const selfId = makeId()
  const topic = roomTopic(roomCode)
  const seenPeers = new Map<string, number>()
  const seenMsg = new Set<string>()
  const clients = new Map<string, MqttClient>()
  const alive = new Set<string>()

  const msgFns = new Set<(msg: NetMsg, peerId: string) => void>()
  const joinFns = new Set<(peerId: string) => void>()
  const leaveFns = new Set<(peerId: string) => void>()
  const errFns = new Set<(message: string) => void>()
  const connectedFns = new Set<() => void>()

  let closed = false
  let announced = false
  const queue: Wire[] = []

  const unsub =
    <T>(set: Set<T>, fn: T) =>
    () => {
      set.delete(fn)
    }

  const touchPeer = (peerId: string) => {
    const first = !seenPeers.has(peerId)
    seenPeers.set(peerId, Date.now())
    if (first) for (const fn of joinFns) fn(peerId)
  }

  const publishAll = (wire: Wire) => {
    const body = JSON.stringify(wire)
    let sent = 0
    for (const url of alive) {
      const c = clients.get(url)
      if (!c?.connected) continue
      c.publish(topic, body, { qos: 0 })
      sent++
    }
    if (sent === 0) queue.push(wire)
  }

  const flush = () => {
    if (alive.size === 0) return
    while (queue.length) publishAll(queue.shift()!)
  }

  const handlePayload = (payload: Buffer | string) => {
    let wire: Wire
    try {
      wire = JSON.parse(payload.toString()) as Wire
    } catch {
      return
    }
    if (!wire || wire.v !== 1 || wire.app !== APP_ID || !wire.from || !wire.msg) return
    if (wire.from === selfId) return
    if (wire.to && wire.to !== selfId) return
    if (wire.id) {
      if (seenMsg.has(wire.id)) return
      seenMsg.add(wire.id)
      if (seenMsg.size > 400) {
        const first = seenMsg.values().next().value
        if (first) seenMsg.delete(first)
      }
    }
    touchPeer(wire.from)
    for (const fn of msgFns) fn(wire.msg, wire.from)
  }

  const markConnected = (url: string) => {
    const wasEmpty = alive.size === 0
    alive.add(url)
    flush()
    if (wasEmpty && !announced) {
      announced = true
      for (const fn of connectedFns) fn()
    }
  }

  const connectOne = (url: string) => {
    if (closed) return
    const client = mqtt.connect(url, {
      clientId: `rp${selfId}${Math.random().toString(36).slice(2, 6)}`,
      clean: true,
      reconnectPeriod: 2_000,
      connectTimeout: 10_000,
      protocolVersion: 4,
    })
    clients.set(url, client)

    client.on('connect', () => {
      if (closed) {
        client.end(true)
        return
      }
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          for (const fn of errFns) fn(`${url}: ${err.message}`)
          return
        }
        markConnected(url)
      })
    })

    client.on('message', (_t, payload) => handlePayload(payload))

    client.on('error', (err) => {
      for (const fn of errFns) fn(err.message || 'MQTT error')
    })

    client.on('close', () => {
      alive.delete(url)
    })
  }

  for (const url of BROKERS) connectOne(url)

  const pruneTimer = window.setInterval(() => {
    const now = Date.now()
    for (const [id, at] of seenPeers) {
      if (now - at > 15_000) {
        seenPeers.delete(id)
        for (const fn of leaveFns) fn(id)
      }
    }
  }, 3000)

  return {
    selfId,
    get ready() {
      return alive.size > 0
    },
    getBrokerCount: () => alive.size,
    leave: async () => {
      closed = true
      window.clearInterval(pruneTimer)
      queue.length = 0
      const ending = [...clients.values()].map(
        (c) => new Promise<void>((res) => c.end(true, {}, () => res())),
      )
      clients.clear()
      alive.clear()
      await Promise.all(ending)
    },
    send: (msg, target) => {
      publishAll({
        v: 1,
        id: makeId(),
        app: APP_ID,
        from: selfId,
        to: target,
        msg,
      })
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
      errFns.add(fn)
      return unsub(errFns, fn)
    },
    onConnected: (fn) => {
      connectedFns.add(fn)
      if (alive.size > 0) fn()
      return unsub(connectedFns, fn)
    },
    getPeers: () => [...seenPeers.keys()],
  }
}
