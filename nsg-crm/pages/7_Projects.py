import streamlit as st
from database import init_db, get_projects, create_project, update_project, delete_project, get_clients
from datetime import date, timedelta

st.set_page_config(page_title="Projects | NSG CRM", page_icon="🔨", layout="wide")
init_db()

STAGES = ["Discovery","Planning","Design","Development","Review","Revisions","Ready To Launch","Live","Maintenance"]
SERVICE_TYPES = ["Website Design","Ecommerce Store","AI Automation","Local SEO","Maintenance","Other"]

STAGE_COLORS = {
    "Discovery": "#9ca3af", "Planning": "#60a5fa", "Design": "#a78bfa",
    "Development": "#f59e0b", "Review": "#fb923c", "Revisions": "#f87171",
    "Ready To Launch": "#34d399", "Live": "#10b981", "Maintenance": "#6b7280",
}

st.title("🔨 Project Management")

projects = get_projects()
clients = get_clients()
client_names = ["(No client)"] + [c["business_name"] for c in clients]
client_id_map = {c["business_name"]: c["id"] for c in clients}

# ── ADD PROJECT ──────────────────────────────────────────
with st.expander("➕ Add New Project"):
    with st.form("add_project", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        client_name = c1.selectbox("Client", client_names)
        project_name = c2.text_input("Project Name *")
        service_type = c3.selectbox("Service Type", SERVICE_TYPES)

        c4, c5, c6 = st.columns(3)
        start = c4.date_input("Start Date", value=date.today())
        due = c5.date_input("Due Date", value=date.today() + timedelta(days=14))
        stage = c6.selectbox("Current Stage", STAGES)

        notes = st.text_area("Notes")

        if st.form_submit_button("Add Project", type="primary"):
            if not project_name:
                st.error("Project name is required.")
            else:
                create_project({
                    "client_id": client_id_map.get(client_name),
                    "client_name": client_name if client_name != "(No client)" else "",
                    "project_name": project_name,
                    "service_type": service_type,
                    "start_date": start.isoformat(),
                    "due_date": due.isoformat(),
                    "stage": stage,
                    "notes": notes,
                })
                st.success(f"✅ Project added: {project_name}")
                st.rerun()

st.divider()

# ── KANBAN BOARD ─────────────────────────────────────────
active_stages = [s for s in STAGES if s not in ("Live","Maintenance")]
display_stages = [s for s in STAGES]

# Count per stage
stage_counts = {s: sum(1 for p in projects if p["stage"] == s) for s in STAGES}

view = st.radio("View", ["Kanban Board", "List View"], horizontal=True)

if view == "Kanban Board":
    st.markdown("### Active Projects by Stage")
    cols = st.columns(len(active_stages))
    for i, stage in enumerate(active_stages):
        with cols[i]:
            color = STAGE_COLORS.get(stage, "#9ca3af")
            count = stage_counts[stage]
            st.markdown(f"""
            <div style="background:#1f2937;border-radius:8px;padding:.5rem .75rem;margin-bottom:.5rem;border-top:3px solid {color};">
                <div style="font-size:.75rem;font-weight:700;color:{color};">{stage}</div>
                <div style="font-size:.65rem;color:#6b7280;">{count} project{'s' if count!=1 else ''}</div>
            </div>
            """, unsafe_allow_html=True)

            stage_projects = [p for p in projects if p["stage"] == stage]
            for p in stage_projects:
                today_iso = date.today().isoformat()
                overdue = p.get("due_date") and p["due_date"] < today_iso
                st.markdown(f"""
                <div style="background:#111827;border:1px solid {'#f87171' if overdue else '#374151'};border-radius:8px;padding:.6rem .75rem;margin-bottom:.35rem;font-size:.8rem;">
                    <div style="font-weight:600;">{p['project_name']}</div>
                    <div style="color:#6b7280;">{p.get('client_name','—')}</div>
                    <div style="color:#4b5563;">{p.get('service_type','')}</div>
                    {'<div style="color:#f87171;">⏰ Overdue: ' + p['due_date'] + '</div>' if overdue else f'<div style="color:#4b5563;">Due: {p.get("due_date","—")}</div>'}
                </div>
                """, unsafe_allow_html=True)

                if st.button("Edit", key=f"proj_edit_{p['id']}", use_container_width=True):
                    st.session_state[f"editing_proj_{p['id']}"] = True

else:
    # ── LIST VIEW ─────────────────────────────────────────
    filter_stage = st.selectbox("Filter Stage", ["All"] + STAGES)
    display = [p for p in projects if filter_stage == "All" or p["stage"] == filter_stage]

    for p in display:
        color = STAGE_COLORS.get(p["stage"], "#9ca3af")
        today_iso = date.today().isoformat()
        overdue = p.get("due_date") and p["due_date"] < today_iso

        st.markdown(f"""
        <div style="border:1px solid {'#f87171' if overdue else '#1f2937'};border-radius:10px;padding:.85rem 1rem;margin-bottom:.4rem;background:#111827;">
            <div style="display:flex;justify-content:space-between;">
                <span style="font-weight:700;">{p['project_name']}</span>
                <span style="color:{color};font-size:.8rem;font-weight:600;">{p['stage']}</span>
            </div>
            <div style="font-size:.8rem;color:#9ca3af;">{p.get('client_name','—')} · {p.get('service_type','')}</div>
            <div style="font-size:.75rem;color:#6b7280;">Start: {p.get('start_date','—')} · Due: {p.get('due_date','—')}</div>
        </div>
        """, unsafe_allow_html=True)

        if st.button("Edit", key=f"proj_list_edit_{p['id']}"):
            st.session_state[f"editing_proj_{p['id']}"] = True

# ── EDIT FORM ────────────────────────────────────────────
for p in projects:
    if st.session_state.get(f"editing_proj_{p['id']}"):
        with st.form(f"edit_proj_{p['id']}"):
            st.markdown(f"**Editing: {p['project_name']}**")
            ec1, ec2 = st.columns(2)
            pname = ec1.text_input("Project Name", value=p["project_name"])
            cname = ec2.text_input("Client Name", value=p.get("client_name",""))
            ec3, ec4, ec5 = st.columns(3)
            stype = ec3.selectbox("Service Type", SERVICE_TYPES,
                index=SERVICE_TYPES.index(p["service_type"]) if p.get("service_type") in SERVICE_TYPES else 0)
            stage2 = ec4.selectbox("Stage", STAGES,
                index=STAGES.index(p["stage"]) if p.get("stage") in STAGES else 0)
            due2_val = p.get("due_date")
            due2 = ec5.date_input("Due Date",
                value=date.fromisoformat(due2_val) if due2_val else date.today())
            notes2 = st.text_area("Notes", value=p.get("notes",""))
            sa, sb = st.columns(2)
            if sa.form_submit_button("💾 Save", type="primary"):
                update_project(p["id"], {
                    "client_name": cname, "project_name": pname,
                    "service_type": stype, "start_date": p.get("start_date"),
                    "due_date": due2.isoformat(), "stage": stage2, "notes": notes2,
                })
                st.session_state.pop(f"editing_proj_{p['id']}", None)
                st.rerun()
            if sb.form_submit_button("🗑️ Delete"):
                delete_project(p["id"])
                st.session_state.pop(f"editing_proj_{p['id']}", None)
                st.rerun()
