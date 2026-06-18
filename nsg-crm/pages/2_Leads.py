import streamlit as st
from database import init_db, get_leads, get_lead, create_lead, update_lead, delete_lead
from datetime import date

st.set_page_config(page_title="Leads | NSG CRM", page_icon="👥", layout="wide")
init_db()

STATUSES = ["Prospect","Contacted","Follow Up 1","Follow Up 2","Meeting Scheduled",
            "Proposal Sent","Interested","Not Now","Won","Lost"]
SOURCES = ["Google Search","Referral","Facebook","Instagram","Card Show",
           "Cold Email","Cold Call","Website Lead","Walk-In","Other"]
INTERESTS = ["Hot","Warm","Cold"]
INDUSTRIES = ["Contractor","Plumbing","Electrical","HVAC","Pest Control","Auto Detail",
              "Dog Grooming","Landscaping","Cleaning Service","Retail Store","Card Shop",
              "Restaurant","Salon & Spa","Ecommerce","Other"]

INTEREST_COLORS = {"Hot": "🔴", "Warm": "🟡", "Cold": "⚫"}

st.title("👥 Lead Management")

# ── SEARCH & FILTERS ─────────────────────────────────────
with st.expander("🔍 Search & Filter", expanded=True):
    fc1, fc2, fc3, fc4, fc5 = st.columns(5)
    search = fc1.text_input("Search", placeholder="Business name...")
    f_status = fc2.selectbox("Status", ["All"] + STATUSES)
    f_industry = fc3.selectbox("Industry", ["All"] + INDUSTRIES)
    f_interest = fc4.selectbox("Interest", ["All"] + INTERESTS)
    f_source = fc5.selectbox("Source", ["All"] + SOURCES)

leads = get_leads(
    status=None if f_status == "All" else f_status,
    industry=None if f_industry == "All" else f_industry,
    interest=None if f_interest == "All" else f_interest,
    source=None if f_source == "All" else f_source,
    search=search or None,
)

# ── ADD LEAD FORM ────────────────────────────────────────
with st.expander("➕ Add New Lead"):
    with st.form("add_lead_form", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        biz = c1.text_input("Business Name *")
        contact = c2.text_input("Contact Name")
        industry = c3.selectbox("Industry", INDUSTRIES)

        c4, c5, c6 = st.columns(3)
        phone = c4.text_input("Phone")
        email = c5.text_input("Email")
        website = c6.text_input("Website")

        c7, c8, c9 = st.columns(3)
        source = c7.selectbox("Lead Source", SOURCES)
        status = c8.selectbox("Status", STATUSES)
        interest = c9.selectbox("Interest Level", INTERESTS)

        c10, c11, c12 = st.columns(3)
        followup = c10.date_input("Next Follow-Up", value=date.today())
        setup_fee = c11.number_input("Est. Setup Fee ($)", min_value=0, value=499, step=100)
        monthly = c12.number_input("Est. Monthly ($)", min_value=0, value=99, step=50)

        notes = st.text_area("Notes")

        if st.form_submit_button("Add Lead", type="primary"):
            if not biz:
                st.error("Business name is required.")
            else:
                create_lead({
                    "business_name": biz, "contact_name": contact, "industry": industry,
                    "website": website, "phone": phone, "email": email,
                    "lead_source": source, "status": status, "interest_level": interest,
                    "notes": notes, "date_added": date.today().isoformat(),
                    "last_contact_date": None,
                    "next_followup_date": followup.isoformat(),
                    "estimated_setup_fee": setup_fee,
                    "estimated_monthly_revenue": monthly,
                })
                st.success(f"✅ Lead added: {biz}")
                st.rerun()

# ── LEADS TABLE ──────────────────────────────────────────
st.markdown(f"**{len(leads)} lead{'s' if len(leads) != 1 else ''}**")

if not leads:
    st.info("No leads match your filters.")
else:
    for lead in leads:
        interest_icon = INTEREST_COLORS.get(lead.get("interest_level",""), "⚫")
        overdue = lead.get("next_followup_date") and lead["next_followup_date"] < date.today().isoformat()
        border_color = "#f87171" if overdue else "#9d6ef8" if lead.get("interest_level") == "Hot" else "#374151"

        with st.container():
            st.markdown(f"""
            <div style="border:1px solid {border_color};border-radius:10px;padding:.85rem 1.1rem;margin-bottom:.5rem;background:#111827;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:700;font-size:1rem;">{interest_icon} {lead['business_name']}</span>
                    <span style="font-size:.75rem;background:#1f2937;padding:.2rem .6rem;border-radius:100px;color:#9ca3af;">{lead.get('status','')}</span>
                </div>
                <div style="font-size:.8rem;color:#6b7280;margin-top:.3rem;">
                    {lead.get('contact_name') or '—'} · {lead.get('industry','—')} · {lead.get('phone') or lead.get('email') or 'No contact info'}
                </div>
                <div style="font-size:.75rem;color:#4b5563;margin-top:.2rem;">
                    Source: {lead.get('lead_source','—')} · Setup: ${lead.get('estimated_setup_fee',0):,.0f} · MRR: ${lead.get('estimated_monthly_revenue',0):,.0f}/mo
                    {'· ⏰ Follow-up: ' + lead['next_followup_date'] if lead.get('next_followup_date') else ''}
                </div>
            </div>
            """, unsafe_allow_html=True)

            ecol1, ecol2 = st.columns([6, 1])
            with ecol2:
                if st.button("Edit", key=f"edit_{lead['id']}", use_container_width=True):
                    st.session_state[f"editing_{lead['id']}"] = True

        # ── INLINE EDIT FORM ──────────────────────────────
        if st.session_state.get(f"editing_{lead['id']}"):
            with st.form(f"edit_form_{lead['id']}"):
                st.markdown(f"**Editing: {lead['business_name']}**")
                ec1, ec2, ec3 = st.columns(3)
                biz2 = ec1.text_input("Business Name", value=lead["business_name"])
                contact2 = ec2.text_input("Contact Name", value=lead.get("contact_name",""))
                industry2 = ec3.selectbox("Industry", INDUSTRIES,
                    index=INDUSTRIES.index(lead["industry"]) if lead.get("industry") in INDUSTRIES else 0)

                ec4, ec5, ec6 = st.columns(3)
                phone2 = ec4.text_input("Phone", value=lead.get("phone",""))
                email2 = ec5.text_input("Email", value=lead.get("email",""))
                website2 = ec6.text_input("Website", value=lead.get("website",""))

                ec7, ec8, ec9 = st.columns(3)
                source2 = ec7.selectbox("Source", SOURCES,
                    index=SOURCES.index(lead["lead_source"]) if lead.get("lead_source") in SOURCES else 0)
                status2 = ec8.selectbox("Status", STATUSES,
                    index=STATUSES.index(lead["status"]) if lead.get("status") in STATUSES else 0)
                interest2 = ec9.selectbox("Interest", INTERESTS,
                    index=INTERESTS.index(lead["interest_level"]) if lead.get("interest_level") in INTERESTS else 1)

                ec10, ec11, ec12 = st.columns(3)
                fu_val = lead.get("next_followup_date")
                followup2 = ec10.date_input("Next Follow-Up",
                    value=date.fromisoformat(fu_val) if fu_val else date.today())
                setup2 = ec11.number_input("Est. Setup ($)", value=float(lead.get("estimated_setup_fee",0)), step=100.0)
                monthly2 = ec12.number_input("Est. Monthly ($)", value=float(lead.get("estimated_monthly_revenue",0)), step=50.0)

                notes2 = st.text_area("Notes", value=lead.get("notes",""))

                sa, sb, sc = st.columns([2,1,1])
                save = sa.form_submit_button("💾 Save Changes", type="primary")
                delete_btn = sc.form_submit_button("🗑️ Delete Lead")

                if save:
                    update_lead(lead["id"], {
                        "business_name": biz2, "contact_name": contact2,
                        "industry": industry2, "website": website2,
                        "phone": phone2, "email": email2,
                        "lead_source": source2, "status": status2,
                        "interest_level": interest2, "notes": notes2,
                        "last_contact_date": lead.get("last_contact_date"),
                        "next_followup_date": followup2.isoformat(),
                        "estimated_setup_fee": setup2,
                        "estimated_monthly_revenue": monthly2,
                    })
                    st.session_state.pop(f"editing_{lead['id']}", None)
                    st.success("Saved!")
                    st.rerun()

                if delete_btn:
                    delete_lead(lead["id"])
                    st.session_state.pop(f"editing_{lead['id']}", None)
                    st.warning("Lead deleted.")
                    st.rerun()
