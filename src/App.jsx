import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, Copy, Crown, Gamepad2, Link2, LoaderCircle, Radio, RotateCcw, ShieldCheck, Sparkles, Users, Wifi, WifiOff } from 'lucide-react';
import { hasSupabaseConfig, supabase } from './supabaseClient.js';

const CODE_FROM_URL = new URLSearchParams(window.location.search).get('room') || '';
const EMPTY = () => Array(42).fill(0);
const cleanRoom = (data) => Array.isArray(data) ? data[0] : data;
const saveName = (value) => {
  const next = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 18);
  if (next) localStorage.setItem('fourplay-player-name', next);
  return next;
};
const getMessage = (error, fallback = 'Something went wrong. Please try again.') => {
  const message = String(error?.message || fallback).replace(/^.*?\(\d+\):\s*/, '');
  return message.length > 180 ? `${message.slice(0, 177)}…` : message;
};

function Piece({ value, preview = false }) {
  return <span className={`disc ${value === 1 ? 'disc-red' : value === 2 ? 'disc-yellow' : 'disc-empty'} ${preview ? 'disc-preview' : ''}`} />;
}

function Brand() {
  return (
    <div className="brand" aria-label="FourPlay home">
      <div className="brand-mark"><span /><span /><span /><span /></div>
      <span>four<span className="brand-light">play</span></span>
    </div>
  );
}

function SetupScreen() {
  return (
    <main className="page-shell setup-shell">
      <header className="topbar"><Brand /><span className="topbar-note">A little friendly competition</span></header>
      <section className="setup-card">
        <div className="setup-icon"><ShieldCheck size={26} /></div>
        <p className="eyebrow">ONE-TIME SETUP</p>
        <h1>Your game table is almost ready.</h1>
        <p className="lead">Connect this app to a Supabase project to turn on shared rooms and live multiplayer.</p>
        <ol className="setup-list">
          <li><span>01</span><div><strong>Create a Supabase project</strong><p>Use the free tier for a small demo.</p></div></li>
          <li><span>02</span><div><strong>Run the database migration</strong><p>Paste <code>supabase/migrations/001_connect_four.sql</code> into the Supabase SQL Editor and run it.</p></div></li>
          <li><span>03</span><div><strong>Add your public project keys</strong><p>Copy <code>.env.example</code> to <code>.env.local</code> and fill in your project URL and publishable/anon key.</p></div></li>
        </ol>
        <p className="security-note"><ShieldCheck size={16} /> Never put a Supabase service-role key in a browser app.</p>
      </section>
      <footer className="page-footer">FourPlay · Built for good-natured rivalry</footer>
    </main>
  );
}

function App() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('fourplay-player-name') || '');
  const [roomCodeInput, setRoomCodeInput] = useState(CODE_FROM_URL.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8));
  const [room, setRoom] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [connection, setConnection] = useState('connecting');
  const [lastColumn, setLastColumn] = useState(null);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setAuthReady(true);
      return undefined;
    }
    let active = true;
    const init = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        let session = sessionData.session;
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        if (active) setUserId(session?.user?.id || null);
      } catch (error) {
        if (active) setAuthError(getMessage(error, 'Could not create a guest session. Check Supabase Auth settings.'));
      } finally {
        if (active) setAuthReady(true);
      }
    };
    init();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUserId(session?.user?.id || null);
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !room?.id) return undefined;
    setConnection('connecting');
    const channel = supabase
      .channel(`fourplay-room-${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'connect_four_rooms', filter: `id=eq.${room.id}`,
      }, (payload) => {
        setRoom(payload.new);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnection('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnection('reconnecting');
        else if (status === 'CLOSED') setConnection('offline');
      });
    return () => { supabase.removeChannel(channel); };
  }, [room?.id]);

  const notify = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(notify.timeoutId);
    notify.timeoutId = window.setTimeout(() => setNotice(''), 5200);
  }, []);

  const normalizedName = useMemo(() => playerName.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 18), [playerName]);
  const myPiece = room && userId ? (room.host_id === userId ? 1 : room.guest_id === userId ? 2 : 0) : 0;
  const isMyTurn = Boolean(room && myPiece && room.status === 'playing' && room.current_turn === myPiece);
  const board = Array.isArray(room?.board) && room.board.length === 42 ? room.board : EMPTY();
  const hostName = room?.host_name || 'Red player';
  const guestName = room?.guest_name || 'Yellow player';
  const currentPlayerName = room?.current_turn === 1 ? hostName : guestName;
  const inviteUrl = room ? `${window.location.origin}${window.location.pathname}?room=${room.room_code}` : '';
  const winnerName = room?.winner === 1 ? hostName : guestName;

  async function callRpc(name, params) {
    if (!supabase) throw new Error('Supabase is not configured yet.');
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    const result = cleanRoom(data);
    if (!result?.id) throw new Error('The server returned an unexpected response. Check that you ran the SQL migration.');
    return result;
  }

  async function handleCreate(event) {
    event?.preventDefault();
    const name = saveName(normalizedName);
    if (!name) { notify('Add a nickname first.'); return; }
    setBusy(true); setNotice('');
    try {
      const nextRoom = await callRpc('create_room', { p_player_name: name });
      setRoom(nextRoom); setLastColumn(null);
      setRoomCodeInput(nextRoom.room_code);
      window.history.replaceState({}, '', `?room=${nextRoom.room_code}`);
    } catch (error) { notify(getMessage(error, 'Could not create a room.')); }
    finally { setBusy(false); }
  }

  async function handleJoin(event) {
    event?.preventDefault();
    const name = saveName(normalizedName);
    const code = roomCodeInput.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
    if (!name) { notify('Add a nickname first.'); return; }
    if (code.length !== 8) { notify('Enter the 8-character room code.'); return; }
    setBusy(true); setNotice('');
    try {
      const nextRoom = await callRpc('join_room', { p_room_code: code, p_player_name: name });
      setRoom(nextRoom); setLastColumn(null);
      setRoomCodeInput(nextRoom.room_code);
      window.history.replaceState({}, '', `?room=${nextRoom.room_code}`);
    } catch (error) { notify(getMessage(error, 'Could not join that room.')); }
    finally { setBusy(false); }
  }

  async function handleMove(column) {
    if (!room || !isMyTurn || busy) return;
    if (!board.some((value, index) => index % 7 === column && value === 0)) return;
    setBusy(true); setNotice(''); setLastColumn(column);
    try {
      const nextRoom = await callRpc('make_move', { p_room_id: room.id, p_column: column });
      setRoom(nextRoom);
    } catch (error) { notify(getMessage(error, 'Move could not be played.')); }
    finally { setBusy(false); }
  }

  async function handleRematch() {
    if (!room || busy) return;
    setBusy(true); setNotice('');
    try {
      const nextRoom = await callRpc('rematch_room', { p_room_id: room.id });
      setRoom(nextRoom); setLastColumn(null);
    } catch (error) { notify(getMessage(error, 'Could not start a rematch.')); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      notify(`Share this link with your friend: ${inviteUrl}`);
    }
  }

  function backToLobby() {
    setRoom(null); setLastColumn(null); setNotice('');
    window.history.replaceState({}, '', window.location.pathname);
    setRoomCodeInput('');
  }

  if (!hasSupabaseConfig) return <SetupScreen />;

  if (!authReady) {
    return <main className="page-shell loading-shell"><Brand /><LoaderCircle className="spin" size={30} /><p>Setting up your guest seat…</p></main>;
  }

  if (authError || !userId) {
    return (
      <main className="page-shell setup-shell">
        <header className="topbar"><Brand /></header>
        <section className="setup-card error-card">
          <div className="setup-icon"><WifiOff size={26} /></div>
          <p className="eyebrow">CONNECTION SETUP</p>
          <h1>We couldn’t seat you at the table.</h1>
          <p className="lead">{authError || 'A guest session was not created.'}</p>
          <p>In Supabase, open <strong>Authentication → Sign In / Providers</strong> and enable Anonymous Sign-Ins. Then refresh this page.</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>Try again <ArrowRight size={16} /></button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <Brand />
        <div className="topbar-right">
          <span className={`connection-pill ${connection === 'live' ? 'is-live' : ''}`}>
            {connection === 'live' ? <Wifi size={14} /> : connection === 'offline' ? <WifiOff size={14} /> : <Radio size={14} />}
            {connection === 'live' ? 'Live connection' : connection === 'offline' ? 'Offline' : 'Connecting…'}
          </span>
          <span className="topbar-note">A little friendly competition</span>
        </div>
      </header>

      {!room ? (
        <>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow"><Sparkles size={14} /> THE CLASSIC, CONNECTED</div>
              <h1>A little rivalry.<br /><span>From anywhere.</span></h1>
              <p className="lead">Drop a disc, block a win, and see who gets four in a row. Your friend can play from their own device.</p>
              <div className="feature-row"><span><Users size={16} /> 2 players</span><span><Radio size={16} /> Live moves</span><span><Gamepad2 size={16} /> Free to play</span></div>
            </div>
            <div className="hero-board-art" aria-hidden="true">
              <div className="art-board">
                {[1,2,3,4,5,6,7].map((n) => <div className="art-column" key={n}>{[0,1,2,3,4,5].map((r) => {
                  const v = ([[0,1],[1,2],[2,1],[3,2],[3,1],[4,2],[5,1],[6,2],[8,1],[9,2],[10,1],[13,2],[17,1],[22,2],[26,1],[30,2],[34,1],[38,2],[40,1],[41,2]]).find(([i]) => i === (r * 7 + n - 1))?.[1] || 0;
                  return <div className={`art-hole ${v ? `art-disc-${v}` : ''}`} key={r} />;
                })}</div>)}
              </div>
              <div className="art-sticker"><Crown size={17} /> YOUR MOVE</div>
            </div>
          </section>

          <section className="lobby-section">
            <div className="section-heading"><div><p className="eyebrow">YOUR NEXT MOVE</p><h2>Start a game</h2></div><span className="section-step">01 / 01</span></div>
            <div className="name-field"><label htmlFor="player-name">Your nickname</label><input id="player-name" value={playerName} onChange={(e) => setPlayerName(e.target.value.slice(0, 18))} maxLength={18} placeholder="e.g. StarPlayer" autoComplete="nickname" /><span>{normalizedName.length}/18</span></div>
            <div className="lobby-grid">
              <form className="lobby-card lobby-create" onSubmit={handleCreate}>
                <div className="card-topline"><span className="card-icon"><Sparkles size={18} /></span><span className="card-tag">HOST A GAME</span></div>
                <h3>Make the first move.</h3>
                <p>Start a private room, then send your friend the code or invite link.</p>
                <div className="mini-preview"><div className="mini-disc mini-red" /><div className="mini-disc mini-yellow" /><div className="mini-disc mini-red" /><div className="mini-disc mini-empty" /><div className="mini-disc mini-yellow" /><div className="mini-disc mini-empty" /><div className="mini-disc mini-empty" /></div>
                <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <><span>Create a room</span><ArrowRight size={17} /></>}</button>
              </form>

              <form className="lobby-card lobby-join" onSubmit={handleJoin}>
                <div className="card-topline"><span className="card-icon card-icon-yellow"><Link2 size={18} /></span><span className="card-tag">JOIN A FRIEND</span></div>
                <h3>Got a room code?</h3>
                <p>Enter the 8-character code your friend shared with you.</p>
                <label htmlFor="room-code" className="sr-only">Room code</label>
                <input id="room-code" className="room-code-input" value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 8))} placeholder="AB12CD34" maxLength={8} autoCapitalize="characters" autoComplete="off" />
                <button className="button button-secondary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <><span>Join game</span><ArrowRight size={17} /></>}</button>
              </form>
            </div>
            <div className="rules-strip"><div className="rules-icon"><Check size={17} /></div><p><strong>Know the goal.</strong> Take turns dropping discs. First to connect four horizontally, vertically, or diagonally wins. Fill the board with no winner? It’s a draw.</p></div>
          </section>
        </>
      ) : (
        <section className="game-page">
          <div className="game-heading-row">
            <button className="back-button" onClick={backToLobby}><ArrowLeft size={16} /> <span>Leave table</span></button>
            <div className="room-chip"><span>ROOM</span><strong>{room.room_code}</strong><button onClick={copyInvite} title="Copy invite link" aria-label="Copy invite link">{copied ? <Check size={15} /> : <Copy size={15} />}</button></div>
          </div>
          <div className="game-title-row">
            <div><p className="eyebrow"><span className="live-dot" /> {room.status === 'waiting' ? 'ROOM OPEN' : room.status === 'playing' ? 'MATCH IN PROGRESS' : 'MATCH COMPLETE'}</p><h1>{room.status === 'waiting' ? 'Your table is set.' : room.status === 'won' ? 'Four in a row.' : room.status === 'draw' ? 'Dead heat.' : 'Make it count.'}</h1><p className="lead">{room.status === 'waiting' ? 'Invite a friend to take the other seat.' : room.status === 'won' ? `${winnerName} takes this round.` : room.status === 'draw' ? 'No four in a row this time. Nicely matched.' : isMyTurn ? 'You’re up. Pick a column.' : `${currentPlayerName} is up. Watch for an opening.`}</p></div>
            <div className="round-mark"><span>ROUND</span><strong>01</strong><span>CONNECT FOUR</span></div>
          </div>

          {room.status === 'waiting' ? (
            <div className="waiting-card">
              <div className="waiting-illustration"><div className="waiting-ring"><Users size={31} /></div><span className="waiting-orbit orbit-one" /><span className="waiting-orbit orbit-two" /></div>
              <p className="eyebrow">ONE SEAT LEFT</p><h2>Waiting for your opponent</h2><p>Send them the room code or invite link. When they join, the game starts automatically.</p>
              <div className="share-code"><span>{room.room_code}</span><button onClick={copyInvite}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Copied' : 'Copy invite link'}</button></div>
              <div className="waiting-hint"><LoaderCircle size={15} className="spin" /> This room stays open while you wait.</div>
            </div>
          ) : (
            <div className="play-layout">
              <section className="board-card">
                <div className="players-row">
                  <div className={`player-chip ${myPiece === 1 ? 'player-me' : ''}`}>
                    <Piece value={1} /><div><strong>{hostName}</strong><span>{myPiece === 1 ? 'YOU · RED' : 'RED PLAYER'}</span></div>{room.current_turn === 1 && room.status === 'playing' && <span className="turn-arrow"><ArrowDown size={14} /></span>}
                  </div>
                  <div className="versus">VS</div>
                  <div className={`player-chip player-chip-right ${myPiece === 2 ? 'player-me' : ''}`}>
                    {room.current_turn === 2 && room.status === 'playing' && <span className="turn-arrow"><ArrowDown size={14} /></span>}<Piece value={2} /><div><strong>{guestName}</strong><span>{myPiece === 2 ? 'YOU · YELLOW' : 'YELLOW PLAYER'}</span></div>
                  </div>
                </div>
                <div className={`turn-banner ${room.status !== 'playing' ? 'turn-banner-finished' : isMyTurn ? 'turn-banner-mine' : ''}`} aria-live="polite">
                  <span className="turn-banner-dot" />
                  {room.status === 'won' ? (myPiece === room.winner ? 'YOU WON THIS ROUND' : `${winnerName.toUpperCase()} WON THIS ROUND`) : room.status === 'draw' ? 'IT’S A DRAW' : isMyTurn ? 'YOUR TURN — PICK A COLUMN' : `${currentPlayerName.toUpperCase()} IS THINKING`}
                </div>
                <div className={`board-wrap ${!isMyTurn || room.status !== 'playing' ? 'board-not-turn' : ''}`}>
                  <div className="board-column-labels" aria-hidden="true">{[1,2,3,4,5,6,7].map((n) => <span key={n}>{n}</span>)}</div>
                  <div className="connect-board" role="group" aria-label="Connect Four board, seven columns and six rows">
                    {[0,1,2,3,4,5,6].map((col) => {
                      const isFull = !board.some((value, index) => index % 7 === col && value === 0);
                      return <button key={col} type="button" className={`board-column ${lastColumn === col ? 'column-last' : ''}`} onClick={() => handleMove(col)} disabled={!isMyTurn || busy || isFull} aria-label={`Drop a disc in column ${col + 1}${isFull ? ', full' : ''}`}>
                        {Array.from({ length: 6 }, (_, row) => {
                          const value = board[row * 7 + col];
                          return <span className={`board-slot ${value === 1 ? 'slot-red' : value === 2 ? 'slot-yellow' : ''}`} key={row}><Piece value={value} /></span>;
                        })}
                      </button>;
                    })}
                  </div>
                  <div className="board-footnote"><span><span className="footnote-dot red-dot" /> Red goes first</span><span>Choose a column to drop</span></div>
                </div>
                {room.status === 'playing' && !isMyTurn && <p className="under-board-note">Your turn will light up when the other player has moved.</p>}
                {room.status === 'playing' && isMyTurn && <p className="under-board-note">Tip: block their line before it reaches four.</p>}
                {(room.status === 'won' || room.status === 'draw') && <button className="button button-primary rematch-button" onClick={handleRematch} disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <RotateCcw size={17} />} <span>Play a rematch</span></button>}
              </section>

              <aside className="game-sidebar">
                <div className="side-card invite-card">
                  <div className="side-card-icon"><Link2 size={17} /></div><p className="eyebrow">PLAY TOGETHER</p><h3>Bring a friend in.</h3><p>They can join from another device. No account signup required.</p>
                  <div className="invite-code-label">YOUR ROOM CODE</div><div className="invite-code-row"><strong>{room.room_code}</strong><button title="Copy invite link" onClick={copyInvite} aria-label="Copy invite link">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
                  <button className="button button-secondary button-full" onClick={copyInvite}>{copied ? 'Invite link copied' : 'Copy invite link'}</button>
                  <div className="side-divider" />
                  <div className="side-status"><span className={`status-indicator ${room.guest_id ? 'status-ready' : ''}`} /><div><strong>{room.guest_id ? 'Both seats filled' : 'Waiting on player 2'}</strong><span>{room.guest_id ? 'The match is connected' : 'Share the invite to get started'}</span></div></div>
                </div>
                <div className="side-card rules-card"><div className="rules-card-title"><Gamepad2 size={17} /><h3>How to win</h3></div><div className="rule-line"><span className="rule-symbol">4×</span><p>Connect four discs in a row.</p></div><div className="rule-line"><span className="rule-symbol rule-symbol-arrows">↔↕↗</span><p>Horizontal, vertical, or diagonal all count.</p></div><div className="rule-line"><span className="rule-symbol">⇄</span><p>Take turns. Red starts each round.</p></div></div>
              </aside>
            </div>
          )}
          <footer className="page-footer">FourPlay · A good game is better shared <span>·</span> <button onClick={backToLobby}>Back to lobby</button></footer>
        </section>
      )}

      {notice && <div role="status" aria-live="polite" className="toast"><span className="toast-mark">!</span><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      <footer className="global-footer"><span>FOURPLAY © 2026</span><span>MADE FOR THE REMATCH</span></footer>
    </main>
  );
}

export default App;
