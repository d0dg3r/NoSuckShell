import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const helpSections = [
    {
        title: "Hostliste",
        rows: [
            { action: "Host verbinden", mouse: "Doppelklick auf Host-Zeile", keys: "Host-Zeile fokussieren + Enter/Space" },
            { action: "Host in Pane ziehen", mouse: "Host-Zeile per Drag and Drop auf Pane", keys: "-" },
            { action: "Favorit toggeln", mouse: "Stern-Button in der Host-Zeile", keys: "-" },
            { action: "Host-Einstellungen", mouse: "Menue-Button (⋯) in der Host-Zeile", keys: "-" },
        ],
    },
    {
        title: "Pane & Terminal",
        rows: [
            { action: "Pane fokussieren", mouse: "Klick auf Pane", keys: "-" },
            { action: "Pane-Kontextaktionen", mouse: "Rechtsklick auf Pane", keys: "-" },
            { action: "Pane teilen", mouse: "Split-Buttons in der Pane-Toolbar", keys: "-" },
            { action: "Pane groesse aendern", mouse: "Split-Trenner ziehen", keys: "-" },
            { action: "Terminal-Eingabe", mouse: "Terminal fokussieren und tippen", keys: "Alle Tasten gehen direkt an die Shell" },
        ],
    },
    {
        title: "Drag & Drop Cheatsheet",
        rows: [
            { action: "Top/Left/Right/Bottom", mouse: "Host auf entsprechende Drop-Zone ziehen", keys: "-" },
            { action: "Replace", mouse: "Host auf Center-Zone (Replace) ziehen", keys: "-" },
            { action: "Host Drop Mode", mouse: "Footer: Spawn oder Move waehlen", keys: "-" },
            { action: "Move-Modus", mouse: "Existierende Session des Hosts in Ziel-Pane verschieben", keys: "-" },
        ],
    },
    {
        title: "Layout & Navigation",
        rows: [
            { action: "Close all", mouse: "Footer: Close all (mit Confirm-Schritt)", keys: "-" },
            { action: "Close + reset", mouse: "Footer: Close + reset (mit Confirm-Schritt)", keys: "-" },
            { action: "Layoutprofile laden", mouse: "Profil auswaehlen + Load-Button", keys: "-" },
            { action: "Mobile Ansicht", mouse: "Tabbar Hosts/Terminal + Pager ‹ ›", keys: "-" },
        ],
    },
];
// Keep this cheatsheet in sync with interaction logic in App.tsx and context-actions.ts.
export function HelpPanel() {
    return (_jsxs("section", { className: "help-panel", children: [_jsxs("header", { className: "help-panel-header", children: [_jsx("h3", { children: "Hilfe & Cheatsheet" }), _jsx("p", { className: "muted-copy", children: "NoSuckShell kombiniert Host-Verwaltung, Split-Panes und schnelle Drag-and-Drop Workflows in einer Ansicht. Diese Uebersicht zeigt die wichtigsten Maus- und Tastaturfunktionen kompakt." })] }), helpSections.map((section) => (_jsxs("section", { className: "help-section", children: [_jsx("h4", { children: section.title }), _jsx("div", { className: "help-table-wrap", children: _jsxs("table", { className: "help-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Aktion" }), _jsx("th", { children: "Maus / Geste" }), _jsx("th", { children: "Tastatur" })] }) }), _jsx("tbody", { children: section.rows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: row.action }), _jsx("td", { children: row.mouse }), _jsx("td", { children: row.keys.includes("Enter") || row.keys.includes("Space") ? (_jsxs("span", { className: "help-kbd-group", children: [_jsx("kbd", { className: "help-kbd", children: "Enter" }), _jsx("span", { children: "/" }), _jsx("kbd", { className: "help-kbd", children: "Space" })] })) : (row.keys) })] }, `${section.title}:${row.action}`))) })] }) })] }, section.title))), _jsx("p", { className: "muted-copy help-note", children: "Hinweis: Es gibt derzeit keine globalen App-Hotkeys im Settings-Dialog. Tastatureingaben im Terminal werden an die aktive Shell weitergegeben." })] }));
}
