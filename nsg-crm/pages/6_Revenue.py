import streamlit as st
from database import init_db, get_clients
from components import inject_css, metric_card, section_header, cards_row, progress_bar

st.set_page_config(page_title="Revenue | NSG CRM", page_icon="💰", layout="wide")
inject_css()
init_db()

st.markdown("## 💰 Revenue Dashboard")

clients = get_clients()
active  = [c for c in clients if c["status"] == "Active"]
paused  = [c for c in clients if c["status"] == "Paused"]

mrr         = sum(c["monthly_fee"] for c in active)
setup_total = sum(c["setup_fee"]   for c in clients)
arr         = mrr * 12
lifetime    = mrr + setup_total

MRR_GOAL_1 = 1000
MRR_GOAL_2 = 5000

# ── TOP METRICS ──────────────────────────────────────────
st.markdown(section_header("Revenue Overview"), unsafe_allow_html=True)
cards_row([
    metric_card("Current MRR",        f"${mrr:,.0f}",         icon="💜", color="purple", glow=True),
    metric_card("Projected ARR",       f"${arr:,.0f}",         icon="📈", color="purple"),
    metric_card("Setup Fees Collected",f"${setup_total:,.0f}", icon="🔧", color="green",  glow=True),
    metric_card("Total Revenue",       f"${lifetime:,.0f}",    icon="💰", color="green"),
    metric_card("Active Clients",      str(len(active)),       icon="🤝", color="blue"),
])

# ── MRR GOAL CARDS ───────────────────────────────────────
st.markdown(section_header("MRR Goal Progress"), unsafe_allow_html=True)

col1, col2 = st.columns(2)

p1 = min(mrr / MRR_GOAL_1, 1.0)
p2 = min(mrr / MRR_GOAL_2, 1.0)
remaining1 = max(MRR_GOAL_1 - mrr, 0)
remaining2 = max(MRR_GOAL_2 - mrr, 0)
clients_needed = max(int(-(-remaining1 // 99)), 0)

with col1:
    st.markdown(f"""
    <div class="card card-purple card-glow-purple">
        <div class="card-label">Goal 1 — $1,000/month</div>
        <div style="display:flex;align-items:baseline;gap:.5rem;margin:.3rem 0 .6rem;">
            <span style="font-size:2rem;font-weight:800;color:#fff;">${mrr:,.0f}</span>
            <span style="color:#6b7280;font-size:.85rem;">of ${MRR_GOAL_1:,}/mo</span>
            <span style="margin-left:auto;font-size:1.1rem;font-weight:800;color:#9d6ef8;">{p1*100:.0f}%</span>
        </div>
        <div style="background:#1f2937;border-radius:100px;height:10px;overflow:hidden;">
            <div style="width:{p1*100:.1f}%;height:100%;background:linear-gradient(90deg,#7c3aed,#9d6ef8);border-radius:100px;"></div>
        </div>
        <div style="font-size:.78rem;color:#6b7280;margin-top:.5rem;">
            ${remaining1:,.0f} remaining · ~{clients_needed} more Starter clients needed
        </div>
    </div>
    """, unsafe_allow_html=True)

with col2:
    st.markdown(f"""
    <div class="card card-green">
        <div class="card-label">Goal 2 — $5,000/month</div>
        <div style="display:flex;align-items:baseline;gap:.5rem;margin:.3rem 0 .6rem;">
            <span style="font-size:2rem;font-weight:800;color:#fff;">${mrr:,.0f}</span>
            <span style="color:#6b7280;font-size:.85rem;">of ${MRR_GOAL_2:,}/mo</span>
            <span style="margin-left:auto;font-size:1.1rem;font-weight:800;color:#34d399;">{p2*100:.1f}%</span>
        </div>
        <div style="background:#1f2937;border-radius:100px;height:10px;overflow:hidden;">
            <div style="width:{p2*100:.1f}%;height:100%;background:linear-gradient(90deg,#059669,#34d399);border-radius:100px;"></div>
        </div>
        <div style="font-size:.78rem;color:#6b7280;margin-top:.5rem;">
            ${remaining2:,.0f} remaining to $5k MRR
        </div>
    </div>
    """, unsafe_allow_html=True)

# ── MRR BREAKDOWN ────────────────────────────────────────
st.markdown(section_header("Active MRR Breakdown"), unsafe_allow_html=True)

if active:
    for c in sorted(active, key=lambda x: x["monthly_fee"], reverse=True):
        services = [s for s, k in [("Website","service_website"),("Ecommerce","service_ecommerce"),
                    ("SEO","service_seo"),("AI","service_ai"),("Maintenance","service_maintenance")] if c[k]]
        pct = (c["monthly_fee"] / mrr) if mrr else 0
        service_tags = "".join(
            f'<span style="background:#1f2937;border:1px solid #374151;border-radius:4px;padding:.1rem .4rem;font-size:.7rem;color:#9ca3af;margin-right:.25rem;">{s}</span>'
            for s in services
        )
        st.markdown(f"""
        <div class="card" style="margin-bottom:.5rem;padding:1rem 1.25rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;">
                <div>
                    <span style="font-weight:700;font-size:.95rem;">{c['business_name']}</span>
                    <div style="margin-top:.25rem;">{service_tags}</div>
                </div>
                <span style="font-size:1.25rem;font-weight:800;color:#9d6ef8;">${c['monthly_fee']:,.0f}<span style="font-size:.75rem;color:#6b7280;">/mo</span></span>
            </div>
            <div style="background:#1f2937;border-radius:100px;height:6px;overflow:hidden;">
                <div style="width:{pct*100:.1f}%;height:100%;background:linear-gradient(90deg,#7c3aed,#9d6ef8);border-radius:100px;"></div>
            </div>
            <div style="font-size:.7rem;color:#4b5563;margin-top:.3rem;">{pct*100:.0f}% of total MRR</div>
        </div>
        """, unsafe_allow_html=True)
else:
    st.markdown("""
    <div class="card card-gray" style="text-align:center;padding:2rem;">
        <div style="font-size:1.5rem;margin-bottom:.5rem;">💼</div>
        <div style="font-weight:600;">No active clients yet</div>
        <div style="color:#6b7280;font-size:.85rem;margin-top:.25rem;">Close your first deal to start tracking MRR</div>
    </div>
    """, unsafe_allow_html=True)

# ── SETUP REVENUE TABLE ──────────────────────────────────
st.markdown(section_header("Setup Revenue by Client"), unsafe_allow_html=True)

if clients:
    st.markdown('<div style="background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden;">', unsafe_allow_html=True)
    for i, c in enumerate(sorted(clients, key=lambda x: x["setup_fee"], reverse=True)):
        status_color = {"Active":"#34d399","Paused":"#fbbf24","Cancelled":"#f87171"}.get(c["status"],"#9ca3af")
        border = "border-bottom:1px solid #1f2937;" if i < len(clients)-1 else ""
        st.markdown(f"""
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.85rem 1.25rem;{border}">
            <div>
                <span style="font-weight:600;">{c['business_name']}</span>
                <span style="margin-left:.6rem;font-size:.72rem;padding:.15rem .5rem;background:#1f2937;border-radius:100px;color:{status_color};">{c['status']}</span>
            </div>
            <div style="text-align:right;">
                <span style="font-weight:700;color:#34d399;">${c['setup_fee']:,.0f}</span>
                <div style="font-size:.72rem;color:#6b7280;">Since {c.get('client_start_date','—')}</div>
            </div>
        </div>
        """, unsafe_allow_html=True)
    st.markdown('</div>', unsafe_allow_html=True)

# ── CHURN WARNING ────────────────────────────────────────
if paused:
    st.markdown(f"""
    <div style="background:linear-gradient(135deg,rgba(217,119,6,0.15),rgba(217,119,6,0.05));
         border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:1rem 1.25rem;margin-top:1rem;">
        <div style="font-weight:700;color:#fbbf24;margin-bottom:.5rem;">⚠️ {len(paused)} client{'s' if len(paused)>1 else ''} paused — ${sum(c['monthly_fee'] for c in paused):,.0f}/mo at risk</div>
        {''.join(f'<div style="font-size:.85rem;color:#9ca3af;padding:.2rem 0;">• {c["business_name"]} — ${c["monthly_fee"]:,.0f}/mo</div>' for c in paused)}
    </div>
    """, unsafe_allow_html=True)
