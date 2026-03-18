import { useState, type ReactNode } from "react";
import type { ProxyEntry } from "../types";
import {
  addProxy, addProxiesBulk, deleteProxy, testProxy, testAllProxies,
} from "../api";
import {
  Plus, Trash2, Zap, ZapOff, HelpCircle, RefreshCw,
} from "lucide-react";

interface Props {
  proxies: ProxyEntry[];
  onRefresh: () => void;
}

const STATUS_ICON: Record<string, ReactNode> = {
  alive: <Zap size={14} className="text-green" />,
  dead: <ZapOff size={14} className="text-red" />,
  untested: <HelpCircle size={14} className="text-gray" />,
};

export default function ProxyManager({ proxies, onRefresh }: Props) {
  const [input, setInput] = useState("");
  const [testing, setTesting] = useState(false);

  const handleAdd = async () => {
    const lines = input.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    try {
      if (lines.length === 1) {
        await addProxy(lines[0]);
      } else {
        await addProxiesBulk(lines);
      }
      setInput("");
      onRefresh();
    } catch (err) {
      alert("Error adding proxy: " + (err instanceof Error ? err.message : err));
    }
  };

  const handleTestAll = async () => {
    setTesting(true);
    try {
      await testAllProxies();
      onRefresh();
    } catch (err) {
      alert("Error testing proxies: " + (err instanceof Error ? err.message : err));
    } finally {
      setTesting(false);
    }
  };

  const handleTestOne = async (id: string) => {
    try {
      await testProxy(id);
      onRefresh();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProxy(id);
      onRefresh();
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    }
  };

  return (
    <div className="proxy-manager">
      <div className="proxy-add">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"Add proxies (one per line)\nFormat: IP:Port or IP:Port:User:Pass"}
          rows={3}
        />
        <div className="proxy-add-actions">
          <button className="btn btn-primary" onClick={handleAdd}>
            <Plus size={14} /> Add
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleTestAll}
            disabled={testing || proxies.length === 0}
          >
            <RefreshCw size={14} className={testing ? "spin" : ""} />
            {testing ? "Testing..." : "Test All"}
          </button>
        </div>
      </div>

      {proxies.length === 0 ? (
        <div className="empty-state">
          <p>No proxies added yet.</p>
        </div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Host</th>
                <th>Port</th>
                <th>Username</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="proxy-status">
                      {STATUS_ICON[p.status]}
                      {p.status}
                    </span>
                  </td>
                  <td>{p.host}</td>
                  <td>{p.port}</td>
                  <td>{p.username || "—"}</td>
                  <td className="td-actions">
                    <button
                      className="btn-icon btn-blue"
                      title="Test"
                      onClick={() => handleTestOne(p.id)}
                    >
                      <Zap size={14} />
                    </button>
                    <button
                      className="btn-icon btn-red"
                      title="Delete"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
