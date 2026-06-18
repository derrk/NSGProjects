import streamlit as st
from database import init_db, get_activities, create_activity, delete_activity, get_leads
from datetime import date

st.set_page_config(page_title="Activity | NSG CRM", page_icon="📋", layout="wide")
init_db()

ACTIVITY_TYPES = ["Email Sent","Phone Call","Voicemail","Text Message","Instagram DM",
                  "Facebook Message","In-Person Meeting","Proposal Sent","Follow-Up"]
OUTCOMES = ["No Response","Interested","Not Interested","Meeting Scheduled",
            "Proposal Requested","Won","Lost"]

st.title("📋 Activity Tracker")

leads = get_leads()
lead_map = {l["business_name"]: l["id"] for l in leads}
lead_names = [""] + list(lead_map.keys())

# ── LOG ACTIVITY ─────────────────────────────────────────
with st.expander("➕ Log Activity", expanded=True):
    with st.form("log_activity", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        lead_name = c1.selectbox("Lead / Business *", lead_names)
        activity_type = c2.selectbox("Activity Type", ACTIVITY_TYPES)
        outcome = c3.selectbox("Outcome", OUTCOMES)

        c4, c5 = st.columns([1, 3])
        act_date = c4.date_input("Date", value=date.today())
        notes = c5.text_input("Notes", placeholder="What happened? What's the next step?")

        if st.form_submit_button("Log Activity", type="primary"):
            if not lead_name:
                st.error("Select a lead.")
            else:
                create_activity({
                    "lead_id": lead_map[lead_name],
                    "activity_date": act_date.isoformat(),
                    "activity_type": activity_type,
                    "outcome": outcome,
                    "notes": notes,
                })
                st.success(f"✅ Activity logged for {lead_name}")
                st.rerun()

st.divider()

# ── FILTER ───────────────────────────────────────────────
fc1, fc2 = st.columns(2)
filter_lead = fc1.selectbox("Filter by Lead", ["All"] + list(lead_map.keys()))
filter_type = fc2.selectbox("Filter by Type", ["All"] + ACTIVITY_TYPES)

activities = get_activities(
    lead_id=lead_map[filter_lead] if filter_lead != "All" else None
)
if filter_type != "All":
    activities = [a for a in activities if a.get("activity_type") == filter_type]

st.markdown(f"**{len(activities)} activit{'ies' if len(activities) != 1 else 'y'}**")

OUTCOME_COLORS = {
    "Interested": "#34d399", "Won": "#34d399",
    "Meeting Scheduled": "#60a5fa", "Proposal Requested": "#60a5fa",
    "No Response": "#9ca3af",
    "Not Interested": "#f87171", "Lost": "#f87171",
}

for act in activities:
    color = OUTCOME_COLORS.get(act.get("outcome",""), "#9ca3af")
    col1, col2 = st.columns([5, 1])
    with col1:
        st.markdown(f"""
        <div style="border:1px solid #1f2937;border-radius:8px;padding:.7rem 1rem;margin-bottom:.35rem;background:#111827;">
            <div style="display:flex;justify-content:space-between;">
                <span style="font-weight:600;">{act.get('business_name','Unknown')}</span>
                <span style="font-size:.75rem;color:#6b7280;">{act.get('activity_date','')}</span>
            </div>
            <div style="font-size:.82rem;color:#9ca3af;margin-top:.2rem;">
                {act.get('activity_type','')}
                &nbsp;·&nbsp;
                <span style="color:{color};">{act.get('outcome','')}</span>
            </div>
            {f'<div style="font-size:.78rem;color:#6b7280;margin-top:.2rem;">{act["notes"]}</div>' if act.get("notes") else ""}
        </div>
        """, unsafe_allow_html=True)
    with col2:
        st.markdown("<div style='margin-top:.25rem'></div>", unsafe_allow_html=True)
        if st.button("🗑️", key=f"del_act_{act['id']}", help="Delete"):
            delete_activity(act["id"])
            st.rerun()
