"""Reusable styled components for NSG CRM."""

BASE_CSS = """
<style>
/* ── BASE ──────────────────────────────────────────────── */
[data-testid="stSidebar"] { background: #0a0a12 !important; }
[data-testid="stSidebar"] [data-testid="stMarkdown"] { color: #9ca3af; }
.main .block-container { padding-top: 2rem; max-width: 1200px; }

/* Remove default metric card chrome */
div[data-testid="metric-container"] {
    background: transparent !important;
    border: none !important;
    padding: 0 !important;
}

/* ── METRIC CARDS ──────────────────────────────────────── */
.card {
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 14px;
    padding: 1.25rem 1.5rem;
    position: relative;
    overflow: hidden;
    height: 100%;
}
.card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 14px 14px 0 0;
}
.card-purple::before { background: linear-gradient(90deg, #7c3aed, #9d6ef8); }
.card-green::before  { background: linear-gradient(90deg, #059669, #34d399); }
.card-yellow::before { background: linear-gradient(90deg, #d97706, #fbbf24); }
.card-red::before    { background: linear-gradient(90deg, #dc2626, #f87171); }
.card-blue::before   { background: linear-gradient(90deg, #2563eb, #60a5fa); }
.card-gray::before   { background: linear-gradient(90deg, #374151, #6b7280); }

.card-glow-purple { box-shadow: 0 0 24px rgba(124,58,237,0.12); border-color: rgba(124,58,237,0.3); }
.card-glow-green  { box-shadow: 0 0 24px rgba(52,211,153,0.10); border-color: rgba(52,211,153,0.25); }

.card-label {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6b7280;
    margin-bottom: 0.4rem;
}
.card-value {
    font-size: 2rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.1;
    color: #ffffff;
}
.card-value-sm {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.03em;
    line-height: 1.1;
    color: #ffffff;
}
.card-sub {
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.3rem;
}
.card-icon {
    position: absolute;
    top: 1.1rem; right: 1.25rem;
    font-size: 1.4rem;
    opacity: 0.25;
}

/* ── SECTION HEADERS ───────────────────────────────────── */
.section-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 1.75rem 0 0.75rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #6b7280;
}
.section-header::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #1f2937;
}

/* ── STAT ROW INSIDE CARD ──────────────────────────────── */
.stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem;
    background: #0d1117;
    border: 1px solid #1f2937;
    border-radius: 8px;
    margin-bottom: 0.4rem;
}
.stat-row-label { font-size: 0.85rem; color: #9ca3af; }
.stat-row-value { font-size: 0.95rem; font-weight: 700; color: #fff; }

/* ── PROGRESS BARS ─────────────────────────────────────── */
.progress-wrap { margin-top: 0.6rem; }
.progress-bar-bg {
    height: 6px;
    background: #1f2937;
    border-radius: 100px;
    overflow: hidden;
    margin-top: 0.3rem;
}
.progress-bar-fill {
    height: 100%;
    border-radius: 100px;
    transition: width 0.3s ease;
}

/* ── ALERT BANNER ──────────────────────────────────────── */
.alert-banner {
    background: linear-gradient(135deg, rgba(220,38,38,0.15), rgba(220,38,38,0.05));
    border: 1px solid rgba(248,113,113,0.3);
    border-radius: 10px;
    padding: 0.85rem 1.1rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: #f87171;
}

/* ── FUNNEL BAR ────────────────────────────────────────── */
.funnel-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid #1a1a2e;
}
.funnel-label { width: 160px; font-size: 0.82rem; color: #9ca3af; flex-shrink: 0; }
.funnel-bar-wrap { flex: 1; background: #1f2937; border-radius: 100px; height: 8px; overflow: hidden; }
.funnel-bar-fill { height: 100%; border-radius: 100px; }
.funnel-count { width: 60px; text-align: right; font-size: 0.82rem; font-weight: 700; color: #fff; }
</style>
"""


def inject_css():
    import streamlit as st
    st.markdown(BASE_CSS, unsafe_allow_html=True)


def metric_card(label, value, sub=None, color="purple", icon=None, glow=False):
    glow_cls = f"card-glow-{color}" if glow else ""
    icon_html = f'<div class="card-icon">{icon}</div>' if icon else ""
    sub_html = f'<div class="card-sub">{sub}</div>' if sub else ""
    return f"""
    <div class="card card-{color} {glow_cls}">
        {icon_html}
        <div class="card-label">{label}</div>
        <div class="card-value">{value}</div>
        {sub_html}
    </div>
    """


def metric_card_sm(label, value, sub=None, color="gray", icon=None):
    icon_html = f'<div class="card-icon">{icon}</div>' if icon else ""
    sub_html = f'<div class="card-sub">{sub}</div>' if sub else ""
    return f"""
    <div class="card card-{color}">
        {icon_html}
        <div class="card-label">{label}</div>
        <div class="card-value-sm">{value}</div>
        {sub_html}
    </div>
    """


def section_header(label):
    return f'<div class="section-header">{label}</div>'


def stat_row(label, value):
    return f"""
    <div class="stat-row">
        <span class="stat-row-label">{label}</span>
        <span class="stat-row-value">{value}</span>
    </div>
    """


def progress_bar(pct, color="#9d6ef8", label=None):
    width = min(pct * 100, 100)
    label_html = f'<div style="font-size:.75rem;color:#6b7280;margin-bottom:.2rem;display:flex;justify-content:space-between;"><span>{label or ""}</span><span>{width:.0f}%</span></div>' if label else ""
    return f"""
    <div class="progress-wrap">
        {label_html}
        <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:{width}%;background:{color};"></div>
        </div>
    </div>
    """


def funnel_row(label, count, total, color="#9d6ef8"):
    width = (count / total * 100) if total else 0
    return f"""
    <div class="funnel-row">
        <div class="funnel-label">{label}</div>
        <div class="funnel-bar-wrap"><div class="funnel-bar-fill" style="width:{width}%;background:{color};"></div></div>
        <div class="funnel-count">{count}</div>
    </div>
    """


def cards_row(cards_html: list):
    """Render a list of card HTML strings in equal columns using streamlit."""
    import streamlit as st
    cols = st.columns(len(cards_html))
    for i, html in enumerate(cards_html):
        cols[i].markdown(html, unsafe_allow_html=True)
