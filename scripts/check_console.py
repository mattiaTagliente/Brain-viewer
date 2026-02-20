"""Check browser console for WebGL/shader errors."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:5174"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--disable-gpu-sandbox"])
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Capture console messages
        messages = []
        page.on("console", lambda msg: messages.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: messages.append(f"[PAGE_ERROR] {err}"))

        page.goto(URL)

        # Wait for graph to render
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
            timeout=60000,
        )
        page.wait_for_timeout(3000)

        # Also check for WebGL errors via JS
        webgl_info = page.evaluate("""() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas found';
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            if (!gl) return 'No WebGL context';
            const err = gl.getError();
            return {
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
                glslVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                error: err,
                errorName: err === 0 ? 'NO_ERROR' : `GL_ERROR_${err}`,
            };
        }""")

        # Check shader compilation by examining Three.js internal state
        shader_check = page.evaluate("""() => {
            // Check if there are any THREE warnings in the performance
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas found';
            // Try to access Three.js renderer
            const fiber = canvas.__r$;
            if (!fiber) return 'No R3F fiber root found';
            return 'R3F root found';
        }""")

        browser.close()

        print("\n=== CONSOLE MESSAGES ===")
        for msg in messages:
            print(msg)
        print(f"\n=== WEBGL INFO ===\n{webgl_info}")
        print(f"\n=== SHADER CHECK ===\n{shader_check}")


if __name__ == "__main__":
    main()
