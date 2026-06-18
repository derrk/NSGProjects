import streamlit as st
from database import init_db, get_dashboard_stats, get_followups_today
from datetime import date

st.set_page_config(
    page_title="NSG Studios CRM",
    page_icon="🟣",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
[data-testid="stSidebar"] { background: #0f0f1a; }
.kpi-card { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:1rem 1.25rem; }
.kpi-val { font-size:2rem; font-weight:800; line-height:1.1; }
.kpi-label { font-size:0.75rem; color:#6b7280; text-transform:uppercase; letter-spacing:.08em; margin-top:2px; }
.kpi-purple { color:#9d6ef8; }
.kpi-green  { color:#34d399; }
.kpi-yellow { color:#fbbf24; }
.kpi-red    { color:#f87171; }
.kpi-blue   { color:#60a5fa; }
.section-header { font-size:0.7rem; font-weight:700; text-transform:uppercase; letter-spacing:.12em; color:#6b7280; margin-bottom:.5rem; margin-top:1.5rem; }
div[data-testid="metric-container"] { background:#111827; border:1px solid #1f2937; border-radius:12px; padding:.75rem 1rem; }
</style>
""", unsafe_allow_html=True)

init_db()
stats = get_dashboard_stats()
today_str = date.today().strftime("%A, %B %d")

st.markdown(f"## 🟣 NSG Studios CRM")
st.caption(f"Today is {today_str}")

overdue = get_followups_today()
if overdue:
    st.error(f"🔔 **{len(overdue)} follow-up{'s' if len(overdue)>1 else ''} due today** — check the Follow-Ups page", icon="🚨")

# ── KPI ROW 1: LEADS ─────────────────────────────────────
st.markdown('<div class="section-header">Lead Metrics</div>', unsafe_allow_html=True)
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Total Leads", stats["total_leads"])
c2.metric("New This Month", stats["new_leads_month"])
c3.metric("Contacted", stats["contacted"])
c4.metric("Follow-Ups Due Today", stats["followups_today"], delta="Overdue" if stats["followups_today"] > 0 else None, delta_color="inverse")
c5.metric("Meetings Scheduled", stats["meetings"])

# ── KPI ROW 2: SALES ─────────────────────────────────────
st.markdown('<div class="section-header">Sales Metrics</div>', unsafe_allow_html=True)
c1, c2, c3, c4 = st.columns(4)
c1.metric("Proposals Sent", stats["proposals"])
c2.metric("Clients Won", stats["won"])
c3.metric("Clients Lost", stats["lost"])
c4.metric("Close Rate", f"{stats['close_rate']}%")

# ── KPI ROW 3: REVENUE ───────────────────────────────────
st.markdown('<div class="section-header">Revenue Metrics</div>', unsafe_allow_html=True)
c1, c2, c3 = st.columns(3)
c1.metric("Current MRR", f"${stats['mrr']:,.0f}")
c2.metric("Setup Fees Collected", f"${stats['setup_revenue']:,.0f}")
c3.metric("Total Revenue", f"${stats['total_revenue']:,.0f}")

# ── MRR PROGRESS ─────────────────────────────────────────
mrr_goal = 1000
progress = min(stats["mrr"] / mrr_goal, 1.0) if mrr_goal > 0 else 0
st.markdown('<div class="section-header">MRR Goal Progress</div>', unsafe_allow_html=True)
col1, col2 = st.columns([3, 1])
with col1:
    st.progress(progress)
with col2:
    st.caption(f"${stats['mrr']:,.0f} / ${mrr_goal:,}/mo ({progress*100:.0f}%)")

# ── KPI ROW 4: ACTIVITY ──────────────────────────────────
st.markdown('<div class="section-header">Activity This Period</div>', unsafe_allow_html=True)
c1, c2 = st.columns(2)
c1.metric("Businesses Contacted This Week", stats["contacted_week"])
c2.metric("Businesses Contacted This Month", stats["contacted_month"])

# ── OVERDUE FOLLOW-UPS TABLE ─────────────────────────────
if overdue:
    st.markdown('<div class="section-header">🚨 Overdue Follow-Ups</div>', unsafe_allow_html=True)
    for lead in overdue:
        col1, col2, col3, col4 = st.columns([3, 2, 2, 1])
        col1.markdown(f"**{lead['business_name']}**")
        col2.caption(lead.get("status",""))
        col3.caption(f"Due: {lead.get('next_followup_date','')}")
        with col4:
            if st.button("View", key=f"ov_{lead['id']}"):
                st.switch_page("pages/2_Leads.py")
