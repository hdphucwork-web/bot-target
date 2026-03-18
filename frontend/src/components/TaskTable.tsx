import type { TaskConfig, ProxyEntry } from "../types";
import {
  Play, Square, Pause, PlayCircle, Edit, Trash2, RotateCcw,
} from "lucide-react";
import { startTask, stopTask, pauseTask, resumeTask, deleteTask } from "../api";

interface Props {
  tasks: TaskConfig[];
  proxies: ProxyEntry[];
  onEdit: (task: TaskConfig) => void;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "#6b7280",
  running: "#3b82f6",
  paused: "#f59e0b",
  success: "#10b981",
  error: "#ef4444",
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  success: "Success",
  error: "Error",
};

export default function TaskTable({ tasks, proxies, onEdit, onRefresh }: Props) {
  const getProxyLabel = (proxyId: string | null) => {
    if (!proxyId) return "None";
    const p = proxies.find((px) => px.id === proxyId);
    return p ? `${p.host}:${p.port}` : "Unknown";
  };

  const handleAction = async (action: () => Promise<unknown>) => {
    try {
      await action();
      onRefresh();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <p>No tasks yet. Click "New Task" to create one.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Product URL</th>
            <th>Qty</th>
            <th>Proxy</th>
            <th>Delay</th>
            <th>Status</th>
            <th>Last Log</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="td-name">{task.task_name || task.id}</td>
              <td className="td-url" title={task.product_url}>
                {task.product_url
                  ? task.product_url.replace(/^https?:\/\/[^/]+/, "").slice(0, 40) + "..."
                  : "—"}
              </td>
              <td>{task.quantity}</td>
              <td>{getProxyLabel(task.proxy_id)}</td>
              <td>{task.reload_delay_ms}ms</td>
              <td>
                <span
                  className="status-badge"
                  style={{ backgroundColor: STATUS_COLORS[task.status] || "#6b7280" }}
                >
                  {STATUS_LABELS[task.status] || task.status}
                </span>
              </td>
              <td className="td-log" title={task.last_log}>
                {task.last_log?.slice(0, 50) || "—"}
              </td>
              <td className="td-actions">
                {task.status === "idle" || task.status === "error" || task.status === "success" ? (
                  <button
                    className="btn-icon btn-green"
                    title="Start"
                    onClick={() => handleAction(() => startTask(task.id))}
                  >
                    <Play size={16} />
                  </button>
                ) : null}

                {task.status === "running" ? (
                  <>
                    <button
                      className="btn-icon btn-yellow"
                      title="Pause"
                      onClick={() => handleAction(() => pauseTask(task.id))}
                    >
                      <Pause size={16} />
                    </button>
                    <button
                      className="btn-icon btn-red"
                      title="Stop"
                      onClick={() => handleAction(() => stopTask(task.id))}
                    >
                      <Square size={16} />
                    </button>
                  </>
                ) : null}

                {task.status === "paused" ? (
                  <>
                    <button
                      className="btn-icon btn-green"
                      title="Resume"
                      onClick={() => handleAction(() => resumeTask(task.id))}
                    >
                      <PlayCircle size={16} />
                    </button>
                    <button
                      className="btn-icon btn-red"
                      title="Stop"
                      onClick={() => handleAction(() => stopTask(task.id))}
                    >
                      <Square size={16} />
                    </button>
                  </>
                ) : null}

                {task.status === "error" ? (
                  <button
                    className="btn-icon btn-blue"
                    title="Retry"
                    onClick={() => handleAction(() => startTask(task.id))}
                  >
                    <RotateCcw size={16} />
                  </button>
                ) : null}

                <button
                  className="btn-icon"
                  title="Edit"
                  onClick={() => onEdit(task)}
                  disabled={task.status === "running"}
                >
                  <Edit size={16} />
                </button>

                <button
                  className="btn-icon btn-red"
                  title="Delete"
                  onClick={() => {
                    if (confirm("Delete this task?")) {
                      handleAction(() => deleteTask(task.id));
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
