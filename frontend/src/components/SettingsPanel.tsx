import { useState, useEffect } from "react";
import type { GlobalSettings } from "../types";
import { getSettings, updateSettings } from "../api";
import { Save } from "lucide-react";

export default function SettingsPanel() {
  const [settings, setSettings] = useState<GlobalSettings>({
    headless: false,
    retry_limit: 3,
    discord_webhook_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => setSettings(data as unknown as GlobalSettings))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings(settings as unknown as Record<string, unknown>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert("Error: " + (err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <div className="form-section">
        <h3>Browser Settings</h3>
        <div className="form-grid">
          <div className="form-group">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={settings.headless}
                onChange={(e) => setSettings({ ...settings, headless: e.target.checked })}
              />
              <span>Headless Mode</span>
            </label>
            <small>Run browser in headless (invisible) mode</small>
          </div>
          <div className="form-group">
            <label>Retry Limit</label>
            <input
              type="number"
              min={0}
              max={10}
              value={settings.retry_limit}
              onChange={(e) => setSettings({ ...settings, retry_limit: Number(e.target.value) })}
            />
            <small>Number of retry attempts on crash</small>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h3>Discord Webhook</h3>
        <div className="form-group">
          <label>Webhook URL</label>
          <input
            type="url"
            value={settings.discord_webhook_url}
            onChange={(e) => setSettings({ ...settings, discord_webhook_url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
          />
          <small>Receive a notification on successful checkout</small>
        </div>
      </div>

      <div className="settings-actions">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={14} />
          {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
