"""Take screenshots: overview + zoomed for all 3 themes."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:5174"
OUT = "C:/Users/matti/Dev/Brain_viewer/screenshots"


def zoom_in(page, steps=50):
    for _ in range(steps):
        page.evaluate("""
            const c = document.querySelector('canvas');
            if (c) c.dispatchEvent(new WheelEvent('wheel', {deltaY: -300, bubbles: true, clientX: 700, clientY: 450}));
        """)
        page.wait_for_timeout(50)
    page.wait_for_timeout(1500)


def go_home(page):
    page.evaluate("if (window.__brainViewerGoHome) window.__brainViewerGoHome()")
    page.wait_for_timeout(800)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})
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
        page.wait_for_timeout(4000)

        # Clean overview
        page.screenshot(path=f"{OUT}/clean-theme.png")
        print("Captured clean overview")

        # Zoom into clean
        zoom_in(page, steps=50)
        page.screenshot(path=f"{OUT}/clean-zoomed.png")
        print("Captured clean zoomed")

        # Neural overview
        go_home(page)
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Neural') b.click() })")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/neural-theme.png")
        print("Captured neural overview")

        # Zoom into neural
        zoom_in(page, steps=50)
        page.screenshot(path=f"{OUT}/neural-zoomed.png")
        print("Captured neural zoomed")

        # Organic overview
        go_home(page)
        page.evaluate("document.querySelectorAll('button').forEach(b => { if (b.textContent === 'Organic') b.click() })")
        page.wait_for_timeout(2000)
        page.screenshot(path=f"{OUT}/organic-theme.png")
        print("Captured organic overview")

        # Zoom into organic
        zoom_in(page, steps=50)
        page.screenshot(path=f"{OUT}/organic-zoomed.png")
        print("Captured organic zoomed")

        browser.close()
        print("Done")


if __name__ == "__main__":
    main()
