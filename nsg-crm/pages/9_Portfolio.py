import streamlit as st
from database import init_db, get_portfolio, create_portfolio_item, delete_portfolio_item
from datetime import date

st.set_page_config(page_title="Portfolio | NSG CRM", page_icon="🖥️", layout="wide")
init_db()

INDUSTRIES = ["Contractor","Plumbing","Electrical","HVAC","Pest Control","Auto Detail",
              "Dog Grooming","Landscaping","Cleaning Service","Retail Store","Card Shop",
              "Restaurant","Salon & Spa","Ecommerce","Other"]

st.title("🖥️ Website Portfolio")
st.caption("Track all completed client work.")

items = get_portfolio()

with st.expander("➕ Add Portfolio Item"):
    with st.form("add_portfolio", clear_on_submit=True):
        c1, c2, c3 = st.columns(3)
        client_name = c1.text_input("Client / Business Name *")
        website_url = c2.text_input("Website URL")
        industry = c3.selectbox("Industry", INDUSTRIES)
        c4, c5 = st.columns([1, 3])
        launch_date = c4.date_input("Launch Date", value=date.today())
        notes = c5.text_input("Notes")
        if st.form_submit_button("Add", type="primary"):
            if client_name:
                create_portfolio_item({
                    "client_name": client_name,
                    "website_url": website_url,
                    "industry": industry,
                    "launch_date": launch_date.isoformat(),
                    "notes": notes,
                })
                st.rerun()

st.markdown(f"**{len(items)} completed project{'s' if len(items)!=1 else ''}**")

if not items:
    st.info("No portfolio items yet. Launch your first project!")
else:
    cols = st.columns(3)
    for i, item in enumerate(items):
        with cols[i % 3]:
            st.markdown(f"""
            <div style="background:#111827;border:1px solid #1f2937;border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
                <div style="font-weight:700;font-size:1rem;margin-bottom:.25rem;">🖥️ {item['client_name']}</div>
                <div style="font-size:.78rem;color:#9d6ef8;margin-bottom:.5rem;">{item.get('industry','')}</div>
                {f'<a href="{item["website_url"]}" target="_blank" style="font-size:.8rem;color:#60a5fa;">{item["website_url"]}</a>' if item.get('website_url') else ''}
                <div style="font-size:.75rem;color:#6b7280;margin-top:.4rem;">Launched: {item.get('launch_date','—')}</div>
                {f'<div style="font-size:.75rem;color:#9ca3af;margin-top:.3rem;">{item["notes"]}</div>' if item.get('notes') else ''}
            </div>
            """, unsafe_allow_html=True)
            if st.button("🗑️ Remove", key=f"del_port_{item['id']}", use_container_width=True):
                delete_portfolio_item(item["id"])
                st.rerun()
