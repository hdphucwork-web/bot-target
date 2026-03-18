import { useState, useEffect, useCallback } from "react";
import type { TaskConfig, ProxyEntry } from "./types";
import { getTasks, getProxies, startAllTasks, stopAllTasks } from "./api";
import { useWebSocket } from "./hooks/useWebSocket";
import TaskTable from "./components/TaskTable";
import TaskModal from "./components/TaskModal";
import LogViewer from "./components/LogViewer";
import ProxyManager from "./components/ProxyManager";
import SettingsPanel from "./components/SettingsPanel";
import {
  Plus, PlayCircle, StopCircle, Wifi, WifiOff,
  ListTodo, Globe, Settings, Terminal,
} from "lucide-react";
import "./App.css";

type Tab = "tasks" | "proxies" | "settings";

export default function App() {
  const [tasks, setTasks] = useState<TaskConfig[]>([]);
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [tab, setTab] = useState<Tab>("tasks");
  const [modalTask, setModalTask] = useState<TaskConfig | null | undefined>(undefined);
  // undefined = closed, null = new task, TaskConfig = edit
  const [logFilter, setLogFilter] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const data = await getTasks();
      setTasks(data as unknown as TaskConfig[]);
    } catch {
      // API might be down
    }
  }, []);

  const fetchProxies = useCallback(async () => {
    try {
      const data = await getProxies();
      setProxies(data as unknown as ProxyEntry[]);
    } catch {
      // API might be down
    }
  }, []);

  const handleTaskUpdate = useCallback((taskData: Record<string, unknown>) => {
    const updated = taskData as unknown as TaskConfig;
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [...prev, updated];
    });
  }, []);

  const { logs, connected, clearLogs } = useWebSocket(handleTaskUpdate);

  useEffect(() => {
    fetchTasks();
    fetchProxies();
  }, [fetchTasks, fetchProxies]);

  const handleStartAll = async () => {
    try {
      await startAllTasks();
      fetchTasks();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    }
  };

  const handleStopAll = async () => {
    try {
      await stopAllTasks();
      fetchTasks();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    }
  };

  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo">Target Bot</h1>
          <span className="header-stats">
            {tasks.length} tasks &middot; {runningCount} running
          </span>
        </div>
        <div className="header-right">
          <span className={`ws-status ${connected ? "connected" : "disconnected"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <nav className="tabs">
        <button
          className={`tab ${tab === "tasks" ? "active" : ""}`}
          onClick={() => setTab("tasks")}
        >
          <ListTodo size={16} /> Tasks
        </button>
        <button
          className={`tab ${tab === "proxies" ? "active" : ""}`}
          onClick={() => setTab("proxies")}
        >
          <Globe size={16} /> Proxies ({proxies.length})
        </button>
        <button
          className={`tab ${tab === "settings" ? "active" : ""}`}
          onClick={() => setTab("settings")}
        >
          <Settings size={16} /> Settings
        </button>
      </nav>

      {/* Main Content */}
      <main className="main">
        {tab === "tasks" && (
          <>
            <div className="toolbar">
              <button className="btn btn-primary" onClick={() => setModalTask(null)}>
                <Plus size={14} /> New Task
              </button>
              <button className="btn btn-green" onClick={handleStartAll} disabled={tasks.length === 0}>
                <PlayCircle size={14} /> Start All
              </button>
              <button className="btn btn-red" onClick={handleStopAll} disabled={runningCount === 0}>
                <StopCircle size={14} /> Stop All
              </button>
            </div>

            <TaskTable
              tasks={tasks}
              proxies={proxies}
              onEdit={(task) => setModalTask(task)}
              onRefresh={fetchTasks}
            />
          </>
        )}

        {tab === "proxies" && (
          <ProxyManager proxies={proxies} onRefresh={fetchProxies} />
        )}

        {tab === "settings" && <SettingsPanel />}
      </main>

      {/* Logs Panel (always visible at bottom) */}
      <div className="logs-section">
        <div className="logs-header">
          <Terminal size={16} />
          <span>Live Logs</span>
        </div>
        <LogViewer
          logs={logs}
          onClear={clearLogs}
          taskFilter={logFilter}
          onFilterChange={setLogFilter}
          taskIds={tasks.map((t) => t.id)}
          tasks={tasks}
        />
      </div>

      {/* Task Modal */}
      {modalTask !== undefined && (
        <TaskModal
          task={modalTask}
          proxies={proxies}
          onClose={() => setModalTask(undefined)}
          onSaved={fetchTasks}
        />
      )}
    </div>
  );
}
