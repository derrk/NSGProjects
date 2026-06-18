import streamlit as st
from database import init_db, get_dashboard_stats, get_followups_today
from components import inject_css, metric_card, metric_card_sm, section_header, progress_bar, cards_row
from datetime import date

st.set_page_config(
    page_title="NSG Studios CRM",
    page_icon="🟣",
    layout="wide",
    initial_sidebar_state="expanded",
)

inject_css()
init_db()

stats = get_dashboard_stats()
today_str = date.today().strftime("%A, %B %d")
overdue = get_followups_today()

# ── HEADER ───────────────────────────────────────────────
col_h1, col_h2 = st.columns([3, 1])
col_h1.markdown("## 🟣 NSG Studios CRM")
col_h1.caption(f"Today is {today_str}")

if overdue:
    st.markdown(f"""
    <div style="background:linear-gradient(135deg,rgba(220,38,38,0.15),rgba(220,38,38,0.05));
         border:1px solid rgba(248,113,113,0.35);border-radius:10px;
         padding:.85rem 1.1rem;margin-bottom:1rem;
         display:flex;align-items:center;gap:.75rem;
         font-size:.9rem;font-weight:600;color:#f87171;">
        🚨 <span>{len(overdue)} follow-up{'s' if len(overdue)>1 else ''} overdue — check the Follow-Ups page</span>
    </div>
    """, unsafe_allow_html=True)

# ── LEAD METRICS ─────────────────────────────────────────
st.markdown(section_header("Lead Metrics"), unsafe_allow_html=True)
cards_row([
    metric_card("Total Leads",        stats["total_leads"],    icon="👥", color="purple"),
    metric_card("New This Month",      stats["new_leads_month"],icon="📅", color="blue"),
    metric_card("Contacted",           stats["contacted"],      icon="📞", color="blue"),
    metric_card("Follow-Ups Due Today",stats["followups_today"],
                sub="Check Follow-Ups page" if stats["followups_today"] else "All clear ✓",
                icon="⏰", color="red" if stats["followups_today"] else "green",
                glow=stats["followups_today"] > 0),
    metric_card("Meetings Scheduled",  stats["meetings"],       icon="🗓️", color="purple"),
])

# ── SALES METRICS ────────────────────────────────────────
st.markdown(section_header("Sales Metrics"), unsafe_allow_html=True)
cards_row([
    metric_card("Proposals Sent", stats["proposals"],  icon="📄", color="yellow"),
    metric_card("Clients Won",    stats["won"],         icon="🏆", color="green", glow=stats["won"]>0),
    metric_card("Clients Lost",   stats["lost"],        icon="❌", color="red"),
    metric_card("Close Rate",     f"{stats['close_rate']}%",
                sub=f"{stats['won']} won of {stats['won']+stats['lost']} closed",
                icon="📊", color="purple"),
])

# ── REVENUE METRICS ──────────────────────────────────────
st.markdown(section_header("Revenue Metrics"), unsafe_allow_html=True)
cards_row([
    metric_card("Current MRR",       f"${stats['mrr']:,.0f}",          icon="💜", color="purple", glow=True),
    metric_card("Setup Fees Closed", f"${stats['setup_revenue']:,.0f}", icon="🔧", color="green"),
    metric_card("Total Revenue",     f"${stats['total_revenue']:,.0f}", icon="💰", color="green"),
])

# ── MRR PROGRESS ─────────────────────────────────────────
mrr_goal = 1000
pct = min(stats["mrr"] / mrr_goal, 1.0) if mrr_goal else 0
st.markdown(f"""
<div class="card card-purple" style="margin-top:.75rem;">
    <div class="card-label">MRR Goal — $1,000/month</div>
    <div style="display:flex;align-items:baseline;gap:.5rem;margin:.25rem 0 .5rem;">
        <span style="font-size:1.5rem;font-weight:800;color:#fff;">${stats['mrr']:,.0f}</span>
        <span style="color:#6b7280;font-size:.85rem;">of ${mrr_goal:,}/mo</span>
        <span style="margin-left:auto;font-size:.85rem;font-weight:700;color:#9d6ef8;">{pct*100:.0f}%</span>
    </div>
    <div style="background:#1f2937;border-radius:100px;height:8px;overflow:hidden;">
        <div style="width:{pct*100:.1f}%;height:100%;background:linear-gradient(90deg,#7c3aed,#9d6ef8);border-radius:100px;"></div>
    </div>
    <div style="font-size:.75rem;color:#6b7280;margin-top:.4rem;">
        Need ${max(mrr_goal - stats['mrr'], 0):,.0f} more · ~{max(int(-(-max(mrr_goal - stats['mrr'],0) // 99)),0)} more Starter clients
    </div>
</div>
""", unsafe_allow_html=True)

# ── ACTIVITY METRICS ─────────────────────────────────────
st.markdown(section_header("Outreach Activity"), unsafe_allow_html=True)
cards_row([
    metric_card("Contacted This Week",  stats["contacted_week"],  icon="📤", color="blue"),
    metric_card("Contacted This Month", stats["contacted_month"], icon="📬", color="blue"),
])

# ── OVERDUE TABLE ─────────────────────────────────────────
if overdue:
    st.markdown(section_header("🚨 Overdue Follow-Ups"), unsafe_allow_html=True)
    for lead in overdue:
        c1, c2, c3, c4 = st.columns([3, 2, 2, 1])
        c1.markdown(f"**{lead['business_name']}**")
        c2.caption(lead.get("status",""))
        c3.caption(f"Due: {lead.get('next_followup_date','')}")
        c4.page_link("pages/3_Follow_Ups.py", label="View")
