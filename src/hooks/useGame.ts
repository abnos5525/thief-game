import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addPlayer,
  applyPeelEnd,
  applyPeelStart,
  applyPeelUpdate,
  applySlam,
  applySteal,
  createLobbyState,
  electHost,
  removePlayer,
  setReady as engineSetReady,
  startRound,
  tickRound,
} from '@/game'
import { createRoomSession, type Session } from '@/net'
import { isValidRoomCode, makeRoomCode, normalizeRoomCode } from '@/lib/roomCode'
import {
  PLAYER_COLORS,
  type Edge,
  type GameState,
  type NetMsg,
  type PeelMode,
  type Player,
} from '@/lib/types'

function blankPlayer(id: string, name: string, color: string): Player {
  return { id, name, color, ready: false, score: 0, stunnedUntil: 0, items: [] }
}

function rebuildLobby(hostId: string, players: Player[], seed: number): GameState {
  let next = createLobbyState(hostId, seed)
  for (const p of players) {
    next = addPlayer(next, blankPlayer(p.id, p.name, p.color))
  }
  return next
}

export function useGame() {
  const [name, setName] = useState('')
  const [color] = useState(
    () => PLAYER_COLORS[(Math.random() * PLAYER_COLORS.length) | 0]!,
  )
  const [roomCode, setRoomCode] = useState('')
  const [joinInput, setJoinInput] = useState('')
  const [view, setView] = useState<'home' | 'room'>('home')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [state, setState] = useState<GameState | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [kickArmed, setKickArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [netHint, setNetHint] = useState<string | null>(null)
  const [brokerReady, setBrokerReady] = useState(false)

  const sessionRef = useRef<Session | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const selfIdRef = useRef<string | null>(null)
  const unsubsRef = useRef<(() => void)[]>([])
  const helloTimerRef = useRef<number | null>(null)
  const syncTimerRef = useRef<number | null>(null)
  const profileRef = useRef({ name: '', color })
  const asHostRef = useRef(false)
  const peelNetAt = useRef(0)

  stateRef.current = state
  selfIdRef.current = selfId
  profileRef.current = { name: name.trim(), color }

  const iAmHost = useCallback(() => {
    const me = selfIdRef.current
    const cur = stateRef.current
    return !!(me && cur && cur.hostId === me)
  }, [])

  const broadcast = useCallback((next: GameState) => {
    sessionRef.current?.send({ t: 'state', state: next })
  }, [])

  const setAndBroadcast = useCallback(
    (next: GameState) => {
      stateRef.current = next
      setState(next)
      if (next.hostId === selfIdRef.current) broadcast(next)
    },
    [broadcast],
  )

  const stopHelloRetry = useCallback(() => {
    if (helloTimerRef.current != null) {
      window.clearInterval(helloTimerRef.current)
      helloTimerRef.current = null
    }
  }, [])

  const sendHello = useCallback(() => {
    const { name: n, color: c } = profileRef.current
    if (!n || !sessionRef.current) return
    sessionRef.current.send({ t: 'hello', name: n, color: c })
  }, [])

  const startHelloRetry = useCallback(() => {
    stopHelloRetry()
    sendHello()
    helloTimerRef.current = window.setInterval(() => {
      const me = selfIdRef.current
      const cur = stateRef.current
      if (me && cur?.players[me]) {
        stopHelloRetry()
        return
      }
      sendHello()
    }, 700)
  }, [sendHello, stopHelloRetry])

  const clearSession = useCallback(async () => {
    stopHelloRetry()
    if (syncTimerRef.current != null) {
      window.clearInterval(syncTimerRef.current)
      syncTimerRef.current = null
    }
    unsubsRef.current.forEach((u) => u())
    unsubsRef.current = []
    const s = sessionRef.current
    sessionRef.current = null
    asHostRef.current = false
    setPeerCount(0)
    setNetHint(null)
    setBrokerReady(false)
    if (s) await s.leave()
  }, [stopHelloRetry])

  const leave = useCallback(async () => {
    await clearSession()
    setSelfId(null)
    setState(null)
    setRoomCode('')
    setView('home')
    setTargetId(null)
  }, [clearSession])

  const enterRoom = useCallback(
    async (code: string, asHost: boolean) => {
      setError(null)
      setNetHint(null)
      const normalized = normalizeRoomCode(code)
      if (!isValidRoomCode(normalized)) {
        setError('Need a 4-character room code.')
        return
      }
      const trimmed = name.trim()
      if (!trimmed) {
        setError('Enter a name first.')
        return
      }

      await clearSession()
      asHostRef.current = asHost

      let session: Session
      try {
        session = createRoomSession({ roomCode: normalized })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open room')
        return
      }

      sessionRef.current = session
      selfIdRef.current = session.selfId
      setSelfId(session.selfId)
      setRoomCode(normalized)
      setView('room')
      setState(null)
      stateRef.current = null
      setBrokerReady(false)
      setNetHint(asHost ? 'Connecting relay…' : 'Connecting relay…')

      unsubsRef.current = [
        session.onMessage((msg: NetMsg, peerId: string) => {
          const me = selfIdRef.current
          if (!me) return
          setPeerCount(session.getPeers().length)

          if (msg.t === 'state') {
            stateRef.current = msg.state
            setState(msg.state)
            setNetHint(null)
            if (msg.state.players[me]) stopHelloRetry()
            else if (!asHostRef.current) startHelloRetry()
            return
          }

          const cur = stateRef.current
          if (!cur || cur.hostId !== me) return

          // Any joiner noise in lobby → push a fresh snapshot.
          if (msg.t === 'ping' || msg.t === 'sync') {
            if (cur.phase === 'lobby') broadcast(cur)
            return
          }

          let next = cur
          if (msg.t === 'hello') {
            if (cur.players[peerId]) {
              broadcast(cur)
              return
            }
            next = addPlayer(cur, blankPlayer(peerId, msg.name, msg.color))
          } else if (msg.t === 'ready') {
            next = engineSetReady(cur, peerId, msg.ready)
          } else if (msg.t === 'start') {
            if (Object.keys(cur.players).length >= 2) next = startRound(cur, Date.now())
          } else if (msg.t === 'peelStart') {
            next = applyPeelStart(
              cur,
              peerId,
              msg.victimId,
              msg.edge,
              msg.mode,
              msg.along,
              Date.now(),
              msg.peelId,
            )
          } else if (msg.t === 'peelUpdate') {
            next = applyPeelUpdate(cur, msg.peelId, msg.amount, msg.along)
          } else if (msg.t === 'peelEnd') {
            next = applyPeelEnd(cur, msg.peelId)
          } else if (msg.t === 'steal') {
            next = applySteal(cur, msg.peelId, msg.itemId)
          } else if (msg.t === 'slam') {
            next = applySlam(cur, msg.peelId, Date.now())
          }
          if (next !== cur) setAndBroadcast(next)
        }),
        session.onPeerJoin(() => {
          setPeerCount(session.getPeers().length)
          if (iAmHost() && stateRef.current?.phase === 'lobby') {
            broadcast(stateRef.current)
          }
        }),
        session.onPeerLeave((peerId) => {
          setPeerCount(session.getPeers().length)
          const cur = stateRef.current
          const me = selfIdRef.current
          if (!cur || !me) return

          if (cur.hostId === me) {
            setAndBroadcast(removePlayer(cur, peerId))
            return
          }

          if (cur.hostId === peerId) {
            const ids = [me, ...session.getPeers()]
            const hostId = electHost(ids)
            if (hostId === me) {
              setAndBroadcast(removePlayer({ ...cur, hostId }, peerId))
            } else {
              setNetHint('Host left — waiting…')
            }
          }
        }),
        session.onJoinError((message) => {
          setNetHint(`Relay issue: ${message}`)
        }),
        session.onConnected(() => {
          setBrokerReady(true)
          setNetHint(
            asHostRef.current
              ? `Relay up (${session.getBrokerCount()}) — share code`
              : `Relay up (${session.getBrokerCount()}) — greeting host…`,
          )
          if (asHostRef.current) {
            if (stateRef.current) broadcast(stateRef.current)
            return
          }
          session.send({ t: 'sync' })
          startHelloRetry()
        }),
      ]

      // Heartbeat + lobby snapshot + hello retry safety net.
      syncTimerRef.current = window.setInterval(() => {
        const s = sessionRef.current
        if (!s?.ready) return
        setPeerCount(s.getPeers().length)
        setNetHint((h) =>
          h?.startsWith('Relay up')
            ? `Relay up (${s.getBrokerCount()})${
                asHostRef.current ? ' — share code' : ' — greeting host…'
              }`
            : h,
        )
        s.send({ t: 'ping' })
        if (!asHostRef.current && !stateRef.current?.players[selfIdRef.current!]) {
          s.send({ t: 'sync' })
        }

        if (iAmHost() && stateRef.current) {
          if (stateRef.current.phase === 'lobby') broadcast(stateRef.current)
          return
        }

        if (!asHostRef.current) {
          const me = selfIdRef.current
          if (!me || !stateRef.current?.players[me]) startHelloRetry()
        }
      }, 1000)

      if (asHost) {
        const seed = (Math.random() * 1e9) | 0
        const lobby = addPlayer(
          createLobbyState(session.selfId, seed),
          blankPlayer(session.selfId, trimmed, color),
        )
        setAndBroadcast(lobby)
      }
    },
    [
      broadcast,
      clearSession,
      color,
      iAmHost,
      name,
      setAndBroadcast,
      startHelloRetry,
      stopHelloRetry,
    ],
  )

  useEffect(() => {
    return () => {
      void clearSession()
    }
  }, [clearSession])

  useEffect(() => {
    if (!selfId || !state || view !== 'room') return
    if (state.hostId !== selfId || state.phase !== 'playing') return
    const id = window.setInterval(() => {
      const cur = stateRef.current
      const me = selfIdRef.current
      if (!cur || !me || cur.phase !== 'playing' || cur.hostId !== me) return
      const next = tickRound(cur, Date.now())
      if (next !== cur) setAndBroadcast(next)
    }, 250)
    return () => clearInterval(id)
  }, [selfId, state?.phase, state?.hostId, view, setAndBroadcast])

  useEffect(() => {
    if (!state || !selfId) return
    const others = Object.keys(state.players).filter((id) => id !== selfId)
    if (!targetId || !state.players[targetId]) {
      setTargetId(others[0] ?? null)
    }
  }, [state, selfId, targetId])

  const sendOrApply = useCallback(
    (local: (s: GameState) => GameState, msg: NetMsg) => {
      if (iAmHost() && stateRef.current) {
        setAndBroadcast(local(stateRef.current))
      } else {
        sessionRef.current?.send(msg)
      }
    },
    [iAmHost, setAndBroadcast],
  )

  const createRoom = useCallback(() => {
    void enterRoom(makeRoomCode(), true)
  }, [enterRoom])

  const joinRoomAction = useCallback(() => {
    void enterRoom(joinInput, false)
  }, [enterRoom, joinInput])

  const toggleReady = useCallback(() => {
    if (!selfId || !state) return
    const ready = !state.players[selfId]?.ready
    sendOrApply((s) => engineSetReady(s, selfId, ready), { t: 'ready', ready })
  }, [selfId, state, sendOrApply])

  const start = useCallback(() => {
    if (!iAmHost() || !state) return
    if (Object.keys(state.players).length < 2) return
    setAndBroadcast(startRound(state, Date.now()))
  }, [iAmHost, state, setAndBroadcast])

  const playAgain = useCallback(() => {
    if (!iAmHost() || !state || !selfId) return
    const players = Object.values(state.players)
    setAndBroadcast(rebuildLobby(state.hostId, players, (Math.random() * 1e9) | 0))
  }, [iAmHost, selfId, state, setAndBroadcast])

  const peelStart = useCallback(
    (victimId: string, edge: Edge, mode: PeelMode, along: number) => {
      if (!selfId) return ''
      const now = Date.now()
      const peelId = `peel-${selfId}-${now}`
      sendOrApply(
        (s) => applyPeelStart(s, selfId, victimId, edge, mode, along, now, peelId),
        { t: 'peelStart', peelId, victimId, edge, mode, along },
      )
      setKickArmed(false)
      return peelId
    },
    [selfId, sendOrApply],
  )

  const peelUpdate = useCallback(
    (peelId: string, amount: number, along: number) => {
      // Host applies immediately; joiner throttles MQTT flood from mouse moves.
      if (iAmHost()) {
        sendOrApply(
          (s) => applyPeelUpdate(s, peelId, amount, along),
          { t: 'peelUpdate', peelId, amount, along },
        )
        return
      }
      const now = performance.now()
      if (now - peelNetAt.current < 45) return
      peelNetAt.current = now
      sessionRef.current?.send({ t: 'peelUpdate', peelId, amount, along })
    },
    [iAmHost, sendOrApply],
  )

  const peelEnd = useCallback(
    (peelId: string) => {
      sendOrApply((s) => applyPeelEnd(s, peelId), { t: 'peelEnd', peelId })
    },
    [sendOrApply],
  )

  const steal = useCallback(
    (peelId: string, itemId: string) => {
      sendOrApply((s) => applySteal(s, peelId, itemId), { t: 'steal', peelId, itemId })
      try {
        navigator.vibrate?.(18)
      } catch {
        /* ignore */
      }
    },
    [sendOrApply],
  )

  const slam = useCallback(
    (peelId: string) => {
      const now = Date.now()
      sendOrApply((s) => applySlam(s, peelId, now), { t: 'slam', peelId })
      try {
        navigator.vibrate?.(30)
      } catch {
        /* ignore */
      }
    },
    [sendOrApply],
  )

  const isHost = !!(selfId && state && state.hostId === selfId)
  const me = selfId && state ? state.players[selfId] : undefined

  return {
    name,
    setName,
    color,
    roomCode,
    joinInput,
    setJoinInput,
    view,
    selfId,
    state,
    me,
    isHost,
    targetId,
    setTargetId,
    kickArmed,
    setKickArmed,
    error,
    peerCount,
    netHint,
    brokerReady,
    createRoom,
    joinRoom: joinRoomAction,
    leave,
    toggleReady,
    start,
    playAgain,
    peelStart,
    peelUpdate,
    peelEnd,
    steal,
    slam,
  }
}

export type GameApi = ReturnType<typeof useGame>
