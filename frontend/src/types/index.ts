export interface CustomerInfo {
  name: string;
  name_kana: string;
  email: string;
  phone: string;
  zip_code: string;
  prefecture_id: string;
  address1: string;
  address2: string;
}

export interface CreditCardInfo {
  number: string;
  expire: string;
  security: string;
  holder_name: string;
}

export interface TaskConfig {
  id: string;
  task_name: string;
  product_url: string;
  quantity: number;
  customer: CustomerInfo;
  credit_card: CreditCardInfo;
  proxy_id: string | null;
  profile_id: string | null;
  reload_delay_ms: number;
  status: "idle" | "running" | "paused" | "success" | "error";
  last_log: string;
}

export interface ProfileInfo {
  id: string;
  profile_name: string;
  customer: CustomerInfo;
  credit_card: CreditCardInfo;
}

export interface ProxyEntry {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  status: "untested" | "alive" | "dead";
}

export interface GlobalSettings {
  headless: boolean;
  retry_limit: number;
  discord_webhook_url: string;
}

export interface LogMessage {
  type: "log";
  task_id: string;
  level: string;
  message: string;
  timestamp: string;
  status: string;
}

export interface TaskUpdateMessage {
  type: "task_update";
  task: TaskConfig;
}

export type WSMessage = LogMessage | TaskUpdateMessage;
