import streamlit as st
from database import init_db, get_followups_today, get_projects, get_leads, get_dashboard_stats
from datetime import date, timedelta

st.set_page_config(page_title="Today | NSG CRM", page_icon="📋", layout="wide")
init_db()

st.title("📋 Today's Priorities")
st.caption(date.today().strftime("%A, %B %d, %Y"))

stats = get_dashboard_stats()
overdue = get_followups_today()
active_projects = get_projects()
active_projects = [p for p in active_projects if p["stage"] not in ("Live", "Maintenance")]

col1, col2 = st.columns(2)

# ── FOLLOW-UPS DUE ───────────────────────────────────────
with col1:
    st.subheader("🚨 Follow-Ups Due Today")
    if overdue:
        for lead in overdue:
            is_overdue = lead.get("next_followup_date","") < date.today().isoformat()
            color = "#fee2e2" if is_overdue else "#fefce8"
            badge = "🔴 OVERDUE" if is_overdue else "🟡 TODAY"
            st.markdown(f"""
            <div style="background:#1f1f2e;border-left:4px solid {'#f87171' if is_overdue else '#fbbf24'};border-radius:8px;padding:.75rem 1rem;margin-bottom:.5rem;">
                <div style="font-weight:700;font-size:.95rem;">{lead['business_name']}</div>
                <div style="font-size:.8rem;color:#9ca3af;">{lead.get('contact_name','')} · {lead.get('status','')}</div>
                <div style="font-size:.75rem;color:#6b7280;margin-top:.25rem;">{badge} · Due: {lead.get('next_followup_date','')}</div>
                {f'<div style="font-size:.75rem;color:#9ca3af;margin-top:.25rem;">{lead["notes"][:80]}...</div>' if lead.get("notes") else ""}
            </div>
            """, unsafe_allow_html=True)
    else:
        st.success("✅ No follow-ups due today. Nice work!")

# ── ACTIVE PROJECTS ──────────────────────────────────────
with col2:
    st.subheader("🔨 Active Projects")
    if active_projects:
        for p in active_projects[:8]:
            today_iso = date.today().isoformat()
            overdue_proj = p.get("due_date") and p["due_date"] < today_iso
            st.markdown(f"""
            <div style="background:#1f1f2e;border-left:4px solid {'#f87171' if overdue_proj else '#9d6ef8'};border-radius:8px;padding:.75rem 1rem;margin-bottom:.5rem;">
                <div style="font-weight:700;font-size:.95rem;">{p['project_name']}</div>
                <div style="font-size:.8rem;color:#9ca3af;">{p.get('client_name','')} · {p.get('service_type','')}</div>
                <div style="font-size:.75rem;color:#6b7280;margin-top:.25rem;">Stage: <b>{p.get('stage','')}</b> · Due: {p.get('due_date') or 'Not set'}</div>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.info("No active projects right now.")

st.divider()

# ── BOTTOM ROW ───────────────────────────────────────────
col3, col4, col5 = st.columns(3)

with col3:
    st.subheader("📊 This Week")
    st.metric("Businesses Contacted", stats["contacted_week"])
    st.metric("New Leads Added", stats["new_leads_month"])

with col4:
    st.subheader("💰 Revenue Snapshot")
    st.metric("Current MRR", f"${stats['mrr']:,.0f}")
    mrr_goal = 1000
    progress = min(stats["mrr"] / mrr_goal, 1.0)
    st.progress(progress, text=f"Goal: ${mrr_goal:,}/mo ({progress*100:.0f}%)")

with col5:
    st.subheader("🔥 Hot Leads")
    hot = [l for l in get_leads(interest="Hot") if l["status"] not in ("Won","Lost")][:5]
    if hot:
        for lead in hot:
            st.markdown(f"🔴 **{lead['business_name']}** — {lead['status']}")
    else:
        st.info("No hot leads right now. Time to prospect!")
