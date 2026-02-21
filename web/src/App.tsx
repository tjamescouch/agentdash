import { useReducer, useState, useCallback } from 'react';
import { DashboardContext } from './context';
import { reducer, initialState } from './reducer';
import { useWebSocket } from './hooks/useWebSocket';
import { useResizable } from './hooks/useResizable';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { MessageFeed } from './components/MessageFeed';
import { RightPanel } from './components/RightPanel';
import { NetworkPulse } from './components/NetworkPulse';
import { LogsPanel } from './components/LogsPanel';
import { SpendPanel } from './components/SpendPanel';
import { ConnectionOverlay } from './components/ConnectionOverlay';
import { LockdownOverlay } from './components/LockdownOverlay';
import { BootSequence } from './components/BootSequence';
import { DropZone, SendFileModal, SaveModal } from './components/FileTransfer';
import { KillSwitchModal } from './components/modals/KillSwitchModal';
import { AgentControlModal } from './components/modals/AgentControlModal';

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const send = useWebSocket(dispatch);
  const sidebar = useResizable(220, 160, 400, 'left');
  const rightPanel = useResizable(280, 200, 500, 'right');
  const logsPanel = useResizable(200, 80, 500, 'bottom');
  const [booted, setBooted] = useState(() => sessionStorage.getItem('agentdash-booted') === '1');

  const handleBootComplete = useCallback(() => setBooted(true), []);

  return (
    <DashboardContext.Provider value={{ state, dispatch, send }}>
      {!booted && <BootSequence onComplete={handleBootComplete} />}
      <div className="vm-window">
        <div className="vm-menubar">
          <span className="vm-menu-item">File</span>
          <span className="vm-menu-item">Edit</span>
          <span className="vm-menu-item">VM</span>
          <span className="vm-menu-item">View</span>
          <span className="vm-menu-item">Help</span>
          <div className="vm-menu-right">
            AgentDash v2.1
          </div>
        </div>
        <div className="vm-tabbar">
          <div className="vm-tab">
            <div className="vm-tab-icon">&#9654;</div>
            <span className="vm-tab-label">AgentChat Network</span>
            <span className={`vm-tab-status ${state.connected ? 'running' : 'stopped'}`}>
              {state.connected ? 'Running' : 'Stopped'}
            </span>
          </div>
        </div>
        <div className="vm-toolbar">
          <button className="vm-toolbar-btn" title="Power On" onClick={() => {}}>&#9211;</button>
          <button className="vm-toolbar-btn" title="Suspend">&#9208;</button>
          <div className="vm-toolbar-sep" />
          <button className="vm-toolbar-btn" title="Snapshot">&#128247;</button>
          <button className="vm-toolbar-btn" title="Settings">&#9881;</button>
          <div className="vm-toolbar-sep" />
          <button
            className="vm-toolbar-btn active"
            title="Agent Control"
            onClick={() => dispatch({ type: 'TOGGLE_AGENT_CONTROL' })}
          >&#128101;</button>
          <span className="vm-toolbar-label">Agents: {Object.values(state.agents).filter(a => a.online).length}</span>
          <div className="vm-toolbar-sep" />
          <button
            className="vm-toolbar-btn danger"
            title="Kill Switch"
            onClick={() => dispatch({ type: 'TOGGLE_KILLSWITCH' })}
          >&#9940;</button>
        </div>
        <div className="vm-content">
          <div className="dashboard">
            <TopBar state={state} dispatch={dispatch} send={send} />
            <div className="content-area">
              <div className="main">
                <Sidebar state={state} dispatch={dispatch} sidebarWidth={sidebar.width} send={send} />
                <div className="resize-handle" ref={sidebar.handleRef} onMouseDown={sidebar.onMouseDown} />
                {state.pulseOpen ? (
                  <NetworkPulse state={state} dispatch={dispatch} />
                ) : (
                  <DropZone state={state} dispatch={dispatch}>
                    <MessageFeed state={state} dispatch={dispatch} send={send} />
                  </DropZone>
                )}
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
          </div>
        </div>
        <div className="vm-statusbar">
          <div className="vm-statusbar-item">
            <div className={`vm-statusbar-dot ${state.connected ? 'green' : 'red'}`} />
            {state.connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="vm-statusbar-item">
            Agents: {Object.values(state.agents).filter(a => a.online).length}
          </div>
          <div className="vm-statusbar-item">
            Channels: {Object.keys(state.channels).length}
          </div>
          <div className="vm-statusbar-right">
            <span>ws://agentchat-server.fly.dev</span>
          </div>
        </div>
        <div className="crt-overlay" />
      </div>
    </DashboardContext.Provider>
  );
}
