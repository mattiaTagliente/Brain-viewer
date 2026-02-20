"""Debug screenshots: zoom in to see individual node colors."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:5174"
OUT = "C:/Users/matti/Dev/Brain_viewer/screenshots"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Capture console messages
        console_msgs = []
        page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))

        page.goto(URL)

        print("Waiting for graph to render...")
        page.wait_for_function(
            """() => {
                const el = document.getElementById('root');
                if (!el) return false;
                const text = el.innerText || '';
                if (text.includes('Computing layout')) return false;
                if (text.includes('Loading graph')) return false;
                return text.includes('entities');
            }""",
            timeout=300000,
        )
        page.wait_for_timeout(3000)

        # Check for WebGL errors
        webgl_info = page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas found';
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return 'No WebGL context';
            const err = gl.getError();
            return {
                error: err,
                renderer: gl.getParameter(gl.RENDERER),
                vendor: gl.getParameter(gl.VENDOR),
            };
        }""")
        print(f"WebGL info: {webgl_info}")

        # Check actual entity type distribution from the store
        entity_types = page.evaluate("""() => {
            // Access zustand store
            const store = window.__ZUSTAND_DEVTOOLS_STORE__ || null;
            // Try to get entities from the React tree
            const root = document.getElementById('root');
            if (!root || !root._reactRootContainer) {
                // Try another approach - check if the graph data is in memory
                return 'Cannot access store directly';
            }
            return 'Store access attempted';
        }""")
        print(f"Entity check: {entity_types}")

        # Switch to Neural theme for better contrast
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Neural') b.click() })")
        page.wait_for_timeout(1000)

        # Zoom in a LOT to see individual nodes
        for _ in range(40):
            page.evaluate("""
                const c = document.querySelector('canvas');
                if (c) c.dispatchEvent(new WheelEvent('wheel', {deltaY: -200, bubbles: true, clientX: 700, clientY: 450}));
            """)
            page.wait_for_timeout(80)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/debug-neural-zoomed.png")
        print("Captured debug neural zoomed")

        # Zoom in even more
        for _ in range(30):
            page.evaluate("""
                const c = document.querySelector('canvas');
                if (c) c.dispatchEvent(new WheelEvent('wheel', {deltaY: -200, bubbles: true, clientX: 700, clientY: 450}));
            """)
            page.wait_for_timeout(80)
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/debug-neural-closeup.png")
        print("Captured debug neural closeup")

        # Switch to Clean for easier color visibility
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Clean') b.click() })")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/debug-clean-closeup.png")
        print("Captured debug clean closeup")

        # Print console messages
        print("\nConsole messages:")
        for msg in console_msgs:
            if "error" in msg.lower() or "warn" in msg.lower() or "webgl" in msg.lower() or "shader" in msg.lower() or "GraphScene" in msg.lower():
                print(f"  {msg}")

        browser.close()
        print("Done")


if __name__ == "__main__":
    main()
