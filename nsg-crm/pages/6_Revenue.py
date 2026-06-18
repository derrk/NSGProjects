import streamlit as st
from database import init_db, get_clients, get_mrr, get_setup_revenue
import streamlit as st

st.set_page_config(page_title="Revenue | NSG CRM", page_icon="💰", layout="wide")
init_db()

st.title("💰 Revenue Dashboard")

clients = get_clients()
active = [c for c in clients if c["status"] == "Active"]
paused = [c for c in clients if c["status"] == "Paused"]

mrr = sum(c["monthly_fee"] for c in active)
setup_total = sum(c["setup_fee"] for c in clients)
lifetime = mrr + setup_total
arr = mrr * 12

MRR_GOAL = 1000
MRR_GOAL_2 = 5000

# ── TOP METRICS ──────────────────────────────────────────
c1, c2, c3, c4 = st.columns(4)
c1.metric("Current MRR", f"${mrr:,.0f}", help="Sum of all active monthly fees")
c2.metric("ARR (Projected)", f"${arr:,.0f}")
c3.metric("Setup Fees Collected", f"${setup_total:,.0f}")
c4.metric("Total Revenue", f"${lifetime:,.0f}")

st.divider()

# ── MRR GOALS ────────────────────────────────────────────
st.subheader("📈 MRR Goal Progress")

col1, col2 = st.columns(2)
with col1:
    p1 = min(mrr / MRR_GOAL, 1.0)
    st.markdown(f"**Goal 1: $1,000/mo** — {p1*100:.0f}% complete")
    st.progress(p1)
    remaining = max(MRR_GOAL - mrr, 0)
    clients_needed = max(int(-(-remaining // 99)), 0)  # ceiling div
    st.caption(f"${mrr:,.0f} of ${MRR_GOAL:,} · Need ${remaining:,.0f} more · ~{clients_needed} more Starter clients")

with col2:
    p2 = min(mrr / MRR_GOAL_2, 1.0)
    st.markdown(f"**Goal 2: $5,000/mo** — {p2*100:.1f}% complete")
    st.progress(p2)
    remaining2 = max(MRR_GOAL_2 - mrr, 0)
    st.caption(f"${mrr:,.0f} of ${MRR_GOAL_2:,} · Need ${remaining2:,.0f} more")

st.divider()

# ── MRR BREAKDOWN ────────────────────────────────────────
st.subheader("📊 Active MRR Breakdown")

if active:
    for c in sorted(active, key=lambda x: x["monthly_fee"], reverse=True):
        services = []
        if c["service_website"]: services.append("Web")
        if c["service_ecommerce"]: services.append("Ecom")
        if c["service_seo"]: services.append("SEO")
        if c["service_ai"]: services.append("AI")
        if c["service_maintenance"]: services.append("Maint")

        pct = (c["monthly_fee"] / mrr * 100) if mrr else 0
        col1, col2, col3 = st.columns([3, 1, 2])
        col1.markdown(f"**{c['business_name']}**  \n<span style='font-size:.8rem;color:#6b7280;'>{', '.join(services) or 'No services tagged'}</span>", unsafe_allow_html=True)
        col2.markdown(f"<div style='font-size:1.1rem;font-weight:700;color:#9d6ef8;'>${c['monthly_fee']:,.0f}/mo</div>", unsafe_allow_html=True)
        col3.progress(pct / 100, text=f"{pct:.0f}% of MRR")
else:
    st.info("No active clients yet. Close your first deal!")

st.divider()

# ── SETUP REVENUE TABLE ──────────────────────────────────
st.subheader("🔧 Setup Revenue by Client")
if clients:
    for c in sorted(clients, key=lambda x: x["setup_fee"], reverse=True):
        col1, col2, col3 = st.columns([3, 1, 2])
        col1.markdown(f"**{c['business_name']}** <span style='font-size:.75rem;color:#6b7280;'>({c['status']})</span>", unsafe_allow_html=True)
        col2.markdown(f"<span style='color:#34d399;font-weight:700;'>${c['setup_fee']:,.0f}</span>", unsafe_allow_html=True)
        col3.caption(f"Since {c.get('client_start_date','—')}")
else:
    st.info("No clients yet.")

st.divider()

# ── CHURN WARNING ────────────────────────────────────────
if paused:
    st.warning(f"⚠️ {len(paused)} client{'s' if len(paused)>1 else ''} paused — ${sum(c['monthly_fee'] for c in paused):,.0f}/mo at risk")
    for c in paused:
        st.markdown(f"- **{c['business_name']}** — ${c['monthly_fee']:,.0f}/mo paused")
