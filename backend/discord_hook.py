"""
Discord webhook integration for successful checkout notifications.
"""

import httpx
from datetime import datetime, timezone
from config import TaskConfig


async def send_discord_webhook(webhook_url: str, task: TaskConfig):
    """Send a rich embed to Discord on successful checkout."""
    if not webhook_url:
        return

    embed = {
        "title": "✅ Successful Checkout!",
        "color": 0x00FF00,  # Green
        "fields": [
            {
                "name": "Task",
                "value": task.task_name or task.id,
                "inline": True,
            },
            {
                "name": "Product URL",
                "value": task.product_url,
                "inline": False,
            },
            {
                "name": "Quantity",
                "value": str(task.quantity),
                "inline": True,
            },
            {
                "name": "Customer",
                "value": task.customer.name or "N/A",
                "inline": True,
            },
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "footer": {
            "text": "Target Bot",
        },
    }

    payload = {
        "embeds": [embed],
    }

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(webhook_url, json=payload, timeout=10)
            resp.raise_for_status()
        except Exception as e:
            print(f"Discord webhook error: {e}")
