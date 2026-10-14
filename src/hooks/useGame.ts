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

  const sessionRef = useRef<Session | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const selfIdRef = useRef<string | null>(null)
  const hostRef = useRef(false)
  const unsubsRef = useRef<(() => void)[]>([])

  stateRef.current = state
  selfIdRef.current = selfId

  const broadcast = useCallback((next: GameState) => {
    sessionRef.current?.send({ t: 'state', state: next })
  }, [])

  const setAndBroadcast = useCallback(
    (next: GameState) => {
      stateRef.current = next
      setState(next)
      if (hostRef.current) broadcast(next)
    },
    [broadcast],
  )

  const refreshHost = useCallback(() => {
    const session = sessionRef.current
    const id = selfIdRef.current
    if (!session || !id) return false
    const ids = [id, ...session.getPeers()]
    const hostId = electHost(ids)
    const wasHost = hostRef.current
    hostRef.current = hostId === id
    if (hostRef.current && stateRef.current && stateRef.current.hostId !== hostId) {
      setAndBroadcast({ ...stateRef.current, hostId })
    } else if (hostRef.current && !wasHost && stateRef.current) {
      broadcast(stateRef.current)
    }
    return hostRef.current
  }, [broadcast, setAndBroadcast])

  const clearSession = useCallback(async () => {
    unsubsRef.current.forEach((u) => u())
    unsubsRef.current = []
    const s = sessionRef.current
    sessionRef.current = null
    hostRef.current = false
    if (s) await s.leave()
  }, [])

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
      const session = createRoomSession({ roomCode: normalized })
      sessionRef.current = session
      selfIdRef.current = session.selfId
      setSelfId(session.selfId)
      setRoomCode(normalized)
      setView('room')

      unsubsRef.current = [
        session.onMessage((msg: NetMsg, peerId: string) => {
          const cur = stateRef.current
          const me = selfIdRef.current
          if (!me) return

          if (msg.t === 'state') {
            stateRef.current = msg.state
            hostRef.current = msg.state.hostId === me
            setState(msg.state)
            return
          }

          if (!hostRef.current || !cur) return

          let next = cur
          if (msg.t === 'hello') {
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
          refreshHost()
          if (hostRef.current && stateRef.current) broadcast(stateRef.current)
        }),
        session.onPeerLeave((peerId) => {
          refreshHost()
          if (hostRef.current && stateRef.current) {
            setAndBroadcast(removePlayer(stateRef.current, peerId))
          }
        }),
      ]

      if (asHost) {
        hostRef.current = true
        const seed = (Math.random() * 1e9) | 0
        const lobby = addPlayer(
          createLobbyState(session.selfId, seed),
          blankPlayer(session.selfId, trimmed, color),
        )
        setAndBroadcast(lobby)
      } else {
        hostRef.current = false
        session.send({ t: 'hello', name: trimmed, color })
      }
    },
    [broadcast, clearSession, color, name, refreshHost, setAndBroadcast],
  )

  useEffect(() => {
    return () => {
      void clearSession()
    }
  }, [clearSession])

  useEffect(() => {
    if (!selfId || !state || view !== 'room') return
    if (!hostRef.current || state.phase !== 'playing') return
    const id = window.setInterval(() => {
      const cur = stateRef.current
      if (!cur || cur.phase !== 'playing' || !hostRef.current) return
      const next = tickRound(cur, Date.now())
      if (next !== cur) setAndBroadcast(next)
    }, 250)
    return () => clearInterval(id)
  }, [selfId, state?.phase, view, setAndBroadcast])

  useEffect(() => {
    if (!state || !selfId) return
    const others = Object.keys(state.players).filter((id) => id !== selfId)
    if (!targetId || !state.players[targetId]) {
      setTargetId(others[0] ?? null)
    }
  }, [state, selfId, targetId])

  const sendOrApply = useCallback(
    (local: (s: GameState) => GameState, msg: NetMsg) => {
      if (hostRef.current && stateRef.current) {
        setAndBroadcast(local(stateRef.current))
      } else {
        sessionRef.current?.send(msg)
      }
    },
    [setAndBroadcast],
  )

  const createRoom = useCallback(() => {
    void enterRoom(makeRoomCode(), true)
  }, [enterRoom])

  const joinRoom = useCallback(() => {
    void enterRoom(joinInput, false)
  }, [enterRoom, joinInput])

  const toggleReady = useCallback(() => {
    if (!selfId || !state) return
    const ready = !state.players[selfId]?.ready
    sendOrApply((s) => engineSetReady(s, selfId, ready), { t: 'ready', ready })
  }, [selfId, state, sendOrApply])

  const start = useCallback(() => {
    if (!hostRef.current || !state) return
    if (Object.keys(state.players).length < 2) return
    setAndBroadcast(startRound(state, Date.now()))
  }, [state, setAndBroadcast])

  const playAgain = useCallback(() => {
    if (!hostRef.current || !state || !selfId) return
    const players = Object.values(state.players)
    const hostId = electHost([selfId, ...(sessionRef.current?.getPeers() ?? [])])
    setAndBroadcast(rebuildLobby(hostId, players, (Math.random() * 1e9) | 0))
  }, [selfId, state, setAndBroadcast])

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
      sendOrApply(
        (s) => applyPeelUpdate(s, peelId, amount, along),
        { t: 'peelUpdate', peelId, amount, along },
      )
    },
    [sendOrApply],
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
    createRoom,
    joinRoom,
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
