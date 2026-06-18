import streamlit as st
from database import init_db, get_goals, update_goal_value, create_goal, delete_goal

st.set_page_config(page_title="Goals | NSG CRM", page_icon="🎯", layout="wide")
init_db()

CATEGORIES = ["Outreach","Sales","Revenue","General"]

st.title("🎯 Agency Goals")

goals = get_goals()
categories = sorted(set(g["category"] for g in goals))

# ── ADD GOAL ─────────────────────────────────────────────
with st.expander("➕ Add Custom Goal"):
    with st.form("add_goal", clear_on_submit=True):
        c1, c2, c3, c4 = st.columns(4)
        name = c1.text_input("Goal Name *")
        target = c2.number_input("Target", min_value=1.0, value=10.0)
        unit = c3.text_input("Unit", placeholder="clients, leads, $, etc.")
        cat = c4.selectbox("Category", CATEGORIES)
        if st.form_submit_button("Add Goal", type="primary"):
            if name:
                create_goal({"name": name, "target": target, "current_value": 0, "unit": unit, "category": cat})
                st.rerun()

st.divider()

# ── GOALS BY CATEGORY ────────────────────────────────────
for cat in categories:
    cat_goals = [g for g in goals if g["category"] == cat]
    st.subheader(f"📌 {cat}")

    cols = st.columns(min(len(cat_goals), 3))
    for i, goal in enumerate(cat_goals):
        pct = min(goal["current_value"] / goal["target"], 1.0) if goal["target"] > 0 else 0
        color = "#34d399" if pct >= 1.0 else "#9d6ef8" if pct >= 0.5 else "#fbbf24"

        with cols[i % 3]:
            st.markdown(f"""
            <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:1rem 1.25rem;margin-bottom:.75rem;">
                <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">{goal['category']}</div>
                <div style="font-size:1rem;font-weight:700;margin:.25rem 0;">{goal['name']}</div>
                <div style="font-size:1.75rem;font-weight:800;color:{color};">{goal['current_value']:g}<span style="font-size:.9rem;color:#6b7280;font-weight:500;"> / {goal['target']:g} {goal['unit']}</span></div>
                <div style="font-size:.75rem;color:#6b7280;margin-top:.25rem;">{pct*100:.0f}% complete{'  🎉' if pct >= 1.0 else ''}</div>
            </div>
            """, unsafe_allow_html=True)
            st.progress(pct)

            new_val = st.number_input(
                f"Update {goal['name']}",
                min_value=0.0,
                value=float(goal["current_value"]),
                step=1.0,
                key=f"goal_val_{goal['id']}",
                label_visibility="collapsed",
            )
            c1, c2 = st.columns(2)
            if c1.button("Update", key=f"goal_save_{goal['id']}", use_container_width=True):
                update_goal_value(goal["id"], new_val)
                st.rerun()
            if c2.button("🗑️", key=f"goal_del_{goal['id']}", use_container_width=True):
                delete_goal(goal["id"])
                st.rerun()

    st.divider()
