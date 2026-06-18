import streamlit as st
from database import init_db, get_leads, get_clients, get_activities
from components import inject_css, metric_card, section_header, cards_row, funnel_row
from collections import Counter

st.set_page_config(page_title="Reports | NSG CRM", page_icon="📊", layout="wide")
inject_css()
init_db()

st.markdown("## 📊 Reports")

leads      = get_leads()
clients    = get_clients()
activities = get_activities()

tab1, tab2, tab3, tab4 = st.tabs(["📋 Leads", "🎯 Sales Funnel", "💰 Revenue", "📤 Activity"])

# ── LEADS TAB ────────────────────────────────────────────
with tab1:
    st.markdown(section_header("Overview"), unsafe_allow_html=True)
    status_counts = Counter(l.get("status","Prospect") for l in leads)
    cards_row([
        metric_card("Total Leads",   str(len(leads)),                          color="purple", icon="👥"),
        metric_card("Hot Leads",     str(sum(1 for l in leads if l.get("interest_level")=="Hot")),  color="red",    icon="🔥"),
        metric_card("Warm Leads",    str(sum(1 for l in leads if l.get("interest_level")=="Warm")), color="yellow", icon="🟡"),
        metric_card("Won",           str(status_counts.get("Won",0)),           color="green",  icon="🏆"),
        metric_card("Lost",          str(status_counts.get("Lost",0)),          color="red",    icon="❌"),
    ])

    col1, col2 = st.columns(2)

    with col1:
        st.markdown(section_header("Leads by Source"), unsafe_allow_html=True)
        sources = Counter(l.get("lead_source","Other") for l in leads)
        total_s = sum(sources.values()) or 1
        SOURCE_COLORS = {
            "Google Search":"#60a5fa","Referral":"#34d399","Facebook":"#818cf8",
            "Instagram":"#f472b6","Card Show":"#fbbf24","Cold Email":"#a78bfa",
            "Cold Call":"#fb923c","Website Lead":"#34d399","Walk-In":"#a3e635","Other":"#6b7280",
        }
        if sources:
            st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1rem 1.25rem;">', unsafe_allow_html=True)
            for source, count in sources.most_common():
                color = SOURCE_COLORS.get(source,"#6b7280")
                pct = count / total_s
                st.markdown(f"""
                <div style="margin-bottom:.6rem;">
                    <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.25rem;">
                        <span style="color:#e5e7eb;">{source}</span>
                        <span style="color:{color};font-weight:700;">{count} <span style="color:#6b7280;font-weight:400;">({pct*100:.0f}%)</span></span>
                    </div>
                    <div style="background:#1f2937;border-radius:100px;height:6px;overflow:hidden;">
                        <div style="width:{pct*100:.1f}%;height:100%;background:{color};border-radius:100px;"></div>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("No leads yet.")

    with col2:
        st.markdown(section_header("Leads by Industry"), unsafe_allow_html=True)
        industries = Counter(l.get("industry","Other") for l in leads if l.get("industry"))
        total_i = sum(industries.values()) or 1
        if industries:
            st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1rem 1.25rem;">', unsafe_allow_html=True)
            for ind, count in industries.most_common():
                pct = count / total_i
                st.markdown(f"""
                <div style="margin-bottom:.6rem;">
                    <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.25rem;">
                        <span style="color:#e5e7eb;">{ind}</span>
                        <span style="color:#9d6ef8;font-weight:700;">{count} <span style="color:#6b7280;font-weight:400;">({pct*100:.0f}%)</span></span>
                    </div>
                    <div style="background:#1f2937;border-radius:100px;height:6px;overflow:hidden;">
                        <div style="width:{pct*100:.1f}%;height:100%;background:#7c3aed;border-radius:100px;"></div>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("No leads yet.")

# ── SALES FUNNEL TAB ─────────────────────────────────────
with tab2:
    FUNNEL_STAGES = [
        ("Prospect",          "#6b7280"),
        ("Contacted",         "#60a5fa"),
        ("Follow Up 1",       "#60a5fa"),
        ("Follow Up 2",       "#818cf8"),
        ("Meeting Scheduled", "#a78bfa"),
        ("Proposal Sent",     "#c084fc"),
        ("Won",               "#34d399"),
        ("Lost",              "#f87171"),
    ]
    funnel_counts = Counter(l.get("status") for l in leads)
    total_leads = len(leads) or 1
    won  = funnel_counts.get("Won",  0)
    lost = funnel_counts.get("Lost", 0)
    close_rate = won / (won + lost) * 100 if (won + lost) else 0

    st.markdown(section_header("Conversion Metrics"), unsafe_allow_html=True)
    cards_row([
        metric_card("Total Leads",   str(len(leads)), color="purple", icon="👥"),
        metric_card("Won",           str(won),        color="green",  icon="🏆", glow=won>0),
        metric_card("Lost",          str(lost),       color="red",    icon="❌"),
        metric_card("Close Rate",    f"{close_rate:.1f}%",
                    sub=f"{won} won of {won+lost} decided",
                    color="purple", icon="📊"),
    ])

    st.markdown(section_header("Sales Funnel"), unsafe_allow_html=True)
    st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1.25rem 1.5rem;">', unsafe_allow_html=True)
    for stage, color in FUNNEL_STAGES:
        count = funnel_counts.get(stage, 0)
        width = (count / total_leads * 100)
        st.markdown(f"""
        <div style="display:flex;align-items:center;gap:1rem;padding:.5rem 0;border-bottom:1px solid #1a1a2e;">
            <div style="width:160px;font-size:.82rem;color:#9ca3af;flex-shrink:0;">{stage}</div>
            <div style="flex:1;background:#1f2937;border-radius:100px;height:8px;overflow:hidden;">
                <div style="width:{width:.1f}%;height:100%;background:{color};border-radius:100px;"></div>
            </div>
            <div style="width:50px;text-align:right;font-size:.85rem;font-weight:700;color:{color};">{count}</div>
        </div>
        """, unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

    pipeline = sum(
        l.get("estimated_setup_fee",0) + l.get("estimated_monthly_revenue",0)*12
        for l in leads if l.get("status") not in ("Won","Lost","Not Now")
    )
    st.markdown(section_header("Pipeline Value"), unsafe_allow_html=True)
    st.markdown(f"""
    <div class="card card-purple card-glow-purple" style="margin-top:.25rem;">
        <div class="card-label">Estimated Pipeline (Setup + 12mo MRR)</div>
        <div class="card-value">${pipeline:,.0f}</div>
        <div class="card-sub">Based on open leads excluding Won / Lost / Not Now</div>
    </div>
    """, unsafe_allow_html=True)

# ── REVENUE TAB ──────────────────────────────────────────
with tab3:
    active = [c for c in clients if c["status"] == "Active"]
    mrr = sum(c["monthly_fee"] for c in active)
    setup_total = sum(c["setup_fee"] for c in clients)

    st.markdown(section_header("Revenue Metrics"), unsafe_allow_html=True)
    cards_row([
        metric_card("Active Clients",      str(len(active)),         color="blue",   icon="🤝"),
        metric_card("Current MRR",         f"${mrr:,.0f}",           color="purple", icon="💜", glow=True),
        metric_card("Setup Fees Collected",f"${setup_total:,.0f}",   color="green",  icon="🔧"),
        metric_card("Total Revenue",       f"${mrr+setup_total:,.0f}",color="green", icon="💰"),
    ])

    st.markdown(section_header("MRR by Service"), unsafe_allow_html=True)
    service_mrr = {
        "Website":     sum(c["monthly_fee"] for c in active if c["service_website"]),
        "Ecommerce":   sum(c["monthly_fee"] for c in active if c["service_ecommerce"]),
        "SEO":         sum(c["monthly_fee"] for c in active if c["service_seo"]),
        "AI Automation":sum(c["monthly_fee"] for c in active if c["service_ai"]),
        "Maintenance": sum(c["monthly_fee"] for c in active if c["service_maintenance"]),
    }
    service_colors = {
        "Website":"#60a5fa","Ecommerce":"#a78bfa","SEO":"#34d399",
        "AI Automation":"#9d6ef8","Maintenance":"#6b7280",
    }
    active_services = {k:v for k,v in service_mrr.items() if v > 0}
    if active_services:
        st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1.25rem 1.5rem;">', unsafe_allow_html=True)
        for service, amount in sorted(active_services.items(), key=lambda x: x[1], reverse=True):
            pct = amount / mrr if mrr else 0
            color = service_colors.get(service,"#9ca3af")
            st.markdown(f"""
            <div style="margin-bottom:.75rem;">
                <div style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.3rem;">
                    <span style="color:#e5e7eb;font-weight:500;">{service}</span>
                    <span style="color:{color};font-weight:700;">${amount:,.0f}/mo <span style="color:#6b7280;font-weight:400;">({pct*100:.0f}%)</span></span>
                </div>
                <div style="background:#1f2937;border-radius:100px;height:6px;overflow:hidden;">
                    <div style="width:{pct*100:.1f}%;height:100%;background:{color};border-radius:100px;"></div>
                </div>
            </div>
            """, unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)
    else:
        st.info("No active clients with services tagged yet.")

# ── ACTIVITY TAB ─────────────────────────────────────────
with tab4:
    act_types = Counter(a.get("activity_type","Other") for a in activities)
    outcomes  = Counter(a.get("outcome","") for a in activities if a.get("outcome"))
    total_acts = sum(act_types.values()) or 1

    st.markdown(section_header("Activity Overview"), unsafe_allow_html=True)
    cards_row([
        metric_card("Total Activities Logged", str(len(activities)), color="blue",   icon="📋"),
        metric_card("Unique Leads Touched",
                    str(len(set(a["lead_id"] for a in activities if a.get("lead_id")))),
                    color="purple", icon="👥"),
    ])

    col1, col2 = st.columns(2)
    with col1:
        st.markdown(section_header("By Activity Type"), unsafe_allow_html=True)
        TYPE_COLORS = {
            "Phone Call":"#60a5fa","Email Sent":"#34d399","Text Message":"#a78bfa",
            "Instagram DM":"#f472b6","Facebook Message":"#818cf8","In-Person Meeting":"#fbbf24",
            "Voicemail":"#9ca3af","Proposal Sent":"#c084fc","Follow-Up":"#fb923c",
        }
        if act_types:
            st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1rem 1.25rem;">', unsafe_allow_html=True)
            for atype, count in act_types.most_common():
                pct = count / total_acts
                color = TYPE_COLORS.get(atype,"#6b7280")
                st.markdown(f"""
                <div style="margin-bottom:.6rem;">
                    <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.25rem;">
                        <span style="color:#e5e7eb;">{atype}</span>
                        <span style="color:{color};font-weight:700;">{count}</span>
                    </div>
                    <div style="background:#1f2937;border-radius:100px;height:5px;overflow:hidden;">
                        <div style="width:{pct*100:.1f}%;height:100%;background:{color};border-radius:100px;"></div>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("No activities logged yet.")

    with col2:
        st.markdown(section_header("By Outcome"), unsafe_allow_html=True)
        OUTCOME_COLORS = {
            "Interested":"#34d399","Won":"#34d399",
            "Meeting Scheduled":"#60a5fa","Proposal Requested":"#a78bfa",
            "No Response":"#6b7280","Not Interested":"#f87171","Lost":"#f87171",
        }
        total_out = sum(outcomes.values()) or 1
        if outcomes:
            st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;padding:1rem 1.25rem;">', unsafe_allow_html=True)
            for outcome, count in outcomes.most_common():
                pct = count / total_out
                color = OUTCOME_COLORS.get(outcome,"#6b7280")
                st.markdown(f"""
                <div style="margin-bottom:.6rem;">
                    <div style="display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:.25rem;">
                        <span style="color:#e5e7eb;">{outcome}</span>
                        <span style="color:{color};font-weight:700;">{count}</span>
                    </div>
                    <div style="background:#1f2937;border-radius:100px;height:5px;overflow:hidden;">
                        <div style="width:{pct*100:.1f}%;height:100%;background:{color};border-radius:100px;"></div>
                    </div>
                </div>
                """, unsafe_allow_html=True)
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("No outcomes logged yet.")
