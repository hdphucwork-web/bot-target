import { useState, useRef, useEffect } from "react";
import type { LogMessage, TaskConfig } from "../types";
import { Trash2 } from "lucide-react";

interface Props {
  logs: LogMessage[];
  onClear: () => void;
  taskFilter: string;
  onFilterChange: (id: string) => void;
  taskIds: string[];
  tasks: TaskConfig[];
}

const LEVEL_COLORS: Record<string, string> = {
  info: "#93c5fd",
  success: "#6ee7b7",
  warn: "#fcd34d",
  error: "#fca5a5",
};

const STATUS_COLORS: Record<string, string> = {
  running: "#3b82f6",
  paused: "#f59e0b",
  success: "#10b981",
  error: "#ef4444",
  idle: "#71717a",
};

export default function LogViewer({ logs, onClear, taskFilter, onFilterChange, taskIds, tasks }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const filtered = taskFilter
    ? logs.filter((l) => l.task_id === taskFilter)
    : logs;

  useEffect(() => {
    if (autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [filtered.length, autoScroll]);

  const getTaskName = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    return task?.task_name || taskId;
  };

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <select value={taskFilter} onChange={(e) => onFilterChange(e.target.value)}>
          <option value="">All Tasks</option>
          {taskIds.map((id) => (
            <option key={id} value={id}>{getTaskName(id)} ({id})</option>
          ))}
        </select>
        <label className="log-checkbox">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          Auto-scroll
        </label>
        <button className="btn btn-small btn-secondary" onClick={onClear}>
          <Trash2 size={14} /> Clear
        </button>
      </div>
      <div className="log-container">
        {filtered.length === 0 ? (
          <div className="log-empty">No logs yet...</div>
        ) : (
          filtered.map((log, i) => (
            <div key={i} className="log-line">
              <span className="log-time">[{log.timestamp || "--:--:--"}]</span>
              <span className="log-task">[{log.task_id}]</span>
              <span
                className="log-level"
                style={{ color: LEVEL_COLORS[log.level] || "#d1d5db" }}
              >
                [{log.level.toUpperCase()}]
              </span>
              <span
                className="log-status"
                style={{ color: STATUS_COLORS[log.status] || "#71717a" }}
              >
                [{log.status || "idle"}]
              </span>
              <span className="log-arrow">-&gt;</span>
              <span className="log-msg">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
