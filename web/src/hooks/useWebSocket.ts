import { getOrCreateIdentity } from '../identity';
import { useState, useEffect, useRef } from 'react';
import type { DashboardAction, WsSendFn } from '../types';
import { getSavedChannels } from '../reducer';

export function useWebSocket(dispatch: React.Dispatch<DashboardAction>): WsSendFn {
  const ws = useRef<WebSocket | null>(null);
  const [send, setSend] = useState<WsSendFn>(() => () => {});

  useEffect(() => {
    const wsUrl = import.meta.env.DEV
      ? 'ws://localhost:3000/ws'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

    let reconnectDelay = 2000;

    function connect() {
      dispatch({ type: 'CONNECTING' });
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        reconnectDelay = 2000;
        const savedMode = localStorage.getItem('dashboardMode');

        // Always ensure identity exists before connecting in participate mode
        if (savedMode && savedMode !== 'lurk') {
          const storedNick = localStorage.getItem('dashboardNick');

          getOrCreateIdentity().then(identity => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify({
                type: 'set_mode',
                data: {
                  mode: savedMode,
                  nick: storedNick || undefined,
                  identity
                }
              }));
            }
          }).catch(err => {
            console.error('Failed to generate identity:', err);
            // Fall back to lurk mode if crypto fails
            localStorage.setItem('dashboardMode', 'lurk');
          });
        }
      };

      ws.current.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'ping') {
          ws.current!.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        switch (msg.type) {
          case 'state_sync': {
            dispatch({ type: 'STATE_SYNC', data: msg.data });
            const serverChannels = new Set((msg.data.channels || []).map((c: { name: string }) => c.name));
            const saved = getSavedChannels();
            for (const ch of saved) {
              if (!serverChannels.has(ch)) {
                ws.current?.send(JSON.stringify({ type: 'join_channel', data: { channel: ch } }));
              }
            }
            break;
          }
          case 'connected':
            dispatch({ type: 'CONNECTED', data: msg.data });
            dispatch({ type: 'ADD_TOAST', toast: { message: 'Connected to AgentChat', type: 'success', duration: 3000 } });
            break;
          case 'disconnected':
            dispatch({ type: 'DISCONNECTED' });
            dispatch({ type: 'ADD_TOAST', toast: { message: 'Disconnected from server', type: 'warning', duration: 5000 } });
            break;
          case 'message':
            dispatch({ type: 'MESSAGE', data: msg.data });
            break;
          case 'agent_update':
            dispatch({ type: 'AGENT_UPDATE', data: msg.data });
            break;
          case 'agents_update':
            dispatch({ type: 'AGENTS_BULK_UPDATE', data: msg.data });
            break;
          case 'channel_update':
            dispatch({ type: 'CHANNELS_BULK_UPDATE', data: msg.data });
            break;
          case 'proposal_update':
            dispatch({ type: 'PROPOSAL_UPDATE', data: msg.data });
            break;
          case 'dispute_update':
            dispatch({ type: 'DISPUTE_UPDATE', data: msg.data });
            break;
          case 'leaderboard_update':
            dispatch({ type: 'LEADERBOARD_UPDATE', data: msg.data });
            break;
          case 'token_usage':
            dispatch({ type: 'TOKEN_USAGE_UPDATE', data: msg.data });
            break;
          case 'skills_update':
            dispatch({ type: 'SKILLS_UPDATE', data: msg.data });
            break;
          case 'typing':
            dispatch({ type: 'TYPING', data: msg.data });
            break;
          case 'mode_changed':
            dispatch({ type: 'SET_MODE', mode: msg.data.mode });
            break;
          case 'session_identity':
            dispatch({ type: 'SET_DASHBOARD_AGENT', data: msg.data });
            break;
          case 'nick_changed':
            dispatch({ type: 'NICK_CHANGED', nick: msg.data.nick });
            break;
          case 'file_offer':
            dispatch({
              type: 'TRANSFER_UPDATE',
              data: {
                id: msg.data.transferId,
                direction: 'in',
                files: msg.data.files,
                totalSize: msg.data.totalSize,
                status: 'offered',
                progress: 0,
                peer: msg.data.from,
                peerNick: msg.data.fromNick
              }
            });
            break;
          case 'transfer_progress': {
            const existing = msg.data.transferId;
            dispatch({
              type: 'TRANSFER_UPDATE',
              data: {
                id: existing,
                direction: msg.data.recipient ? 'out' : 'in',
                files: [],
                totalSize: 0,
                status: 'transferring',
                progress: msg.data.progress || Math.round(((msg.data.sent || msg.data.received) / msg.data.total) * 100),
                peer: msg.data.recipient || '',
                peerNick: ''
              }
            });
            break;
          }
          case 'transfer_complete':
            dispatch({
              type: 'SHOW_SAVE_MODAL',
              data: { transferId: msg.data.transferId, files: msg.data.files }
            });
            dispatch({
              type: 'TRANSFER_UPDATE',
              data: {
                id: msg.data.transferId,
                direction: 'in',
                files: msg.data.files,
                totalSize: msg.data.totalSize,
                status: 'complete',
                progress: 100,
                peer: '',
                peerNick: ''
              }
            });
            dispatch({ type: 'ADD_TOAST', toast: { message: `File transfer complete: ${msg.data.files?.length || 0} file(s)`, type: 'success', duration: 4000 } });
            break;
          case 'transfer_update':
          case 'offer_sent':
          case 'transfer_sent':
            break;
          case 'save_complete':
            dispatch({ type: 'HIDE_SAVE_MODAL' });
            break;
          case 'log':
            dispatch({ type: 'LOG', data: msg.data });
            break;
          case 'log_history':
            dispatch({ type: 'LOG_HISTORY', data: msg.data });
            break;
          case 'spend':
            dispatch({ type: 'SPEND', data: msg.data });
            break;
          case 'lockdown':
            dispatch({ type: 'LOCKDOWN' });
            dispatch({ type: 'ADD_TOAST', toast: { message: 'LOCKDOWN ACTIVATED', type: 'error', duration: 0 } });
            break;
          case 'error':
            console.error('Server error:', msg.data?.code, msg.data?.message);
            if (msg.data?.code === 'LURK_MODE') {
              dispatch({ type: 'SET_MODE', mode: 'lurk' });
              dispatch({ type: 'ADD_TOAST', toast: { message: 'Switched to lurk mode', type: 'info', duration: 3000 } });
            } else if (msg.data?.code === 'NOT_ALLOWED') {
              dispatch({ type: 'CONNECTION_ERROR', error: msg.data?.message || 'Connection rejected by server' });
              dispatch({ type: 'ADD_TOAST', toast: { message: msg.data?.message || 'Connection rejected', type: 'error', duration: 6000 } });
            } else {
              dispatch({ type: 'ADD_TOAST', toast: { message: msg.data?.message || 'Server error', type: 'error', duration: 5000 } });
            }
            break;
        }
      };

      ws.current.onerror = () => {
        dispatch({ type: 'CONNECTION_ERROR', error: 'Connection failed \u2014 is the server running?' });
      };

      ws.current.onclose = () => {
        dispatch({ type: 'DISCONNECTED' });
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
      };

      setSend(() => (msg: Record<string, unknown>) => {
        if (ws.current?.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify(msg));
        } else {
          console.warn('WebSocket not ready, buffering message');
          // Wait for next tick and retry once
          setTimeout(() => {
            if (ws.current?.readyState === WebSocket.OPEN) {
              ws.current.send(JSON.stringify(msg));
            } else {
              console.error('WebSocket still not ready after retry');
              dispatch({ type: 'ADD_TOAST', toast: { message: 'Connection lost — message not sent', type: 'error', duration: 3000 } });
            }
          }, 100);
        }
      });
    }

    connect();
    return () => ws.current?.close();
  }, [dispatch]);

  return send;
}
