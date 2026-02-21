import { useReducer, useState, useCallback, useEffect } from 'react';
import type { Toast, DashboardState as DashboardStateType, DashboardAction as DashboardActionType } from './types';
import { DashboardContext } from './context';
import { reducer, initialState } from './reducer';
import { useWebSocket } from './hooks/useWebSocket';
import { useResizable } from './hooks/useResizable';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { MessageFeed } from './components/MessageFeed';
import { RightPanel } from './components/RightPanel';
import { LogsPanel } from './components/LogsPanel';
import { SpendPanel } from './components/SpendPanel';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { LockdownOverlay } from './components/LockdownOverlay';
import { DropZone, SendFileModal, SaveModal } from './components/FileTransfer';
import { KillSwitchModal } from './components/modals/KillSwitchModal';
import { AgentControlModal } from './components/modals/AgentControlModal';


// ============ Toast Notifications ============

function ToastContainer({ state, dispatch }: { state: DashboardStateType; dispatch: React.Dispatch<DashboardActionType> }) {
  // Auto-dismiss toasts
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    state.toasts.forEach(toast => {
      if (toast.duration > 0) {
        const remaining = toast.duration - (Date.now() - toast.ts);
        if (remaining <= 0) {
          dispatch({ type: 'DISMISS_TOAST', id: toast.id });
        } else {
          timers.push(setTimeout(() => {
            dispatch({ type: 'DISMISS_TOAST', id: toast.id });
          }, remaining));
        }
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [state.toasts, dispatch]);

  if (state.toasts.length === 0) return null;

  const iconMap: Record<Toast['type'], string> = {
    info: '\u2139',
    success: '\u2713',
    warning: '\u26A0',
    error: '\u2717'
  };

  return (
    <div className="toast-container">
      {state.toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => dispatch({ type: 'DISMISS_TOAST', id: toast.id })}
        >
          <span className="toast-icon">{iconMap[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close">&times;</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const send = useWebSocket(dispatch);
  const sidebar = useResizable(220, 160, 400, 'left');
  const rightPanel = useResizable(280, 200, 500, 'right');
  const logsPanel = useResizable(200, 80, 500, 'bottom');

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't fire shortcuts when typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

      // Alt+1..9: switch channel by index
      if (e.altKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const channels = Object.values(state.channels);
        const idx = parseInt(e.key) - 1;
        if (channels[idx]) {
          dispatch({ type: 'SELECT_CHANNEL', channel: channels[idx].name });
        }
        return;
      }

      // Alt+L: toggle logs
      if (e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_LOGS' });
        return;
      }

      // Alt+K: toggle kill switch
      if (e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_KILLSWITCH' });
        return;
      }

      // Alt+S: focus message input
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const textarea = document.querySelector('.input-bar textarea') as HTMLTextAreaElement;
        textarea?.focus();
        return;
      }

      // Alt+←/→: prev/next channel
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const channels = Object.values(state.channels);
        if (channels.length === 0) return;
        const currentIdx = channels.findIndex(c => c.name === state.selectedChannel);
        let nextIdx: number;
        if (e.key === 'ArrowRight') {
          nextIdx = (currentIdx + 1) % channels.length;
        } else {
          nextIdx = (currentIdx - 1 + channels.length) % channels.length;
        }
        dispatch({ type: 'SELECT_CHANNEL', channel: channels[nextIdx].name });
        return;
      }

      // Escape: close modals/panels (only when not in input)
      if (e.key === 'Escape' && !isInput) {
        if (state.killSwitchOpen) {
          dispatch({ type: 'TOGGLE_KILLSWITCH' });
        } else if (state.sendModal) {
          dispatch({ type: 'HIDE_SEND_MODAL' });
        } else if (state.saveModal) {
          dispatch({ type: 'HIDE_SAVE_MODAL' });
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.channels, state.selectedChannel, state.killSwitchOpen, state.sendModal, state.saveModal, dispatch]);

  return (
    <DashboardContext.Provider value={{ state, dispatch, send }}>
      <div className="app-shell">
        <div className="dashboard">
          <TopBar state={state} dispatch={dispatch} send={send} />
          <div className="content-area">
            <div className="main">
              <Sidebar state={state} dispatch={dispatch} sidebarWidth={sidebar.width} send={send} />
              <div className="resize-handle" ref={sidebar.handleRef} onMouseDown={sidebar.onMouseDown} />
              <DropZone state={state} dispatch={dispatch}>
                <MessageFeed state={state} dispatch={dispatch} send={send} />
              </DropZone>
              <div className="resize-handle" ref={rightPanel.handleRef} onMouseDown={rightPanel.onMouseDown} />
              <RightPanel state={state} dispatch={dispatch} send={send} panelWidth={rightPanel.width} />
            </div>
            {state.logsOpen && (
              <>
                <div className="resize-handle-h" ref={logsPanel.handleRef} onMouseDown={logsPanel.onMouseDown} />
                <div style={{ height: logsPanel.width }}>
                  <LogsPanel state={state} dispatch={dispatch} />
                </div>
              </>
            )}
            {state.spendOpen && (
              <>
                <div className="resize-handle-h" ref={logsPanel.handleRef} onMouseDown={logsPanel.onMouseDown} />
                <div style={{ height: logsPanel.width }}>
                  <SpendPanel state={state} dispatch={dispatch} send={send} />
                </div>
              </>
            )}
          </div>
          <SendFileModal state={state} dispatch={dispatch} send={send} />
          <SaveModal state={state} dispatch={dispatch} send={send} />
          <KillSwitchModal state={state} dispatch={dispatch} />
          <AgentControlModal state={state} dispatch={dispatch} send={send} />
          <LockdownOverlay state={state} />
          <ConnectionOverlay state={state} />
          <ToastContainer state={state} dispatch={dispatch} />
        </div>
      </div>
    </DashboardContext.Provider>
  );
}
