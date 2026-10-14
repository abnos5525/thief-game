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
  ready: boolean
}

type Wire = {
  v: 1
  app: string
  from: string
  to?: string
  msg: NetMsg
}

const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
]

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return `p${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.slice(0, 16)
}

function roomTopic(roomCode: string): string {
  return `${APP_ID}/${roomCode}/bus`
}

/**
 * Room sync over public MQTT WebSockets (no WebRTC).
 * Works across phones/NATs where P2P often fails on GitHub Pages.
 */
export function createRoomSession({ roomCode }: { roomCode: string }): Session {
  const selfId = makeId()
  const topic = roomTopic(roomCode.toUpperCase())
  const seen = new Map<string, number>() // peerId -> lastSeen ms

  const msgFns = new Set<(msg: NetMsg, peerId: string) => void>()
  const joinFns = new Set<(peerId: string) => void>()
  const leaveFns = new Set<(peerId: string) => void>()
  const errFns = new Set<(message: string) => void>()
  const connectedFns = new Set<() => void>()

  let ready = false
  let client: MqttClient | null = null
  let brokerIndex = 0
  let closed = false
  const queue: Wire[] = []

  const unsub =
    <T>(set: Set<T>, fn: T) =>
    () => {
      set.delete(fn)
    }

  const touchPeer = (peerId: string) => {
    const first = !seen.has(peerId)
    seen.set(peerId, Date.now())
    if (first) {
      for (const fn of joinFns) fn(peerId)
    }
  }

  const publish = (wire: Wire) => {
    if (!client || !ready) {
      queue.push(wire)
      return
    }
    client.publish(topic, JSON.stringify(wire), { qos: 0 })
  }

  const flush = () => {
    while (queue.length && client && ready) {
      const wire = queue.shift()!
      client.publish(topic, JSON.stringify(wire), { qos: 0 })
    }
  }

  const connect = () => {
    if (closed) return
    const url = BROKERS[brokerIndex % BROKERS.length]!
    brokerIndex++

    const next = mqtt.connect(url, {
      clientId: `rp-${selfId}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 8_000,
      protocolVersion: 4,
    })

    client = next

    next.on('connect', () => {
      if (closed) {
        next.end(true)
        return
      }
      next.subscribe(topic, { qos: 0 }, (err) => {
        if (err) {
          for (const fn of errFns) fn(err.message)
          next.end(true)
          window.setTimeout(connect, 400)
          return
        }
        ready = true
        flush()
        for (const fn of connectedFns) fn()
      })
    })

    next.on('message', (_t, payload) => {
      let wire: Wire
      try {
        wire = JSON.parse(payload.toString()) as Wire
      } catch {
        return
      }
      if (!wire || wire.v !== 1 || wire.app !== APP_ID || !wire.from || !wire.msg) return
      if (wire.from === selfId) return
      if (wire.to && wire.to !== selfId) return
      touchPeer(wire.from)
      for (const fn of msgFns) fn(wire.msg, wire.from)
    })

    next.on('error', (err) => {
      for (const fn of errFns) fn(err.message || 'MQTT error')
    })

    next.on('close', () => {
      if (client !== next) return
      ready = false
      client = null
      if (!closed) window.setTimeout(connect, 600)
    })
  }

  connect()

  // Drop stale presence every few seconds.
  const pruneTimer = window.setInterval(() => {
    const now = Date.now()
    for (const [id, at] of seen) {
      if (now - at > 12_000) {
        seen.delete(id)
        for (const fn of leaveFns) fn(id)
      }
    }
  }, 3000)

  return {
    selfId,
    get ready() {
      return ready
    },
    leave: async () => {
      closed = true
      window.clearInterval(pruneTimer)
      queue.length = 0
      const c = client
      client = null
      ready = false
      if (c) await new Promise<void>((res) => c.end(true, {}, () => res()))
    },
    send: (msg, target) => {
      publish({
        v: 1,
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
      if (ready) fn()
      return unsub(connectedFns, fn)
    },
    getPeers: () => [...seen.keys()],
  }
}
