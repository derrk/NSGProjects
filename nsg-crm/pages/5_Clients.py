import streamlit as st
from database import init_db, get_clients, create_client, update_client, delete_client, get_leads
from datetime import date

st.set_page_config(page_title="Clients | NSG CRM", page_icon="🤝", layout="wide")
init_db()

STATUSES = ["Active","Paused","Cancelled"]

st.title("🤝 Client Management")

clients = get_clients()
leads = get_leads(status="Won")
lead_map = {"(No linked lead)": None, **{l["business_name"]: l["id"] for l in get_leads()}}

# ── SUMMARY ──────────────────────────────────────────────
active = [c for c in clients if c["status"] == "Active"]
mrr = sum(c["monthly_fee"] for c in active)
setup_total = sum(c["setup_fee"] for c in clients)

c1, c2, c3, c4 = st.columns(4)
c1.metric("Total Clients", len(clients))
c2.metric("Active", len(active))
c3.metric("Current MRR", f"${mrr:,.0f}")
c4.metric("Total Setup Revenue", f"${setup_total:,.0f}")

st.divider()

# ── ADD CLIENT ───────────────────────────────────────────
with st.expander("➕ Add New Client"):
    with st.form("add_client", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        biz = c1.text_input("Business Name *")
        contact = c2.text_input("Contact Name")
        linked = c3.selectbox("Link to Lead", list(lead_map.keys()))

        c4, c5 = st.columns(2)
        phone = c4.text_input("Phone")
        email = c5.text_input("Email")

        c6, c7 = st.columns(2)
        setup_fee = c6.number_input("Setup Fee ($)", min_value=0, value=499, step=100)
        monthly = c7.number_input("Monthly Fee ($)", min_value=0, value=99, step=50)

        st.markdown("**Services**")
        sc1, sc2, sc3, sc4, sc5 = st.columns(5)
        svc_web  = sc1.checkbox("Website")
        svc_eco  = sc2.checkbox("Ecommerce")
        svc_seo  = sc3.checkbox("SEO")
        svc_ai   = sc4.checkbox("AI Automation")
        svc_maint = sc5.checkbox("Maintenance")

        c8, c9, c10 = st.columns(3)
        start = c8.date_input("Start Date", value=date.today())
        renewal = c9.date_input("Renewal Date", value=None)
        status = c10.selectbox("Status", STATUSES)

        notes = st.text_area("Notes")

        if st.form_submit_button("Add Client", type="primary"):
            if not biz:
                st.error("Business name is required.")
            else:
                create_client({
                    "lead_id": lead_map[linked],
                    "business_name": biz, "contact_name": contact,
                    "phone": phone, "email": email,
                    "setup_fee": setup_fee, "monthly_fee": monthly,
                    "service_website": int(svc_web), "service_ecommerce": int(svc_eco),
                    "service_seo": int(svc_seo), "service_ai": int(svc_ai),
                    "service_maintenance": int(svc_maint),
                    "client_start_date": start.isoformat(),
                    "renewal_date": renewal.isoformat() if renewal else None,
                    "status": status, "notes": notes,
                })
                st.success(f"✅ Client added: {biz}")
                st.rerun()

# ── CLIENT CARDS ─────────────────────────────────────────
filter_status = st.selectbox("Filter by Status", ["All"] + STATUSES)
display = [c for c in clients if filter_status == "All" or c["status"] == filter_status]

if not display:
    st.info("No clients yet. Close your first deal!")
else:
    for client in display:
        services = []
        if client["service_website"]: services.append("Website")
        if client["service_ecommerce"]: services.append("Ecommerce")
        if client["service_seo"]: services.append("SEO")
        if client["service_ai"]: services.append("AI")
        if client["service_maintenance"]: services.append("Maintenance")

        status_color = {"Active":"#34d399","Paused":"#fbbf24","Cancelled":"#f87171"}.get(client["status"],"#9ca3af")

        st.markdown(f"""
        <div style="border:1px solid #1f2937;border-radius:10px;padding:1rem 1.25rem;margin-bottom:.5rem;background:#111827;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:1rem;">🤝 {client['business_name']}</span>
                <span style="color:{status_color};font-size:.8rem;font-weight:600;">{client['status']}</span>
            </div>
            <div style="font-size:.82rem;color:#9ca3af;margin-top:.3rem;">
                {client.get('contact_name','—')} · {client.get('phone') or client.get('email') or 'No contact info'}
            </div>
            <div style="font-size:.8rem;color:#6b7280;margin-top:.25rem;">
                Setup: <b style="color:#fff;">${client['setup_fee']:,.0f}</b> · Monthly: <b style="color:#9d6ef8;">${client['monthly_fee']:,.0f}/mo</b>
                {'· Services: ' + ', '.join(services) if services else ''}
            </div>
            <div style="font-size:.75rem;color:#4b5563;margin-top:.2rem;">
                Since: {client.get('client_start_date','—')}
                {' · Renewal: ' + client['renewal_date'] if client.get('renewal_date') else ''}
            </div>
        </div>
        """, unsafe_allow_html=True)

        if st.button("Edit", key=f"edit_client_{client['id']}"):
            st.session_state[f"editing_client_{client['id']}"] = True

        if st.session_state.get(f"editing_client_{client['id']}"):
            with st.form(f"edit_client_form_{client['id']}"):
                ec1, ec2 = st.columns(2)
                biz2 = ec1.text_input("Business Name", value=client["business_name"])
                contact2 = ec2.text_input("Contact Name", value=client.get("contact_name",""))
                ec3, ec4 = st.columns(2)
                phone2 = ec3.text_input("Phone", value=client.get("phone",""))
                email2 = ec4.text_input("Email", value=client.get("email",""))
                ec5, ec6 = st.columns(2)
                setup2 = ec5.number_input("Setup Fee", value=float(client["setup_fee"]), step=100.0)
                monthly2 = ec6.number_input("Monthly Fee", value=float(client["monthly_fee"]), step=50.0)
                st.markdown("**Services**")
                sc1, sc2, sc3, sc4, sc5 = st.columns(5)
                svc_web2  = sc1.checkbox("Website",     value=bool(client["service_website"]))
                svc_eco2  = sc2.checkbox("Ecommerce",   value=bool(client["service_ecommerce"]))
                svc_seo2  = sc3.checkbox("SEO",         value=bool(client["service_seo"]))
                svc_ai2   = sc4.checkbox("AI",          value=bool(client["service_ai"]))
                svc_maint2 = sc5.checkbox("Maintenance",value=bool(client["service_maintenance"]))
                status2 = st.selectbox("Status", STATUSES, index=STATUSES.index(client["status"]))
                notes2 = st.text_area("Notes", value=client.get("notes",""))
                sa, sb = st.columns(2)
                save = sa.form_submit_button("💾 Save", type="primary")
                delete_btn = sb.form_submit_button("🗑️ Delete")
                if save:
                    update_client(client["id"], {
                        "business_name": biz2, "contact_name": contact2,
                        "phone": phone2, "email": email2,
                        "setup_fee": setup2, "monthly_fee": monthly2,
                        "service_website": int(svc_web2), "service_ecommerce": int(svc_eco2),
                        "service_seo": int(svc_seo2), "service_ai": int(svc_ai2),
                        "service_maintenance": int(svc_maint2),
                        "client_start_date": client["client_start_date"],
                        "renewal_date": client.get("renewal_date"),
                        "status": status2, "notes": notes2,
                    })
                    st.session_state.pop(f"editing_client_{client['id']}", None)
                    st.rerun()
                if delete_btn:
                    delete_client(client["id"])
                    st.session_state.pop(f"editing_client_{client['id']}", None)
                    st.rerun()
