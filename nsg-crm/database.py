import sqlite3
import os
from datetime import date, datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "nsg_crm.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_conn()
    c = conn.cursor()

    c.executescript("""
    CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT NOT NULL,
        contact_name TEXT,
        industry TEXT,
        website TEXT,
        phone TEXT,
        email TEXT,
        lead_source TEXT DEFAULT 'Other',
        status TEXT DEFAULT 'Prospect',
        interest_level TEXT DEFAULT 'Warm',
        notes TEXT,
        date_added TEXT DEFAULT (date('now')),
        last_contact_date TEXT,
        next_followup_date TEXT,
        estimated_setup_fee REAL DEFAULT 0,
        estimated_monthly_revenue REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
        activity_date TEXT DEFAULT (date('now')),
        activity_type TEXT,
        outcome TEXT,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER REFERENCES leads(id),
        business_name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        setup_fee REAL DEFAULT 0,
        monthly_fee REAL DEFAULT 0,
        service_website INTEGER DEFAULT 0,
        service_ecommerce INTEGER DEFAULT 0,
        service_seo INTEGER DEFAULT 0,
        service_ai INTEGER DEFAULT 0,
        service_maintenance INTEGER DEFAULT 0,
        client_start_date TEXT DEFAULT (date('now')),
        renewal_date TEXT,
        status TEXT DEFAULT 'Active',
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
        client_name TEXT,
        project_name TEXT NOT NULL,
        service_type TEXT,
        start_date TEXT DEFAULT (date('now')),
        due_date TEXT,
        stage TEXT DEFAULT 'Discovery',
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS portfolio (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT NOT NULL,
        website_url TEXT,
        industry TEXT,
        launch_date TEXT,
        notes TEXT
    );

    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target REAL NOT NULL,
        current_value REAL DEFAULT 0,
        unit TEXT DEFAULT '',
        category TEXT DEFAULT 'General',
        auto_track INTEGER DEFAULT 0,
        track_field TEXT
    );
    """)
    conn.commit()
    conn.close()


def _seed_sample_data(conn):
    c = conn.cursor()
    if c.execute("SELECT COUNT(*) FROM leads").fetchone()[0] > 0:
        return

    today = date.today().isoformat()
    c.executemany("""
        INSERT INTO leads (business_name, contact_name, industry, phone, email,
            lead_source, status, interest_level, notes, date_added,
            next_followup_date, estimated_setup_fee, estimated_monthly_revenue)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, [
        ("Big Hit Displays", "Mike Torres", "Retail", "(940) 555-0101", "mike@bighitdisplays.com",
         "Card Show", "Proposal Sent", "Hot",
         "Met at card show. Very interested in website + AI automation.",
         today, today, 999, 149),
        ("Secret Stock TCG", "Jake Reynolds", "Card Shop", "(940) 555-0202", "jake@secretstocktx.com",
         "Referral", "Interested", "Warm",
         "Referred by Big Hit. Wants ecommerce store for Pokemon cards.",
         today, today, 1999, 149),
        ("Wichita Falls Pest Pro", "Sarah Kim", "Pest Control", "(940) 555-0303", "",
         "Cold Call", "Contacted", "Warm",
         "Left voicemail. Call back Thursday.",
         today, today, 499, 99),
        ("Elite Auto Detail", "Carlos Rivera", "Auto Detailing", "(940) 555-0404", "",
         "Instagram", "Prospect", "Cold",
         "Saw our Instagram ad. Requested pricing info.",
         today, today, 499, 99),
        ("Lone Star Plumbing", "Bill Carter", "Plumbing", "(940) 555-0505", "bill@lonestarplumbing.com",
         "Google Search", "Follow Up 1", "Hot",
         "Ready to move forward after seeing our portfolio.",
         today, today, 999, 149),
    ])

    c.execute("""
        INSERT INTO portfolio (client_name, website_url, industry, launch_date, notes)
        VALUES (?,?,?,?,?)
    """, ("Secret Stock TCG", "https://secretstocktx.com", "Card Shop", today,
          "Pokemon & One Piece cards. Inventory, collections, contact pages."))

    c.execute("""
        INSERT INTO goals (name, target, current_value, unit, category, auto_track)
        VALUES
            ('Leads Added', 50, 5, 'leads', 'Outreach', 0),
            ('Businesses Contacted', 25, 5, 'contacts', 'Outreach', 0),
            ('Meetings Scheduled', 5, 0, 'meetings', 'Sales', 0),
            ('Clients Closed', 3, 0, 'clients', 'Sales', 0),
            ('MRR Goal', 1000, 0, '$/mo', 'Revenue', 0),
            ('Setup Revenue', 5000, 0, '$', 'Revenue', 0)
    """)
    conn.commit()


# ── LEADS ────────────────────────────────────────────────

def get_leads(status=None, industry=None, interest=None, source=None, search=None):
    conn = get_conn()
    q = "SELECT * FROM leads WHERE 1=1"
    params = []
    if status:
        q += " AND status=?"; params.append(status)
    if industry:
        q += " AND industry=?"; params.append(industry)
    if interest:
        q += " AND interest_level=?"; params.append(interest)
    if source:
        q += " AND lead_source=?"; params.append(source)
    if search:
        q += " AND (business_name LIKE ? OR industry LIKE ? OR status LIKE ?)"
        params += [f"%{search}%"] * 3
    q += " ORDER BY date_added DESC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_lead(lead_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_lead(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO leads (business_name, contact_name, industry, website, phone, email,
            lead_source, status, interest_level, notes, date_added,
            last_contact_date, next_followup_date,
            estimated_setup_fee, estimated_monthly_revenue)
        VALUES (:business_name,:contact_name,:industry,:website,:phone,:email,
            :lead_source,:status,:interest_level,:notes,:date_added,
            :last_contact_date,:next_followup_date,
            :estimated_setup_fee,:estimated_monthly_revenue)
    """, data)
    conn.commit()
    conn.close()


def update_lead(lead_id, data):
    conn = get_conn()
    conn.execute("""
        UPDATE leads SET
            business_name=:business_name, contact_name=:contact_name,
            industry=:industry, website=:website, phone=:phone, email=:email,
            lead_source=:lead_source, status=:status, interest_level=:interest_level,
            notes=:notes, last_contact_date=:last_contact_date,
            next_followup_date=:next_followup_date,
            estimated_setup_fee=:estimated_setup_fee,
            estimated_monthly_revenue=:estimated_monthly_revenue
        WHERE id=:id
    """, {**data, "id": lead_id})
    conn.commit()
    conn.close()


def delete_lead(lead_id):
    conn = get_conn()
    conn.execute("DELETE FROM leads WHERE id=?", (lead_id,))
    conn.commit()
    conn.close()


def get_followups_today():
    conn = get_conn()
    today = date.today().isoformat()
    rows = conn.execute(
        "SELECT * FROM leads WHERE next_followup_date <= ? AND status NOT IN ('Won','Lost') ORDER BY next_followup_date",
        (today,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_followups_upcoming(days=7):
    conn = get_conn()
    today = date.today().isoformat()
    rows = conn.execute(
        "SELECT * FROM leads WHERE next_followup_date > ? AND next_followup_date <= date(?,'+? days') AND status NOT IN ('Won','Lost') ORDER BY next_followup_date",
        (today, today, days)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── ACTIVITIES ───────────────────────────────────────────

def get_activities(lead_id=None):
    conn = get_conn()
    if lead_id:
        rows = conn.execute(
            "SELECT a.*, l.business_name FROM activities a LEFT JOIN leads l ON a.lead_id=l.id WHERE a.lead_id=? ORDER BY a.activity_date DESC",
            (lead_id,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT a.*, l.business_name FROM activities a LEFT JOIN leads l ON a.lead_id=l.id ORDER BY a.activity_date DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_activity(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO activities (lead_id, activity_date, activity_type, outcome, notes)
        VALUES (:lead_id,:activity_date,:activity_type,:outcome,:notes)
    """, data)
    if data.get("activity_date"):
        conn.execute("UPDATE leads SET last_contact_date=? WHERE id=?",
                     (data["activity_date"], data["lead_id"]))
    conn.commit()
    conn.close()


def delete_activity(activity_id):
    conn = get_conn()
    conn.execute("DELETE FROM activities WHERE id=?", (activity_id,))
    conn.commit()
    conn.close()


# ── CLIENTS ──────────────────────────────────────────────

def get_clients(status=None):
    conn = get_conn()
    q = "SELECT * FROM clients WHERE 1=1"
    params = []
    if status:
        q += " AND status=?"; params.append(status)
    q += " ORDER BY client_start_date DESC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_client(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO clients (lead_id, business_name, contact_name, phone, email,
            setup_fee, monthly_fee,
            service_website, service_ecommerce, service_seo, service_ai, service_maintenance,
            client_start_date, renewal_date, status, notes)
        VALUES (:lead_id,:business_name,:contact_name,:phone,:email,
            :setup_fee,:monthly_fee,
            :service_website,:service_ecommerce,:service_seo,:service_ai,:service_maintenance,
            :client_start_date,:renewal_date,:status,:notes)
    """, data)
    conn.commit()
    conn.close()


def update_client(client_id, data):
    conn = get_conn()
    conn.execute("""
        UPDATE clients SET
            business_name=:business_name, contact_name=:contact_name,
            phone=:phone, email=:email,
            setup_fee=:setup_fee, monthly_fee=:monthly_fee,
            service_website=:service_website, service_ecommerce=:service_ecommerce,
            service_seo=:service_seo, service_ai=:service_ai,
            service_maintenance=:service_maintenance,
            client_start_date=:client_start_date, renewal_date=:renewal_date,
            status=:status, notes=:notes
        WHERE id=:id
    """, {**data, "id": client_id})
    conn.commit()
    conn.close()


def delete_client(client_id):
    conn = get_conn()
    conn.execute("DELETE FROM clients WHERE id=?", (client_id,))
    conn.commit()
    conn.close()


def get_mrr():
    conn = get_conn()
    row = conn.execute(
        "SELECT COALESCE(SUM(monthly_fee),0) as mrr FROM clients WHERE status='Active'"
    ).fetchone()
    conn.close()
    return row["mrr"]


def get_setup_revenue():
    conn = get_conn()
    row = conn.execute(
        "SELECT COALESCE(SUM(setup_fee),0) as total FROM clients"
    ).fetchone()
    conn.close()
    return row["total"]


# ── PROJECTS ─────────────────────────────────────────────

def get_projects(stage=None):
    conn = get_conn()
    q = "SELECT * FROM projects WHERE 1=1"
    params = []
    if stage:
        q += " AND stage=?"; params.append(stage)
    q += " ORDER BY due_date ASC"
    rows = conn.execute(q, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_project(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO projects (client_id, client_name, project_name, service_type,
            start_date, due_date, stage, notes)
        VALUES (:client_id,:client_name,:project_name,:service_type,
            :start_date,:due_date,:stage,:notes)
    """, data)
    conn.commit()
    conn.close()


def update_project(project_id, data):
    conn = get_conn()
    conn.execute("""
        UPDATE projects SET
            client_name=:client_name, project_name=:project_name,
            service_type=:service_type, start_date=:start_date,
            due_date=:due_date, stage=:stage, notes=:notes
        WHERE id=:id
    """, {**data, "id": project_id})
    conn.commit()
    conn.close()


def delete_project(project_id):
    conn = get_conn()
    conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
    conn.commit()
    conn.close()


# ── PORTFOLIO ────────────────────────────────────────────

def get_portfolio():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM portfolio ORDER BY launch_date DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_portfolio_item(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO portfolio (client_name, website_url, industry, launch_date, notes)
        VALUES (:client_name,:website_url,:industry,:launch_date,:notes)
    """, data)
    conn.commit()
    conn.close()


def delete_portfolio_item(item_id):
    conn = get_conn()
    conn.execute("DELETE FROM portfolio WHERE id=?", (item_id,))
    conn.commit()
    conn.close()


# ── GOALS ────────────────────────────────────────────────

def get_goals():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM goals ORDER BY category, name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_goal_value(goal_id, value):
    conn = get_conn()
    conn.execute("UPDATE goals SET current_value=? WHERE id=?", (value, goal_id))
    conn.commit()
    conn.close()


def create_goal(data):
    conn = get_conn()
    conn.execute("""
        INSERT INTO goals (name, target, current_value, unit, category)
        VALUES (:name,:target,:current_value,:unit,:category)
    """, data)
    conn.commit()
    conn.close()


def delete_goal(goal_id):
    conn = get_conn()
    conn.execute("DELETE FROM goals WHERE id=?", (goal_id,))
    conn.commit()
    conn.close()


# ── DASHBOARD STATS ──────────────────────────────────────

def get_dashboard_stats():
    conn = get_conn()
    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()

    stats = {}

    stats["total_leads"] = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    stats["new_leads_month"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE date_added >= ?", (month_start,)
    ).fetchone()[0]
    stats["contacted"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE status NOT IN ('Prospect')"
    ).fetchone()[0]
    stats["followups_today"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE next_followup_date <= ? AND status NOT IN ('Won','Lost')",
        (today,)
    ).fetchone()[0]
    stats["meetings"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE status='Meeting Scheduled'"
    ).fetchone()[0]
    stats["proposals"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE status='Proposal Sent'"
    ).fetchone()[0]
    stats["won"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE status='Won'"
    ).fetchone()[0]
    stats["lost"] = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE status='Lost'"
    ).fetchone()[0]

    total_closed = stats["won"] + stats["lost"]
    stats["close_rate"] = round(stats["won"] / total_closed * 100, 1) if total_closed > 0 else 0

    stats["mrr"] = conn.execute(
        "SELECT COALESCE(SUM(monthly_fee),0) FROM clients WHERE status='Active'"
    ).fetchone()[0]
    stats["setup_revenue"] = conn.execute(
        "SELECT COALESCE(SUM(setup_fee),0) FROM clients"
    ).fetchone()[0]
    stats["total_revenue"] = stats["mrr"] + stats["setup_revenue"]

    week_start = date.today().strftime("%Y-%m-%d")
    import datetime
    week_ago = (datetime.date.today() - datetime.timedelta(days=7)).isoformat()
    stats["contacted_week"] = conn.execute(
        "SELECT COUNT(DISTINCT lead_id) FROM activities WHERE activity_date >= ?", (week_ago,)
    ).fetchone()[0]
    stats["contacted_month"] = conn.execute(
        "SELECT COUNT(DISTINCT lead_id) FROM activities WHERE activity_date >= ?", (month_start,)
    ).fetchone()[0]

    conn.close()
    return stats
