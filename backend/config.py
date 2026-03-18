"""Global configuration and state management."""

from pydantic import BaseModel, Field
from typing import Optional
import json
import os

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "data", "config.json")
TASKS_FILE = os.path.join(os.path.dirname(__file__), "data", "tasks.json")
PROXIES_FILE = os.path.join(os.path.dirname(__file__), "data", "proxies.json")


class GlobalSettings(BaseModel):
    headless: bool = False  # False = visible browser, True = hidden (headless)
    retry_limit: int = 3
    discord_webhook_url: str = ""


class ProxyEntry(BaseModel):
    id: str
    host: str
    port: int
    username: str = ""
    password: str = ""
    status: str = "untested"  # untested | alive | dead

    @property
    def server_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    @property
    def display(self) -> str:
        return f"{self.host}:{self.port}"


class CustomerInfo(BaseModel):
    name: str = ""
    name_kana: str = ""
    email: str = ""
    phone: str = ""
    zip_code: str = ""
    prefecture_id: str = ""
    address1: str = ""
    address2: str = ""


class CreditCardInfo(BaseModel):
    number: str = ""
    expire: str = ""       # MM/YY
    security: str = ""
    holder_name: str = ""  # Roman letters


class TaskConfig(BaseModel):
    id: str
    product_url: str = ""
    quantity: int = 1
    customer: CustomerInfo = Field(default_factory=CustomerInfo)
    credit_card: CreditCardInfo = Field(default_factory=CreditCardInfo)
    proxy_id: Optional[str] = None
    reload_delay_ms: int = 3000
    status: str = "idle"  # idle | running | paused | success | error
    last_log: str = ""
    task_name: str = ""


def ensure_data_dir():
    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)


def load_json(filepath: str, default=None):
    if default is None:
        default = {}
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(filepath: str, data):
    ensure_data_dir()
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
