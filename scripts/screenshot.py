"""Take screenshots of all 3 themes for visual debugging."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:5174"
OUT = "C:/Users/matti/Dev/Brain_viewer/screenshots"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.goto(URL)

        # Wait for graph to load and layout to finish.
        # The loading overlay disappears when either:
        #   - positionsValid=true (cached layout) or
        #   - layout finishes (incremental is fast)
        print("Waiting for graph to render...")
        page.wait_for_function(
            """() => {
                const el = document.getElementById('root');
                if (!el) return false;
                const text = el.innerText || '';
                if (text.includes('Computing layout')) return false;
                if (text.includes('Loading graph')) return false;
                // Make sure entities are loaded (status bar shows count)
                return text.includes('entities');
            }""",
            timeout=300000,
        )
        page.wait_for_timeout(3000)

        # Clean theme (default)
        page.screenshot(path=f"{OUT}/clean-theme.png")
        print("Captured clean theme")

        # Neural theme — use JS to switch
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Neural') b.click() })")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/neural-theme.png")
        print("Captured neural theme")

        # Organic theme
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Organic') b.click() })")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/organic-theme.png")
        print("Captured organic theme")

        # Neural zoomed — use mouse wheel on canvas
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Neural') b.click() })")
        page.wait_for_timeout(500)
        for _ in range(20):
            page.evaluate("""
                const c = document.querySelector('canvas');
                if (c) c.dispatchEvent(new WheelEvent('wheel', {deltaY: -200, bubbles: true, clientX: 700, clientY: 450}));
            """)
            page.wait_for_timeout(100)
        page.wait_for_timeout(1500)
        page.screenshot(path=f"{OUT}/neural-zoomed.png")
        print("Captured neural zoomed")

        browser.close()
        print("Done")


if __name__ == "__main__":
    main()
