"""Debug: check nodeColor attribute values in the InstancedMesh."""
from playwright.sync_api import sync_playwright

URL = "http://localhost:5174"

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
            timeout=60000,
        )
        page.wait_for_timeout(3000)

        # Check the nodeColor attribute on the InstancedMesh geometry
        result = page.evaluate("""() => {
            // Find the Three.js scene via the canvas
            const canvas = document.querySelector('canvas');
            if (!canvas) return 'No canvas';

            // Access the R3F store
            const fiber = canvas.__r$;
            if (!fiber) return 'No R3F fiber root';

            // Traverse the Three.js scene to find InstancedMesh
            const scene = fiber.stateNode?.current?.memoizedState?.memoizedState?.current?.scene;
            if (!scene) {
                // Try alternative path
                return 'Could not find scene via fiber';
            }

            let meshInfo = null;
            scene.traverse((obj) => {
                if (obj.isInstancedMesh && !meshInfo) {
                    const geom = obj.geometry;
                    const nodeColorAttr = geom.getAttribute('nodeColor');
                    const instanceColorAttr = geom.getAttribute('instanceColor');

                    // Sample first 20 colors from nodeColor attribute
                    let sampleColors = [];
                    if (nodeColorAttr) {
                        const arr = nodeColorAttr.array;
                        for (let i = 0; i < Math.min(20, nodeColorAttr.count); i++) {
                            sampleColors.push({
                                r: arr[i * 3 + 0].toFixed(3),
                                g: arr[i * 3 + 1].toFixed(3),
                                b: arr[i * 3 + 2].toFixed(3),
                            });
                        }
                    }

                    // Check object.instanceColor
                    let objInstanceColor = null;
                    if (obj.instanceColor) {
                        const arr = obj.instanceColor.array;
                        const samples = [];
                        for (let i = 0; i < Math.min(5, obj.instanceColor.count); i++) {
                            samples.push({
                                r: arr[i * 3 + 0].toFixed(3),
                                g: arr[i * 3 + 1].toFixed(3),
                                b: arr[i * 3 + 2].toFixed(3),
                            });
                        }
                        objInstanceColor = { count: obj.instanceColor.count, samples };
                    }

                    meshInfo = {
                        instanceCount: obj.count,
                        geometryAttributes: Object.keys(geom.attributes),
                        hasNodeColor: !!nodeColorAttr,
                        hasInstanceColor: !!instanceColorAttr,
                        nodeColorCount: nodeColorAttr?.count || 0,
                        nodeColorItemSize: nodeColorAttr?.itemSize || 0,
                        nodeColorIsInstanced: nodeColorAttr?.isInstancedBufferAttribute || false,
                        sampleColors,
                        objInstanceColor,
                        materialType: obj.material?.type || 'unknown',
                        materialUniforms: obj.material?.uniforms ? Object.keys(obj.material.uniforms) : [],
                    };
                }
            });

            return meshInfo || 'No InstancedMesh found in scene';
        }""")

        browser.close()

        import json
        print("\n=== MESH DEBUG INFO ===")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
