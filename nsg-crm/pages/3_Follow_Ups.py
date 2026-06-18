import streamlit as st
from database import init_db, get_leads, update_lead, get_lead
from datetime import date, timedelta

st.set_page_config(page_title="Follow-Ups | NSG CRM", page_icon="📅", layout="wide")
init_db()

STATUSES = ["Prospect","Contacted","Follow Up 1","Follow Up 2","Meeting Scheduled",
            "Proposal Sent","Interested","Not Now","Won","Lost"]

st.title("📅 Follow-Up Tracker")

today = date.today()
today_iso = today.isoformat()
tomorrow_iso = (today + timedelta(days=1)).isoformat()
week_iso = (today + timedelta(days=7)).isoformat()

all_leads = get_leads()
active = [l for l in all_leads if l["status"] not in ("Won","Lost")]

overdue   = [l for l in active if l.get("next_followup_date") and l["next_followup_date"] < today_iso]
due_today = [l for l in active if l.get("next_followup_date") == today_iso]
due_week  = [l for l in active if l.get("next_followup_date") and tomorrow_iso <= l["next_followup_date"] <= week_iso]
no_date   = [l for l in active if not l.get("next_followup_date")]

c1, c2, c3, c4 = st.columns(4)
c1.metric("🔴 Overdue", len(overdue))
c2.metric("🟡 Due Today", len(due_today))
c3.metric("🔵 Next 7 Days", len(due_week))
c4.metric("⚪ No Date Set", len(no_date))

st.divider()


def lead_card(lead, border):
    with st.container():
        st.markdown(f"""
        <div style="border:1px solid {border};border-radius:10px;padding:.8rem 1rem;margin-bottom:.4rem;background:#111827;">
            <div style="font-weight:700;">{lead['business_name']}</div>
            <div style="font-size:.8rem;color:#9ca3af;">{lead.get('contact_name','—')} · {lead.get('status','—')} · {lead.get('phone') or lead.get('email') or ''}</div>
            <div style="font-size:.75rem;color:#6b7280;margin-top:.2rem;">Follow-up: {lead.get('next_followup_date','Not set')} · Interest: {lead.get('interest_level','—')}</div>
            {f'<div style="font-size:.75rem;color:#9ca3af;margin-top:.2rem;">{lead["notes"][:100]}</div>' if lead.get("notes") else ""}
        </div>
        """, unsafe_allow_html=True)

        col1, col2, col3 = st.columns([2, 2, 1])
        new_date = col1.date_input("Reschedule", value=today + timedelta(days=2),
                                    key=f"fu_date_{lead['id']}", label_visibility="collapsed")
        new_status = col2.selectbox("Update Status", STATUSES,
                                     index=STATUSES.index(lead["status"]) if lead["status"] in STATUSES else 0,
                                     key=f"fu_status_{lead['id']}", label_visibility="collapsed")
        if col3.button("✓ Update", key=f"fu_save_{lead['id']}", type="primary", use_container_width=True):
            current = get_lead(lead["id"])
            update_lead(lead["id"], {**current,
                "next_followup_date": new_date.isoformat(),
                "status": new_status,
            })
            st.success(f"Updated {lead['business_name']}")
            st.rerun()


# ── OVERDUE ──────────────────────────────────────────────
if overdue:
    st.subheader("🔴 Overdue")
    for l in overdue:
        lead_card(l, "#f87171")
    st.divider()

# ── DUE TODAY ────────────────────────────────────────────
if due_today:
    st.subheader("🟡 Due Today")
    for l in due_today:
        lead_card(l, "#fbbf24")
    st.divider()

# ── UPCOMING ─────────────────────────────────────────────
if due_week:
    st.subheader("🔵 Next 7 Days")
    for l in due_week:
        lead_card(l, "#60a5fa")
    st.divider()

# ── NO DATE ──────────────────────────────────────────────
if no_date:
    with st.expander(f"⚪ No Follow-Up Date Set ({len(no_date)})"):
        for l in no_date:
            lead_card(l, "#374151")

if not (overdue or due_today or due_week or no_date):
    st.success("🎉 All caught up! No follow-ups needed right now.")
