import streamlit as st
from database import init_db, get_leads, get_clients, get_activities
from collections import Counter

st.set_page_config(page_title="Reports | NSG CRM", page_icon="📊", layout="wide")
init_db()

st.title("📊 Reports")

leads = get_leads()
clients = get_clients()
activities = get_activities()

tab1, tab2, tab3, tab4 = st.tabs(["Leads", "Sales", "Revenue", "Activity"])

# ── LEADS TAB ────────────────────────────────────────────
with tab1:
    col1, col2 = st.columns(2)

    with col1:
        st.subheader("Leads by Source")
        sources = Counter(l.get("lead_source","Other") for l in leads)
        if sources:
            total = sum(sources.values())
            for source, count in sources.most_common():
                pct = count / total
                st.markdown(f"**{source}** — {count} ({pct*100:.0f}%)")
                st.progress(pct)
        else:
            st.info("No leads yet.")

    with col2:
        st.subheader("Leads by Industry")
        industries = Counter(l.get("industry","Other") for l in leads if l.get("industry"))
        if industries:
            total = sum(industries.values())
            for ind, count in industries.most_common():
                pct = count / total
                st.markdown(f"**{ind}** — {count} ({pct*100:.0f}%)")
                st.progress(pct)
        else:
            st.info("No leads yet.")

    st.subheader("Leads by Status")
    statuses = Counter(l.get("status","Prospect") for l in leads)
    STATUS_COLORS = {
        "Prospect": "⚪", "Contacted": "🔵", "Follow Up 1": "🔵", "Follow Up 2": "🔵",
        "Meeting Scheduled": "🟣", "Proposal Sent": "🟣", "Interested": "🟡",
        "Not Now": "⚫", "Won": "🟢", "Lost": "🔴",
    }
    cols = st.columns(min(len(statuses), 5))
    for i, (status, count) in enumerate(statuses.most_common()):
        cols[i % 5].metric(f"{STATUS_COLORS.get(status,'⚪')} {status}", count)

# ── SALES TAB ────────────────────────────────────────────
with tab2:
    st.subheader("Sales Funnel")
    FUNNEL = ["Prospect","Contacted","Follow Up 1","Follow Up 2","Meeting Scheduled",
              "Proposal Sent","Won","Lost"]
    funnel_counts = Counter(l.get("status") for l in leads)
    total_leads = len(leads)

    for stage in FUNNEL:
        count = funnel_counts.get(stage, 0)
        pct = count / total_leads if total_leads else 0
        color = "#34d399" if stage == "Won" else "#f87171" if stage == "Lost" else "#9d6ef8"
        st.markdown(f"<span style='color:{color};font-weight:600;'>{stage}</span> — {count} leads ({pct*100:.0f}%)", unsafe_allow_html=True)
        st.progress(pct)

    won = funnel_counts.get("Won", 0)
    lost = funnel_counts.get("Lost", 0)
    close_rate = won / (won + lost) * 100 if (won + lost) > 0 else 0
    st.metric("Overall Close Rate", f"{close_rate:.1f}%")

    st.subheader("Pipeline Value")
    pipeline = sum(l.get("estimated_setup_fee",0) + l.get("estimated_monthly_revenue",0)*12
                   for l in leads if l.get("status") not in ("Won","Lost","Not Now"))
    st.metric("Estimated Pipeline Value (ARR)", f"${pipeline:,.0f}")

# ── REVENUE TAB ──────────────────────────────────────────
with tab3:
    st.subheader("Active Clients")
    active = [c for c in clients if c["status"] == "Active"]
    mrr = sum(c["monthly_fee"] for c in active)
    setup_total = sum(c["setup_fee"] for c in clients)

    c1, c2, c3 = st.columns(3)
    c1.metric("Active Clients", len(active))
    c2.metric("MRR", f"${mrr:,.0f}")
    c3.metric("Setup Collected", f"${setup_total:,.0f}")

    st.subheader("Revenue by Service")
    service_mrr = {
        "Website": sum(c["monthly_fee"] for c in active if c["service_website"]),
        "Ecommerce": sum(c["monthly_fee"] for c in active if c["service_ecommerce"]),
        "SEO": sum(c["monthly_fee"] for c in active if c["service_seo"]),
        "AI Automation": sum(c["monthly_fee"] for c in active if c["service_ai"]),
        "Maintenance": sum(c["monthly_fee"] for c in active if c["service_maintenance"]),
    }
    for service, amount in sorted(service_mrr.items(), key=lambda x: x[1], reverse=True):
        if amount > 0:
            pct = amount / mrr if mrr else 0
            st.markdown(f"**{service}** — ${amount:,.0f}/mo")
            st.progress(pct)

# ── ACTIVITY TAB ─────────────────────────────────────────
with tab4:
    st.subheader("Activity by Type")
    act_types = Counter(a.get("activity_type","Other") for a in activities)
    if act_types:
        total_acts = sum(act_types.values())
        for atype, count in act_types.most_common():
            pct = count / total_acts
            st.markdown(f"**{atype}** — {count} ({pct*100:.0f}%)")
            st.progress(pct)
    else:
        st.info("No activities logged yet.")

    st.subheader("Activity Outcomes")
    outcomes = Counter(a.get("outcome","") for a in activities if a.get("outcome"))
    if outcomes:
        OUTCOME_COLORS = {
            "Interested": "🟢", "Won": "🟢", "Meeting Scheduled": "🔵",
            "Proposal Requested": "🔵", "No Response": "⚪",
            "Not Interested": "🔴", "Lost": "🔴",
        }
        for outcome, count in outcomes.most_common():
            icon = OUTCOME_COLORS.get(outcome, "⚪")
            st.markdown(f"{icon} **{outcome}** — {count}")
    else:
        st.info("No outcomes logged yet.")
