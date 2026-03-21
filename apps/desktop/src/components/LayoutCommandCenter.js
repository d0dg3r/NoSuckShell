import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
function LayoutTreePreview({ node }) {
    if (node.type === "leaf") {
        return _jsx("div", { className: "layout-preview-leaf" });
    }
    const isRow = node.axis === "horizontal";
    return (_jsxs("div", { className: `layout-preview-split ${isRow ? "is-row" : "is-col"}`, children: [_jsx("div", { className: "layout-preview-pane", style: { flex: node.ratio }, children: _jsx(LayoutTreePreview, { node: node.first }) }), _jsx("div", { className: "layout-preview-pane", style: { flex: 1 - node.ratio }, children: _jsx(LayoutTreePreview, { node: node.second }) })] }));
}
export function LayoutCommandCenter({ open, onClose, layoutPresets, profiles, selectedProfileId, onSelectProfileId, profileName, onProfileNameChange, restoreSessions, onRestoreSessionsChange, onApplyProfile, onSaveProfile, pendingDeleteProfileId, onDeleteProfileIntent, onApplyPreset, onCloseAllIntent, pendingCloseAllIntent, previewTree, applyProfileDisabled, saveDisabled, closeActionsDisabled, }) {
    const panelRef = useRef(null);
    useEffect(() => {
        if (!open) {
            return;
        }
        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose]);
    useEffect(() => {
        if (!open) {
            return;
        }
        const t = window.setTimeout(() => {
            const root = panelRef.current;
            if (!root) {
                return;
            }
            const focusable = root.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        }, 0);
        return () => window.clearTimeout(t);
    }, [open]);
    if (!open) {
        return null;
    }
    return (_jsx("div", { className: "app-settings-overlay layout-command-center-overlay", onClick: onClose, role: "presentation", children: _jsxs("div", { ref: panelRef, className: "app-settings-modal panel layout-command-center-modal", onClick: (event) => event.stopPropagation(), "aria-labelledby": "layout-command-center-title", role: "dialog", "aria-modal": "true", children: [_jsxs("header", { className: "panel-header layout-command-center-header", children: [_jsx("h2", { id: "layout-command-center-title", children: "Layout command center" }), _jsx("button", { type: "button", className: "btn", onClick: onClose, "aria-label": "Close layout command center", children: "Close" })] }), _jsxs("div", { className: "layout-command-center-body", children: [_jsxs("div", { className: "layout-command-center-column layout-command-center-column-library", children: [_jsx("h3", { className: "layout-command-center-section-title", children: "Saved layouts" }), _jsx("div", { className: "layout-command-center-list-wrap", children: profiles.length === 0 ? (_jsx("p", { className: "muted-copy layout-command-center-empty", children: "No saved layouts yet." })) : (_jsx("ul", { className: "layout-command-center-profile-list", role: "listbox", "aria-label": "Saved layout profiles", children: profiles.map((profile) => (_jsx("li", { children: _jsxs("button", { type: "button", className: `layout-command-center-profile-item ${selectedProfileId === profile.id ? "is-selected" : ""}`, role: "option", "aria-selected": selectedProfileId === profile.id, onClick: () => onSelectProfileId(profile.id), children: [_jsx("span", { className: "layout-command-center-profile-name", children: profile.name }), _jsx("span", { className: "layout-command-center-profile-meta", children: profile.withHosts ? "Sessions" : "Structure only" })] }) }, profile.id))) })) }), _jsxs("label", { className: "field layout-command-center-field", children: [_jsx("span", { className: "field-label", children: "Name" }), _jsx("input", { className: "input", value: profileName, onChange: (event) => onProfileNameChange(event.target.value), placeholder: "Layout name" })] }), _jsxs("label", { className: "field checkbox-field layout-command-center-checkbox", children: [_jsx("input", { type: "checkbox", className: "checkbox-input", checked: restoreSessions, onChange: (event) => onRestoreSessionsChange(event.target.checked) }), _jsx("span", { className: "field-label", children: "Include sessions when saving (SSH, Quick SSH, local terminal)" })] }), _jsxs("div", { className: "layout-command-center-actions", children: [_jsx("button", { type: "button", className: "btn btn-primary", onClick: () => void onApplyProfile(), disabled: applyProfileDisabled, children: "Apply layout" }), _jsx("button", { type: "button", className: "btn", onClick: () => void onSaveProfile(), disabled: saveDisabled, children: "Save current" }), _jsx("button", { type: "button", className: `btn btn-danger ${pendingDeleteProfileId === selectedProfileId && selectedProfileId ? "btn-danger-confirm" : ""}`, onClick: () => void onDeleteProfileIntent(), disabled: !selectedProfileId, children: pendingDeleteProfileId === selectedProfileId && selectedProfileId ? "Confirm delete" : "Delete" })] })] }), _jsxs("div", { className: "layout-command-center-column layout-command-center-column-templates", children: [_jsx("h3", { className: "layout-command-center-section-title", children: "Templates" }), _jsx("div", { className: "layout-command-center-preset-grid", children: layoutPresets.map((preset) => (_jsxs("button", { type: "button", className: "layout-command-center-preset-card", onClick: () => onApplyPreset(preset.splitTree), children: [_jsx("div", { className: "layout-command-center-preset-thumb", "aria-hidden": true, children: _jsx(LayoutTreePreview, { node: preset.splitTree }) }), _jsx("span", { className: "layout-command-center-preset-title", children: preset.title }), _jsx("span", { className: "layout-command-center-preset-desc", children: preset.description })] }, preset.id))) }), _jsx("h3", { className: "layout-command-center-section-title", children: "Preview (selected layout)" }), _jsx("div", { className: "layout-command-center-preview-box", children: previewTree ? (_jsx(LayoutTreePreview, { node: previewTree })) : (_jsx("p", { className: "muted-copy layout-command-center-empty", children: "Select a saved layout to preview its grid." })) })] }), _jsxs("div", { className: "layout-command-center-column layout-command-center-column-sessions", children: [_jsx("h3", { className: "layout-command-center-section-title", children: "Sessions aufr\u00E4umen" }), _jsx("p", { className: "muted-copy layout-command-center-hint", children: "Destructive actions need a second click to confirm (same as before)." }), _jsxs("div", { className: "layout-command-center-actions layout-command-center-actions-stack", children: [_jsx("button", { type: "button", className: `btn footer-action-btn ${pendingCloseAllIntent === "close" ? "btn-danger-confirm" : "btn-danger"}`, onClick: () => onCloseAllIntent(false), disabled: closeActionsDisabled, children: pendingCloseAllIntent === "close" ? "Confirm close all" : "Close all sessions" }), _jsx("button", { type: "button", className: `btn footer-action-btn ${pendingCloseAllIntent === "reset" ? "btn-danger-confirm" : "btn-danger"}`, onClick: () => onCloseAllIntent(true), disabled: closeActionsDisabled, children: pendingCloseAllIntent === "reset" ? "Confirm close+reset" : "Close all + reset layout" })] })] })] })] }) }));
}
