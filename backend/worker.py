"""
Playwright automation worker for target.co.jp
Each task runs in its own isolated browser context with optional proxy.
"""

import asyncio
import traceback
from typing import Optional, Callable, Awaitable
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from config import TaskConfig, ProxyEntry, GlobalSettings


class AutoWorker:
    """Runs a single purchasing task in an isolated browser context."""

    def __init__(
        self,
        task: TaskConfig,
        settings: GlobalSettings,
        proxy: Optional[ProxyEntry],
        log_callback: Callable[[str, str, str], Awaitable[None]],
    ):
        self.task = task
        self.settings = settings
        self.proxy = proxy
        self.log = log_callback  # async fn(task_id, level, message)
        self._cancel_event = asyncio.Event()
        self._pause_event = asyncio.Event()
        self._pause_event.set()  # Not paused by default
        self._pw = None  # Playwright instance
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None

    # ── Lifecycle controls ──────────────────────────────────────────

    def cancel(self):
        self._cancel_event.set()

    def pause(self):
        self._pause_event.clear()

    def resume(self):
        self._pause_event.set()

    @property
    def is_cancelled(self) -> bool:
        return self._cancel_event.is_set()

    async def _check_state(self):
        """Check for cancel/pause between steps."""
        if self.is_cancelled:
            raise asyncio.CancelledError("Task cancelled")
        await self._pause_event.wait()  # Blocks if paused

    # ── Main entry ──────────────────────────────────────────────────

    async def run(self):
        retries = 0
        max_retries = self.settings.retry_limit
        while retries < max_retries:
            try:
                await self._execute()
                return  # Success
            except asyncio.CancelledError:
                await self.log(self.task.id, "info", "Task cancelled by user.")
                raise
            except Exception as e:
                retries += 1
                tb = traceback.format_exc()
                await self.log(
                    self.task.id,
                    "error",
                    f"Crash #{retries}/{max_retries}: {e}\n{tb}",
                )
                if retries >= max_retries:
                    await self.log(self.task.id, "error", "Max retries exceeded. Stopping.")
                    raise
                await self.log(self.task.id, "warn", f"Retrying in 5s...")
                await asyncio.sleep(5)
            finally:
                await self._cleanup()

    async def _cleanup(self):
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass
        self._pw = None
        self._browser = None
        self._context = None
        self._page = None

    # ── Core automation flow ────────────────────────────────────────

    async def _execute(self):
        await self.log(self.task.id, "info", "Launching browser...")

        self._pw = await async_playwright().start()

        launch_args = {
            "headless": self.settings.headless,
            "args": ["--disable-blink-features=AutomationControlled"],
        }

        self._browser = await self._pw.chromium.launch(**launch_args)

        context_args = {
            "viewport": {"width": 1280, "height": 800},
            "locale": "ja-JP",
            "user_agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        }

        if self.proxy:
            context_args["proxy"] = {
                "server": self.proxy.server_url,
            }
            if self.proxy.username:
                context_args["proxy"]["username"] = self.proxy.username
                context_args["proxy"]["password"] = self.proxy.password

        self._context = await self._browser.new_context(**context_args)
        self._page = await self._context.new_page()

        # ── Step 1: Monitor product page ──
        await self._monitor_product()

        # ── Step 2: Add to cart ──
        await self._add_to_cart()

        # ── Step 3: Handle modal ──
        await self._handle_cart_modal()

        # ── Step 4: Checkout step 01 (Guest) ──
        await self._checkout_step01()

        # ── Step 5: Checkout step 02 (Payment) ──
        await self._checkout_step02()

        # ── Step 6: Final checkout ──
        await self._final_checkout()

        await self.log(self.task.id, "success", "✅ Checkout completed successfully!")

    # ── Step 1: Monitor ─────────────────────────────────────────────

    async def _monitor_product(self):
        page = self._page
        url = self.task.product_url
        delay = self.task.reload_delay_ms

        await self.log(self.task.id, "info", f"Navigating to {url}")
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)

        while True:
            await self._check_state()

            # Check if in stock
            add_btn = await page.query_selector(
                'a.add-cart-btn.btn.cart-order-btn[data-button-id="cart-order"]'
            )
            if add_btn:
                await self.log(self.task.id, "success", "✅ Item is IN STOCK!")
                return

            # Check if sold out
            sold_out = await page.query_selector("div.disabled-btn.btn")
            if sold_out:
                text = await sold_out.inner_text()
                if "売り切れ" in text:
                    await self.log(
                        self.task.id,
                        "warn",
                        f"⏳ Sold out. Reloading in {delay}ms...",
                    )
                    await asyncio.sleep(delay / 1000)
                    await self._check_state()
                    await page.reload(wait_until="domcontentloaded", timeout=30000)
                    continue

            # Fallback: reload
            await self.log(self.task.id, "warn", "Unknown page state. Reloading...")
            await asyncio.sleep(delay / 1000)
            await page.reload(wait_until="domcontentloaded", timeout=30000)

    # ── Step 2: Add to cart ─────────────────────────────────────────

    async def _add_to_cart(self):
        page = self._page
        await self._check_state()
        await self.log(self.task.id, "info", f"Setting quantity to {self.task.quantity}...")

        qty_input = await page.wait_for_selector(
            'input[data-id="makeshop-item-quantity"]', timeout=5000
        )
        await qty_input.click(click_count=3)
        await qty_input.fill(str(self.task.quantity))

        await self.log(self.task.id, "info", "Clicking 'Add to Cart'...")
        add_btn = await page.wait_for_selector(
            'a[data-button-id="cart-order"]', timeout=5000
        )
        await add_btn.click()

    # ── Step 3: Cart modal ──────────────────────────────────────────

    async def _handle_cart_modal(self):
        page = self._page
        await self._check_state()
        await self.log(self.task.id, "info", "Waiting for cart modal...")

        await page.wait_for_selector("section.modal-area", state="visible", timeout=10000)

        await self.log(self.task.id, "info", "Clicking 'Proceed to checkout'...")
        checkout_link = await page.wait_for_selector(
            'a[href="#makeshop-common-order-url"]', state="visible", timeout=5000
        )
        await checkout_link.click()

    # ── Step 4: Checkout step 01 (Guest) ────────────────────────────

    async def _checkout_step01(self):
        page = self._page
        await self._check_state()
        await self.log(self.task.id, "info", "Waiting for checkout step 01...")

        await page.wait_for_url("**/checkout/step01**", timeout=30000)
        await page.wait_for_selector("#guest-form", state="visible", timeout=10000)

        await self.log(self.task.id, "info", "Clicking guest tab...")
        guest_tab = await page.query_selector("li.step1-guest")
        if guest_tab:
            await guest_tab.click()
            await asyncio.sleep(0.5)

        customer = self.task.customer
        await self.log(self.task.id, "info", "Filling customer details...")

        # Fill guest form fields
        field_map = {
            "#guest-name": customer.name,
            "#guest-nameKana": customer.name_kana,
            "#guest-email": customer.email,
            "#guest-tel": customer.phone,
            "#guest-zipCode": customer.zip_code,
            "#guest-address1": customer.address1,
            "#guest-address2": customer.address2,
        }

        for selector, value in field_map.items():
            if value:
                el = await page.wait_for_selector(selector, timeout=5000)
                await el.click(click_count=3)
                await el.fill(value)
                await asyncio.sleep(0.1)

        # Handle prefecture dropdown
        if customer.prefecture_id:
            await page.select_option("#guest-prefectureId", customer.prefecture_id)

        await self._check_state()
        await self.log(self.task.id, "info", "Submitting guest form...")
        submit_btn = await page.wait_for_selector("#guest-submit", timeout=5000)
        await submit_btn.click()

    # ── Step 5: Checkout step 02 (Payment & Confirm) ────────────────

    async def _checkout_step02(self):
        page = self._page
        await self._check_state()
        await self.log(self.task.id, "info", "Waiting for checkout step 02...")

        await page.wait_for_url("**/checkout/step02**", timeout=30000)
        await page.wait_for_load_state("domcontentloaded")
        await asyncio.sleep(1)

        # ── Step 5a: Click 「お支払い方法を選ぶ」 to open payment modal ──
        await self.log(self.task.id, "info", "Clicking 'お支払い方法を選ぶ'...")
        pay_btn = await page.wait_for_selector(
            'a.modal-summoner[data-modal-id="_paymethod_info"]',
            state="visible", timeout=10000
        )
        await pay_btn.click()

        # Wait for payment modal to appear
        await page.wait_for_selector("#_paymethod_info", state="visible", timeout=10000)
        await asyncio.sleep(0.5)

        # ── Step 5b: Select credit card radio ──
        await self.log(self.task.id, "info", "Selecting credit card payment...")
        cc_radio = await page.wait_for_selector("#paymethod_C", state="visible", timeout=5000)
        await cc_radio.click()
        await asyncio.sleep(0.5)

        # Wait for card info panel to expand
        await page.wait_for_selector("#paymethod_C_info", state="visible", timeout=5000)

        # ── Step 5c: Fill credit card details ──
        card = self.task.credit_card
        await self.log(self.task.id, "info", "Filling credit card details...")

        card_fields = {
            "#epsilon_number": card.number,
            "#epsilon_expire": card.expire,
            "#epsilon_security": card.security,
            "#epsilon_name": card.holder_name,
        }

        for selector, value in card_fields.items():
            if value:
                el = await page.wait_for_selector(selector, state="visible", timeout=5000)
                await el.click(click_count=3)
                await el.fill(value)
                await asyncio.sleep(0.1)

        await self._check_state()

        # ── Step 5d: Click 「この内容で変更する」 to confirm payment method ──
        await self.log(self.task.id, "info", "Clicking 'この内容で変更する' (confirm payment)...")
        decision_btn = await page.wait_for_selector("#paymethod_decision", state="visible", timeout=5000)
        await decision_btn.click()

        # Page reloads after payment method is confirmed
        await self.log(self.task.id, "info", "Waiting for page to reload after payment confirmation...")
        await page.wait_for_load_state("domcontentloaded", timeout=30000)
        await asyncio.sleep(2)

    # ── Step 6: Final checkout ──────────────────────────────────────

    async def _final_checkout(self):
        page = self._page
        await self._check_state()
        await self.log(self.task.id, "info", "🛒 Clicking '注文を確定する' (Place Order)...")

        # Wait for the order confirmation button to appear after payment was set
        confirm_btn = await page.wait_for_selector(
            'input[name="checkout"].checkout-confirm', state="visible", timeout=15000
        )
        await confirm_btn.click()

        # Wait for the order to process (redirects to completion page)
        await self.log(self.task.id, "info", "Waiting for order to process (20s)...")
        await asyncio.sleep(20)
        await self.log(self.task.id, "success", "🎉 Order submitted!")
