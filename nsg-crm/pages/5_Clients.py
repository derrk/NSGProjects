import streamlit as st
from database import init_db, get_clients, create_client, update_client, delete_client, get_leads
from components import inject_css, metric_card, section_header, cards_row
from datetime import date

st.set_page_config(page_title="Clients | NSG CRM", page_icon="🤝", layout="wide")
inject_css()
init_db()

STATUSES = ["Active", "Paused", "Cancelled"]

st.markdown("## 🤝 Client Management")

clients = get_clients()
active  = [c for c in clients if c["status"] == "Active"]
paused  = [c for c in clients if c["status"] == "Paused"]
mrr     = sum(c["monthly_fee"] for c in active)
setup_total = sum(c["setup_fee"] for c in clients)

# ── SUMMARY CARDS ────────────────────────────────────────
st.markdown(section_header("Overview"), unsafe_allow_html=True)
cards_row([
    metric_card("Total Clients",  str(len(clients)),      icon="🤝", color="purple"),
    metric_card("Active",         str(len(active)),        icon="✅", color="green", glow=len(active)>0),
    metric_card("Paused",         str(len(paused)),        icon="⏸️", color="yellow"),
    metric_card("Current MRR",    f"${mrr:,.0f}",          icon="💜", color="purple", glow=mrr>0),
    metric_card("Setup Collected",f"${setup_total:,.0f}",  icon="🔧", color="green"),
])

st.divider()

# ── ADD CLIENT ───────────────────────────────────────────
with st.expander("➕ Add New Client"):
    with st.form("add_client", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        biz     = c1.text_input("Business Name *")
        contact = c2.text_input("Contact Name")
        linked  = c3.selectbox("Link to Lead", ["(No linked lead)"] + [l["business_name"] for l in get_leads()])

        c4, c5 = st.columns(2)
        phone = c4.text_input("Phone")
        email = c5.text_input("Email")

        c6, c7 = st.columns(2)
        setup_fee = c6.number_input("Setup Fee ($)", min_value=0, value=499, step=100)
        monthly   = c7.number_input("Monthly Fee ($)", min_value=0, value=99, step=50)

        st.markdown("**Services**")
        sc1, sc2, sc3, sc4, sc5 = st.columns(5)
        svc_web   = sc1.checkbox("Website")
        svc_eco   = sc2.checkbox("Ecommerce")
        svc_seo   = sc3.checkbox("SEO")
        svc_ai    = sc4.checkbox("AI Automation")
        svc_maint = sc5.checkbox("Maintenance")

        c8, c9, c10 = st.columns(3)
        start   = c8.date_input("Start Date", value=date.today())
        renewal = c9.date_input("Renewal Date", value=None)
        status  = c10.selectbox("Status", STATUSES)

        notes = st.text_area("Notes")

        if st.form_submit_button("Add Client", type="primary"):
            if not biz:
                st.error("Business name is required.")
            else:
                lead_map = {l["business_name"]: l["id"] for l in get_leads()}
                create_client({
                    "lead_id": lead_map.get(linked),
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

# ── FILTER ───────────────────────────────────────────────
filter_status = st.segmented_control("Filter", ["All"] + STATUSES, default="All")
display = [c for c in clients if filter_status == "All" or c["status"] == filter_status]

if not display:
    st.markdown("""
    <div style="background:#111827;border:1px solid #1f2937;border-radius:14px;
         padding:2.5rem;text-align:center;margin-top:1rem;">
        <div style="font-size:2rem;margin-bottom:.75rem;">💼</div>
        <div style="font-weight:700;font-size:1.1rem;">No clients yet</div>
        <div style="color:#6b7280;font-size:.875rem;margin-top:.4rem;">Close your first deal and add them here</div>
    </div>
    """, unsafe_allow_html=True)
else:
    st.markdown(f"<div style='font-size:.8rem;color:#6b7280;margin-bottom:.75rem;'>{len(display)} client{'s' if len(display)!=1 else ''}</div>", unsafe_allow_html=True)
    for client in display:
        services = [s for s, k in [
            ("Website","service_website"),("Ecommerce","service_ecommerce"),
            ("SEO","service_seo"),("AI","service_ai"),("Maintenance","service_maintenance")
        ] if client[k]]

        STATUS_STYLES = {
            "Active":    ("#34d399", "rgba(52,211,153,0.12)",  "#7c3aed"),
            "Paused":    ("#fbbf24", "rgba(251,191,36,0.12)",  "#374151"),
            "Cancelled": ("#f87171", "rgba(248,113,113,0.12)", "#374151"),
        }
        txt_color, bg_color, border_color = STATUS_STYLES.get(client["status"], ("#9ca3af","#1f2937","#374151"))

        service_tags = "".join(
            f'<span style="background:#1f2937;border:1px solid #374151;border-radius:4px;'
            f'padding:.15rem .45rem;font-size:.7rem;color:#9ca3af;margin-right:.25rem;">{s}</span>'
            for s in services
        )

        st.markdown(f"""
        <div style="background:#111827;border:1px solid {border_color};border-radius:14px;
             padding:1.25rem 1.5rem;margin-bottom:.6rem;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;right:0;height:3px;background:{txt_color};opacity:.4;"></div>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                    <div style="font-weight:800;font-size:1.05rem;">{client['business_name']}</div>
                    <div style="font-size:.82rem;color:#9ca3af;margin-top:.25rem;">
                        {client.get('contact_name') or '—'}
                        {' · ' + client['phone'] if client.get('phone') else ''}
                        {' · ' + client['email'] if client.get('email') else ''}
                    </div>
                    <div style="margin-top:.5rem;">{service_tags if service_tags else '<span style="font-size:.72rem;color:#4b5563;">No services tagged</span>'}</div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:1rem;">
                    <div style="font-size:1.4rem;font-weight:800;color:#9d6ef8;">${client['monthly_fee']:,.0f}<span style="font-size:.75rem;color:#6b7280;font-weight:400;">/mo</span></div>
                    <div style="font-size:.8rem;color:#34d399;font-weight:600;margin-top:.1rem;">Setup: ${client['setup_fee']:,.0f}</div>
                    <div style="margin-top:.4rem;">
                        <span style="background:{bg_color};color:{txt_color};font-size:.7rem;font-weight:700;
                              letter-spacing:.06em;padding:.2rem .6rem;border-radius:100px;">{client['status']}</span>
                    </div>
                </div>
            </div>
            <div style="font-size:.72rem;color:#4b5563;margin-top:.75rem;padding-top:.6rem;border-top:1px solid #1f2937;">
                Since {client.get('client_start_date','—')}
                {' · Renewal: ' + client['renewal_date'] if client.get('renewal_date') else ''}
            </div>
        </div>
        """, unsafe_allow_html=True)

        if st.button("Edit", key=f"edit_client_{client['id']}"):
            st.session_state[f"editing_client_{client['id']}"] = True

        if st.session_state.get(f"editing_client_{client['id']}"):
            with st.form(f"edit_client_form_{client['id']}"):
                ec1, ec2 = st.columns(2)
                biz2     = ec1.text_input("Business Name",  value=client["business_name"])
                contact2 = ec2.text_input("Contact Name",   value=client.get("contact_name",""))
                ec3, ec4 = st.columns(2)
                phone2   = ec3.text_input("Phone",  value=client.get("phone",""))
                email2   = ec4.text_input("Email",  value=client.get("email",""))
                ec5, ec6 = st.columns(2)
                setup2   = ec5.number_input("Setup Fee",   value=float(client["setup_fee"]),   step=100.0)
                monthly2 = ec6.number_input("Monthly Fee", value=float(client["monthly_fee"]), step=50.0)
                st.markdown("**Services**")
                sc1, sc2, sc3, sc4, sc5 = st.columns(5)
                svc_web2   = sc1.checkbox("Website",     value=bool(client["service_website"]))
                svc_eco2   = sc2.checkbox("Ecommerce",   value=bool(client["service_ecommerce"]))
                svc_seo2   = sc3.checkbox("SEO",         value=bool(client["service_seo"]))
                svc_ai2    = sc4.checkbox("AI",          value=bool(client["service_ai"]))
                svc_maint2 = sc5.checkbox("Maintenance", value=bool(client["service_maintenance"]))
                status2 = st.selectbox("Status", STATUSES, index=STATUSES.index(client["status"]))
                notes2  = st.text_area("Notes", value=client.get("notes",""))
                sa, sb  = st.columns(2)
                if sa.form_submit_button("💾 Save Changes", type="primary"):
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
                if sb.form_submit_button("🗑️ Delete Client"):
                    delete_client(client["id"])
                    st.session_state.pop(f"editing_client_{client['id']}", None)
                    st.rerun()
