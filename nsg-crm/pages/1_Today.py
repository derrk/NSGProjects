import streamlit as st
from database import init_db, get_followups_today, get_projects, get_leads, get_dashboard_stats
from components import inject_css, metric_card, section_header, cards_row
from datetime import date, timedelta

st.set_page_config(page_title="Today | NSG CRM", page_icon="📋", layout="wide")
inject_css()
init_db()

st.markdown("## 📋 Today's Priorities")
st.caption(date.today().strftime("%A, %B %d, %Y"))

stats = get_dashboard_stats()
overdue = get_followups_today()
active_projects = [p for p in get_projects() if p["stage"] not in ("Live", "Maintenance")]
hot_leads = [l for l in get_leads(interest="Hot") if l["status"] not in ("Won", "Lost")]

# ── SNAPSHOT CARDS ───────────────────────────────────────
st.markdown(section_header("Today's Snapshot"), unsafe_allow_html=True)
cards_row([
    metric_card("Follow-Ups Due",        str(len(overdue)),
                sub="Needs your attention" if overdue else "All clear ✓",
                color="red" if overdue else "green", icon="⏰", glow=bool(overdue)),
    metric_card("Active Projects",        str(len(active_projects)),
                sub="In progress",          color="purple", icon="🔨"),
    metric_card("Hot Leads",              str(len(hot_leads)),
                sub="Ready to close",       color="red",    icon="🔥"),
    metric_card("Contacted This Week",    str(stats["contacted_week"]),
                sub="Businesses reached",   color="blue",   icon="📤"),
    metric_card("Current MRR",            f"${stats['mrr']:,.0f}",
                sub="Active monthly revenue",color="purple", icon="💜", glow=True),
])

st.divider()

col1, col2 = st.columns(2)

# ── FOLLOW-UPS DUE ───────────────────────────────────────
with col1:
    st.markdown(section_header("🚨 Follow-Ups Due Today"), unsafe_allow_html=True)
    if overdue:
        for lead in overdue:
            is_overdue = lead.get("next_followup_date", "") < date.today().isoformat()
            border = "#f87171" if is_overdue else "#fbbf24"
            badge_bg = "rgba(220,38,38,0.15)" if is_overdue else "rgba(217,119,6,0.15)"
            badge_color = "#f87171" if is_overdue else "#fbbf24"
            badge_text = "OVERDUE" if is_overdue else "TODAY"
            st.markdown(f"""
            <div style="background:#111827;border:1px solid {border};border-left:4px solid {border};
                 border-radius:10px;padding:.9rem 1.1rem;margin-bottom:.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:.95rem;">{lead['business_name']}</span>
                    <span style="background:{badge_bg};color:{badge_color};font-size:.68rem;
                          font-weight:700;letter-spacing:.08em;padding:.2rem .55rem;
                          border-radius:100px;">{badge_text}</span>
                </div>
                <div style="font-size:.8rem;color:#9ca3af;margin-top:.3rem;">
                    {lead.get('contact_name') or '—'} · {lead.get('status', '')}
                </div>
                <div style="font-size:.75rem;color:#6b7280;margin-top:.2rem;">
                    📞 {lead.get('phone') or '—'} &nbsp;·&nbsp; Due: {lead.get('next_followup_date', '')}
                </div>
                {f'<div style="font-size:.75rem;color:#9ca3af;margin-top:.3rem;border-top:1px solid #1f2937;padding-top:.3rem;">{lead["notes"][:100]}</div>' if lead.get("notes") else ""}
            </div>
            """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div style="background:#111827;border:1px solid #34d399;border-radius:10px;
             padding:1.5rem;text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:.4rem;">✅</div>
            <div style="font-weight:600;color:#34d399;">All caught up!</div>
            <div style="font-size:.82rem;color:#6b7280;margin-top:.25rem;">No follow-ups due today</div>
        </div>
        """, unsafe_allow_html=True)

# ── ACTIVE PROJECTS ──────────────────────────────────────
with col2:
    st.markdown(section_header("🔨 Active Projects"), unsafe_allow_html=True)
    STAGE_COLORS = {
        "Discovery":"#9ca3af","Planning":"#60a5fa","Design":"#a78bfa",
        "Development":"#f59e0b","Review":"#fb923c","Revisions":"#f87171",
        "Ready To Launch":"#34d399",
    }
    if active_projects:
        for p in active_projects[:8]:
            today_iso = date.today().isoformat()
            overdue_proj = p.get("due_date") and p["due_date"] < today_iso
            stage_color = STAGE_COLORS.get(p.get("stage", ""), "#9ca3af")
            border = "#f87171" if overdue_proj else "#1f2937"
            st.markdown(f"""
            <div style="background:#111827;border:1px solid {border};border-left:4px solid {stage_color};
                 border-radius:10px;padding:.9rem 1.1rem;margin-bottom:.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:.95rem;">{p['project_name']}</span>
                    <span style="color:{stage_color};font-size:.75rem;font-weight:700;">{p.get('stage','')}</span>
                </div>
                <div style="font-size:.8rem;color:#9ca3af;margin-top:.3rem;">
                    {p.get('client_name') or '—'} · {p.get('service_type', '')}
                </div>
                <div style="font-size:.75rem;color:{'#f87171' if overdue_proj else '#6b7280'};margin-top:.2rem;">
                    {'⏰ Overdue — ' if overdue_proj else ''}Due: {p.get('due_date') or 'Not set'}
                </div>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;
             padding:1.5rem;text-align:center;">
            <div style="font-size:1.5rem;margin-bottom:.4rem;">🎯</div>
            <div style="font-weight:600;color:#9ca3af;">No active projects</div>
            <div style="font-size:.82rem;color:#6b7280;margin-top:.25rem;">Add a project to start tracking</div>
        </div>
        """, unsafe_allow_html=True)

st.divider()

# ── BOTTOM ROW ───────────────────────────────────────────
col3, col4 = st.columns(2)

with col3:
    st.markdown(section_header("🔥 Hot Leads"), unsafe_allow_html=True)
    if hot_leads:
        for lead in hot_leads[:6]:
            st.markdown(f"""
            <div style="background:#111827;border:1px solid #1f2937;border-left:4px solid #f87171;
                 border-radius:10px;padding:.75rem 1rem;margin-bottom:.4rem;
                 display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:600;font-size:.9rem;">🔴 {lead['business_name']}</div>
                    <div style="font-size:.75rem;color:#9ca3af;margin-top:.15rem;">
                        {lead.get('status','')} · {lead.get('industry','—')}
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:.8rem;font-weight:700;color:#9d6ef8;">${lead.get('estimated_setup_fee',0):,.0f}</div>
                    <div style="font-size:.7rem;color:#6b7280;">${lead.get('estimated_monthly_revenue',0):,.0f}/mo</div>
                </div>
            </div>
            """, unsafe_allow_html=True)
    else:
        st.markdown("""
        <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;
             padding:1.25rem;text-align:center;">
            <div style="font-size:.85rem;color:#6b7280;">No hot leads right now. Time to prospect!</div>
        </div>
        """, unsafe_allow_html=True)

with col4:
    st.markdown(section_header("💰 Revenue Progress"), unsafe_allow_html=True)
    mrr_goal = 1000
    pct = min(stats["mrr"] / mrr_goal, 1.0)
    st.markdown(f"""
    <div class="card card-purple card-glow-purple">
        <div class="card-label">MRR Goal — $1,000/month</div>
        <div style="display:flex;align-items:baseline;gap:.5rem;margin:.3rem 0 .6rem;">
            <span style="font-size:2rem;font-weight:800;color:#fff;">${stats['mrr']:,.0f}</span>
            <span style="color:#6b7280;font-size:.85rem;">of ${mrr_goal:,}/mo</span>
            <span style="margin-left:auto;font-size:1.1rem;font-weight:800;color:#9d6ef8;">{pct*100:.0f}%</span>
        </div>
        <div style="background:#1f2937;border-radius:100px;height:8px;overflow:hidden;">
            <div style="width:{pct*100:.1f}%;height:100%;background:linear-gradient(90deg,#7c3aed,#9d6ef8);border-radius:100px;"></div>
        </div>
        <div style="font-size:.75rem;color:#6b7280;margin-top:.4rem;">
            ${max(mrr_goal - stats['mrr'], 0):,.0f} remaining to goal
        </div>
    </div>
    <div class="card" style="margin-top:.75rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:.4rem;">
            <span style="font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">This Month</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #1f2937;">
            <span style="font-size:.85rem;color:#9ca3af;">Contacted</span>
            <span style="font-weight:700;color:#fff;">{stats['contacted_month']}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid #1f2937;">
            <span style="font-size:.85rem;color:#9ca3af;">New Leads</span>
            <span style="font-weight:700;color:#fff;">{stats['new_leads_month']}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:.5rem 0;">
            <span style="font-size:.85rem;color:#9ca3af;">Proposals Sent</span>
            <span style="font-weight:700;color:#fff;">{stats['proposals']}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
