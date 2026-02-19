import { useGraphStore, THEMES } from "../store/graphStore";

const themeNames = Object.keys(THEMES);

export function ThemePicker() {
  const currentTheme = useGraphStore((s) => s.theme);
  const setTheme = useGraphStore((s) => s.setTheme);

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        zIndex: 20,
        display: "flex",
        gap: 4,
        background: "rgba(0,0,0,0.6)",
        padding: "4px 8px",
        borderRadius: 8,
      }}
    >
      {themeNames.map((name) => (
        <button
          key={name}
          onClick={() => setTheme(name)}
          style={{
            padding: "4px 10px",
            borderRadius: 4,
            border: currentTheme === name ? "1px solid #fff" : "1px solid #555",
            background: currentTheme === name ? "#444" : "transparent",
            color: currentTheme === name ? "#fff" : "#aaa",
            fontSize: 12,
            cursor: "pointer",
            textTransform: "capitalize",
          }}
        >
          {THEMES[name].name}
        </button>
      ))}
    </div>
  );
}
