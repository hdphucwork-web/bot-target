import { useState } from "react";
import type { TaskConfig, ProxyEntry, CustomerInfo, CreditCardInfo } from "../types";
import { createTask, updateTask } from "../api";
import { X } from "lucide-react";

interface Props {
  task: TaskConfig | null;  // null = create new
  proxies: ProxyEntry[];
  onClose: () => void;
  onSaved: () => void;
}

const PREFECTURES = [
  { id: "", label: "選択してください" },
  { id: "1", label: "北海道" }, { id: "2", label: "青森県" }, { id: "3", label: "岩手県" },
  { id: "4", label: "宮城県" }, { id: "5", label: "秋田県" }, { id: "6", label: "山形県" },
  { id: "7", label: "福島県" }, { id: "8", label: "茨城県" }, { id: "9", label: "栃木県" },
  { id: "10", label: "群馬県" }, { id: "11", label: "埼玉県" }, { id: "12", label: "千葉県" },
  { id: "13", label: "東京都" }, { id: "14", label: "神奈川県" }, { id: "15", label: "新潟県" },
  { id: "16", label: "富山県" }, { id: "17", label: "石川県" }, { id: "18", label: "福井県" },
  { id: "19", label: "山梨県" }, { id: "20", label: "長野県" }, { id: "21", label: "岐阜県" },
  { id: "22", label: "静岡県" }, { id: "23", label: "愛知県" }, { id: "24", label: "三重県" },
  { id: "25", label: "滋賀県" }, { id: "26", label: "京都府" }, { id: "27", label: "大阪府" },
  { id: "28", label: "兵庫県" }, { id: "29", label: "奈良県" }, { id: "30", label: "和歌山県" },
  { id: "31", label: "鳥取県" }, { id: "32", label: "島根県" }, { id: "33", label: "岡山県" },
  { id: "34", label: "広島県" }, { id: "35", label: "山口県" }, { id: "36", label: "徳島県" },
  { id: "37", label: "香川県" }, { id: "38", label: "愛媛県" }, { id: "39", label: "高知県" },
  { id: "40", label: "福岡県" }, { id: "41", label: "佐賀県" }, { id: "42", label: "長崎県" },
  { id: "43", label: "熊本県" }, { id: "44", label: "大分県" }, { id: "45", label: "宮崎県" },
  { id: "46", label: "鹿児島県" }, { id: "47", label: "沖縄県" },
];

export default function TaskModal({ task, proxies, onClose, onSaved }: Props) {
  const isEdit = !!task;

  const [taskName, setTaskName] = useState(task?.task_name || "");
  const [productUrl, setProductUrl] = useState(task?.product_url || "");
  const [quantity, setQuantity] = useState(task?.quantity || 1);
  const [reloadDelay, setReloadDelay] = useState(task?.reload_delay_ms || 3000);
  const [proxyId, setProxyId] = useState<string | null>(task?.proxy_id || null);

  const [customer, setCustomer] = useState<CustomerInfo>(
    task?.customer || {
      name: "", name_kana: "", email: "", phone: "",
      zip_code: "", prefecture_id: "", address1: "", address2: "",
    }
  );

  const [card, setCard] = useState<CreditCardInfo>(
    task?.credit_card || {
      number: "", expire: "", security: "", holder_name: "",
    }
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        task_name: taskName,
        product_url: productUrl,
        quantity,
        customer,
        credit_card: card,
        proxy_id: proxyId,
        reload_delay_ms: reloadDelay,
      };

      if (isEdit && task) {
        await updateTask(task.id, payload);
      } else {
        await createTask(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert("Error saving task: " + (err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  };

  const updateCustomer = (key: keyof CustomerInfo, value: string) => {
    setCustomer((prev) => ({ ...prev, [key]: value }));
  };

  const updateCard = (key: keyof CreditCardInfo, value: string) => {
    setCard((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{isEdit ? "Edit Task" : "New Task"}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {/* Basic Info */}
          <div className="form-section">
            <h3>Basic Info</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Task Name</label>
                <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="My Task" />
              </div>
              <div className="form-group">
                <label>Product URL</label>
                <input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://www.target.co.jp/view/item/..." />
              </div>
              <div className="form-group">
                <label>Quantity</label>
                <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Reload Delay (ms)</label>
                <input type="number" min={500} step={500} value={reloadDelay} onChange={(e) => setReloadDelay(Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Proxy</label>
                <select value={proxyId || ""} onChange={(e) => setProxyId(e.target.value || null)}>
                  <option value="">No Proxy</option>
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.host}:{p.port} ({p.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="form-section">
            <h3>Customer Info (Guest Checkout)</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Full Name</label>
                <input value={customer.name} onChange={(e) => updateCustomer("name", e.target.value)} placeholder="二木太郎" />
              </div>
              <div className="form-group">
                <label>Name (Kana)</label>
                <input value={customer.name_kana} onChange={(e) => updateCustomer("name_kana", e.target.value)} placeholder="ニキタロウ" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={customer.email} onChange={(e) => updateCustomer("email", e.target.value)} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input value={customer.phone} onChange={(e) => updateCustomer("phone", e.target.value)} placeholder="08001234567" />
              </div>
              <div className="form-group">
                <label>Postal Code</label>
                <input value={customer.zip_code} onChange={(e) => updateCustomer("zip_code", e.target.value)} placeholder="1508512" />
              </div>
              <div className="form-group">
                <label>Prefecture</label>
                <select value={customer.prefecture_id} onChange={(e) => updateCustomer("prefecture_id", e.target.value)}>
                  {PREFECTURES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Address 1 (City/Ward)</label>
                <input value={customer.address1} onChange={(e) => updateCustomer("address1", e.target.value)} placeholder="渋谷区" />
              </div>
              <div className="form-group">
                <label>Address 2 (Street)</label>
                <input value={customer.address2} onChange={(e) => updateCustomer("address2", e.target.value)} placeholder="○○町1-1-1" />
              </div>
            </div>
          </div>

          {/* Credit Card Info */}
          <div className="form-section">
            <h3>Credit Card</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Card Number</label>
                <input value={card.number} onChange={(e) => updateCard("number", e.target.value)} placeholder="4111111111111111" maxLength={19} />
              </div>
              <div className="form-group">
                <label>Expiry (MM/YY)</label>
                <input value={card.expire} onChange={(e) => updateCard("expire", e.target.value)} placeholder="12/28" maxLength={5} />
              </div>
              <div className="form-group">
                <label>Security Code</label>
                <input value={card.security} onChange={(e) => updateCard("security", e.target.value)} placeholder="123" maxLength={4} />
              </div>
              <div className="form-group">
                <label>Holder Name</label>
                <input value={card.holder_name} onChange={(e) => updateCard("holder_name", e.target.value)} placeholder="TARO NIKI" />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : isEdit ? "Update Task" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
